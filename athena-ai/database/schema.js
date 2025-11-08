import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initializeDatabase(dbPath = './data/athena.db') {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 사용자 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE,
      email TEXT,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  // 정체성 데이터베이스 - 아테나의 인격, 행동 방법, 판단 가중치
  db.exec(`
    CREATE TABLE IF NOT EXISTS identity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      category TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 단기 기억 - 대화 세션과 맥락
  db.exec(`
    CREATE TABLE IF NOT EXISTS short_term_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message_type TEXT NOT NULL, -- 'user' or 'assistant'
      content TEXT NOT NULL,
      metadata TEXT, -- JSON 형태로 추가 정보 저장
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 장기 기억 - 영구히 기록되어야 할 프로젝트 단위 정보
  db.exec(`
    CREATE TABLE IF NOT EXISTS long_term_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL, -- 'project', 'preference', 'fact', etc.
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT, -- JSON array
      importance INTEGER DEFAULT 5, -- 1-10 scale
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // AI 판단 및 결정 로그
  db.exec(`
    CREATE TABLE IF NOT EXISTS decision_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      decision_type TEXT NOT NULL, -- 'agent_selection', 'collaboration', 'voting', etc.
      input TEXT NOT NULL,
      process TEXT NOT NULL, -- JSON 형태로 사고 과정 저장
      output TEXT NOT NULL,
      ai_used TEXT NOT NULL, -- JSON array of AI providers used
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 웹 검색 캐시
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      results TEXT NOT NULL, -- JSON
      source TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // AI 성능 및 선호도 학습 데이터
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ai_provider TEXT NOT NULL,
      task_type TEXT NOT NULL,
      success_rate REAL DEFAULT 0.0,
      avg_response_time REAL DEFAULT 0.0,
      total_uses INTEGER DEFAULT 0,
      user_satisfaction REAL DEFAULT 0.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // API 사용량 상세 추적 (토큰 수, 비용 등)
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ai_provider TEXT NOT NULL,
      model TEXT NOT NULL,
      task_type TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      estimated_cost REAL DEFAULT 0.0,
      response_time INTEGER DEFAULT 0,
      success INTEGER DEFAULT 1,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 성능 히스토리 (시간별 추적)
  db.exec(`
    CREATE TABLE IF NOT EXISTS performance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ai_provider TEXT NOT NULL,
      task_type TEXT,
      response_time INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0.0,
      total_calls INTEGER DEFAULT 0,
      hour_timestamp DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 세션 관리
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 검색 결과 피드백
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      result_url TEXT NOT NULL,
      feedback_type TEXT NOT NULL, -- 'useful' or 'not_useful'
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Debate/Voting 피드백
  db.exec(`
    CREATE TABLE IF NOT EXISTS debate_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      debate_id TEXT NOT NULL, -- debate round + agent 조합 식별자
      feedback_type TEXT NOT NULL, -- 'like' or 'dislike'
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Voting 피드백
  db.exec(`
    CREATE TABLE IF NOT EXISTS voting_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      vote_id TEXT NOT NULL, -- vote choice 식별자
      feedback_type TEXT NOT NULL, -- 'like' or 'dislike'
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 인덱스 생성
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_short_term_session ON short_term_memory(session_id);
    CREATE INDEX IF NOT EXISTS idx_short_term_user ON short_term_memory(user_id);
    CREATE INDEX IF NOT EXISTS idx_long_term_user ON long_term_memory(user_id);
    CREATE INDEX IF NOT EXISTS idx_long_term_category ON long_term_memory(category);
    CREATE INDEX IF NOT EXISTS idx_decision_session ON decision_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_search_query ON search_cache(query);
    CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage(ai_provider);
    CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_performance_history_provider ON performance_history(ai_provider);
    CREATE INDEX IF NOT EXISTS idx_performance_history_timestamp ON performance_history(hour_timestamp);
    CREATE INDEX IF NOT EXISTS idx_search_feedback_query ON search_feedback(query);
    CREATE INDEX IF NOT EXISTS idx_search_summary_query ON search_summary_cache(query);
    CREATE INDEX IF NOT EXISTS idx_debate_feedback_session ON debate_feedback(session_id);
    CREATE INDEX IF NOT EXISTS idx_voting_feedback_session ON voting_feedback(session_id);
  `);
