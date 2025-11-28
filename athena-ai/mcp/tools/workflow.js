/**
 * Workflow Automation Tool - 워크플로우 자동화
 * MCP 도구들을 연결하여 복합 작업을 자동화하는 기능
 */

import { logger } from '../../utils/logger.js';
import Database from 'better-sqlite3';
import path from 'path';

/**
 * 워크플로우 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createWorkflowTools(options = {}) {
  const {
    dbPath = './athena-data/athena.db',
    mcpManager = null
  } = options;

  // DB 연결
  const db = new Database(dbPath);

  // 워크플로우 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      steps TEXT NOT NULL,
      triggers TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workflow_executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      started_at DATETIME,
      completed_at DATETIME,
      steps_results TEXT,
      error TEXT,
      triggered_by TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id)
    );

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      steps TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 기본 템플릿 추가
  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO workflow_templates (id, name, description, category, steps)
    VALUES (?, ?, ?, ?, ?)
  `);

  const defaultTemplates = [
    {
      id: 'meeting-summary',
      name: '회의 녹음 처리',
      description: '오디오 파일을 텍스트로 변환하고 회의록을 생성',
      category: 'productivity',
      steps: [
        { tool: 'speech_to_text', params: { audioPath: '{{input.audioPath}}', language: 'ko' } },
        { tool: 'generate_meeting_minutes', params: { text: '{{steps[0].result.text}}' } },
        { tool: 'send_notification', params: { title: '회의록 생성 완료', message: '{{steps[1].result.summary}}', type: 'success' } }
      ]
    },
    {
      id: 'daily-report',
      name: '일일 보고서 생성',
      description: '프로젝트 활동을 분석하고 보고서를 생성하여 전송',
      category: 'reporting',
      steps: [
        { tool: 'get_dashboard_summary', params: { userId: '{{input.userId}}' } },
        { tool: 'send_notification', params: { title: '일일 보고서', message: '{{steps[0].result.summary}}', type: 'info' } }
      ]
    },
    {
      id: 'content-translation',
      name: '다국어 콘텐츠 생성',
      description: '텍스트를 여러 언어로 번역',
      category: 'content',
      steps: [
        { tool: 'translate', params: { text: '{{input.text}}', targetLanguage: 'en' } },
        { tool: 'translate', params: { text: '{{input.text}}', targetLanguage: 'ja' } },
        { tool: 'translate', params: { text: '{{input.text}}', targetLanguage: 'zh' } }
      ]
    },
    {
      id: 'github-pr-notify',
      name: 'GitHub PR 알림',
      description: 'GitHub PR 생성 시 Slack으로 알림',
      category: 'development',
      steps: [
        { tool: 'get_pull_request', params: { owner: '{{input.owner}}', repo: '{{input.repo}}', pullNumber: '{{input.prNumber}}' } },
        { tool: 'send_slack_message', params: { channel: '{{input.channel}}', text: 'New PR: {{steps[0].result.title}}' } }
      ]
    }
  ];

  defaultTemplates.forEach(template => {
    insertTemplate.run(
      template.id,
      template.name,
      template.description,
      template.category,
      JSON.stringify(template.steps)
    );
  });

  // 워크플로우 실행 함수
  const executeWorkflow = async (workflowId, inputs = {}, mcpMgr = mcpManager) => {
    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId);
    if (!workflow) {
      throw new Error(`워크플로우를 찾을 수 없습니다: ${workflowId}`);
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const steps = JSON.parse(workflow.steps);
    const stepsResults = [];

    // 실행 기록 생성
    db.prepare(`
      INSERT INTO workflow_executions (id, workflow_id, status, started_at, triggered_by)
      VALUES (?, ?, 'running', CURRENT_TIMESTAMP, ?)
    `).run(executionId, workflowId, JSON.stringify(inputs));

    try {
      logger.info('워크플로우 실행 시작', { workflowId, executionId });

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        // 파라미터 템플릿 치환
        const resolvedParams = resolveParams(step.params, { input: inputs, steps: stepsResults });

        logger.info(`Step ${i + 1}/${steps.length} 실행`, { tool: step.tool });

        // 도구 실행
        let result;
        if (mcpMgr) {
          result = await mcpMgr.executeTool(step.tool, resolvedParams);
        } else {
          result = { success: false, error: 'MCP Manager가 연결되지 않음' };
        }

        stepsResults.push({
          step: i + 1,
          tool: step.tool,
          params: resolvedParams,
          result
        });

        // 실패 시 중단 (옵션에 따라)
        if (!result.success && step.stopOnError !== false) {
          throw new Error(`Step ${i + 1} 실패: ${result.error || '알 수 없는 오류'}`);
        }
      }

      // 성공 완료
      db.prepare(`
        UPDATE workflow_executions
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP, steps_results = ?
        WHERE id = ?
      `).run(JSON.stringify(stepsResults), executionId);

      logger.info('워크플로우 실행 완료', { workflowId, executionId });

      return {
        success: true,
        executionId,
        workflowId,
        stepsResults
      };

    } catch (error) {
      // 실패 기록
      db.prepare(`
        UPDATE workflow_executions
        SET status = 'failed', completed_at = CURRENT_TIMESTAMP, steps_results = ?, error = ?
        WHERE id = ?
      `).run(JSON.stringify(stepsResults), error.message, executionId);

      logger.error('워크플로우 실행 실패', error);
      throw error;
    }
  };

  // 파라미터 템플릿 치환
  const resolveParams = (params, context) => {
    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.includes('{{')) {
        // 템플릿 치환
        resolved[key] = value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
          try {
            // 경로 파싱 (예: steps[0].result.text)
            const parts = path.trim().split(/[\.\[\]]+/).filter(Boolean);
            let current = context;

            for (const part of parts) {
              if (current === undefined || current === null) return match;
              current = current[part];
            }

            return current !== undefined ? String(current) : match;
          } catch {
            return match;
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = resolveParams(value, context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  };

  return [
    // 워크플로우 생성
    {
      name: 'create_workflow',
      description: '새로운 워크플로우를 생성합니다. 여러 MCP 도구를 순차적으로 실행하는 자동화 흐름입니다.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '워크플로우 이름'
          },
          description: {
            type: 'string',
            description: '워크플로우 설명'
          },
          steps: {
            type: 'array',
            description: '실행할 단계들',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', description: 'MCP 도구 이름' },
                params: { type: 'object', description: '도구 파라미터 ({{input.xxx}} 또는 {{steps[n].result.xxx}} 형식으로 동적 값 사용 가능)' },
                stopOnError: { type: 'boolean', description: '오류 시 중단 여부', default: true }
              },
              required: ['tool', 'params']
            }
          },
          triggers: {
            type: 'object',
            description: '자동 실행 트리거 (예: schedule, webhook)',
            properties: {
              type: { type: 'string', enum: ['manual', 'schedule', 'webhook'] },
              schedule: { type: 'string', description: 'Cron 표현식 (schedule 타입일 때)' },
              webhookPath: { type: 'string', description: 'Webhook 경로 (webhook 타입일 때)' }
            }
          }
        },
        required: ['name', 'steps']
      },
      execute: async (args) => {
        const { name, description, steps, triggers } = args;

        try {
          const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          db.prepare(`
            INSERT INTO workflows (id, name, description, steps, triggers)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            workflowId,
            name,
            description || '',
            JSON.stringify(steps),
            triggers ? JSON.stringify(triggers) : null
          );

          logger.info('워크플로우 생성', { workflowId, name });

          return {
            success: true,
            workflowId,
            name,
            stepsCount: steps.length
          };

        } catch (error) {
          logger.error('워크플로우 생성 오류', error);
          throw new Error(`워크플로우 생성 실패: ${error.message}`);
        }
      }
    },

    // 워크플로우 실행
    {
      name: 'run_workflow',
      description: '저장된 워크플로우를 실행합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: '실행할 워크플로우 ID'
          },
          inputs: {
            type: 'object',
            description: '워크플로우 입력 값들 ({{input.xxx}}로 참조됨)'
          }
        },
        required: ['workflowId']
      },
      execute: async (args) => {
        const { workflowId, inputs = {} } = args;
        return await executeWorkflow(workflowId, inputs, mcpManager);
      }
    },

    // 워크플로우 목록 조회
    {
      name: 'list_workflows',
      description: '저장된 워크플로우 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          activeOnly: {
            type: 'boolean',
            description: '활성화된 워크플로우만 조회',
            default: true
          }
        }
      },
      execute: async (args) => {
        const { activeOnly = true } = args;

        try {
          let query = 'SELECT * FROM workflows';
          if (activeOnly) {
            query += ' WHERE is_active = 1';
          }
          query += ' ORDER BY updated_at DESC';

          const workflows = db.prepare(query).all();

          return {
            success: true,
            workflows: workflows.map(w => ({
              id: w.id,
              name: w.name,
              description: w.description,
              stepsCount: JSON.parse(w.steps).length,
              triggers: w.triggers ? JSON.parse(w.triggers) : null,
              isActive: w.is_active === 1,
              createdAt: w.created_at,
              updatedAt: w.updated_at
            })),
            total: workflows.length
          };

        } catch (error) {
          logger.error('워크플로우 목록 조회 오류', error);
          throw new Error(`목록 조회 실패: ${error.message}`);
        }
      }
    },

    // 워크플로우 상세 조회
    {
      name: 'get_workflow',
      description: '워크플로우 상세 정보를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: '워크플로우 ID'
          }
        },
        required: ['workflowId']
      },
      execute: async (args) => {
        const { workflowId } = args;

        try {
          const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId);

          if (!workflow) {
            throw new Error('워크플로우를 찾을 수 없습니다');
          }

          // 최근 실행 기록
          const executions = db.prepare(`
            SELECT * FROM workflow_executions
            WHERE workflow_id = ?
            ORDER BY started_at DESC LIMIT 10
          `).all(workflowId);

          return {
            success: true,
            workflow: {
              id: workflow.id,
              name: workflow.name,
              description: workflow.description,
              steps: JSON.parse(workflow.steps),
              triggers: workflow.triggers ? JSON.parse(workflow.triggers) : null,
              isActive: workflow.is_active === 1,
              createdAt: workflow.created_at,
              updatedAt: workflow.updated_at
            },
            recentExecutions: executions.map(e => ({
              id: e.id,
              status: e.status,
              startedAt: e.started_at,
              completedAt: e.completed_at,
              error: e.error
            }))
          };

        } catch (error) {
          logger.error('워크플로우 조회 오류', error);
          throw new Error(`조회 실패: ${error.message}`);
        }
      }
    },

    // 워크플로우 삭제
    {
      name: 'delete_workflow',
      description: '워크플로우를 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: '삭제할 워크플로우 ID'
          }
        },
        required: ['workflowId']
      },
      execute: async (args) => {
        const { workflowId } = args;

        try {
          const result = db.prepare('DELETE FROM workflows WHERE id = ?').run(workflowId);

          if (result.changes === 0) {
            throw new Error('워크플로우를 찾을 수 없습니다');
          }

          // 실행 기록도 삭제
          db.prepare('DELETE FROM workflow_executions WHERE workflow_id = ?').run(workflowId);

          logger.info('워크플로우 삭제', { workflowId });

          return {
            success: true,
            workflowId
          };

        } catch (error) {
          logger.error('워크플로우 삭제 오류', error);
          throw new Error(`삭제 실패: ${error.message}`);
        }
      }
    },

    // 템플릿에서 워크플로우 생성
    {
      name: 'create_workflow_from_template',
      description: '템플릿을 기반으로 워크플로우를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: {
            type: 'string',
            description: '템플릿 ID'
          },
          name: {
            type: 'string',
            description: '새 워크플로우 이름'
          },
          customization: {
            type: 'object',
            description: '템플릿 커스터마이징 옵션'
          }
        },
        required: ['templateId']
      },
      execute: async (args) => {
        const { templateId, name, customization = {} } = args;

        try {
          const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(templateId);

          if (!template) {
            throw new Error('템플릿을 찾을 수 없습니다');
          }

          const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const workflowName = name || `${template.name} - ${new Date().toLocaleDateString('ko-KR')}`;
          let steps = JSON.parse(template.steps);

          // 커스터마이징 적용
          if (customization.steps) {
            steps = steps.map((step, i) => ({
              ...step,
              ...customization.steps[i]
            }));
          }

          db.prepare(`
            INSERT INTO workflows (id, name, description, steps)
            VALUES (?, ?, ?, ?)
          `).run(workflowId, workflowName, template.description, JSON.stringify(steps));

          logger.info('템플릿에서 워크플로우 생성', { templateId, workflowId });

          return {
            success: true,
            workflowId,
            name: workflowName,
            templateName: template.name
          };

        } catch (error) {
          logger.error('템플릿 워크플로우 생성 오류', error);
          throw new Error(`생성 실패: ${error.message}`);
        }
      }
    },

    // 템플릿 목록 조회
    {
      name: 'list_workflow_templates',
      description: '사용 가능한 워크플로우 템플릿 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: '카테고리별 필터링'
          }
        }
      },
      execute: async (args) => {
        const { category } = args;

        try {
          let query = 'SELECT * FROM workflow_templates';
          const params = [];

          if (category) {
            query += ' WHERE category = ?';
            params.push(category);
          }

          query += ' ORDER BY name';

          const templates = db.prepare(query).all(...params);

          return {
            success: true,
            templates: templates.map(t => ({
              id: t.id,
              name: t.name,
              description: t.description,
              category: t.category,
              stepsCount: JSON.parse(t.steps).length
            })),
            categories: [...new Set(templates.map(t => t.category).filter(Boolean))]
          };

        } catch (error) {
          logger.error('템플릿 목록 조회 오류', error);
          throw new Error(`목록 조회 실패: ${error.message}`);
        }
      }
    },

    // 실행 기록 조회
    {
      name: 'get_workflow_executions',
      description: '워크플로우 실행 기록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: '특정 워크플로우의 실행만 조회 (선택)'
          },
          status: {
            type: 'string',
            enum: ['pending', 'running', 'completed', 'failed'],
            description: '상태별 필터링'
          },
          limit: {
            type: 'number',
            description: '조회 개수',
            default: 20
          }
        }
      },
      execute: async (args) => {
        const { workflowId, status, limit = 20 } = args;

        try {
          let query = `
            SELECT e.*, w.name as workflow_name
            FROM workflow_executions e
            JOIN workflows w ON e.workflow_id = w.id
            WHERE 1=1
          `;
          const params = [];

          if (workflowId) {
            query += ' AND e.workflow_id = ?';
            params.push(workflowId);
          }
          if (status) {
            query += ' AND e.status = ?';
            params.push(status);
          }

          query += ' ORDER BY e.started_at DESC LIMIT ?';
          params.push(limit);

          const executions = db.prepare(query).all(...params);

          return {
            success: true,
            executions: executions.map(e => ({
              id: e.id,
              workflowId: e.workflow_id,
              workflowName: e.workflow_name,
              status: e.status,
              startedAt: e.started_at,
              completedAt: e.completed_at,
              error: e.error,
              stepsCount: e.steps_results ? JSON.parse(e.steps_results).length : 0
            })),
            total: executions.length
          };

        } catch (error) {
          logger.error('실행 기록 조회 오류', error);
          throw new Error(`조회 실패: ${error.message}`);
        }
      }
    }
  ];
}
