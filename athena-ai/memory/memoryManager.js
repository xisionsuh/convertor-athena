import { getDatabase } from '../database/schema.js';

export class MemoryManager {
  constructor(dbPath) {
    this.db = getDatabase(dbPath);
  }

  // ==================== 정체성 (Identity) 관리 ====================

  setIdentity(key, value, category = 'core', description = '') {
    const stmt = this.db.prepare(`
      INSERT INTO identity (key, value, category, description, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        category = excluded.category,
        description = excluded.description,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(key, JSON.stringify(value), category, description);
  }

  getIdentity(key) {
    const stmt = this.db.prepare('SELECT * FROM identity WHERE key = ?');
    const result = stmt.get(key);
    if (result) {
      result.value = JSON.parse(result.value);
    }
    return result;
  }

  getAllIdentity(category = null) {
    let stmt;
    if (category) {
      stmt = this.db.prepare('SELECT * FROM identity WHERE category = ?');
      return stmt.all(category).map(row => ({
        ...row,
        value: JSON.parse(row.value)
      }));
    } else {
      stmt = this.db.prepare('SELECT * FROM identity');
      return stmt.all().map(row => ({
        ...row,
        value: JSON.parse(row.value)
      }));
    }
  }

  // ==================== 단기 기억 (Short-term Memory) ====================

  addShortTermMemory(userId, sessionId, messageType, content, metadata = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO short_term_memory (user_id, session_id, message_type, content, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(userId, sessionId, messageType, content, JSON.stringify(metadata));
  }

  getShortTermMemory(sessionId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM short_term_memory
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(sessionId, limit).reverse().map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    }));
  }

  getContextWindow(sessionId, windowSize = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM short_term_memory
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(sessionId, windowSize).reverse().map(row => ({
      role: row.message_type === 'user' ? 'user' : 'assistant',
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    }));
  }

  clearShortTermMemory(sessionId) {
    const stmt = this.db.prepare('DELETE FROM short_term_memory WHERE session_id = ?');
    return stmt.run(sessionId);
  }

  // ==================== 장기 기억 (Long-term Memory) ====================

  addLongTermMemory(userId, category, title, content, tags = [], importance = 5) {
    const stmt = this.db.prepare(`
      INSERT INTO long_term_memory (user_id, category, title, content, tags, importance)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(userId, category, title, content, JSON.stringify(tags), importance);
  }

  getLongTermMemory(userId, category = null, limit = 100) {
    let stmt;
    let results;

    if (category) {
      stmt = this.db.prepare(`
        SELECT * FROM long_term_memory
        WHERE user_id = ? AND category = ?
        ORDER BY importance DESC, updated_at DESC
        LIMIT ?
      `);
      results = stmt.all(userId, category, limit);
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM long_term_memory
        WHERE user_id = ?
        ORDER BY importance DESC, updated_at DESC
        LIMIT ?
      `);
      results = stmt.all(userId, limit);
    }

    return results.map(row => ({
      ...row,
      tags: JSON.parse(row.tags)
    }));
  }

  searchLongTermMemory(userId, searchTerm) {
    const stmt = this.db.prepare(`
      SELECT * FROM long_term_memory
      WHERE user_id = ? AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)
      ORDER BY importance DESC, updated_at DESC
    `);
    const pattern = `%${searchTerm}%`;
    return stmt.all(userId, pattern, pattern, pattern).map(row => ({
      ...row,
      tags: JSON.parse(row.tags)
    }));
  }

  updateLongTermMemory(id, updates) {
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.importance !== undefined) {
      fields.push('importance = ?');
      values.push(updates.importance);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE long_term_memory
      SET ${fields.join(', ')}
      WHERE id = ?
    `);
    return stmt.run(...values);
  }

  deleteLongTermMemory(id) {
    const stmt = this.db.prepare('DELETE FROM long_term_memory WHERE id = ?');
    return stmt.run(id);
  }

  // ==================== 세션 관리 ====================

  createSession(userId, title = null) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, title)
      VALUES (?, ?, ?)
    `);
    stmt.run(sessionId, userId, title);
    return sessionId;
  }

  getSession(sessionId) {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(sessionId);
  }

  getUserSessions(userId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  }

  updateSessionTitle(sessionId, title) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET title = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(title, sessionId);
  }

  deleteSession(sessionId) {
    // 세션과 관련된 모든 데이터 삭제
    const deleteShortTerm = this.db.prepare('DELETE FROM short_term_memory WHERE session_id = ?');
    const deleteDecisionLog = this.db.prepare('DELETE FROM decision_log WHERE session_id = ?');
    const deleteSession = this.db.prepare('DELETE FROM sessions WHERE id = ?');

    deleteShortTerm.run(sessionId);
    deleteDecisionLog.run(sessionId);
    return deleteSession.run(sessionId);
  }

  // ==================== 결정 로그 ====================

  logDecision(userId, sessionId, decisionType, input, process, output, aiUsed) {
    const stmt = this.db.prepare(`
      INSERT INTO decision_log (user_id, session_id, decision_type, input, process, output, ai_used)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      userId,
      sessionId,
      decisionType,
      input,
      JSON.stringify(process),
      output,
      JSON.stringify(aiUsed)
    );
  }

  getDecisionLog(sessionId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM decision_log
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(sessionId, limit).map(row => ({
      ...row,
      process: JSON.parse(row.process),
      ai_used: JSON.parse(row.ai_used)
    }));
  }

  /**
   * 유사한 질문의 과거 결정 로그 분석
   */
  analyzeSimilarDecisions(userId, query, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM decision_log
      WHERE user_id = ?
      AND decision_type = 'strategy_analysis'
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    const logs = stmt.all(userId, limit * 5).map(row => {
      try {
        return {
          ...row,
          process: JSON.parse(row.process),
          ai_used: JSON.parse(row.ai_used)
        };
      } catch (e) {
        return null;
      }
    }).filter(log => log && log.process && log.process.strategy);

    // 간단한 유사도 검사 (키워드 기반)
    const queryKeywords = query.toLowerCase().split(/\s+/);
    const scoredLogs = logs.map(log => {
      const inputKeywords = (log.input || '').toLowerCase().split(/\s+/);
      const commonKeywords = queryKeywords.filter(kw => 
        inputKeywords.some(ikw => ikw.includes(kw) || kw.includes(ikw))
      );
      const similarity = commonKeywords.length / Math.max(queryKeywords.length, inputKeywords.length);
      return { ...log, similarity };
    }).filter(log => log.similarity > 0.2)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scoredLogs;
  }

  /**
   * 특정 협업 모드의 성공 패턴 분석
   */
  analyzeModePatterns(userId, mode, limit = 20) {
    const stmt = this.db.prepare(`
      SELECT * FROM decision_log
      WHERE user_id = ?
      AND decision_type = 'strategy_analysis'
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    const logs = stmt.all(userId, limit * 3).map(row => {
      try {
        const process = JSON.parse(row.process);
        return {
          ...row,
          process,
          ai_used: JSON.parse(row.ai_used),
          strategy: process?.strategy
        };
      } catch (e) {
        return null;
      }
    }).filter(log => 
      log && 
      log.strategy && 
      log.strategy.collaborationMode === mode
    ).slice(0, limit);

    // 패턴 분석
    const agentFrequency = {};
    const categoryFrequency = {};
    
    logs.forEach(log => {
      const agents = log.strategy?.recommendedAgents || [];
      agents.forEach(agent => {
        agentFrequency[agent] = (agentFrequency[agent] || 0) + 1;
      });
      const category = log.strategy?.category || 'unknown';
      categoryFrequency[category] = (categoryFrequency[category] || 0) + 1;
    });

    return {
      total: logs.length,
      agentFrequency,
      categoryFrequency,
      recentExamples: logs.slice(0, 5).map(log => ({
        input: log.input,
        strategy: log.strategy
      }))
    };
  }
}
