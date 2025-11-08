/**
 * 에러 처리 유틸리티
 * 사용자 친화적인 에러 메시지 및 에러 분류
 */

import { logger } from './logger.js';

/**
 * 에러 타입 분류
 */
export const ErrorType = {
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  API_ERROR: 'API_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * 사용자 친화적인 에러 메시지 매핑
 */
const USER_FRIENDLY_MESSAGES = {
  [ErrorType.AI_PROVIDER_ERROR]: 'AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
  [ErrorType.API_ERROR]: '요청 처리 중 오류가 발생했습니다.',
  [ErrorType.VALIDATION_ERROR]: '입력값을 확인해주세요.',
  [ErrorType.DATABASE_ERROR]: '데이터 처리 중 오류가 발생했습니다.',
  [ErrorType.NETWORK_ERROR]: '네트워크 연결을 확인해주세요.',
  [ErrorType.AUTHENTICATION_ERROR]: '인증이 필요합니다.',
  [ErrorType.RATE_LIMIT_ERROR]: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  [ErrorType.UNKNOWN_ERROR]: '예상치 못한 오류가 발생했습니다.'
};

/**
 * 에러 분류 함수
 */
export function classifyError(error) {
  // HTTP 상태 코드 기반 분류
  if (error.status) {
    if (error.status === 401 || error.status === 403) {
      return ErrorType.AUTHENTICATION_ERROR;
    }
    if (error.status === 429) {
      return ErrorType.RATE_LIMIT_ERROR;
    }
    if (error.status >= 500) {
      return ErrorType.NETWORK_ERROR;
    }
  }

  // 에러 메시지 기반 분류
  const errorMessage = error.message?.toLowerCase() || '';
  
  if (errorMessage.includes('api key') || errorMessage.includes('인증')) {
    return ErrorType.AUTHENTICATION_ERROR;
  }
  
  if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
    return ErrorType.RATE_LIMIT_ERROR;
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('econnrefused')) {
    return ErrorType.NETWORK_ERROR;
  }
  
  if (errorMessage.includes('database') || errorMessage.includes('sql')) {
    return ErrorType.DATABASE_ERROR;
  }
  
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return ErrorType.VALIDATION_ERROR;
  }

  // AI Provider 에러 확인
  if (error.provider || errorMessage.includes('gpt') || errorMessage.includes('claude') || 
      errorMessage.includes('gemini') || errorMessage.includes('grok')) {
    return ErrorType.AI_PROVIDER_ERROR;
  }

  return ErrorType.UNKNOWN_ERROR;
}

/**
 * 사용자 친화적인 에러 메시지 반환
 */
export function getUserFriendlyMessage(error, defaultMessage = null) {
  const errorType = classifyError(error);
  const friendlyMessage = USER_FRIENDLY_MESSAGES[errorType];
  
  // 개발 모드에서는 상세한 에러 메시지도 포함
  if (process.env.NODE_ENV === 'development') {
    return `${friendlyMessage} (${error.message || defaultMessage})`;
  }
  
  return friendlyMessage || defaultMessage || USER_FRIENDLY_MESSAGES[ErrorType.UNKNOWN_ERROR];
}

/**
 * 에러 응답 생성
 */
export function createErrorResponse(error, req = null) {
  const errorType = classifyError(error);
  const userMessage = getUserFriendlyMessage(error);
  
  // 에러 로깅
  if (req) {
    logger.logAPIError(req, error);
  } else {
    logger.error('Error occurred', error, { errorType });
  }
  
  // 상태 코드 결정
  let statusCode = 500;
  if (error.status) {
    statusCode = error.status;
  } else if (errorType === ErrorType.AUTHENTICATION_ERROR) {
    statusCode = 401;
  } else if (errorType === ErrorType.VALIDATION_ERROR) {
    statusCode = 400;
  } else if (errorType === ErrorType.RATE_LIMIT_ERROR) {
    statusCode = 429;
  }
  
  return {
    success: false,
    error: {
      type: errorType,
      message: userMessage,
      ...(process.env.NODE_ENV === 'development' && {
        details: error.message,
        stack: error.stack
      })
    },
    statusCode
  };
}

/**
 * 에러 핸들러 미들웨어
 */
export function errorHandler(err, req, res, next) {
  const errorResponse = createErrorResponse(err, req);
  
  res.status(errorResponse.statusCode).json({
    success: errorResponse.success,
    error: errorResponse.error
  });
}

/**
 * 비동기 에러 핸들러 래퍼
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

