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
      project_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `);

  // 기존 테이블에 project_id 컬럼 추가 (마이그레이션)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN project_id TEXT`);
  } catch (e) {
    // 컬럼이 이미 존재하면 무시
  }

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

  // 프로젝트 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 프로젝트 자료 테이블 (파일, 메모, 자료 등)
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_resources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      resource_type TEXT NOT NULL, -- 'file', 'memo', 'material', 'transcription', 'minutes'
      resource_id TEXT NOT NULL, -- 원본 파일/메모 ID
      title TEXT NOT NULL,
      content TEXT,
      metadata TEXT, -- JSON 형태로 추가 정보 저장
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // 프로젝트 컨텍스트 테이블 (프로젝트별 학습 컨텍스트)
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_context (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      context_type TEXT NOT NULL, -- 'file_content', 'memo', 'material', 'summary', 'note'
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_resource_id TEXT, -- 원본 자료 ID
      embedding TEXT, -- 벡터 임베딩 (향후 검색용)
      tags TEXT, -- JSON array
      importance INTEGER DEFAULT 5, -- 1-10 scale
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // 파일 세션 테이블 (브라우저 독립적 저장)
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      transcription TEXT,
      minutes TEXT,
      chunks TEXT, -- JSON 형태로 저장
      status TEXT NOT NULL DEFAULT 'pending',
      project_id TEXT,
      file_metadata TEXT, -- JSON 형태로 파일 정보 저장
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 메모 세션 테이블 (브라우저 독립적 저장)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memo_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      project_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
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
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_resources_project ON project_resources(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_resources_type ON project_resources(resource_type);
    CREATE INDEX IF NOT EXISTS idx_project_context_project ON project_context(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_context_type ON project_context(context_type);
    CREATE INDEX IF NOT EXISTS idx_file_sessions_user ON file_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_file_sessions_project ON file_sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_memo_sessions_user ON memo_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_memo_sessions_project ON memo_sessions(project_id);
  `);

  return db;
}

// 싱글톤 데이터베이스 인스턴스
let dbInstance = null;

export function getDatabase(dbPath = './data/athena.db') {
  if (!dbInstance) {
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
  }
  return dbInstance;
}
