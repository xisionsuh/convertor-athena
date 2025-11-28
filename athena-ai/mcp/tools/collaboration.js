/**
 * Real-time Collaboration Tools
 * 실시간 협업 기능을 위한 MCP 도구
 */

import { logger } from '../../utils/logger.js';

/**
 * 실시간 협업 도구 생성
 * @param {Object} options - 옵션
 * @param {string} options.dbPath - 데이터베이스 경로
 * @returns {Array<Object>} MCP 도구 배열
 */
export function createCollaborationTools(options = {}) {
  const { dbPath } = options;

  // 협업 세션 저장소
  const sessions = new Map();
  const participants = new Map();
  const pendingInvites = new Map();

  return [
    {
      name: 'create_collaboration_session',
      description: '새로운 협업 세션 생성',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '세션 이름'
          },
          type: {
            type: 'string',
            enum: ['chat', 'document', 'whiteboard', 'code'],
            description: '세션 유형'
          },
          conversation_id: {
            type: 'string',
            description: '연결할 대화 ID (선택)'
          },
          settings: {
            type: 'object',
            description: '세션 설정',
            properties: {
              max_participants: { type: 'number' },
              allow_anonymous: { type: 'boolean' },
              require_approval: { type: 'boolean' },
              auto_save: { type: 'boolean' },
              expiry_hours: { type: 'number' }
            }
          }
        },
        required: ['name', 'type']
      },
      execute: async (args) => {
        try {
          const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const inviteCode = generateInviteCode();

          const session = {
            id: sessionId,
            name: args.name,
            type: args.type,
            conversation_id: args.conversation_id,
            settings: {
              max_participants: args.settings?.max_participants || 10,
              allow_anonymous: args.settings?.allow_anonymous || false,
              require_approval: args.settings?.require_approval || true,
              auto_save: args.settings?.auto_save !== false,
              expiry_hours: args.settings?.expiry_hours || 24
            },
            invite_code: inviteCode,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active',
            participants: [],
            owner: 'current_user', // 실제로는 인증된 사용자 ID
            activity_log: []
          };

          sessions.set(sessionId, session);

          logger.info('Collaboration session created', { sessionId, type: args.type });

          return {
            success: true,
            session: {
              id: sessionId,
              name: session.name,
              type: session.type,
              invite_code: inviteCode,
              invite_link: `athena://join/${inviteCode}`,
              settings: session.settings
            }
          };
        } catch (error) {
          logger.error('Failed to create collaboration session', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'join_collaboration_session',
      description: '초대 코드로 협업 세션 참가',
      inputSchema: {
        type: 'object',
        properties: {
          invite_code: {
            type: 'string',
            description: '초대 코드'
          },
          display_name: {
            type: 'string',
            description: '표시할 이름'
          },
          role: {
            type: 'string',
            enum: ['viewer', 'editor', 'admin'],
            description: '역할 (기본: viewer)'
          }
        },
        required: ['invite_code']
      },
      execute: async (args) => {
        try {
          // 초대 코드로 세션 찾기
          let targetSession = null;
          for (const [id, session] of sessions) {
            if (session.invite_code === args.invite_code && session.status === 'active') {
              targetSession = session;
              break;
            }
          }

          if (!targetSession) {
            return {
              success: false,
              error: '유효하지 않은 초대 코드이거나 세션이 종료되었습니다.'
            };
          }

          // 참가자 수 제한 확인
          if (targetSession.participants.length >= targetSession.settings.max_participants) {
            return {
              success: false,
              error: '세션이 가득 찼습니다.'
            };
          }

          // 참가자 추가
          const participantId = `participant_${Date.now()}`;
          const participant = {
            id: participantId,
            display_name: args.display_name || `User_${participantId.slice(-4)}`,
            role: args.role || 'viewer',
            joined_at: new Date().toISOString(),
            last_active: new Date().toISOString(),
            cursor_position: null,
            status: 'online'
          };

          targetSession.participants.push(participant);
          participants.set(participantId, {
            ...participant,
            session_id: targetSession.id
          });

          // 활동 로그
          targetSession.activity_log.push({
            type: 'join',
            participant_id: participantId,
            display_name: participant.display_name,
            timestamp: new Date().toISOString()
          });

          logger.info('Participant joined session', {
            sessionId: targetSession.id,
            participantId
          });

          return {
            success: true,
            session: {
              id: targetSession.id,
              name: targetSession.name,
              type: targetSession.type,
              participant_count: targetSession.participants.length
            },
            participant: {
              id: participantId,
              display_name: participant.display_name,
              role: participant.role
            }
          };
        } catch (error) {
          logger.error('Failed to join collaboration session', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'send_collaboration_message',
      description: '협업 세션에 메시지 전송',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: '세션 ID'
          },
          message_type: {
            type: 'string',
            enum: ['text', 'cursor', 'selection', 'edit', 'reaction', 'system'],
            description: '메시지 유형'
          },
          content: {
            type: 'object',
            description: '메시지 내용',
            properties: {
              text: { type: 'string' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  line: { type: 'number' },
                  column: { type: 'number' }
                }
              },
              selection: {
                type: 'object',
                properties: {
                  start: { type: 'number' },
                  end: { type: 'number' },
                  text: { type: 'string' }
                }
              },
              reaction: { type: 'string' }
            }
          },
          participant_id: {
            type: 'string',
            description: '발신자 참가자 ID'
          }
        },
        required: ['session_id', 'message_type', 'content']
      },
      execute: async (args) => {
        try {
          const session = sessions.get(args.session_id);
          if (!session) {
            return { success: false, error: '세션을 찾을 수 없습니다.' };
          }

          const message = {
            id: `msg_${Date.now()}`,
            session_id: args.session_id,
            type: args.message_type,
            content: args.content,
            participant_id: args.participant_id,
            timestamp: new Date().toISOString()
          };

          // 커서 위치 업데이트
          if (args.message_type === 'cursor' && args.participant_id) {
            const participant = session.participants.find(p => p.id === args.participant_id);
            if (participant) {
              participant.cursor_position = args.content.position;
              participant.last_active = new Date().toISOString();
            }
          }

          // 활동 로그에 추가 (텍스트 메시지만)
          if (args.message_type === 'text') {
            session.activity_log.push({
              type: 'message',
              participant_id: args.participant_id,
              preview: args.content.text?.substring(0, 50),
              timestamp: new Date().toISOString()
            });
          }

          session.updated_at = new Date().toISOString();

          return {
            success: true,
            message: {
              id: message.id,
              type: message.type,
              timestamp: message.timestamp
            }
          };
        } catch (error) {
          logger.error('Failed to send collaboration message', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'get_session_participants',
      description: '협업 세션 참가자 목록 조회',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: '세션 ID'
          },
          include_cursors: {
            type: 'boolean',
            description: '커서 위치 포함 여부'
          }
        },
        required: ['session_id']
      },
      execute: async (args) => {
        try {
          const session = sessions.get(args.session_id);
          if (!session) {
            return { success: false, error: '세션을 찾을 수 없습니다.' };
          }

          const participantList = session.participants.map(p => ({
            id: p.id,
            display_name: p.display_name,
            role: p.role,
            status: p.status,
            joined_at: p.joined_at,
            last_active: p.last_active,
            cursor_position: args.include_cursors ? p.cursor_position : undefined
          }));

          return {
            success: true,
            session_id: args.session_id,
            participant_count: participantList.length,
            participants: participantList,
            online_count: participantList.filter(p => p.status === 'online').length
          };
        } catch (error) {
          logger.error('Failed to get session participants', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'update_participant_role',
      description: '참가자 역할 변경',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: '세션 ID'
          },
          participant_id: {
            type: 'string',
            description: '대상 참가자 ID'
          },
          new_role: {
            type: 'string',
            enum: ['viewer', 'editor', 'admin'],
            description: '새 역할'
          }
        },
        required: ['session_id', 'participant_id', 'new_role']
      },
      execute: async (args) => {
        try {
          const session = sessions.get(args.session_id);
          if (!session) {
            return { success: false, error: '세션을 찾을 수 없습니다.' };
          }

          const participant = session.participants.find(p => p.id === args.participant_id);
          if (!participant) {
            return { success: false, error: '참가자를 찾을 수 없습니다.' };
          }

          const oldRole = participant.role;
          participant.role = args.new_role;

          session.activity_log.push({
            type: 'role_change',
            participant_id: args.participant_id,
            old_role: oldRole,
            new_role: args.new_role,
            timestamp: new Date().toISOString()
          });

          return {
            success: true,
            participant: {
              id: participant.id,
              display_name: participant.display_name,
              old_role: oldRole,
              new_role: args.new_role
            }
          };
        } catch (error) {
          logger.error('Failed to update participant role', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'leave_collaboration_session',
      description: '협업 세션 나가기',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: '세션 ID'
          },
          participant_id: {
            type: 'string',
            description: '참가자 ID'
          }
        },
        required: ['session_id', 'participant_id']
      },
      execute: async (args) => {
        try {
          const session = sessions.get(args.session_id);
          if (!session) {
            return { success: false, error: '세션을 찾을 수 없습니다.' };
          }

          const participantIndex = session.participants.findIndex(p => p.id === args.participant_id);
          if (participantIndex === -1) {
            return { success: false, error: '참가자를 찾을 수 없습니다.' };
          }

          const participant = session.participants[participantIndex];
          session.participants.splice(participantIndex, 1);
          participants.delete(args.participant_id);

          session.activity_log.push({
            type: 'leave',
            participant_id: args.participant_id,
            display_name: participant.display_name,
            timestamp: new Date().toISOString()
          });

          // 모든 참가자가 나가면 세션 자동 종료
          if (session.participants.length === 0) {
            session.status = 'ended';
            session.ended_at = new Date().toISOString();
          }

          logger.info('Participant left session', {
            sessionId: args.session_id,
            participantId: args.participant_id
          });

          return {
            success: true,
            message: '세션에서 나왔습니다.',
            session_status: session.status,
            remaining_participants: session.participants.length
          };
        } catch (error) {
          logger.error('Failed to leave collaboration session', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'end_collaboration_session',
      description: '협업 세션 종료 (소유자만)',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: '세션 ID'
          },
          reason: {
            type: 'string',
            description: '종료 사유 (선택)'
          }
        },
        required: ['session_id']
      },
      execute: async (args) => {
        try {
          const session = sessions.get(args.session_id);
          if (!session) {
            return { success: false, error: '세션을 찾을 수 없습니다.' };
          }

          session.status = 'ended';
          session.ended_at = new Date().toISOString();
          session.end_reason = args.reason;

          session.activity_log.push({
            type: 'session_end',
            reason: args.reason,
            timestamp: new Date().toISOString()
          });

          // 모든 참가자 상태 업데이트
          session.participants.forEach(p => {
            p.status = 'offline';
          });

          logger.info('Collaboration session ended', { sessionId: args.session_id });

          return {
            success: true,
            message: '세션이 종료되었습니다.',
            session: {
              id: session.id,
              name: session.name,
              duration_minutes: calculateDuration(session.created_at, session.ended_at),
              total_participants: session.activity_log.filter(a => a.type === 'join').length
            }
          };
        } catch (error) {
          logger.error('Failed to end collaboration session', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'get_session_activity',
      description: '세션 활동 로그 조회',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: '세션 ID'
          },
          limit: {
            type: 'number',
            description: '최대 항목 수 (기본: 50)'
          },
          activity_types: {
            type: 'array',
            items: { type: 'string' },
            description: '필터할 활동 유형'
          }
        },
        required: ['session_id']
      },
      execute: async (args) => {
        try {
          const session = sessions.get(args.session_id);
          if (!session) {
            return { success: false, error: '세션을 찾을 수 없습니다.' };
          }

          let activities = [...session.activity_log];

          if (args.activity_types && args.activity_types.length > 0) {
            activities = activities.filter(a => args.activity_types.includes(a.type));
          }

          activities = activities.slice(-(args.limit || 50));

          return {
            success: true,
            session_id: args.session_id,
            activity_count: activities.length,
            activities
          };
        } catch (error) {
          logger.error('Failed to get session activity', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'list_active_sessions',
      description: '활성 협업 세션 목록 조회',
      inputSchema: {
        type: 'object',
        properties: {
          filter_type: {
            type: 'string',
            enum: ['all', 'owned', 'joined'],
            description: '필터 유형 (기본: all)'
          },
          include_stats: {
            type: 'boolean',
            description: '통계 포함 여부'
          }
        }
      },
      execute: async (args) => {
        try {
          let sessionList = [];

          for (const [id, session] of sessions) {
            if (session.status !== 'active') continue;

            const sessionInfo = {
              id: session.id,
              name: session.name,
              type: session.type,
              participant_count: session.participants.length,
              created_at: session.created_at,
              updated_at: session.updated_at
            };

            if (args.include_stats) {
              sessionInfo.stats = {
                online_participants: session.participants.filter(p => p.status === 'online').length,
                total_messages: session.activity_log.filter(a => a.type === 'message').length,
                duration_minutes: calculateDuration(session.created_at)
              };
            }

            sessionList.push(sessionInfo);
          }

          return {
            success: true,
            session_count: sessionList.length,
            sessions: sessionList
          };
        } catch (error) {
          logger.error('Failed to list active sessions', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'share_ai_response',
      description: 'AI 응답을 협업 세션에 공유',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: '세션 ID'
          },
          message_id: {
            type: 'string',
            description: '공유할 메시지 ID'
          },
          include_context: {
            type: 'boolean',
            description: '프롬프트 컨텍스트 포함 여부'
          },
          comment: {
            type: 'string',
            description: '공유 시 추가할 코멘트'
          }
        },
        required: ['session_id', 'message_id']
      },
      execute: async (args) => {
        try {
          const session = sessions.get(args.session_id);
          if (!session) {
            return { success: false, error: '세션을 찾을 수 없습니다.' };
          }

          const sharedContent = {
            id: `shared_${Date.now()}`,
            type: 'ai_response',
            message_id: args.message_id,
            include_context: args.include_context,
            comment: args.comment,
            shared_at: new Date().toISOString(),
            shared_by: 'current_user'
          };

          session.activity_log.push({
            type: 'share',
            content_type: 'ai_response',
            message_id: args.message_id,
            comment: args.comment,
            timestamp: new Date().toISOString()
          });

          return {
            success: true,
            shared_content: sharedContent,
            message: 'AI 응답이 협업 세션에 공유되었습니다.'
          };
        } catch (error) {
          logger.error('Failed to share AI response', error);
          return { success: false, error: error.message };
        }
      }
    }
  ];
}

// 헬퍼 함수들

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function calculateDuration(startTime, endTime = null) {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  return Math.round((end - start) / (1000 * 60));
}
