/**
 * Task Scheduler Tool - 작업 예약 시스템
 * 작업을 예약하고 반복 실행하는 스케줄러 기능
 */

import { logger } from '../../utils/logger.js';
import Database from 'better-sqlite3';

/**
 * 스케줄러 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createSchedulerTools(options = {}) {
  const {
    dbPath = './athena-data/athena.db',
    mcpManager = null
  } = options;

  const db = new Database(dbPath);

  // 스케줄 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      task_type TEXT NOT NULL,
      task_config TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_config TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_run DATETIME,
      next_run DATETIME,
      run_count INTEGER DEFAULT 0,
      max_runs INTEGER,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_execution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      completed_at DATETIME,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_task_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_task_active ON scheduled_tasks(is_active);
  `);

  // Cron 표현식 파싱 (간단한 구현)
  const parseCron = (cronExpression) => {
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) {
      throw new Error('잘못된 Cron 표현식입니다. 형식: "분 시 일 월 요일"');
    }

    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4]
    };
  };

  // 다음 실행 시간 계산
  const calculateNextRun = (scheduleType, scheduleConfig, lastRun = null) => {
    const now = new Date();
    const baseTime = lastRun ? new Date(lastRun) : now;
    let nextRun = new Date(baseTime);

    switch (scheduleType) {
      case 'once':
        // 일회성 - 지정된 시간
        return new Date(scheduleConfig.datetime);

      case 'interval':
        // 간격 실행
        const intervalMs = scheduleConfig.intervalMinutes * 60 * 1000;
        nextRun = new Date(baseTime.getTime() + intervalMs);
        if (nextRun <= now) {
          nextRun = new Date(now.getTime() + intervalMs);
        }
        return nextRun;

      case 'daily':
        // 매일 특정 시간
        const [hours, minutes] = scheduleConfig.time.split(':').map(Number);
        nextRun.setHours(hours, minutes, 0, 0);
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        return nextRun;

      case 'weekly':
        // 매주 특정 요일과 시간
        const [wHours, wMinutes] = scheduleConfig.time.split(':').map(Number);
        const targetDay = scheduleConfig.dayOfWeek; // 0 = Sunday
        nextRun.setHours(wHours, wMinutes, 0, 0);

        const currentDay = nextRun.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd < 0 || (daysToAdd === 0 && nextRun <= now)) {
          daysToAdd += 7;
        }
        nextRun.setDate(nextRun.getDate() + daysToAdd);
        return nextRun;

      case 'monthly':
        // 매월 특정 일과 시간
        const [mHours, mMinutes] = scheduleConfig.time.split(':').map(Number);
        const targetDate = scheduleConfig.dayOfMonth;
        nextRun.setDate(targetDate);
        nextRun.setHours(mHours, mMinutes, 0, 0);

        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        return nextRun;

      case 'cron':
        // Cron 표현식 (간단한 구현)
        const cron = parseCron(scheduleConfig.expression);
        // 실제 cron 파싱은 복잡하므로 여기서는 기본 구현만
        const cronHour = cron.hour === '*' ? now.getHours() : parseInt(cron.hour);
        const cronMinute = cron.minute === '*' ? 0 : parseInt(cron.minute);
        nextRun.setHours(cronHour, cronMinute, 0, 0);
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        return nextRun;

      default:
        throw new Error(`알 수 없는 스케줄 타입: ${scheduleType}`);
    }
  };

  return [
    // 작업 예약 생성
    {
      name: 'create_scheduled_task',
      description: '새로운 예약 작업을 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '작업 이름'
          },
          description: {
            type: 'string',
            description: '작업 설명'
          },
          taskType: {
            type: 'string',
            enum: ['workflow', 'mcp_tool', 'notification', 'report'],
            description: '작업 유형'
          },
          taskConfig: {
            type: 'object',
            description: '작업 설정',
            properties: {
              workflowId: { type: 'string', description: 'workflow 타입일 때 워크플로우 ID' },
              toolName: { type: 'string', description: 'mcp_tool 타입일 때 도구 이름' },
              toolParams: { type: 'object', description: 'mcp_tool 타입일 때 도구 파라미터' },
              notificationConfig: { type: 'object', description: 'notification 타입일 때 알림 설정' },
              reportType: { type: 'string', description: 'report 타입일 때 보고서 종류' }
            }
          },
          scheduleType: {
            type: 'string',
            enum: ['once', 'interval', 'daily', 'weekly', 'monthly', 'cron'],
            description: '스케줄 유형'
          },
          scheduleConfig: {
            type: 'object',
            description: '스케줄 설정',
            properties: {
              datetime: { type: 'string', description: 'once: ISO 날짜시간' },
              intervalMinutes: { type: 'number', description: 'interval: 간격(분)' },
              time: { type: 'string', description: 'daily/weekly/monthly: HH:MM 형식' },
              dayOfWeek: { type: 'number', description: 'weekly: 요일 (0=일요일)' },
              dayOfMonth: { type: 'number', description: 'monthly: 일 (1-31)' },
              expression: { type: 'string', description: 'cron: Cron 표현식' }
            }
          },
          maxRuns: {
            type: 'number',
            description: '최대 실행 횟수 (null: 무제한)'
          },
          createdBy: {
            type: 'string',
            description: '생성자 ID'
          }
        },
        required: ['name', 'taskType', 'taskConfig', 'scheduleType', 'scheduleConfig']
      },
      execute: async (args) => {
        const {
          name,
          description,
          taskType,
          taskConfig,
          scheduleType,
          scheduleConfig,
          maxRuns,
          createdBy
        } = args;

        try {
          const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const nextRun = calculateNextRun(scheduleType, scheduleConfig);

          db.prepare(`
            INSERT INTO scheduled_tasks (id, name, description, task_type, task_config, schedule_type, schedule_config, next_run, max_runs, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            taskId,
            name,
            description || '',
            taskType,
            JSON.stringify(taskConfig),
            scheduleType,
            JSON.stringify(scheduleConfig),
            nextRun.toISOString(),
            maxRuns || null,
            createdBy || null
          );

          logger.info('예약 작업 생성', { taskId, name, scheduleType });

          return {
            success: true,
            taskId,
            name,
            nextRun: nextRun.toISOString(),
            scheduleType
          };

        } catch (error) {
          throw new Error(`작업 생성 실패: ${error.message}`);
        }
      }
    },

    // 예약 작업 목록 조회
    {
      name: 'list_scheduled_tasks',
      description: '예약된 작업 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          activeOnly: {
            type: 'boolean',
            description: '활성 작업만 조회',
            default: true
          },
          taskType: {
            type: 'string',
            description: '작업 유형별 필터링'
          }
        }
      },
      execute: async (args) => {
        const { activeOnly = true, taskType } = args;

        try {
          let query = 'SELECT * FROM scheduled_tasks WHERE 1=1';
          const params = [];

          if (activeOnly) {
            query += ' AND is_active = 1';
          }
          if (taskType) {
            query += ' AND task_type = ?';
            params.push(taskType);
          }

          query += ' ORDER BY next_run ASC';

          const tasks = db.prepare(query).all(...params);

          return {
            success: true,
            tasks: tasks.map(t => ({
              id: t.id,
              name: t.name,
              description: t.description,
              taskType: t.task_type,
              scheduleType: t.schedule_type,
              isActive: t.is_active === 1,
              nextRun: t.next_run,
              lastRun: t.last_run,
              runCount: t.run_count,
              maxRuns: t.max_runs
            })),
            total: tasks.length
          };

        } catch (error) {
          throw new Error(`목록 조회 실패: ${error.message}`);
        }
      }
    },

    // 예약 작업 상세 조회
    {
      name: 'get_scheduled_task',
      description: '예약 작업의 상세 정보를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '작업 ID'
          }
        },
        required: ['taskId']
      },
      execute: async (args) => {
        const { taskId } = args;

        try {
          const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(taskId);

          if (!task) {
            throw new Error('작업을 찾을 수 없습니다');
          }

          // 최근 실행 기록
          const executions = db.prepare(`
            SELECT * FROM task_execution_log
            WHERE task_id = ?
            ORDER BY started_at DESC
            LIMIT 10
          `).all(taskId);

          return {
            success: true,
            task: {
              id: task.id,
              name: task.name,
              description: task.description,
              taskType: task.task_type,
              taskConfig: JSON.parse(task.task_config),
              scheduleType: task.schedule_type,
              scheduleConfig: JSON.parse(task.schedule_config),
              isActive: task.is_active === 1,
              nextRun: task.next_run,
              lastRun: task.last_run,
              runCount: task.run_count,
              maxRuns: task.max_runs,
              createdAt: task.created_at
            },
            recentExecutions: executions.map(e => ({
              status: e.status,
              startedAt: e.started_at,
              completedAt: e.completed_at,
              error: e.error
            }))
          };

        } catch (error) {
          throw new Error(`조회 실패: ${error.message}`);
        }
      }
    },

    // 예약 작업 수동 실행
    {
      name: 'run_scheduled_task',
      description: '예약 작업을 즉시 수동으로 실행합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '실행할 작업 ID'
          }
        },
        required: ['taskId']
      },
      execute: async (args) => {
        const { taskId } = args;

        try {
          const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(taskId);

          if (!task) {
            throw new Error('작업을 찾을 수 없습니다');
          }

          const taskConfig = JSON.parse(task.task_config);
          const startedAt = new Date();

          // 실행 기록 생성
          const execResult = db.prepare(`
            INSERT INTO task_execution_log (task_id, status, started_at)
            VALUES (?, 'running', ?)
          `).run(taskId, startedAt.toISOString());

          const logId = execResult.lastInsertRowid;

          try {
            let result;

            switch (task.task_type) {
              case 'workflow':
                if (mcpManager) {
                  result = await mcpManager.executeTool('run_workflow', {
                    workflowId: taskConfig.workflowId,
                    inputs: taskConfig.inputs || {}
                  });
                }
                break;

              case 'mcp_tool':
                if (mcpManager) {
                  result = await mcpManager.executeTool(taskConfig.toolName, taskConfig.toolParams || {});
                }
                break;

              case 'notification':
                if (mcpManager) {
                  result = await mcpManager.executeTool('send_notification', taskConfig.notificationConfig);
                }
                break;

              case 'report':
                if (mcpManager) {
                  result = await mcpManager.executeTool('get_dashboard_summary', {
                    userId: taskConfig.userId || 'system'
                  });
                }
                break;

              default:
                throw new Error(`알 수 없는 작업 유형: ${task.task_type}`);
            }

            // 성공 기록
            db.prepare(`
              UPDATE task_execution_log
              SET status = 'completed', completed_at = ?, result = ?
              WHERE id = ?
            `).run(new Date().toISOString(), JSON.stringify(result), logId);

            // 작업 업데이트
            const scheduleConfig = JSON.parse(task.schedule_config);
            const nextRun = calculateNextRun(task.schedule_type, scheduleConfig, new Date());

            db.prepare(`
              UPDATE scheduled_tasks
              SET last_run = ?, next_run = ?, run_count = run_count + 1, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(startedAt.toISOString(), nextRun.toISOString(), taskId);

            // 최대 실행 횟수 체크
            if (task.max_runs && task.run_count + 1 >= task.max_runs) {
              db.prepare('UPDATE scheduled_tasks SET is_active = 0 WHERE id = ?').run(taskId);
            }

            logger.info('예약 작업 실행 완료', { taskId, taskType: task.task_type });

            return {
              success: true,
              taskId,
              taskName: task.name,
              result,
              nextRun: nextRun.toISOString()
            };

          } catch (execError) {
            // 실패 기록
            db.prepare(`
              UPDATE task_execution_log
              SET status = 'failed', completed_at = ?, error = ?
              WHERE id = ?
            `).run(new Date().toISOString(), execError.message, logId);

            throw execError;
          }

        } catch (error) {
          logger.error('예약 작업 실행 실패', error);
          throw new Error(`실행 실패: ${error.message}`);
        }
      }
    },

    // 예약 작업 활성화/비활성화
    {
      name: 'toggle_scheduled_task',
      description: '예약 작업을 활성화하거나 비활성화합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '작업 ID'
          },
          isActive: {
            type: 'boolean',
            description: '활성화 여부'
          }
        },
        required: ['taskId', 'isActive']
      },
      execute: async (args) => {
        const { taskId, isActive } = args;

        try {
          const result = db.prepare(`
            UPDATE scheduled_tasks
            SET is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(isActive ? 1 : 0, taskId);

          if (result.changes === 0) {
            throw new Error('작업을 찾을 수 없습니다');
          }

          // 활성화 시 다음 실행 시간 재계산
          if (isActive) {
            const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(taskId);
            const scheduleConfig = JSON.parse(task.schedule_config);
            const nextRun = calculateNextRun(task.schedule_type, scheduleConfig);

            db.prepare('UPDATE scheduled_tasks SET next_run = ? WHERE id = ?')
              .run(nextRun.toISOString(), taskId);
          }

          return {
            success: true,
            taskId,
            isActive
          };

        } catch (error) {
          throw new Error(`상태 변경 실패: ${error.message}`);
        }
      }
    },

    // 예약 작업 삭제
    {
      name: 'delete_scheduled_task',
      description: '예약 작업을 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '삭제할 작업 ID'
          }
        },
        required: ['taskId']
      },
      execute: async (args) => {
        const { taskId } = args;

        try {
          // 실행 기록 삭제
          db.prepare('DELETE FROM task_execution_log WHERE task_id = ?').run(taskId);

          // 작업 삭제
          const result = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(taskId);

          if (result.changes === 0) {
            throw new Error('작업을 찾을 수 없습니다');
          }

          return {
            success: true,
            taskId
          };

        } catch (error) {
          throw new Error(`삭제 실패: ${error.message}`);
        }
      }
    },

    // 실행 대기 중인 작업 조회
    {
      name: 'get_pending_tasks',
      description: '현재 실행 대기 중인 작업들을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          withinMinutes: {
            type: 'number',
            description: '앞으로 N분 이내 실행 예정 작업',
            default: 60
          }
        }
      },
      execute: async (args) => {
        const { withinMinutes = 60 } = args;

        try {
          const deadline = new Date();
          deadline.setMinutes(deadline.getMinutes() + withinMinutes);

          const tasks = db.prepare(`
            SELECT * FROM scheduled_tasks
            WHERE is_active = 1 AND next_run <= ?
            ORDER BY next_run ASC
          `).all(deadline.toISOString());

          return {
            success: true,
            pendingTasks: tasks.map(t => ({
              id: t.id,
              name: t.name,
              taskType: t.task_type,
              nextRun: t.next_run,
              minutesUntilRun: Math.round((new Date(t.next_run) - new Date()) / 60000)
            })),
            total: tasks.length
          };

        } catch (error) {
          throw new Error(`조회 실패: ${error.message}`);
        }
      }
    },

    // 빠른 일정 예약 (헬퍼)
    {
      name: 'schedule_quick_task',
      description: '빠르게 일회성 작업을 예약합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '작업 이름'
          },
          toolName: {
            type: 'string',
            description: '실행할 MCP 도구'
          },
          toolParams: {
            type: 'object',
            description: '도구 파라미터'
          },
          runAt: {
            type: 'string',
            description: '실행 시간 (ISO 형식 또는 "5분 후", "1시간 후" 등)'
          }
        },
        required: ['name', 'toolName', 'runAt']
      },
      execute: async (args) => {
        const { name, toolName, toolParams = {}, runAt } = args;

        try {
          let datetime;

          // 상대 시간 파싱
          if (runAt.includes('분 후')) {
            const minutes = parseInt(runAt);
            datetime = new Date();
            datetime.setMinutes(datetime.getMinutes() + minutes);
          } else if (runAt.includes('시간 후')) {
            const hours = parseInt(runAt);
            datetime = new Date();
            datetime.setHours(datetime.getHours() + hours);
          } else {
            datetime = new Date(runAt);
          }

          if (isNaN(datetime.getTime())) {
            throw new Error('유효하지 않은 시간 형식입니다');
          }

          const taskId = `quick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          db.prepare(`
            INSERT INTO scheduled_tasks (id, name, task_type, task_config, schedule_type, schedule_config, next_run, max_runs)
            VALUES (?, ?, 'mcp_tool', ?, 'once', ?, ?, 1)
          `).run(
            taskId,
            name,
            JSON.stringify({ toolName, toolParams }),
            JSON.stringify({ datetime: datetime.toISOString() }),
            datetime.toISOString()
          );

          return {
            success: true,
            taskId,
            name,
            runAt: datetime.toISOString(),
            runAtFormatted: datetime.toLocaleString('ko-KR')
          };

        } catch (error) {
          throw new Error(`예약 실패: ${error.message}`);
        }
      }
    }
  ];
}
