/**
 * User Settings Tool - 사용자 설정 관리
 * AI 행동, 언어, 테마, 기본값 등 사용자 맞춤 설정 기능
 */

import { logger } from '../../utils/logger.js';
import Database from 'better-sqlite3';

/**
 * 사용자 설정 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createUserSettingsTools(options = {}) {
  const {
    dbPath = './athena-data/athena.db'
  } = options;

  const db = new Database(dbPath);

  // 사용자 설정 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      settings TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_preferences_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 기본 설정 템플릿
  const DEFAULT_SETTINGS = {
    // AI 행동 설정
    ai: {
      tone: 'friendly', // friendly, professional, casual, concise
      language: 'ko', // 응답 언어
      verbosity: 'normal', // brief, normal, detailed
      defaultModel: 'gpt-4o-mini',
      preferredProviders: ['ChatGPT', 'Gemini', 'Claude'],
      collaborationMode: 'auto', // auto, single, parallel, sequential
      webSearchEnabled: true,
      mcpToolsEnabled: true
    },
    // UI 설정
    ui: {
      theme: 'system', // light, dark, system
      fontSize: 'medium', // small, medium, large
      language: 'ko', // UI 언어
      showTimestamps: true,
      compactMode: false,
      sidebarPosition: 'left'
    },
    // 알림 설정
    notifications: {
      enabled: true,
      sound: true,
      desktop: true,
      email: false,
      slack: false,
      discord: false,
      reminderDefaultTime: '09:00'
    },
    // 개인정보 설정
    privacy: {
      saveHistory: true,
      analyticsEnabled: true,
      shareUsageData: false
    },
    // 단축키 설정
    shortcuts: {
      sendMessage: 'Enter',
      newLine: 'Shift+Enter',
      clearChat: 'Ctrl+L',
      toggleSidebar: 'Ctrl+B'
    },
    // 고급 설정
    advanced: {
      maxContextLength: 10,
      streamingEnabled: true,
      debugMode: false,
      experimentalFeatures: false
    }
  };

  // 설정 가져오기
  const getSettings = (userId) => {
    const row = db.prepare('SELECT settings FROM user_settings WHERE user_id = ?').get(userId);
    if (row) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(row.settings) };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  };

  // 설정 저장
  const saveSettings = (userId, settings) => {
    db.prepare(`
      INSERT INTO user_settings (user_id, settings)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        settings = excluded.settings,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, JSON.stringify(settings));
  };

  // 중첩 객체 업데이트 헬퍼
  const deepMerge = (target, source) => {
    const result = { ...target };
    for (const key in source) {
      if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  };

  return [
    // 전체 설정 조회
    {
      name: 'get_user_settings',
      description: '사용자의 전체 설정을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          category: {
            type: 'string',
            enum: ['ai', 'ui', 'notifications', 'privacy', 'shortcuts', 'advanced', 'all'],
            description: '특정 카테고리만 조회',
            default: 'all'
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId, category = 'all' } = args;

        try {
          const settings = getSettings(userId);

          if (category === 'all') {
            return {
              success: true,
              userId,
              settings
            };
          }

          return {
            success: true,
            userId,
            category,
            settings: settings[category] || {}
          };

        } catch (error) {
          throw new Error(`설정 조회 실패: ${error.message}`);
        }
      }
    },

    // 설정 업데이트
    {
      name: 'update_user_settings',
      description: '사용자 설정을 업데이트합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          category: {
            type: 'string',
            enum: ['ai', 'ui', 'notifications', 'privacy', 'shortcuts', 'advanced'],
            description: '업데이트할 카테고리'
          },
          updates: {
            type: 'object',
            description: '업데이트할 설정 값들'
          }
        },
        required: ['userId', 'category', 'updates']
      },
      execute: async (args) => {
        const { userId, category, updates } = args;

        try {
          const currentSettings = getSettings(userId);
          const oldCategorySettings = currentSettings[category] || {};

          // 유효성 검사
          const validSettings = {};
          for (const [key, value] of Object.entries(updates)) {
            // 기본 설정에 존재하는 키만 허용
            if (DEFAULT_SETTINGS[category] && key in DEFAULT_SETTINGS[category]) {
              validSettings[key] = value;

              // 변경 기록 저장
              db.prepare(`
                INSERT INTO user_preferences_history (user_id, setting_key, old_value, new_value)
                VALUES (?, ?, ?, ?)
              `).run(userId, `${category}.${key}`, JSON.stringify(oldCategorySettings[key]), JSON.stringify(value));
            }
          }

          const newSettings = {
            ...currentSettings,
            [category]: { ...currentSettings[category], ...validSettings }
          };

          saveSettings(userId, newSettings);

          logger.info('사용자 설정 업데이트', { userId, category, updates: validSettings });

          return {
            success: true,
            category,
            updatedSettings: newSettings[category],
            changedKeys: Object.keys(validSettings)
          };

        } catch (error) {
          throw new Error(`설정 업데이트 실패: ${error.message}`);
        }
      }
    },

    // AI 톤 설정
    {
      name: 'set_ai_tone',
      description: 'AI의 응답 톤을 설정합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          tone: {
            type: 'string',
            enum: ['friendly', 'professional', 'casual', 'concise'],
            description: 'AI 톤 (friendly: 친근함, professional: 전문적, casual: 캐주얼, concise: 간결함)'
          },
          verbosity: {
            type: 'string',
            enum: ['brief', 'normal', 'detailed'],
            description: '응답 상세도'
          }
        },
        required: ['userId', 'tone']
      },
      execute: async (args) => {
        const { userId, tone, verbosity } = args;

        try {
          const settings = getSettings(userId);
          settings.ai.tone = tone;
          if (verbosity) {
            settings.ai.verbosity = verbosity;
          }
          saveSettings(userId, settings);

          const toneDescriptions = {
            friendly: '친근하고 따뜻한 톤으로 대화합니다.',
            professional: '전문적이고 격식있는 톤으로 대화합니다.',
            casual: '가벼고 편안한 톤으로 대화합니다.',
            concise: '핵심만 간결하게 전달합니다.'
          };

          return {
            success: true,
            tone,
            verbosity: settings.ai.verbosity,
            description: toneDescriptions[tone]
          };

        } catch (error) {
          throw new Error(`톤 설정 실패: ${error.message}`);
        }
      }
    },

    // 기본 AI 모델 설정
    {
      name: 'set_default_model',
      description: '기본 AI 모델을 설정합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          model: {
            type: 'string',
            description: '기본 모델 (gpt-4o, gpt-4o-mini, claude-3-sonnet 등)'
          },
          preferredProviders: {
            type: 'array',
            items: { type: 'string' },
            description: '선호 프로바이더 순서'
          }
        },
        required: ['userId', 'model']
      },
      execute: async (args) => {
        const { userId, model, preferredProviders } = args;

        try {
          const settings = getSettings(userId);
          settings.ai.defaultModel = model;
          if (preferredProviders) {
            settings.ai.preferredProviders = preferredProviders;
          }
          saveSettings(userId, settings);

          return {
            success: true,
            defaultModel: model,
            preferredProviders: settings.ai.preferredProviders
          };

        } catch (error) {
          throw new Error(`모델 설정 실패: ${error.message}`);
        }
      }
    },

    // 테마 설정
    {
      name: 'set_theme',
      description: 'UI 테마를 설정합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          theme: {
            type: 'string',
            enum: ['light', 'dark', 'system'],
            description: '테마 (light: 밝은, dark: 어두운, system: 시스템 설정 따름)'
          }
        },
        required: ['userId', 'theme']
      },
      execute: async (args) => {
        const { userId, theme } = args;

        try {
          const settings = getSettings(userId);
          settings.ui.theme = theme;
          saveSettings(userId, settings);

          return {
            success: true,
            theme
          };

        } catch (error) {
          throw new Error(`테마 설정 실패: ${error.message}`);
        }
      }
    },

    // 알림 설정
    {
      name: 'configure_notifications',
      description: '알림 설정을 구성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          enabled: {
            type: 'boolean',
            description: '알림 전체 활성화'
          },
          channels: {
            type: 'object',
            description: '채널별 설정',
            properties: {
              sound: { type: 'boolean' },
              desktop: { type: 'boolean' },
              email: { type: 'boolean' },
              slack: { type: 'boolean' },
              discord: { type: 'boolean' }
            }
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId, enabled, channels } = args;

        try {
          const settings = getSettings(userId);

          if (enabled !== undefined) {
            settings.notifications.enabled = enabled;
          }
          if (channels) {
            Object.assign(settings.notifications, channels);
          }

          saveSettings(userId, settings);

          return {
            success: true,
            notifications: settings.notifications
          };

        } catch (error) {
          throw new Error(`알림 설정 실패: ${error.message}`);
        }
      }
    },

    // 설정 초기화
    {
      name: 'reset_user_settings',
      description: '사용자 설정을 기본값으로 초기화합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          category: {
            type: 'string',
            enum: ['ai', 'ui', 'notifications', 'privacy', 'shortcuts', 'advanced', 'all'],
            description: '초기화할 카테고리 (all: 전체)',
            default: 'all'
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId, category = 'all' } = args;

        try {
          if (category === 'all') {
            saveSettings(userId, DEFAULT_SETTINGS);
          } else {
            const settings = getSettings(userId);
            settings[category] = DEFAULT_SETTINGS[category];
            saveSettings(userId, settings);
          }

          logger.info('사용자 설정 초기화', { userId, category });

          return {
            success: true,
            message: category === 'all' ? '모든 설정이 초기화되었습니다.' : `${category} 설정이 초기화되었습니다.`,
            resetSettings: category === 'all' ? DEFAULT_SETTINGS : DEFAULT_SETTINGS[category]
          };

        } catch (error) {
          throw new Error(`초기화 실패: ${error.message}`);
        }
      }
    },

    // 설정 내보내기
    {
      name: 'export_user_settings',
      description: '사용자 설정을 JSON으로 내보냅니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId } = args;

        try {
          const settings = getSettings(userId);

          return {
            success: true,
            userId,
            exportedAt: new Date().toISOString(),
            settings,
            json: JSON.stringify(settings, null, 2)
          };

        } catch (error) {
          throw new Error(`내보내기 실패: ${error.message}`);
        }
      }
    },

    // 설정 가져오기
    {
      name: 'import_user_settings',
      description: 'JSON에서 사용자 설정을 가져옵니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          settingsJson: {
            type: 'string',
            description: '가져올 설정 JSON'
          },
          merge: {
            type: 'boolean',
            description: '기존 설정과 병합 (false: 덮어쓰기)',
            default: true
          }
        },
        required: ['userId', 'settingsJson']
      },
      execute: async (args) => {
        const { userId, settingsJson, merge = true } = args;

        try {
          const importedSettings = JSON.parse(settingsJson);
          let finalSettings;

          if (merge) {
            const currentSettings = getSettings(userId);
            finalSettings = deepMerge(currentSettings, importedSettings);
          } else {
            finalSettings = deepMerge(DEFAULT_SETTINGS, importedSettings);
          }

          saveSettings(userId, finalSettings);

          return {
            success: true,
            message: merge ? '설정이 병합되었습니다.' : '설정을 가져왔습니다.',
            settings: finalSettings
          };

        } catch (error) {
          throw new Error(`가져오기 실패: ${error.message}`);
        }
      }
    },

    // 설정 변경 이력 조회
    {
      name: 'get_settings_history',
      description: '설정 변경 이력을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          },
          limit: {
            type: 'number',
            default: 20
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId, limit = 20 } = args;

        try {
          const history = db.prepare(`
            SELECT * FROM user_preferences_history
            WHERE user_id = ?
            ORDER BY changed_at DESC
            LIMIT ?
          `).all(userId, limit);

          return {
            success: true,
            history: history.map(h => ({
              key: h.setting_key,
              oldValue: h.old_value ? JSON.parse(h.old_value) : null,
              newValue: h.new_value ? JSON.parse(h.new_value) : null,
              changedAt: h.changed_at
            }))
          };

        } catch (error) {
          throw new Error(`이력 조회 실패: ${error.message}`);
        }
      }
    }
  ];
}
