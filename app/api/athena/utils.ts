import path from 'path';
// @ts-expect-error - athena-ai는 webpack alias로 매핑됨
import { AthenaOrchestrator } from 'athena-ai/core/orchestrator.js';
// @ts-expect-error - webpack alias로 매핑됨
import { WebSearchService } from 'athena-ai/utils/webSearch.js';
// @ts-expect-error - webpack alias로 매핑됨
import { initializeDatabase } from 'athena-ai/database/schema.js';

const dbPath = process.env.ATHENA_DB_PATH || path.join(process.cwd(), 'athena-data', 'athena.db');

// 데이터베이스 초기화 (한 번만 실행)
let dbInitialized = false;
if (!dbInitialized) {
  try {
    initializeDatabase(dbPath);
    dbInitialized = true;
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Web Search Service 초기화
const webSearch = new WebSearchService({
  searchApiKey: process.env.SEARCH_API_KEY,
  searchEngineId: process.env.SEARCH_ENGINE_ID,
  dbPath
});

// Athena Orchestrator 초기화 (싱글톤 패턴)
let orchestrator: AthenaOrchestrator | null = null;

export function getOrchestrator(): AthenaOrchestrator {
  if (!orchestrator) {
    orchestrator = new AthenaOrchestrator({
      dbPath,
      openaiApiKey: process.env.OPENAI_API_KEY,
      geminiApiKey: process.env.GOOGLE_AI_API_KEY,
      claudeApiKey: process.env.ANTHROPIC_API_KEY,
      grokApiKey: process.env.XAI_API_KEY,
      webSearchEnabled: true,
      webSearchService: webSearch,
      mcpEnabled: process.env.MCP_ENABLED !== 'false',
      mcpWorkspaceRoot: process.env.MCP_WORKSPACE_ROOT || path.join(process.cwd(), 'workspace')
    });
  }
  return orchestrator;
}

export function getWebSearch(): WebSearchService {
  return webSearch;
}
