/**
 * Self Memory Tool - AI가 스스로 메모리/아이덴티티를 편집하는 MCP 도구
 */

import fs from 'fs';
import { logger } from '../../utils/logger.js';

export function createSelfMemoryTool(options = {}) {
  const workspaceMemory = options.workspaceMemory;

  if (!workspaceMemory) {
    throw new Error('workspaceMemory is required for selfMemory tool');
  }

  return {
    name: 'self_memory',
    description: `AI 자기 자신의 메모리와 정체성을 읽고 편집하는 도구.
Actions:
- read_memory: MEMORY.md 읽기
- update_memory: MEMORY.md 전체 덮어쓰기
- append_memory: MEMORY.md 특정 섹션에 내용 추가
- read_identity: IDENTITY.md 읽기
- update_identity: IDENTITY.md 전체 덮어쓰기
- read_daily_log: 특정 날짜의 일일 로그 읽기
- write_daily_log: 오늘의 일일 로그에 엔트리 추가`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read_memory', 'update_memory', 'append_memory', 'read_identity', 'update_identity', 'read_daily_log', 'write_daily_log'],
          description: '수행할 작업'
        },
        content: {
          type: 'string',
          description: 'update/append/write 시 내용'
        },
        section: {
          type: 'string',
          description: 'append_memory 시 섹션 이름 (예: "Important Facts")'
        },
        date: {
          type: 'string',
          description: 'read_daily_log 시 날짜 (YYYY-MM-DD, 미지정 시 오늘)'
        }
      },
      required: ['action']
    },
    execute: async (args) => {
      try {
        switch (args.action) {
          case 'read_memory': {
            const memory = workspaceMemory.getMemory();
            return { success: true, data: memory };
          }

          case 'update_memory': {
            if (!args.content) return { success: false, error: 'content is required' };
            workspaceMemory.updateMemory(args.content);
            return { success: true, message: 'MEMORY.md updated' };
          }

          case 'append_memory': {
            if (!args.section || !args.content) {
              return { success: false, error: 'section and content are required' };
            }
            workspaceMemory.appendMemory(args.section, args.content);
            return { success: true, message: `Appended to section "${args.section}"` };
          }

          case 'read_identity': {
            const identity = workspaceMemory.getIdentity();
            return { success: true, data: identity };
          }

          case 'update_identity': {
            if (!args.content) return { success: false, error: 'content is required' };
            fs.writeFileSync(workspaceMemory.identityPath, args.content, 'utf-8');
            return { success: true, message: 'IDENTITY.md updated' };
          }

          case 'read_daily_log': {
            const log = workspaceMemory.getDailyLog(args.date || null);
            return { success: true, data: log || '(로그 없음)' };
          }

          case 'write_daily_log': {
            if (!args.content) return { success: false, error: 'content is required' };
            workspaceMemory.appendDailyLog(args.content);
            return { success: true, message: 'Daily log entry added' };
          }

          default:
            return { success: false, error: `Unknown action: ${args.action}` };
        }
      } catch (error) {
        logger.error('selfMemory tool error', error);
        return { success: false, error: error.message };
      }
    }
  };
}
