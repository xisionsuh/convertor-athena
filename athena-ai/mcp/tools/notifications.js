/**
 * Notifications Tool - 알림 시스템
 * 스케줄링 가능한 알림 관리 및 푸시 알림 지원
 */

import { logger } from '../../utils/logger.js';
import Database from 'better-sqlite3';

/**
 * 알림 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createNotificationTools(options = {}) {
  const { dbPath } = options;

  let db = null;

  const getDb = () => {
    if (!db && dbPath) {
      db = new Database(dbPath);
      initializeNotificationTables(db);
    }
    return db;
  };

  // 알림 테이블 초기화
  function initializeNotificationTables(database) {
    database.exec(`
      -- 알림 테이블
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        category TEXT DEFAULT 'general',
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'pending',
        scheduled_at DATETIME,
        sent_at DATETIME,
        read_at DATETIME,
        action_url TEXT,
        action_label TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 알림 인덱스
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_at, status);
      CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);

      -- 리마인더 테이블
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        remind_at DATETIME NOT NULL,
        repeat_type TEXT,
        repeat_interval INTEGER,
        repeat_until DATETIME,
        status TEXT DEFAULT 'active',
        notification_id TEXT,
        source_type TEXT,
        source_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (notification_id) REFERENCES notifications(id)
      );

      -- 리마인더 인덱스
      CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_reminders_remind ON reminders(remind_at, status);
    `);
  }

  // 고유 ID 생성
  const generateId = () => `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const generateReminderId = () => `remind_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return [
    // 알림 생성
    {
      name: 'create_notification',
      description: '새 알림을 생성합니다. 즉시 발송하거나 예약할 수 있습니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          title: {
            type: 'string',
            description: '알림 제목'
          },
          message: {
            type: 'string',
            description: '알림 내용'
          },
          type: {
            type: 'string',
            enum: ['info', 'success', 'warning', 'error', 'reminder'],
            description: '알림 유형',
            default: 'info'
          },
          category: {
            type: 'string',
            enum: ['general', 'calendar', 'task', 'project', 'ai', 'system'],
            description: '알림 카테고리',
            default: 'general'
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
            description: '우선순위',
            default: 'normal'
          },
          scheduledAt: {
            type: 'string',
            description: '예약 발송 시간 (ISO 8601 형식, 없으면 즉시 발송)'
          },
          actionUrl: {
            type: 'string',
            description: '클릭 시 이동할 URL'
          },
          actionLabel: {
            type: 'string',
            description: '액션 버튼 라벨'
          },
          metadata: {
            type: 'object',
            description: '추가 메타데이터'
          }
        },
        required: ['userId', 'title', 'message']
      },
      execute: async (args) => {
        const {
          userId,
          title,
          message,
          type = 'info',
          category = 'general',
          priority = 'normal',
          scheduledAt,
          actionUrl,
          actionLabel,
          metadata
        } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          const id = generateId();
          const now = new Date().toISOString();
          const status = scheduledAt ? 'scheduled' : 'pending';

          database.prepare(`
            INSERT INTO notifications
            (id, user_id, title, message, type, category, priority, status, scheduled_at, action_url, action_label, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, userId, title, message, type, category, priority, status,
            scheduledAt || null, actionUrl || null, actionLabel || null,
            metadata ? JSON.stringify(metadata) : null, now, now
          );

          logger.info('알림 생성', { id, userId, type, category, status });

          return {
            success: true,
            notification: {
              id,
              userId,
              title,
              message,
              type,
              category,
              priority,
              status,
              scheduledAt: scheduledAt || 'immediate',
              createdAt: now
            }
          };

        } catch (error) {
          logger.error('알림 생성 오류', error);
          throw new Error(`알림 생성 실패: ${error.message}`);
        }
      }
    },

    // 알림 목록 조회
    {
      name: 'list_notifications',
      description: '사용자의 알림 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          status: {
            type: 'string',
            enum: ['pending', 'sent', 'read', 'scheduled', 'all'],
            description: '알림 상태 필터',
            default: 'all'
          },
          category: {
            type: 'string',
            description: '카테고리 필터'
          },
          limit: {
            type: 'number',
            description: '조회 개수',
            default: 50
          },
          includeRead: {
            type: 'boolean',
            description: '읽은 알림 포함 여부',
            default: true
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const {
          userId,
          status = 'all',
          category,
          limit = 50,
          includeRead = true
        } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          let query = `SELECT * FROM notifications WHERE user_id = ?`;
          const params = [userId];

          if (status !== 'all') {
            query += ` AND status = ?`;
            params.push(status);
          }

          if (!includeRead) {
            query += ` AND read_at IS NULL`;
          }

          if (category) {
            query += ` AND category = ?`;
            params.push(category);
          }

          query += ` ORDER BY
            CASE priority
              WHEN 'urgent' THEN 1
              WHEN 'high' THEN 2
              WHEN 'normal' THEN 3
              WHEN 'low' THEN 4
            END,
            created_at DESC
            LIMIT ?`;
          params.push(limit);

          const notifications = database.prepare(query).all(...params);

          // 읽지 않은 알림 수
          const unreadCount = database.prepare(`
            SELECT COUNT(*) as count FROM notifications
            WHERE user_id = ? AND read_at IS NULL
          `).get(userId).count;

          logger.info('알림 목록 조회', { userId, count: notifications.length });

          return {
            success: true,
            count: notifications.length,
            unreadCount,
            notifications: notifications.map(n => ({
              ...n,
              metadata: n.metadata ? JSON.parse(n.metadata) : null
            }))
          };

        } catch (error) {
          logger.error('알림 목록 조회 오류', error);
          throw new Error(`알림 조회 실패: ${error.message}`);
        }
      }
    },

    // 알림 읽음 처리
    {
      name: 'mark_notification_read',
      description: '알림을 읽음으로 표시합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          notificationId: {
            type: 'string',
            description: '알림 ID (또는 "all"로 모든 알림 읽음 처리)'
          },
          userId: {
            type: 'string',
            description: '사용자 ID (전체 읽음 처리 시 필수)'
          }
        },
        required: ['notificationId']
      },
      execute: async (args) => {
        const { notificationId, userId } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          const now = new Date().toISOString();

          if (notificationId === 'all' && userId) {
            const result = database.prepare(`
              UPDATE notifications
              SET read_at = ?, status = 'read', updated_at = ?
              WHERE user_id = ? AND read_at IS NULL
            `).run(now, now, userId);

            logger.info('전체 알림 읽음 처리', { userId, count: result.changes });

            return {
              success: true,
              message: `${result.changes}개의 알림을 읽음으로 표시했습니다.`,
              updatedCount: result.changes
            };
          } else {
            database.prepare(`
              UPDATE notifications
              SET read_at = ?, status = 'read', updated_at = ?
              WHERE id = ?
            `).run(now, now, notificationId);

            logger.info('알림 읽음 처리', { notificationId });

            return {
              success: true,
              message: '알림을 읽음으로 표시했습니다.',
              notificationId
            };
          }

        } catch (error) {
          logger.error('알림 읽음 처리 오류', error);
          throw new Error(`알림 읽음 처리 실패: ${error.message}`);
        }
      }
    },

    // 리마인더 생성
    {
      name: 'create_reminder',
      description: '리마인더를 생성합니다. 반복 설정이 가능합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          title: {
            type: 'string',
            description: '리마인더 제목'
          },
          description: {
            type: 'string',
            description: '상세 설명'
          },
          remindAt: {
            type: 'string',
            description: '알림 시간 (ISO 8601 형식)'
          },
          repeatType: {
            type: 'string',
            enum: ['none', 'daily', 'weekly', 'monthly', 'custom'],
            description: '반복 유형',
            default: 'none'
          },
          repeatInterval: {
            type: 'number',
            description: '반복 간격 (custom 사용 시, 분 단위)'
          },
          repeatUntil: {
            type: 'string',
            description: '반복 종료 날짜 (ISO 8601 형식)'
          },
          sourceType: {
            type: 'string',
            description: '소스 유형 (calendar, task, project 등)'
          },
          sourceId: {
            type: 'string',
            description: '소스 ID'
          }
        },
        required: ['userId', 'title', 'remindAt']
      },
      execute: async (args) => {
        const {
          userId,
          title,
          description,
          remindAt,
          repeatType = 'none',
          repeatInterval,
          repeatUntil,
          sourceType,
          sourceId
        } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          const id = generateReminderId();
          const now = new Date().toISOString();

          // 리마인더용 알림도 생성
          const notificationId = generateId();

          database.prepare(`
            INSERT INTO notifications
            (id, user_id, title, message, type, category, priority, status, scheduled_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'reminder', 'calendar', 'high', 'scheduled', ?, ?, ?)
          `).run(notificationId, userId, title, description || title, remindAt, now, now);

          database.prepare(`
            INSERT INTO reminders
            (id, user_id, title, description, remind_at, repeat_type, repeat_interval, repeat_until, notification_id, source_type, source_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, userId, title, description || null, remindAt,
            repeatType, repeatInterval || null, repeatUntil || null,
            notificationId, sourceType || null, sourceId || null, now
          );

          logger.info('리마인더 생성', { id, userId, remindAt, repeatType });

          return {
            success: true,
            reminder: {
              id,
              userId,
              title,
              description,
              remindAt,
              repeatType,
              repeatInterval,
              repeatUntil,
              notificationId,
              createdAt: now
            }
          };

        } catch (error) {
          logger.error('리마인더 생성 오류', error);
          throw new Error(`리마인더 생성 실패: ${error.message}`);
        }
      }
    },

    // 리마인더 목록 조회
    {
      name: 'list_reminders',
      description: '사용자의 리마인더 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          status: {
            type: 'string',
            enum: ['active', 'completed', 'cancelled', 'all'],
            description: '상태 필터',
            default: 'active'
          },
          upcoming: {
            type: 'boolean',
            description: '다가오는 리마인더만 조회',
            default: true
          },
          days: {
            type: 'number',
            description: '앞으로 N일 이내 리마인더 조회',
            default: 7
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId, status = 'active', upcoming = true, days = 7 } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          let query = `SELECT * FROM reminders WHERE user_id = ?`;
          const params = [userId];

          if (status !== 'all') {
            query += ` AND status = ?`;
            params.push(status);
          }

          if (upcoming) {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + days);
            query += ` AND remind_at BETWEEN datetime('now') AND ?`;
            params.push(futureDate.toISOString());
          }

          query += ` ORDER BY remind_at ASC`;

          const reminders = database.prepare(query).all(...params);

          logger.info('리마인더 목록 조회', { userId, count: reminders.length });

          return {
            success: true,
            count: reminders.length,
            reminders
          };

        } catch (error) {
          logger.error('리마인더 목록 조회 오류', error);
          throw new Error(`리마인더 조회 실패: ${error.message}`);
        }
      }
    },

    // 예약된 알림 확인 (폴링용)
    {
      name: 'check_due_notifications',
      description: '발송할 시간이 된 알림들을 확인합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID (없으면 전체)'
          }
        }
      },
      execute: async (args) => {
        const { userId } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          let query = `
            SELECT * FROM notifications
            WHERE status = 'scheduled'
            AND scheduled_at <= datetime('now')
          `;
          const params = [];

          if (userId) {
            query += ` AND user_id = ?`;
            params.push(userId);
          }

          query += ` ORDER BY priority, scheduled_at ASC`;

          const dueNotifications = database.prepare(query).all(...params);

          // 상태 업데이트
          if (dueNotifications.length > 0) {
            const now = new Date().toISOString();
            const ids = dueNotifications.map(n => n.id);

            database.prepare(`
              UPDATE notifications
              SET status = 'sent', sent_at = ?, updated_at = ?
              WHERE id IN (${ids.map(() => '?').join(',')})
            `).run(now, now, ...ids);
          }

          logger.info('예약 알림 확인', { dueCount: dueNotifications.length });

          return {
            success: true,
            count: dueNotifications.length,
            notifications: dueNotifications.map(n => ({
              ...n,
              metadata: n.metadata ? JSON.parse(n.metadata) : null
            }))
          };

        } catch (error) {
          logger.error('예약 알림 확인 오류', error);
          throw new Error(`알림 확인 실패: ${error.message}`);
        }
      }
    },

    // 알림 삭제
    {
      name: 'delete_notification',
      description: '알림을 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          notificationId: {
            type: 'string',
            description: '삭제할 알림 ID'
          }
        },
        required: ['notificationId']
      },
      execute: async (args) => {
        const { notificationId } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          database.prepare(`DELETE FROM notifications WHERE id = ?`).run(notificationId);

          logger.info('알림 삭제', { notificationId });

          return {
            success: true,
            message: '알림이 삭제되었습니다.',
            notificationId
          };

        } catch (error) {
          logger.error('알림 삭제 오류', error);
          throw new Error(`알림 삭제 실패: ${error.message}`);
        }
      }
    }
  ];
}
