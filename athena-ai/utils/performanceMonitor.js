/**
 * 성능 모니터링 유틸리티
 * AI Provider의 응답 시간, 성공률, 사용량 추적
 */

import Database from 'better-sqlite3';
import { logger } from './logger.js';

// 모델별 토큰 비용 (USD per 1M tokens) - 2024년 기준
const MODEL_PRICING = {
  // OpenAI
  'gpt-5': { input: 2.50, output: 10.00 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  
  // Anthropic Claude
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-3-5-sonnet-20240620': { input: 3.00, output: 15.00 },
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  
  // Google Gemini
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.30 },
  'gemini-pro': { input: 0.50, output: 1.50 },
  
  // xAI Grok
  'grok-4-fast': { input: 0.50, output: 2.00 },
  'grok-beta': { input: 0.50, output: 2.00 },
  'grok-2': { input: 0.50, output: 2.00 },
};

/**
 * 토큰 비용 계산
 */
function calculateCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // 기본값: 평균 비용 사용
    return (inputTokens * 1.0 + outputTokens * 5.0) / 1000000;
  }
  
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
}

export class PerformanceMonitor {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  /**
   * 테이블 초기화
   */
  initializeTables() {
    // ai_performance 테이블이 이미 schema.js에서 생성됨
    // 필요시 인덱스 추가
    try {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ai_performance_provider_task 
        ON ai_performance(ai_provider, task_type);
      `);
    } catch (error) {
      // 인덱스가 이미 있으면 무시
      logger.debug('Performance index already exists');
    }
  }

  /**
   * AI 호출 시작 시간 기록
   */
  startTracking(providerName, taskType) {
    return {
      provider: providerName,
      taskType: taskType,
      startTime: Date.now()
    };
  }

  /**
   * AI 호출 완료 및 성능 기록 (토큰 사용량 포함)
   */
  recordSuccess(tracking, responseTime = null, usage = null, model = null) {
    const actualResponseTime = responseTime || (Date.now() - tracking.startTime);
    const providerName = tracking.provider;
    const taskType = tracking.taskType || 'general';

    try {
      // 기존 레코드 조회 또는 생성
      const existing = this.db.prepare(`
        SELECT * FROM ai_performance 
        WHERE ai_provider = ? AND task_type = ?
      `).get(providerName, taskType);

      if (existing) {
        // 기존 레코드 업데이트
        const totalUses = existing.total_uses + 1;
        const currentAvgTime = existing.avg_response_time || 0;
        const newAvgTime = ((currentAvgTime * existing.total_uses) + actualResponseTime) / totalUses;
        const currentSuccessRate = existing.success_rate || 0;
        const newSuccessRate = ((currentSuccessRate * existing.total_uses) + 1) / totalUses;

        this.db.prepare(`
          UPDATE ai_performance 
          SET 
            success_rate = ?,
            avg_response_time = ?,
            total_uses = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE ai_provider = ? AND task_type = ?
        `).run(newSuccessRate, newAvgTime, totalUses, providerName, taskType);
      } else {
        // 새 레코드 생성
        this.db.prepare(`
          INSERT INTO ai_performance 
          (ai_provider, task_type, success_rate, avg_response_time, total_uses, user_satisfaction)
          VALUES (?, ?, 1.0, ?, 1, 0.0)
        `).run(providerName, taskType, actualResponseTime);
      }

      // API 사용량 상세 기록
      if (usage && model) {
        const inputTokens = usage.inputTokens || 0;
        const outputTokens = usage.outputTokens || 0;
        const totalTokens = inputTokens + outputTokens;
        const estimatedCost = calculateCost(model, inputTokens, outputTokens);

        this.db.prepare(`
          INSERT INTO api_usage 
          (ai_provider, model, task_type, input_tokens, output_tokens, total_tokens, estimated_cost, response_time, success)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(providerName, model, taskType, inputTokens, outputTokens, totalTokens, estimatedCost, actualResponseTime);
      }

      // 성능 히스토리 기록 (시간별 집계)
      this.recordPerformanceHistory(providerName, taskType, actualResponseTime, true);

      logger.debug('Performance recorded', {
        provider: providerName,
        taskType,
        responseTime: actualResponseTime,
        tokens: usage ? (usage.inputTokens + usage.outputTokens) : null,
        cost: usage && model ? calculateCost(model, usage.inputTokens || 0, usage.outputTokens || 0) : null,
        success: true
      });
    } catch (error) {
      logger.error('Failed to record performance', error, {
        provider: providerName,
        taskType
      });
    }
  }

  /**
   * AI 호출 실패 기록
   */
  recordFailure(tracking, error = null, usage = null, model = null) {
    const providerName = tracking.provider;
    const taskType = tracking.taskType || 'general';
    const responseTime = Date.now() - tracking.startTime;

    try {
      const existing = this.db.prepare(`
        SELECT * FROM ai_performance 
        WHERE ai_provider = ? AND task_type = ?
      `).get(providerName, taskType);

      if (existing) {
        const totalUses = existing.total_uses + 1;
        const currentSuccessRate = existing.success_rate || 0;
        const newSuccessRate = (currentSuccessRate * existing.total_uses) / totalUses;

        this.db.prepare(`
          UPDATE ai_performance 
          SET 
            success_rate = ?,
            total_uses = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE ai_provider = ? AND task_type = ?
        `).run(newSuccessRate, totalUses, providerName, taskType);
      } else {
        // 첫 실패도 기록
        this.db.prepare(`
          INSERT INTO ai_performance 
          (ai_provider, task_type, success_rate, avg_response_time, total_uses, user_satisfaction)
          VALUES (?, ?, 0.0, 0.0, 1, 0.0)
        `).run(providerName, taskType);
      }

      // API 사용량 기록 (실패한 경우도 기록)
      if (usage && model) {
        const inputTokens = usage.inputTokens || 0;
        const outputTokens = usage.outputTokens || 0;
        const totalTokens = inputTokens + outputTokens;
        const estimatedCost = calculateCost(model, inputTokens, outputTokens);

        this.db.prepare(`
          INSERT INTO api_usage 
          (ai_provider, model, task_type, input_tokens, output_tokens, total_tokens, estimated_cost, response_time, success, error_message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).run(providerName, model, taskType, inputTokens, outputTokens, totalTokens, estimatedCost, responseTime, error?.message || 'Unknown error');
      }

      // 성능 히스토리 기록
      this.recordPerformanceHistory(providerName, taskType, responseTime, false);

      logger.debug('Failure recorded', {
        provider: providerName,
        taskType,
        error: error?.message
      });
    } catch (error) {
      logger.error('Failed to record failure', error, {
        provider: providerName,
        taskType
      });
    }
  }

  /**
   * 성능 히스토리 기록 (시간별 집계)
   */
  recordPerformanceHistory(providerName, taskType, responseTime, success) {
    try {
      const now = new Date();
      const hourTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0).toISOString();

      const existing = this.db.prepare(`
        SELECT * FROM performance_history 
        WHERE ai_provider = ? AND task_type = ? AND hour_timestamp = ?
      `).get(providerName, taskType || 'general', hourTimestamp);

      if (existing) {
        const totalCalls = existing.total_calls + 1;
        const currentAvgTime = existing.response_time || 0;
        const newAvgTime = ((currentAvgTime * existing.total_calls) + responseTime) / totalCalls;
        const currentSuccessRate = existing.success_rate || 0;
        const newSuccessRate = ((currentSuccessRate * existing.total_calls) + (success ? 1 : 0)) / totalCalls;

        this.db.prepare(`
          UPDATE performance_history 
          SET 
            response_time = ?,
            success_rate = ?,
            total_calls = ?,
            created_at = CURRENT_TIMESTAMP
          WHERE ai_provider = ? AND task_type = ? AND hour_timestamp = ?
        `).run(newAvgTime, newSuccessRate, totalCalls, providerName, taskType || 'general', hourTimestamp);
      } else {
        this.db.prepare(`
          INSERT INTO performance_history 
          (ai_provider, task_type, response_time, success_rate, total_calls, hour_timestamp)
          VALUES (?, ?, ?, ?, 1, ?)
        `).run(providerName, taskType || 'general', responseTime, success ? 1.0 : 0.0, hourTimestamp);
      }
    } catch (error) {
      logger.error('Failed to record performance history', error);
    }
  }

  /**
   * 성능 통계 조회
   */
  getPerformanceStats(providerName = null, taskType = null) {
    try {
      let query = 'SELECT * FROM ai_performance WHERE 1=1';
      const params = [];

      if (providerName) {
        query += ' AND ai_provider = ?';
        params.push(providerName);
      }

      if (taskType) {
        query += ' AND task_type = ?';
        params.push(taskType);
      }

      query += ' ORDER BY updated_at DESC';

      const stats = this.db.prepare(query).all(...params);

      return stats.map(stat => ({
        provider: stat.ai_provider,
        taskType: stat.task_type,
        successRate: stat.success_rate,
        avgResponseTime: stat.avg_response_time,
        totalUses: stat.total_uses,
        userSatisfaction: stat.user_satisfaction,
        lastUpdated: stat.updated_at
      }));
    } catch (error) {
      logger.error('Failed to get performance stats', error);
      return [];
    }
  }

  /**
   * 특정 작업 유형에 대한 최적 AI 추천
   */
  getBestProviderForTask(taskType) {
    try {
      const stats = this.db.prepare(`
        SELECT * FROM ai_performance 
        WHERE task_type = ? 
        AND total_uses >= 3
        ORDER BY success_rate DESC, avg_response_time ASC
        LIMIT 1
      `).get(taskType);

      if (stats) {
        return {
          provider: stats.ai_provider,
          successRate: stats.success_rate,
          avgResponseTime: stats.avg_response_time,
          totalUses: stats.total_uses
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get best provider', error);
      return null;
    }
  }

  /**
   * 전체 성능 요약
   */
  getSummary() {
    try {
      const summary = this.db.prepare(`
        SELECT 
          ai_provider,
          COUNT(*) as task_types,
          SUM(total_uses) as total_calls,
          AVG(success_rate) as avg_success_rate,
          AVG(avg_response_time) as avg_response_time
        FROM ai_performance
        GROUP BY ai_provider
        ORDER BY total_calls DESC
      `).all();

      return summary.map(stat => ({
        provider: stat.ai_provider,
        taskTypes: stat.task_types,
        totalCalls: stat.total_calls,
        avgSuccessRate: stat.avg_success_rate,
        avgResponseTime: stat.avg_response_time
      }));
    } catch (error) {
      logger.error('Failed to get summary', error);
      return [];
    }
  }

  /**
   * 사용자 만족도 업데이트 (향후 구현)
   */
  updateSatisfaction(providerName, taskType, satisfaction) {
    try {
      const existing = this.db.prepare(`
        SELECT * FROM ai_performance 
        WHERE ai_provider = ? AND task_type = ?
      `).get(providerName, taskType);

      if (existing) {
        const currentSatisfaction = existing.user_satisfaction || 0;
        const totalUses = existing.total_uses;
        const newSatisfaction = ((currentSatisfaction * totalUses) + satisfaction) / (totalUses + 1);

        this.db.prepare(`
          UPDATE ai_performance 
          SET user_satisfaction = ?, updated_at = CURRENT_TIMESTAMP
          WHERE ai_provider = ? AND task_type = ?
        `).run(newSatisfaction, providerName, taskType);
      }
    } catch (error) {
      logger.error('Failed to update satisfaction', error);
    }
  }

  /**
   * 데이터베이스 연결 종료
   */
  close() {
    this.db.close();
  }
}

