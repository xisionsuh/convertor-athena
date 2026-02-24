/**
 * Lumielle Telegram Bot - Standalone Entry Point
 * PM2로 별도 프로세스로 실행
 *
 * Usage: node athena-ai/telegram-main.js
 * PM2:   pm2 start athena-ai/telegram-main.js --name lumielle
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AthenaOrchestrator } from './core/orchestrator.js';
import { WebSearchService } from './utils/webSearch.js';
import { initializeDatabase } from './database/schema.js';
import { logger } from './utils/logger.js';
import { LumielleBot } from './telegram/bot.js';
import { MessageHandler } from './telegram/handler.js';
import { ProactiveNotifier } from './telegram/proactive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 로드
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

// 데이터베이스 초기화
const dbPath = process.env.ATHENA_DB_PATH || path.join(__dirname, '../athena-data/athena.db');
try {
  initializeDatabase(dbPath);
} catch (error) {
  // DB already initialized
}

// WebSearch 초기화
const webSearch = new WebSearchService({
  searchApiKey: process.env.SEARCH_API_KEY,
  searchEngineId: process.env.SEARCH_ENGINE_ID,
  dbPath
});

// Orchestrator 초기화 (Telegram 전용)
const orchestrator = new AthenaOrchestrator({
  dbPath,
  openaiApiKey: process.env.OPENAI_API_KEY,
  geminiApiKey: process.env.GOOGLE_AI_API_KEY,
  claudeApiKey: process.env.ANTHROPIC_API_KEY,
  grokApiKey: process.env.XAI_API_KEY,
  webSearchEnabled: true,
  webSearchService: webSearch,
  mcpEnabled: true,
  mcpWorkspaceRoot: path.join(__dirname, '../workspace')
});

// Telegram Bot 초기화
const bot = new LumielleBot({
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID || null,
  envPath
});

if (!bot.enabled) {
  console.error('TELEGRAM_BOT_TOKEN not configured. Exiting.');
  process.exit(1);
}

// Proactive Notifier 초기화
const notifier = new ProactiveNotifier({
  bot,
  orchestrator,
  workspaceMemory: orchestrator.workspaceMemory
});

// Message Handler 초기화
const handler = new MessageHandler({
  bot,
  orchestrator,
  workspaceMemory: orchestrator.workspaceMemory,
  notifier
});

bot.setHandler(handler);

// 시작
bot.startPolling();
notifier.start();

console.log(`
╔════════════════════════════════════════╗
║                                        ║
║   ✨  Lumielle AI - Telegram Bot      ║
║                                        ║
║   Bot: @Lumielle_ai_bot               ║
║   Status: Polling...                   ║
║                                        ║
╚════════════════════════════════════════╝
`);

logger.info('Lumielle Telegram Bot started', {
  botEnabled: bot.enabled,
  chatId: bot.chatId || '(waiting for first message)',
  notifier: 'active'
});

// 종료 처리
process.on('SIGINT', () => {
  logger.info('Lumielle: SIGINT received');
  bot.stopPolling();
  notifier.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Lumielle: SIGTERM received');
  bot.stopPolling();
  notifier.stop();
  process.exit(0);
});
