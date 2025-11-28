/**
 * Analytics Tool - 분석 대시보드
 * AI 사용량, 성능 통계, 비용 추정 등 분석 기능
 */

import { logger } from '../../utils/logger.js';
import Database from 'better-sqlite3';

/**
 * 분석 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createAnalyticsTools(options = {}) {
  const { dbPath } = options;

  let db = null;

  const getDb = () => {
    if (!db && dbPath) {
      db = new Database(dbPath);
      initializeAnalyticsTables(db);
    }
    return db;
  };

  // 분석 테이블 초기화
  function initializeAnalyticsTables(database) {
    database.exec(`
      -- API 사용 로그 테이블 (기존 테이블과 별개로 상세 추적)
      CREATE TABLE IF NOT EXISTS analytics_api_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        session_id TEXT,
        provider TEXT NOT NULL,
        model TEXT,
        operation_type TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        response_time_ms INTEGER,
        cost_estimate REAL DEFAULT 0,
        success INTEGER DEFAULT 1,
        error_message TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 일별 집계 테이블
      CREATE TABLE IF NOT EXISTS analytics_daily_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        user_id TEXT,
        provider TEXT,
        total_requests INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        avg_response_time_ms REAL DEFAULT 0,
        success_rate REAL DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, user_id, provider)
      );

      -- 인덱스
      CREATE INDEX IF NOT EXISTS idx_analytics_usage_user ON analytics_api_usage(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_usage_provider ON analytics_api_usage(provider, created_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily_summary(date, user_id);
    `);
  }

  // AI 제공자별 토큰 비용 (USD per 1K tokens)
  const TOKEN_COSTS = {
    'ChatGPT': { input: 0.0015, output: 0.002, model: 'gpt-4o-mini' },
    'GPT-4': { input: 0.03, output: 0.06, model: 'gpt-4' },
    'GPT-4o': { input: 0.005, output: 0.015, model: 'gpt-4o' },
    'Gemini': { input: 0.00025, output: 0.0005, model: 'gemini-pro' },
    'Claude': { input: 0.003, output: 0.015, model: 'claude-3-sonnet' },
    'Grok': { input: 0.005, output: 0.015, model: 'grok-beta' },
    'DALL-E': { perImage: 0.04, model: 'dall-e-3' },
    'TTS': { perCharacter: 0.000015, model: 'tts-1' },
    'Whisper': { perMinute: 0.006, model: 'whisper-1' }
  };

  return [
    // API 사용량 기록
    {
      name: 'log_api_usage',
      description: 'API 사용량을 기록합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: '사용자 ID' },
          sessionId: { type: 'string', description: '세션 ID' },
          provider: { type: 'string', description: 'AI 제공자 (ChatGPT, Gemini, Claude, Grok 등)' },
          model: { type: 'string', description: '사용된 모델' },
          operationType: { type: 'string', description: '작업 유형 (chat, image, tts, stt 등)' },
          inputTokens: { type: 'number', description: '입력 토큰 수' },
          outputTokens: { type: 'number', description: '출력 토큰 수' },
          responseTimeMs: { type: 'number', description: '응답 시간 (밀리초)' },
          success: { type: 'boolean', description: '성공 여부' },
          errorMessage: { type: 'string', description: '에러 메시지 (실패 시)' },
          metadata: { type: 'object', description: '추가 메타데이터' }
        },
        required: ['userId', 'provider']
      },
      execute: async (args) => {
        const {
          userId,
          sessionId,
          provider,
          model,
          operationType = 'chat',
          inputTokens = 0,
          outputTokens = 0,
          responseTimeMs,
          success = true,
          errorMessage,
          metadata
        } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          const totalTokens = inputTokens + outputTokens;

          // 비용 계산
          let costEstimate = 0;
          const costs = TOKEN_COSTS[provider] || TOKEN_COSTS['ChatGPT'];

          if (operationType === 'image') {
            costEstimate = costs.perImage || 0.04;
          } else if (operationType === 'tts') {
            const characters = metadata?.characters || 0;
            costEstimate = characters * (costs.perCharacter || 0.000015);
          } else if (operationType === 'stt') {
            const minutes = metadata?.durationMinutes || 0;
            costEstimate = minutes * (costs.perMinute || 0.006);
          } else {
            costEstimate = (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
          }

          database.prepare(`
            INSERT INTO analytics_api_usage
            (user_id, session_id, provider, model, operation_type, input_tokens, output_tokens, total_tokens, response_time_ms, cost_estimate, success, error_message, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            userId, sessionId || null, provider, model || null, operationType,
            inputTokens, outputTokens, totalTokens, responseTimeMs || null,
            costEstimate, success ? 1 : 0, errorMessage || null,
            metadata ? JSON.stringify(metadata) : null
          );

          logger.info('API 사용량 기록', { userId, provider, totalTokens, costEstimate });

          return {
            success: true,
            recorded: {
              provider,
              model,
              totalTokens,
              costEstimate: `$${costEstimate.toFixed(6)}`,
              responseTimeMs
            }
          };

        } catch (error) {
          logger.error('API 사용량 기록 오류', error);
          throw new Error(`사용량 기록 실패: ${error.message}`);
        }
      }
    },

    // 사용량 통계 조회
    {
      name: 'get_usage_stats',
      description: '사용자의 AI 사용량 통계를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: '사용자 ID' },
          period: {
            type: 'string',
            enum: ['today', 'week', 'month', 'year', 'all'],
            description: '조회 기간',
            default: 'month'
          },
          groupBy: {
            type: 'string',
            enum: ['day', 'week', 'month', 'provider'],
            description: '그룹화 기준',
            default: 'day'
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId, period = 'month', groupBy = 'day' } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          // 기간 설정
          let dateFilter = '';
          switch (period) {
            case 'today':
              dateFilter = "AND date(created_at) = date('now')";
              break;
            case 'week':
              dateFilter = "AND created_at >= datetime('now', '-7 days')";
              break;
            case 'month':
              dateFilter = "AND created_at >= datetime('now', '-30 days')";
              break;
            case 'year':
              dateFilter = "AND created_at >= datetime('now', '-365 days')";
              break;
            default:
              dateFilter = '';
          }

          // 전체 통계
          const totalStats = database.prepare(`
            SELECT
              COUNT(*) as total_requests,
              SUM(total_tokens) as total_tokens,
              SUM(cost_estimate) as total_cost,
              AVG(response_time_ms) as avg_response_time,
              SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
            FROM analytics_api_usage
            WHERE user_id = ? ${dateFilter}
          `).get(userId);

          // 제공자별 통계
          const providerStats = database.prepare(`
            SELECT
              provider,
              COUNT(*) as requests,
              SUM(total_tokens) as tokens,
              SUM(cost_estimate) as cost,
              AVG(response_time_ms) as avg_response_time
            FROM analytics_api_usage
            WHERE user_id = ? ${dateFilter}
            GROUP BY provider
            ORDER BY requests DESC
          `).all(userId);

          // 시간별 추이
          let timeSeriesQuery;
          if (groupBy === 'provider') {
            timeSeriesQuery = `
              SELECT
                provider as label,
                COUNT(*) as requests,
                SUM(total_tokens) as tokens,
                SUM(cost_estimate) as cost
              FROM analytics_api_usage
              WHERE user_id = ? ${dateFilter}
              GROUP BY provider
              ORDER BY requests DESC
            `;
          } else {
            const dateFormat = groupBy === 'day' ? '%Y-%m-%d' :
                              groupBy === 'week' ? '%Y-W%W' : '%Y-%m';
            timeSeriesQuery = `
              SELECT
                strftime('${dateFormat}', created_at) as label,
                COUNT(*) as requests,
                SUM(total_tokens) as tokens,
                SUM(cost_estimate) as cost
              FROM analytics_api_usage
              WHERE user_id = ? ${dateFilter}
              GROUP BY strftime('${dateFormat}', created_at)
              ORDER BY label ASC
            `;
          }

          const timeSeries = database.prepare(timeSeriesQuery).all(userId);

          // 작업 유형별 통계
          const operationStats = database.prepare(`
            SELECT
              operation_type,
              COUNT(*) as count,
              SUM(cost_estimate) as cost
            FROM analytics_api_usage
            WHERE user_id = ? ${dateFilter}
            GROUP BY operation_type
            ORDER BY count DESC
          `).all(userId);

          logger.info('사용량 통계 조회', { userId, period });

          return {
            success: true,
            period,
            summary: {
              totalRequests: totalStats.total_requests || 0,
              totalTokens: totalStats.total_tokens || 0,
              totalCost: `$${(totalStats.total_cost || 0).toFixed(4)}`,
              avgResponseTime: `${Math.round(totalStats.avg_response_time || 0)}ms`,
              successRate: `${(totalStats.success_rate || 100).toFixed(1)}%`
            },
            byProvider: providerStats.map(p => ({
              provider: p.provider,
              requests: p.requests,
              tokens: p.tokens,
              cost: `$${(p.cost || 0).toFixed(4)}`,
              avgResponseTime: `${Math.round(p.avg_response_time || 0)}ms`
            })),
            byOperation: operationStats,
            timeSeries
          };

        } catch (error) {
          logger.error('사용량 통계 조회 오류', error);
          throw new Error(`통계 조회 실패: ${error.message}`);
        }
      }
    },

    // 비용 분석
    {
      name: 'get_cost_analysis',
      description: 'AI 사용 비용을 분석합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: '사용자 ID' },
          period: {
            type: 'string',
            enum: ['week', 'month', 'year'],
            description: '분석 기간',
            default: 'month'
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId, period = 'month' } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          const daysMap = { week: 7, month: 30, year: 365 };
          const days = daysMap[period] || 30;

          // 현재 기간 비용
          const currentPeriod = database.prepare(`
            SELECT
              SUM(cost_estimate) as total_cost,
              COUNT(*) as total_requests
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-${days} days')
          `).get(userId);

          // 이전 기간 비용 (비교용)
          const previousPeriod = database.prepare(`
            SELECT
              SUM(cost_estimate) as total_cost,
              COUNT(*) as total_requests
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-${days * 2} days')
            AND created_at < datetime('now', '-${days} days')
          `).get(userId);

          // 일별 비용 추이
          const dailyCosts = database.prepare(`
            SELECT
              date(created_at) as date,
              SUM(cost_estimate) as cost,
              COUNT(*) as requests
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-${days} days')
            GROUP BY date(created_at)
            ORDER BY date ASC
          `).all(userId);

          // 제공자별 비용
          const costByProvider = database.prepare(`
            SELECT
              provider,
              SUM(cost_estimate) as cost,
              COUNT(*) as requests,
              SUM(total_tokens) as tokens
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-${days} days')
            GROUP BY provider
            ORDER BY cost DESC
          `).all(userId);

          // 비용 절감 제안
          const suggestions = [];
          for (const p of costByProvider) {
            if (p.provider === 'GPT-4' && p.cost > 1) {
              suggestions.push({
                type: 'cost_reduction',
                message: `GPT-4 사용량이 높습니다. 간단한 작업은 GPT-4o-mini 사용을 고려해보세요.`,
                potentialSaving: `최대 ${((p.cost * 0.7)).toFixed(2)} USD 절감 가능`
              });
            }
            if (p.provider === 'DALL-E' && p.requests > 50) {
              suggestions.push({
                type: 'usage_tip',
                message: `이미지 생성을 자주 사용하시네요. 프롬프트를 개선하면 재생성 횟수를 줄일 수 있습니다.`
              });
            }
          }

          // 비용 변화율 계산
          const currentCost = currentPeriod.total_cost || 0;
          const previousCost = previousPeriod.total_cost || 0;
          const costChange = previousCost > 0
            ? ((currentCost - previousCost) / previousCost * 100).toFixed(1)
            : 0;

          // 예상 월간 비용
          const avgDailyCost = currentCost / days;
          const projectedMonthlyCost = avgDailyCost * 30;

          logger.info('비용 분석 조회', { userId, period, totalCost: currentCost });

          return {
            success: true,
            period,
            currentPeriod: {
              totalCost: `$${currentCost.toFixed(4)}`,
              totalRequests: currentPeriod.total_requests || 0,
              avgDailyCost: `$${avgDailyCost.toFixed(4)}`
            },
            comparison: {
              previousPeriodCost: `$${previousCost.toFixed(4)}`,
              changePercent: `${costChange > 0 ? '+' : ''}${costChange}%`,
              trend: costChange > 10 ? 'increasing' : costChange < -10 ? 'decreasing' : 'stable'
            },
            projection: {
              estimatedMonthlyCost: `$${projectedMonthlyCost.toFixed(2)}`,
              estimatedYearlyCost: `$${(projectedMonthlyCost * 12).toFixed(2)}`
            },
            byProvider: costByProvider.map(p => ({
              provider: p.provider,
              cost: `$${(p.cost || 0).toFixed(4)}`,
              percentage: `${((p.cost / currentCost) * 100).toFixed(1)}%`,
              requests: p.requests,
              tokens: p.tokens
            })),
            dailyTrend: dailyCosts.map(d => ({
              date: d.date,
              cost: `$${d.cost.toFixed(4)}`,
              requests: d.requests
            })),
            suggestions
          };

        } catch (error) {
          logger.error('비용 분석 오류', error);
          throw new Error(`비용 분석 실패: ${error.message}`);
        }
      }
    },

    // 성능 분석
    {
      name: 'get_performance_analysis',
      description: 'AI 응답 성능을 분석합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: '사용자 ID' },
          period: {
            type: 'string',
            enum: ['today', 'week', 'month'],
            description: '분석 기간',
            default: 'week'
          }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId, period = 'week' } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          const daysMap = { today: 1, week: 7, month: 30 };
          const days = daysMap[period] || 7;

          // 전체 성능 통계
          const overallStats = database.prepare(`
            SELECT
              COUNT(*) as total_requests,
              AVG(response_time_ms) as avg_response_time,
              MIN(response_time_ms) as min_response_time,
              MAX(response_time_ms) as max_response_time,
              SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
              SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-${days} days')
            AND response_time_ms IS NOT NULL
          `).get(userId);

          // 제공자별 성능
          const providerPerformance = database.prepare(`
            SELECT
              provider,
              COUNT(*) as requests,
              AVG(response_time_ms) as avg_response_time,
              MIN(response_time_ms) as min_response_time,
              MAX(response_time_ms) as max_response_time,
              SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-${days} days')
            GROUP BY provider
            ORDER BY avg_response_time ASC
          `).all(userId);

          // 시간대별 성능 (피크 시간 분석)
          const hourlyPerformance = database.prepare(`
            SELECT
              strftime('%H', created_at) as hour,
              COUNT(*) as requests,
              AVG(response_time_ms) as avg_response_time
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-${days} days')
            GROUP BY strftime('%H', created_at)
            ORDER BY hour ASC
          `).all(userId);

          // 에러 분석
          const errorAnalysis = database.prepare(`
            SELECT
              provider,
              error_message,
              COUNT(*) as count
            FROM analytics_api_usage
            WHERE user_id = ?
            AND success = 0
            AND created_at >= datetime('now', '-${days} days')
            GROUP BY provider, error_message
            ORDER BY count DESC
            LIMIT 10
          `).all(userId);

          // 성능 등급 계산
          const avgResponseTime = overallStats.avg_response_time || 0;
          const successRate = overallStats.total_requests > 0
            ? (overallStats.success_count / overallStats.total_requests * 100)
            : 100;

          let performanceGrade;
          if (avgResponseTime < 1000 && successRate >= 99) {
            performanceGrade = 'A';
          } else if (avgResponseTime < 2000 && successRate >= 95) {
            performanceGrade = 'B';
          } else if (avgResponseTime < 3000 && successRate >= 90) {
            performanceGrade = 'C';
          } else {
            performanceGrade = 'D';
          }

          logger.info('성능 분석 조회', { userId, period, grade: performanceGrade });

          return {
            success: true,
            period,
            grade: performanceGrade,
            summary: {
              totalRequests: overallStats.total_requests || 0,
              avgResponseTime: `${Math.round(avgResponseTime)}ms`,
              minResponseTime: `${overallStats.min_response_time || 0}ms`,
              maxResponseTime: `${overallStats.max_response_time || 0}ms`,
              successRate: `${successRate.toFixed(1)}%`,
              errorCount: overallStats.error_count || 0
            },
            byProvider: providerPerformance.map(p => ({
              provider: p.provider,
              requests: p.requests,
              avgResponseTime: `${Math.round(p.avg_response_time || 0)}ms`,
              responseRange: `${p.min_response_time || 0}ms - ${p.max_response_time || 0}ms`,
              successRate: `${(p.success_rate || 100).toFixed(1)}%`
            })),
            byHour: hourlyPerformance.map(h => ({
              hour: `${h.hour}:00`,
              requests: h.requests,
              avgResponseTime: `${Math.round(h.avg_response_time || 0)}ms`
            })),
            errors: errorAnalysis.map(e => ({
              provider: e.provider,
              message: e.error_message,
              count: e.count
            })),
            recommendations: getPerformanceRecommendations(providerPerformance, errorAnalysis)
          };

        } catch (error) {
          logger.error('성능 분석 오류', error);
          throw new Error(`성능 분석 실패: ${error.message}`);
        }
      }
    },

    // 대시보드 요약
    {
      name: 'get_dashboard_summary',
      description: '대시보드에 표시할 전체 요약 정보를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: '사용자 ID' }
        },
        required: ['userId']
      },
      execute: async (args) => {
        const { userId } = args;

        try {
          const database = getDb();
          if (!database) {
            throw new Error('데이터베이스가 초기화되지 않았습니다.');
          }

          // 오늘 통계
          const today = database.prepare(`
            SELECT
              COUNT(*) as requests,
              SUM(total_tokens) as tokens,
              SUM(cost_estimate) as cost
            FROM analytics_api_usage
            WHERE user_id = ?
            AND date(created_at) = date('now')
          `).get(userId);

          // 이번 주 통계
          const thisWeek = database.prepare(`
            SELECT
              COUNT(*) as requests,
              SUM(total_tokens) as tokens,
              SUM(cost_estimate) as cost
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-7 days')
          `).get(userId);

          // 이번 달 통계
          const thisMonth = database.prepare(`
            SELECT
              COUNT(*) as requests,
              SUM(total_tokens) as tokens,
              SUM(cost_estimate) as cost
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-30 days')
          `).get(userId);

          // 최근 활동
          const recentActivity = database.prepare(`
            SELECT
              provider,
              operation_type,
              total_tokens,
              cost_estimate,
              response_time_ms,
              success,
              created_at
            FROM analytics_api_usage
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 10
          `).all(userId);

          // 가장 많이 사용한 제공자
          const topProvider = database.prepare(`
            SELECT provider, COUNT(*) as count
            FROM analytics_api_usage
            WHERE user_id = ?
            AND created_at >= datetime('now', '-30 days')
            GROUP BY provider
            ORDER BY count DESC
            LIMIT 1
          `).get(userId);

          logger.info('대시보드 요약 조회', { userId });

          return {
            success: true,
            today: {
              requests: today.requests || 0,
              tokens: today.tokens || 0,
              cost: `$${(today.cost || 0).toFixed(4)}`
            },
            thisWeek: {
              requests: thisWeek.requests || 0,
              tokens: thisWeek.tokens || 0,
              cost: `$${(thisWeek.cost || 0).toFixed(4)}`
            },
            thisMonth: {
              requests: thisMonth.requests || 0,
              tokens: thisMonth.tokens || 0,
              cost: `$${(thisMonth.cost || 0).toFixed(4)}`
            },
            topProvider: topProvider ? {
              name: topProvider.provider,
              requests: topProvider.count
            } : null,
            recentActivity: recentActivity.map(a => ({
              provider: a.provider,
              operation: a.operation_type,
              tokens: a.total_tokens,
              cost: `$${(a.cost_estimate || 0).toFixed(6)}`,
              responseTime: a.response_time_ms ? `${a.response_time_ms}ms` : 'N/A',
              success: a.success === 1,
              time: a.created_at
            }))
          };

        } catch (error) {
          logger.error('대시보드 요약 조회 오류', error);
          throw new Error(`대시보드 조회 실패: ${error.message}`);
        }
      }
    }
  ];
}

// 성능 개선 권장 사항 생성
function getPerformanceRecommendations(providerPerformance, errorAnalysis) {
  const recommendations = [];

  for (const p of providerPerformance) {
    if (p.avg_response_time > 5000) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: `${p.provider}의 평균 응답 시간이 ${Math.round(p.avg_response_time / 1000)}초로 느립니다. 네트워크 상태를 확인하세요.`
      });
    }

    if (p.success_rate < 95) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: `${p.provider}의 성공률이 ${p.success_rate.toFixed(1)}%로 낮습니다. 에러 로그를 확인하세요.`
      });
    }
  }

  if (errorAnalysis.length > 0) {
    const topError = errorAnalysis[0];
    recommendations.push({
      type: 'error',
      priority: 'medium',
      message: `"${topError.error_message || 'Unknown error'}" 에러가 ${topError.count}회 발생했습니다.`
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: 'info',
      priority: 'low',
      message: '현재 성능이 양호합니다. 계속 모니터링하세요.'
    });
  }

  return recommendations;
}
