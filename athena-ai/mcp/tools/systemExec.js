/**
 * MCP System Exec Tool
 * 시스템 명령 실행 도구 (3단계 보안 정책)
 */

import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';

const EXEC_TIMEOUT_MS = 30000;
const EXEC_MAX_BUFFER = 10 * 1024 * 1024;

const SAFE_PATTERNS = [
  /^ls(\s|$)/,
  /^cat(\s|$)/,
  /^df(\s|$)/,
  /^free(\s|$)/,
  /^ps(\s|$)/,
  /^uptime(\s|$)/,
  /^whoami(\s|$)/,
  /^hostname(\s|$)/,
  /^date(\s|$)/,
  /^pm2\s+list(\s|$)/,
  /^pm2\s+jlist(\s|$)/,
  /^git\s+status(\s|$)/,
  /^git\s+log(\s|$)/,
  /^npm\s+list(\s|$)/,
  /^du(\s|$)/,
  /^head(\s|$)/,
  /^tail(\s|$)/,
  /^wc(\s|$)/,
  /^grep(\s|$)/,
  /^find(\s|$)/
];

const MODERATE_PATTERNS = [
  /^pm2\s+restart(\s|$)/,
  /^pm2\s+reload(\s|$)/,
  /^npm\s+run\s+build(\s|$)/,
  /^npm\s+install(\s|$)/,
  /^git\s+pull(\s|$)/,
  /^git\s+checkout(\s|$)/,
  /^mkdir(\s|$)/,
  /^cp(\s|$)/,
  /^mv(\s|$)/,
  /^touch(\s|$)/,
  /^python3?(\s|$)/,
  /^\/home\/ubuntu\/\S+\/venv\/bin\/python(\s|$)/
];

const DANGEROUS_PATTERNS = [
  /^rm(\s|$)/,
  /^kill(\s|$)/,
  /^sudo(\s|$)/,
  /^systemctl(\s|$)/,
  /^reboot(\s|$)/,
  /^shutdown(\s|$)/,
  /^chmod(\s|$)/,
  /^chown(\s|$)/,
  /^pkill(\s|$)/,
  /^dd(\s|$)/
];

function normalizeCommand(command) {
  return String(command || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function detectSecurityTier(command) {
  const normalized = normalizeCommand(command);

  if (DANGEROUS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'DANGEROUS';
  }
  if (MODERATE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'MODERATE';
  }
  if (SAFE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'SAFE';
  }

  // 분류되지 않은 명령은 기본적으로 승인이 필요한 위험 단계로 처리
  return 'DANGEROUS';
}

function createRequestId() {
  return `cmdreq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function initializeApprovalTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_approvals (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      security_level TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      resolved_by TEXT,
      result TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_command_approvals_status
      ON command_approvals(status);
  `);
}

/**
 * 시스템 명령 실행 도구 생성
 * @param {Object} options - 옵션
 * @param {string} options.dbPath - SQLite DB 경로
 * @returns {Object} MCP Tool
 */
export function createSystemExecTool(options = {}) {
  const { dbPath = './athena-data/athena.db' } = options;
  const db = new Database(dbPath);
  initializeApprovalTable(db);

  return {
    name: 'system_exec',
    description:
      '시스템 명령을 보안 티어(SAFE, MODERATE, DANGEROUS)로 분류하여 실행합니다. DANGEROUS는 승인 요청으로 저장됩니다.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '실행할 시스템 명령어'
        },
        cwd: {
          type: 'string',
          description: '명령 실행 경로 (생략 시 프로세스 현재 경로)'
        }
      },
      required: ['command']
    },
    execute: async (args) => {
      const { command, cwd } = args;

      if (!command || typeof command !== 'string') {
        throw new Error('command는 필수 문자열입니다.');
      }

      const normalizedCommand = normalizeCommand(command);
      const securityTier = detectSecurityTier(command);

      if (securityTier === 'DANGEROUS') {
        const requestId = createRequestId();
        db.prepare(`
          INSERT INTO command_approvals (
            id, command, security_level, status
          ) VALUES (?, ?, ?, 'pending')
        `).run(requestId, command, securityTier);

        logger.warn('위험 명령 승인 대기 등록', {
          requestId,
          command,
          securityTier
        });

        return {
          success: false,
          status: 'pending_approval',
          requestId,
          securityTier,
          message: '위험 명령은 승인 후 실행할 수 있습니다.'
        };
      }

      try {
        const output = execSync(command, {
          cwd: cwd || process.cwd(),
          timeout: EXEC_TIMEOUT_MS,
          maxBuffer: EXEC_MAX_BUFFER,
          encoding: 'utf-8'
        });

        if (securityTier === 'MODERATE') {
          logger.info('중간 위험 명령 실행', { command, cwd: cwd || process.cwd() });
        } else {
          logger.debug('안전 명령 실행', { command, cwd: cwd || process.cwd() });
        }

        return {
          success: true,
          status: 'executed',
          securityTier,
          command,
          cwd: cwd || process.cwd(),
          output: output || ''
        };
      } catch (error) {
        logger.error('시스템 명령 실행 실패', error, {
          command,
          securityTier,
          cwd: cwd || process.cwd()
        });

        return {
          success: false,
          status: 'failed',
          securityTier,
          command,
          cwd: cwd || process.cwd(),
          error: error.message,
          stdout: error.stdout ? String(error.stdout) : '',
          stderr: error.stderr ? String(error.stderr) : ''
        };
      }
    }
  };
}
