/**
 * MCP Process Manager Tool
 * PM2 프로세스 관리 도구
 */

import { execSync } from 'child_process';
import { logger } from '../../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

function quoteShellArg(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function formatProcess(pm2Process) {
  const pm2Env = pm2Process?.pm2_env || {};
  const monit = pm2Process?.monit || {};
  const pmUptime = typeof pm2Env.pm_uptime === 'number' ? pm2Env.pm_uptime : null;
  const uptime = pmUptime ? Math.max(0, Math.floor((Date.now() - pmUptime) / 1000)) : 0;

  return {
    pid: typeof pm2Process?.pid === 'number' ? pm2Process.pid : null,
    name: pm2Process?.name || pm2Env.name || null,
    status: pm2Env.status || 'unknown',
    cpu: typeof monit.cpu === 'number' ? monit.cpu : 0,
    memory: typeof monit.memory === 'number' ? monit.memory : 0,
    uptime
  };
}

export function createProcessManagerTool(options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  const maxBuffer = options.maxBuffer || DEFAULT_MAX_BUFFER;

  const runPm2 = (command) => {
    return execSync(command, {
      timeout,
      maxBuffer,
      encoding: 'utf-8'
    });
  };

  const getProcessList = () => {
    const raw = runPm2('pm2 jlist');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('pm2 jlist returned unexpected format');
    }

    return parsed;
  };

  const getProcessByName = (name) => {
    const list = getProcessList();
    return list.find((process) => process?.name === name || process?.pm2_env?.name === name) || null;
  };

  const requireName = (name, action) => {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error(`name is required for action: ${action}`);
    }
    return name.trim();
  };

  return {
    name: 'process_manager',
    description: 'PM2 프로세스를 조회/제어합니다. list, status, restart, reload, stop, start, logs 액션을 지원합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'status', 'restart', 'reload', 'stop', 'start', 'logs'],
          description: '실행할 PM2 액션'
        },
        name: {
          type: 'string',
          description: '프로세스 이름 (list 제외 필수)'
        }
      },
      required: ['action']
    },
    execute: async (args) => {
      const { action, name } = args || {};

      try {
        switch (action) {
          case 'list': {
            const processes = getProcessList().map(formatProcess);
            return {
              success: true,
              action,
              processes,
              count: processes.length
            };
          }

          case 'status': {
            const processName = requireName(name, action);
            const process = getProcessByName(processName);

            if (!process) {
              return {
                success: false,
                action,
                error: `Process not found: ${processName}`
              };
            }

            return {
              success: true,
              action,
              process: formatProcess(process)
            };
          }

          case 'restart':
          case 'reload':
          case 'stop':
          case 'start': {
            const processName = requireName(name, action);
            const quotedName = quoteShellArg(processName);
            const output = runPm2(`pm2 ${action} ${quotedName}`);
            const process = getProcessByName(processName);

            logger.info('PM2 process action executed', { action, name: processName });

            return {
              success: true,
              action,
              output: output?.trim() || '',
              process: process ? formatProcess(process) : {
                pid: null,
                name: processName,
                status: 'unknown',
                cpu: 0,
                memory: 0,
                uptime: 0
              }
            };
          }

          case 'logs': {
            const processName = requireName(name, action);
            const quotedName = quoteShellArg(processName);
            const logs = runPm2(`pm2 logs ${quotedName} --lines 50 --nostream`);
            const process = getProcessByName(processName);

            return {
              success: true,
              action,
              logs: logs || '',
              process: process ? formatProcess(process) : {
                pid: null,
                name: processName,
                status: 'unknown',
                cpu: 0,
                memory: 0,
                uptime: 0
              }
            };
          }

          default:
            throw new Error(`Unsupported action: ${action}`);
        }
      } catch (error) {
        logger.error('PM2 process manager tool failed', error, { action, name });

        return {
          success: false,
          action,
          name: name || null,
          error: error.message,
          stdout: error?.stdout ? String(error.stdout) : '',
          stderr: error?.stderr ? String(error.stderr) : ''
        };
      }
    }
  };
}
