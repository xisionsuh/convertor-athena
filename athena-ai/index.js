import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import passport from 'passport';
import { initializeDatabase } from './database/schema.js';
import { AthenaOrchestrator } from './core/orchestrator.js';
import { WebSearchService } from './utils/webSearch.js';
import { createRoutes } from './server/routes.js';
import { setupPassport } from './server/auth.js';
import { createAuthRoutes } from './server/authRoutes.js';
import { errorHandler } from './utils/errorHandler.js';
import { logger } from './utils/logger.js';
import { cleanupBrowser } from './mcp/tools/webBrowser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 로드
dotenv.config();

// 데이터베이스 초기화
const dbPath = process.env.DB_PATH || './data/athena.db';
initializeDatabase(dbPath);

// 로깅 초기화
logger.info('Athena AI 서버 시작', { port: process.env.PORT || 3000, dbPath });

// Passport 설정
setupPassport(dbPath);

// Web Search Service 초기화
const webSearch = new WebSearchService({
  searchApiKey: process.env.SEARCH_API_KEY,
  searchEngineId: process.env.SEARCH_ENGINE_ID,
  dbPath
});

// Athena Orchestrator 초기화 (WebSearchService 전달)
const orchestrator = new AthenaOrchestrator({
  dbPath,
  openaiApiKey: process.env.OPENAI_API_KEY,
  geminiApiKey: process.env.GOOGLE_AI_API_KEY,
  claudeApiKey: process.env.ANTHROPIC_API_KEY,
  grokApiKey: process.env.XAI_API_KEY,
  webSearchEnabled: true,
  webSearchService: webSearch,
  mcpEnabled: process.env.MCP_ENABLED !== 'false', // 기본값: true
  mcpWorkspaceRoot: process.env.MCP_WORKSPACE_ROOT || './workspace'
});

logger.info('Athena Orchestrator 초기화 완료', {
  providers: ['ChatGPT', 'Gemini', 'Claude', 'Grok'],
  fallbackOrder: ['ChatGPT', 'Gemini', 'Claude', 'Grok']
});

// Express 앱 설정
const app = express();
const PORT = process.env.PORT || 3000;

// 세션 설정
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'athena-ai-session-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30일
    }
  })
);

// Passport 초기화
app.use(passport.initialize());
app.use(passport.session());

// 미들웨어
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 서빙 (프론트엔드) - 개발 모드에서는 캐시 방지
if (process.env.NODE_ENV === 'development') {
  app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, path) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  }));
} else {
  app.use(express.static(path.join(__dirname, '../public')));
}

// 인증 라우트
app.use('/auth', createAuthRoutes());

// API 라우트
app.use('/api', createRoutes(orchestrator, webSearch));

// 기본 라우트 - HTML 파일에 캐시 방지 헤더 추가
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 에러 핸들러 (모든 라우트 이후에 위치)
app.use(errorHandler);

// 서버 시작
app.listen(PORT, () => {
  logger.info(`🚀 Athena AI 서버가 포트 ${PORT}에서 실행 중입니다.`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    providers: {
      ChatGPT: !!process.env.OPENAI_API_KEY,
      Gemini: !!process.env.GOOGLE_AI_API_KEY,
      Claude: !!process.env.ANTHROPIC_API_KEY,
      Grok: !!process.env.XAI_API_KEY
    }
  });
  
  console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║        🧠  ATHENA AI - Multi-Agent System        ║
║                                                   ║
║  Server running on http://localhost:${PORT}       ║
║                                                   ║
╚═══════════════════════════════════════════════════╝

AI Brain Hierarchy (Meta AI - 총괄 AI 우선순위):
${process.env.OPENAI_API_KEY ? '✓ 1st' : '✗ 1st'} ChatGPT (Primary Meta AI)
${process.env.GOOGLE_AI_API_KEY ? '✓ 2nd' : '✗ 2nd'} Gemini (Backup Meta AI)
${process.env.ANTHROPIC_API_KEY ? '✓ 3rd' : '✗ 3rd'} Claude (Backup Meta AI)
${process.env.XAI_API_KEY ? '✓ 4th' : '✗ 4th'} Grok (Final Backup Meta AI)

Database: ${dbPath}
Log Level: ${logger.logLevel}
  `);
});

// 프로세스 종료 시 브라우저 정리
process.on('SIGINT', async () => {
  logger.info('SIGINT received, cleaning up...');
  await cleanupBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, cleaning up...');
  await cleanupBrowser();
  process.exit(0);
});

export default app;
