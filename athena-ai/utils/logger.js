/**
 * 구조화된 로깅 시스템
 * 에러, 경고, 정보, 디버그 로그를 체계적으로 관리
 */

export class Logger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
    this.enableFileLogging = options.enableFileLogging || false;
    this.logDir = options.logDir || './logs';
    
    // 로그 레벨 우선순위
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  /**
   * 로그 레벨 확인
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  /**
   * 타임스탬프 생성
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * 로그 포맷팅
   */
  formatLog(level, message, metadata = {}) {
    const timestamp = this.getTimestamp();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...metadata
    };
    
    return JSON.stringify(logEntry);
  }

  /**
   * 에러 로그
   */
  error(message, error = null, metadata = {}) {
    if (!this.shouldLog('error')) return;
    
    const errorMetadata = {
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        status: error.status
      } : null
    };
    
    const logMessage = this.formatLog('error', message, errorMetadata);
    console.error(`[ERROR] ${logMessage}`);
    
    // 파일 로깅이 활성화되어 있으면 파일에 기록
    if (this.enableFileLogging) {
      this.writeToFile('error', logMessage);
    }
  }

  /**
   * 경고 로그
   */
  warn(message, metadata = {}) {
    if (!this.shouldLog('warn')) return;
    
    const logMessage = this.formatLog('warn', message, metadata);
    console.warn(`[WARN] ${logMessage}`);
    
    if (this.enableFileLogging) {
      this.writeToFile('warn', logMessage);
    }
  }

  /**
   * 정보 로그
   */
  info(message, metadata = {}) {
    if (!this.shouldLog('info')) return;
    
    const logMessage = this.formatLog('info', message, metadata);
    console.log(`[INFO] ${logMessage}`);
    
    if (this.enableFileLogging) {
      this.writeToFile('info', logMessage);
    }
  }

  /**
   * 디버그 로그
   */
  debug(message, metadata = {}) {
    if (!this.shouldLog('debug')) return;
    
    const logMessage = this.formatLog('debug', message, metadata);
    console.debug(`[DEBUG] ${logMessage}`);
    
    if (this.enableFileLogging) {
      this.writeToFile('debug', logMessage);
    }
  }

  /**
   * 파일에 로그 기록 (향후 구현)
   */
  writeToFile(level, message) {
    // TODO: 파일 로깅 구현
    // fs.appendFileSync 등 사용
  }

  /**
   * AI Provider 에러 로깅
   */
  logAIError(providerName, error, context = {}) {
    this.error(
      `AI Provider Error: ${providerName}`,
      error,
      {
        provider: providerName,
        context,
        type: 'AI_PROVIDER_ERROR'
      }
    );
  }

  /**
   * API 요청 에러 로깅
   */
  logAPIError(req, error, statusCode = 500) {
    this.error(
      `API Error: ${req.method} ${req.path}`,
      error,
      {
        method: req.method,
        path: req.path,
        statusCode,
        userAgent: req.get('user-agent'),
        ip: req.ip,
        type: 'API_ERROR'
      }
    );
  }

  /**
   * Orchestrator 에러 로깅
   */
  logOrchestratorError(error, context = {}) {
    this.error(
      'Orchestrator Error',
      error,
      {
        ...context,
        type: 'ORCHESTRATOR_ERROR'
      }
    );
  }

  /**
   * 웹 검색 에러 로깅
   */
  logWebSearchError(error, query, context = {}) {
    this.error(
      `Web Search Error: ${query}`,
      error,
      {
        query,
        ...context,
        type: 'WEB_SEARCH_ERROR'
      }
    );
  }
}

// 싱글톤 인스턴스 생성
export const logger = new Logger({
  logLevel: process.env.LOG_LEVEL || 'info',
  enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true'
});

