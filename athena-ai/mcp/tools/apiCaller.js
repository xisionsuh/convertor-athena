/**
 * API 호출 도구
 * 외부 API를 호출하고 결과를 반환하는 MCP 도구
 */

import { logger } from '../../utils/logger.js';
import https from 'https';
import http from 'http';
import { URL } from 'url';

/**
 * API 호출 도구 생성 함수
 */
export function createAPICallerTool() {
  return {
    name: 'call_api',
    description: '외부 API를 호출하고 결과를 반환합니다. GET, POST, PUT, DELETE 메서드를 지원합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '호출할 API의 URL (예: https://api.example.com/data)'
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          description: 'HTTP 메서드 (기본값: GET)',
          default: 'GET'
        },
        headers: {
          type: 'object',
          description: 'HTTP 헤더 (예: {"Authorization": "Bearer token", "Content-Type": "application/json"})',
          additionalProperties: {
            type: 'string'
          }
        },
        body: {
          type: 'string',
          description: '요청 본문 (JSON 문자열 또는 일반 텍스트)'
        },
        timeout: {
          type: 'number',
          description: '요청 타임아웃 (밀리초, 기본값: 30000)',
          default: 30000
        }
      },
      required: ['url']
    },
    execute: async (args) => {
      const { url, method = 'GET', headers = {}, body, timeout = 30000 } = args;

      try {
        // URL 검증
        let apiUrl;
        try {
          apiUrl = new URL(url);
        } catch (error) {
          return {
            success: false,
            error: `Invalid URL: ${url}`,
            message: 'URL 형식이 올바르지 않습니다.'
          };
        }

        // 보안: localhost 및 내부 IP 차단 (선택적)
        const hostname = apiUrl.hostname.toLowerCase();
        const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
        if (blockedHosts.includes(hostname)) {
          return {
            success: false,
            error: 'Localhost access blocked',
            message: '보안상의 이유로 localhost 접근이 차단되었습니다.'
          };
        }

        // 기본 헤더 설정
        const requestHeaders = {
          'User-Agent': 'Athena-AI-MCP/1.0',
          ...headers
        };

        // Content-Type이 없고 body가 있으면 자동 설정
        if (body && !requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
          try {
            JSON.parse(body);
            requestHeaders['Content-Type'] = 'application/json';
          } catch {
            requestHeaders['Content-Type'] = 'text/plain';
          }
        }

        logger.info('API 호출 시작', { url, method, hasBody: !!body });

        // HTTP/HTTPS 모듈 선택
        const httpModule = apiUrl.protocol === 'https:' ? https : http;

        // Promise로 래핑하여 비동기 처리
        const response = await new Promise((resolve, reject) => {
          const requestOptions = {
            hostname: apiUrl.hostname,
            port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
            path: apiUrl.pathname + apiUrl.search,
            method: method.toUpperCase(),
            headers: requestHeaders,
            timeout: timeout
          };

          const req = httpModule.request(requestOptions, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
              responseData += chunk;
            });

            res.on('end', () => {
              let parsedData = responseData;
              
              // JSON 파싱 시도
              try {
                parsedData = JSON.parse(responseData);
              } catch {
                // JSON이 아니면 그대로 사용
              }

              resolve({
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
                headers: res.headers,
                data: parsedData,
                rawData: responseData
              });
            });
          });

          req.on('error', (error) => {
            reject(error);
          });

          req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Request timeout after ${timeout}ms`));
          });

          // 요청 본문 전송
          if (body) {
            req.write(body);
          }

          req.end();
        });

        logger.info('API 호출 완료', {
          url,
          statusCode: response.statusCode,
          dataLength: typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length
        });

        return {
          success: true,
          url,
          method: method.toUpperCase(),
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers,
          data: response.data,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error('API 호출 실패', error, { url, method });
        return {
          success: false,
          error: error.message,
          url,
          method: method.toUpperCase()
        };
      }
    }
  };
}

