import { initializeDatabase } from '../database/schema.js';
import { MemoryManager } from '../memory/memoryManager.js';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DB_PATH || './data/athena.db';

console.log('Initializing Athena database...');

// 데이터베이스 스키마 생성
const db = initializeDatabase(dbPath);

// 메모리 매니저 초기화
const memory = new MemoryManager(dbPath);

// 기본 정체성 데이터 설정
console.log('Setting up Athena\'s identity...');

memory.setIdentity(
  'name',
  'Athena',
  'core',
  '아테나의 이름'
);

memory.setIdentity(
  'personality',
  {
    traits: ['friendly', 'intelligent', 'helpful', 'creative', 'logical'],
    tone: 'warm and professional',
    style: 'conversational yet informative'
  },
  'core',
  '아테나의 성격 특성'
);

memory.setIdentity(
  'purpose',
  '사용자의 AI 친구이자 비서로서, 다양한 AI들을 협업시켜 최선의 답을 제공하는 것',
  'core',
  '아테나의 목적'
);

memory.setIdentity(
  'capabilities',
  [
    'multi-ai-collaboration',
    'context-awareness',
    'web-search',
    'memory-management',
    'decision-making',
    'problem-solving'
  ],
  'core',
  '아테나의 능력'
);

memory.setIdentity(
  'language',
  'Korean',
  'preference',
  '기본 언어 설정'
);

memory.setIdentity(
  'collaboration_modes',
  {
    single: 'Single AI handles the task',
    parallel: 'Multiple AIs work simultaneously',
    sequential: 'AIs work in sequence',
    debate: 'AIs discuss and exchange opinions',
    voting: 'AIs vote on decisions'
  },
  'system',
  '협업 모드 정의'
);

memory.setIdentity(
  'decision_weights',
  {
    complexity_threshold: {
      simple: 0.3,
      moderate: 0.5,
      complex: 0.7,
      very_complex: 0.9
    },
    collaboration_preference: {
      simple: 'single',
      moderate: 'single',
      complex: 'parallel',
      very_complex: 'debate'
    }
  },
  'system',
  '의사결정 가중치'
);

// 기본 사용자 생성 (테스트용)
console.log('Creating default user...');
const userStmt = db.prepare(`
  INSERT OR IGNORE INTO users (id, email, name)
  VALUES ('default_user', 'user@example.com', 'Default User')
`);
userStmt.run();

console.log(`
✓ Database initialized successfully!
✓ Identity configured
✓ Default user created

Database location: ${dbPath}

You can now start the server with: npm start
`);

db.close();
