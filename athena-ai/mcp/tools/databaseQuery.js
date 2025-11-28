/**
 * 데이터베이스 쿼리 도구
 * SQLite 데이터베이스에 쿼리를 실행하는 MCP 도구
 */

import { logger } from '../../utils/logger.js';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * 데이터베이스 쿼리 도구 생성 함수
 */
export function createDatabaseQueryTool(options = {}) {
  const defaultDbPath = options.dbPath || './data/athena.db';

  return {
    name: 'query_database',
    description: 'SQLite 데이터베이스에 SQL 쿼리를 실행하고 결과를 반환합니다. SELECT 쿼리만 지원합니다 (보안상의 이유로).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '실행할 SQL SELECT 쿼리 (예: SELECT * FROM users WHERE id = ?)'
        },
        params: {
          type: 'array',
          description: '쿼리 파라미터 배열 (예: [1, "test"])',
          items: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'null' }
            ]
          }
        },
        database_path: {
          type: 'string',
          description: '쿼리할 데이터베이스 파일 경로 (기본값: 프로젝트의 메인 DB)'
        }
      },
      required: ['query']
    },
    execute: async (args) => {
      const { query, params = [], database_path } = args;

      try {
        // 보안: SELECT 쿼리만 허용
        const trimmedQuery = query.trim().toUpperCase();
        if (!trimmedQuery.startsWith('SELECT')) {
          return {
            success: false,
            error: 'Only SELECT queries are allowed',
            message: '보안상의 이유로 SELECT 쿼리만 실행할 수 있습니다.'
          };
        }

        // 위험한 키워드 차단
        const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE'];
        const upperQuery = query.toUpperCase();
        for (const keyword of dangerousKeywords) {
          if (upperQuery.includes(keyword)) {
            return {
              success: false,
              error: `Dangerous keyword detected: ${keyword}`,
              message: `보안상의 이유로 ${keyword} 키워드를 포함한 쿼리는 실행할 수 없습니다.`
            };
          }
        }

        // 데이터베이스 경로 결정
        const dbPath = database_path || defaultDbPath;
        const resolvedPath = path.resolve(dbPath);

        // 파일 존재 확인
        if (!fs.existsSync(resolvedPath)) {
          return {
            success: false,
            error: `Database file not found: ${resolvedPath}`,
            message: '데이터베이스 파일을 찾을 수 없습니다.'
          };
        }

        logger.info('데이터베이스 쿼리 실행', {
          query: query.substring(0, 100),
          paramsCount: params.length,
          dbPath: resolvedPath
        });

        // 데이터베이스 연결
        const db = new Database(resolvedPath, { readonly: true });

        try {
          // 쿼리 실행
          const stmt = db.prepare(query);
          const rows = params.length > 0 ? stmt.all(...params) : stmt.all();

          // 컬럼 정보 가져오기
          const firstRow = rows.length > 0 ? rows[0] : null;
          const columns = firstRow ? Object.keys(firstRow) : [];

          logger.info('쿼리 실행 완료', {
            rowCount: rows.length,
            columnCount: columns.length
          });

          return {
            success: true,
            query,
            params,
            rowCount: rows.length,
            columns,
            rows: rows,
            timestamp: new Date().toISOString()
          };
        } finally {
          db.close();
        }
      } catch (error) {
        logger.error('데이터베이스 쿼리 실패', error, { query: query.substring(0, 100) });
        return {
          success: false,
          error: error.message,
          query
        };
      }
    }
  };
}
