/**
 * Budget Control Tool - 비용 제어 및 예산 관리
 * API 사용량 한도 설정, 예산 알림, 비용 최적화 기능
 */

import { logger } from '../../utils/logger.js';
import Database from 'better-sqlite3';

/**
 * 비용 제어 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createBudgetControlTools(options = {}) {
  const {
    dbPath = './athena-data/athena.db'
  } = options;

  const db = new Database(dbPath);

  // 예산 및 한도 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      monthly_budget REAL DEFAULT 100.0,
      daily_limit REAL DEFAULT 10.0,
      alert_threshold REAL DEFAULT 0.8,
      auto_stop_enabled INTEGER DEFAULT 0,
      preferred_models TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budget_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_type TEXT NOT NULL,
      message TEXT NOT NULL,
      current_usage REAL,
      threshold REAL,
      acknowledged INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cost_optimization_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      optimization_type TEXT,
      original_model TEXT,
      suggested_model TEXT,
      estimated_savings REAL,
      applied INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 기본 설정 추가
    INSERT OR IGNORE INTO budget_settings (id) VALUES ('default');
  `);

  // 모델별 가격 정보 (1K 토큰당 USD)
  const MODEL_PRICING = {
    // OpenAI
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'whisper-1': { perMinute: 0.006 },
    'tts-1': { perChar: 0.000015 },
    'tts-1-hd': { perChar: 0.00003 },
    'dall-e-3': { perImage: { '1024x1024': 0.04, '1792x1024': 0.08, '1024x1792': 0.08 } },
    'text-embedding-3-small': { input: 0.00002 },
    'text-embedding-3-large': { input: 0.00013 },

    // Anthropic Claude
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },

    // Google Gemini
    'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
    'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },

    // xAI Grok
    'grok-beta': { input: 0.005, output: 0.015 }
  };

  // 비용 계산 함수
  const calculateCost = (model, usage) => {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0;

    let cost = 0;

    if (pricing.input && usage.promptTokens) {
      cost += (usage.promptTokens / 1000) * pricing.input;
    }
    if (pricing.output && usage.completionTokens) {
      cost += (usage.completionTokens / 1000) * pricing.output;
    }
    if (pricing.perMinute && usage.durationMinutes) {
      cost += usage.durationMinutes * pricing.perMinute;
    }
    if (pricing.perChar && usage.characters) {
      cost += usage.characters * pricing.perChar;
    }
    if (pricing.perImage && usage.imageSize) {
      cost += pricing.perImage[usage.imageSize] || pricing.perImage['1024x1024'];
    }

    return Math.round(cost * 10000) / 10000;
  };

  return [
    // 예산 설정
    {
      name: 'set_budget',
      description: '월간 예산 및 일일 한도를 설정합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          monthlyBudget: {
            type: 'number',
            description: '월간 예산 (USD)',
            minimum: 0
          },
          dailyLimit: {
            type: 'number',
            description: '일일 한도 (USD)',
            minimum: 0
          },
          alertThreshold: {
            type: 'number',
            description: '알림 임계값 (0.0-1.0, 예: 0.8 = 80%)',
            minimum: 0,
            maximum: 1,
            default: 0.8
          },
          autoStopEnabled: {
            type: 'boolean',
            description: '한도 도달 시 자동 중지 활성화',
            default: false
          },
          preferredModels: {
            type: 'array',
            items: { type: 'string' },
            description: '비용 최적화 시 선호 모델 목록'
          }
        }
      },
      execute: async (args) => {
        const {
          monthlyBudget,
          dailyLimit,
          alertThreshold = 0.8,
          autoStopEnabled = false,
          preferredModels
        } = args;

        try {
          const updates = [];
          const values = [];

          if (monthlyBudget !== undefined) {
            updates.push('monthly_budget = ?');
            values.push(monthlyBudget);
          }
          if (dailyLimit !== undefined) {
            updates.push('daily_limit = ?');
            values.push(dailyLimit);
          }
          if (alertThreshold !== undefined) {
            updates.push('alert_threshold = ?');
            values.push(alertThreshold);
          }
          updates.push('auto_stop_enabled = ?');
          values.push(autoStopEnabled ? 1 : 0);

          if (preferredModels) {
            updates.push('preferred_models = ?');
            values.push(JSON.stringify(preferredModels));
          }

          updates.push('updated_at = CURRENT_TIMESTAMP');
          values.push('default');

          db.prepare(`
            UPDATE budget_settings
            SET ${updates.join(', ')}
            WHERE id = ?
          `).run(...values);

          logger.info('예산 설정 업데이트', args);

          return {
            success: true,
            settings: {
              monthlyBudget,
              dailyLimit,
              alertThreshold,
              autoStopEnabled
            }
          };

        } catch (error) {
          throw new Error(`설정 실패: ${error.message}`);
        }
      }
    },

    // 예산 상태 조회
    {
      name: 'get_budget_status',
      description: '현재 예산 사용 상태를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        try {
          const settings = db.prepare('SELECT * FROM budget_settings WHERE id = ?').get('default');

          // 이번 달 사용량 조회
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);

          const monthlyUsage = db.prepare(`
            SELECT COALESCE(SUM(cost), 0) as total_cost,
                   COUNT(*) as api_calls
            FROM api_usage
            WHERE created_at >= ?
          `).get(monthStart.toISOString());

          // 오늘 사용량 조회
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const dailyUsage = db.prepare(`
            SELECT COALESCE(SUM(cost), 0) as total_cost,
                   COUNT(*) as api_calls
            FROM api_usage
            WHERE created_at >= ?
          `).get(today.toISOString());

          const monthlyBudget = settings.monthly_budget || 100;
          const dailyLimit = settings.daily_limit || 10;
          const alertThreshold = settings.alert_threshold || 0.8;

          const monthlyUsed = monthlyUsage.total_cost || 0;
          const dailyUsed = dailyUsage.total_cost || 0;

          const monthlyPercentage = (monthlyUsed / monthlyBudget) * 100;
          const dailyPercentage = (dailyUsed / dailyLimit) * 100;

          // 알림 확인
          const alerts = [];
          if (monthlyPercentage >= alertThreshold * 100) {
            alerts.push({
              type: 'monthly_threshold',
              message: `월간 예산의 ${Math.round(monthlyPercentage)}% 사용`
            });
          }
          if (dailyPercentage >= alertThreshold * 100) {
            alerts.push({
              type: 'daily_threshold',
              message: `일일 한도의 ${Math.round(dailyPercentage)}% 사용`
            });
          }

          return {
            success: true,
            budget: {
              monthly: {
                budget: monthlyBudget,
                used: Math.round(monthlyUsed * 100) / 100,
                remaining: Math.round((monthlyBudget - monthlyUsed) * 100) / 100,
                percentage: Math.round(monthlyPercentage * 10) / 10,
                apiCalls: monthlyUsage.api_calls
              },
              daily: {
                limit: dailyLimit,
                used: Math.round(dailyUsed * 100) / 100,
                remaining: Math.round((dailyLimit - dailyUsed) * 100) / 100,
                percentage: Math.round(dailyPercentage * 10) / 10,
                apiCalls: dailyUsage.api_calls
              }
            },
            settings: {
              alertThreshold: alertThreshold * 100 + '%',
              autoStopEnabled: settings.auto_stop_enabled === 1
            },
            alerts,
            estimatedMonthlyTotal: Math.round((monthlyUsed / new Date().getDate()) * 30 * 100) / 100
          };

        } catch (error) {
          throw new Error(`상태 조회 실패: ${error.message}`);
        }
      }
    },

    // 비용 최적화 추천
    {
      name: 'get_cost_optimization_recommendations',
      description: '비용 최적화를 위한 추천 사항을 제공합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          analysisdays: {
            type: 'number',
            description: '분석 기간 (일)',
            default: 7
          }
        }
      },
      execute: async (args) => {
        const { analysisDays = 7 } = args;

        try {
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - analysisDays);

          // 모델별 사용량 분석
          const usageByModel = db.prepare(`
            SELECT model,
                   COUNT(*) as calls,
                   SUM(cost) as total_cost,
                   AVG(response_time) as avg_response_time,
                   SUM(prompt_tokens + completion_tokens) as total_tokens
            FROM api_usage
            WHERE created_at >= ?
            GROUP BY model
            ORDER BY total_cost DESC
          `).all(startDate.toISOString());

          const recommendations = [];

          for (const usage of usageByModel) {
            // 고비용 모델 대체 추천
            if (usage.model === 'gpt-4' || usage.model === 'gpt-4-turbo') {
              const savingsRate = usage.model === 'gpt-4' ? 0.95 : 0.9;
              recommendations.push({
                type: 'model_switch',
                priority: 'high',
                currentModel: usage.model,
                suggestedModel: 'gpt-4o-mini',
                estimatedSavings: Math.round(usage.total_cost * savingsRate * 100) / 100,
                reason: 'GPT-4o-mini는 대부분의 작업에서 유사한 품질을 제공하면서 비용이 크게 낮습니다.'
              });
            }

            if (usage.model === 'claude-3-opus') {
              recommendations.push({
                type: 'model_switch',
                priority: 'medium',
                currentModel: usage.model,
                suggestedModel: 'claude-3-sonnet',
                estimatedSavings: Math.round(usage.total_cost * 0.8 * 100) / 100,
                reason: 'Claude 3 Sonnet은 대부분의 작업에 충분한 성능을 제공합니다.'
              });
            }

            // TTS HD → Standard 추천
            if (usage.model === 'tts-1-hd') {
              recommendations.push({
                type: 'model_switch',
                priority: 'low',
                currentModel: usage.model,
                suggestedModel: 'tts-1',
                estimatedSavings: Math.round(usage.total_cost * 0.5 * 100) / 100,
                reason: '일반 TTS도 충분히 좋은 품질을 제공합니다.'
              });
            }

            // 임베딩 모델 최적화
            if (usage.model === 'text-embedding-3-large') {
              recommendations.push({
                type: 'model_switch',
                priority: 'medium',
                currentModel: usage.model,
                suggestedModel: 'text-embedding-3-small',
                estimatedSavings: Math.round(usage.total_cost * 0.85 * 100) / 100,
                reason: '소형 임베딩 모델도 대부분의 검색 작업에 충분합니다.'
              });
            }
          }

          // 캐싱 추천
          const repeatedQueries = db.prepare(`
            SELECT prompt_hash, COUNT(*) as count, SUM(cost) as wasted_cost
            FROM api_usage
            WHERE created_at >= ?
            GROUP BY prompt_hash
            HAVING count > 1
            ORDER BY wasted_cost DESC
            LIMIT 5
          `).all(startDate.toISOString());

          if (repeatedQueries.length > 0) {
            const totalWasted = repeatedQueries.reduce((sum, q) => sum + (q.wasted_cost || 0), 0);
            recommendations.push({
              type: 'caching',
              priority: 'high',
              estimatedSavings: Math.round(totalWasted * 100) / 100,
              reason: `${repeatedQueries.length}개의 중복 쿼리가 발견되었습니다. 캐싱을 활성화하면 비용을 절약할 수 있습니다.`,
              details: {
                duplicateQueries: repeatedQueries.length,
                totalDuplicateCalls: repeatedQueries.reduce((sum, q) => sum + q.count, 0)
              }
            });
          }

          // 총 절감 가능 금액
          const totalPotentialSavings = recommendations.reduce((sum, r) => sum + (r.estimatedSavings || 0), 0);

          return {
            success: true,
            analysisPeriod: `${analysisDays}일`,
            usageByModel: usageByModel.map(u => ({
              model: u.model,
              calls: u.calls,
              totalCost: Math.round(u.total_cost * 100) / 100,
              avgResponseTime: Math.round(u.avg_response_time)
            })),
            recommendations,
            totalPotentialSavings: Math.round(totalPotentialSavings * 100) / 100
          };

        } catch (error) {
          throw new Error(`분석 실패: ${error.message}`);
        }
      }
    },

    // 비용 예측
    {
      name: 'predict_monthly_cost',
      description: '현재 사용 패턴을 기반으로 월말 예상 비용을 계산합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        try {
          const today = new Date();
          const dayOfMonth = today.getDate();
          const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

          // 이번 달 현재까지 사용량
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          const currentUsage = db.prepare(`
            SELECT COALESCE(SUM(cost), 0) as total_cost,
                   COUNT(*) as api_calls
            FROM api_usage
            WHERE created_at >= ?
          `).get(monthStart.toISOString());

          const dailyAverage = currentUsage.total_cost / dayOfMonth;
          const projectedTotal = dailyAverage * daysInMonth;

          // 지난 달 비교
          const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
          const lastMonthUsage = db.prepare(`
            SELECT COALESCE(SUM(cost), 0) as total_cost
            FROM api_usage
            WHERE created_at >= ? AND created_at <= ?
          `).get(lastMonthStart.toISOString(), lastMonthEnd.toISOString());

          const settings = db.prepare('SELECT * FROM budget_settings WHERE id = ?').get('default');
          const budget = settings?.monthly_budget || 100;

          const projectedOverBudget = projectedTotal > budget;
          const percentageOfBudget = (projectedTotal / budget) * 100;

          return {
            success: true,
            currentMonth: {
              usedSoFar: Math.round(currentUsage.total_cost * 100) / 100,
              dayOfMonth,
              daysRemaining: daysInMonth - dayOfMonth,
              apiCalls: currentUsage.api_calls
            },
            prediction: {
              dailyAverage: Math.round(dailyAverage * 100) / 100,
              projectedTotal: Math.round(projectedTotal * 100) / 100,
              budget,
              percentageOfBudget: Math.round(percentageOfBudget),
              overBudget: projectedOverBudget,
              projectedOverage: projectedOverBudget ? Math.round((projectedTotal - budget) * 100) / 100 : 0
            },
            comparison: {
              lastMonth: Math.round((lastMonthUsage?.total_cost || 0) * 100) / 100,
              changePercentage: lastMonthUsage?.total_cost
                ? Math.round(((projectedTotal - lastMonthUsage.total_cost) / lastMonthUsage.total_cost) * 100)
                : null
            },
            recommendations: projectedOverBudget ? [
              '예산 초과가 예상됩니다. 비용 최적화 추천을 확인하세요.',
              '자동 중지 기능을 활성화하는 것을 고려하세요.',
              '저비용 모델로 전환을 검토하세요.'
            ] : []
          };

        } catch (error) {
          throw new Error(`예측 실패: ${error.message}`);
        }
      }
    },

    // 알림 기록 조회
    {
      name: 'get_budget_alerts',
      description: '예산 관련 알림 기록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          unacknowledgedOnly: {
            type: 'boolean',
            description: '확인되지 않은 알림만 조회',
            default: false
          },
          limit: {
            type: 'number',
            default: 20
          }
        }
      },
      execute: async (args) => {
        const { unacknowledgedOnly = false, limit = 20 } = args;

        try {
          let query = 'SELECT * FROM budget_alerts';
          if (unacknowledgedOnly) {
            query += ' WHERE acknowledged = 0';
          }
          query += ' ORDER BY created_at DESC LIMIT ?';

          const alerts = db.prepare(query).all(limit);

          return {
            success: true,
            alerts: alerts.map(a => ({
              id: a.id,
              type: a.alert_type,
              message: a.message,
              currentUsage: a.current_usage,
              threshold: a.threshold,
              acknowledged: a.acknowledged === 1,
              createdAt: a.created_at
            })),
            unacknowledgedCount: db.prepare('SELECT COUNT(*) as count FROM budget_alerts WHERE acknowledged = 0').get().count
          };

        } catch (error) {
          throw new Error(`알림 조회 실패: ${error.message}`);
        }
      }
    },

    // 모델 가격 정보 조회
    {
      name: 'get_model_pricing',
      description: '사용 가능한 AI 모델의 가격 정보를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['openai', 'anthropic', 'google', 'xai', 'all'],
            description: '프로바이더별 필터링',
            default: 'all'
          }
        }
      },
      execute: async (args) => {
        const { provider = 'all' } = args;

        const providerModels = {
          openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'whisper-1', 'tts-1', 'tts-1-hd', 'dall-e-3', 'text-embedding-3-small', 'text-embedding-3-large'],
          anthropic: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
          google: ['gemini-1.5-pro', 'gemini-1.5-flash'],
          xai: ['grok-beta']
        };

        let modelsToShow = [];
        if (provider === 'all') {
          modelsToShow = Object.values(providerModels).flat();
        } else {
          modelsToShow = providerModels[provider] || [];
        }

        const pricing = modelsToShow.map(model => ({
          model,
          pricing: MODEL_PRICING[model] || 'N/A',
          provider: Object.entries(providerModels).find(([, models]) => models.includes(model))?.[0]
        }));

        return {
          success: true,
          pricing,
          note: '가격은 1K 토큰당 USD 기준입니다. 실제 가격은 공급자 웹사이트에서 확인하세요.'
        };
      }
    }
  ];
}
