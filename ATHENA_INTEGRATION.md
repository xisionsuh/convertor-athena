# Athena-AI 통합 가이드

## 개요

이 프로젝트는 회의 녹음 변환기에 Athena-AI를 통합한 버전입니다.

## 통합된 기능

### Athena-AI 기능
- **Multi-AI 협업 시스템**: ChatGPT, Gemini, Claude, Grok 등 여러 AI 모델 통합
- **웹 검색**: 최신 정보 검색 및 YouTube 검색 지원
- **기억 시스템**: 정체성, 단기, 장기 기억 관리
- **MCP 통합**: Model Context Protocol 지원

## API 엔드포인트

### POST /api/athena/chat
Athena-AI와 채팅

**요청:**
```json
{
  "userId": "user-id",
  "sessionId": "session-id",
  "message": "질문 내용"
}
```

**응답:**
```json
{
  "success": true,
  "response": "AI 응답",
  "metadata": {
    "strategy": "single",
    "agentsUsed": ["ChatGPT"],
    "searchResults": null,
    "searchType": null
  }
}
```

### GET /api/athena/memory
사용자의 기억 조회

**쿼리 파라미터:**
- `userId`: 사용자 ID (필수)
- `type`: 기억 타입 (`identity`, `short-term`, `long-term`, `all`) - 기본값: `all`

### DELETE /api/athena/memory
기억 삭제

**쿼리 파라미터:**
- `userId`: 사용자 ID (필수)
- `memoryId`: 기억 ID (필수)

## 환경 변수 설정

`.env.local` 파일에 다음 환경 변수를 설정하세요:

```env
# AI API Keys
OPENAI_API_KEY=your_openai_api_key
GOOGLE_AI_API_KEY=your_google_ai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
XAI_API_KEY=your_xai_api_key

# Web Search (Optional)
SEARCH_API_KEY=your_google_search_api_key
SEARCH_ENGINE_ID=your_search_engine_id

# Athena Database Path (Optional)
ATHENA_DB_PATH=./athena-data/athena.db

# MCP Settings (Optional)
MCP_ENABLED=true
MCP_WORKSPACE_ROOT=./workspace
```

## 설치

```bash
cd convertor-athena
npm install
```

## 실행

```bash
npm run dev
```

서버는 `http://localhost:4000`에서 실행됩니다.

## 사용 예시

프론트엔드에서 Athena-AI를 사용하려면:

```typescript
const response = await fetch('/api/athena/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-123',
    sessionId: 'session-456',
    message: '안녕하세요!'
  })
});

const data = await response.json();
console.log(data.response);
```

## 파일 구조

```
convertor-athena/
├── app/
│   └── api/
│       └── athena/
│           ├── chat/
│           │   └── route.ts      # 채팅 API
│           ├── memory/
│           │   └── route.ts      # 기억 관리 API
│           └── utils.ts           # 공통 유틸리티
├── athena-ai/                     # Athena-AI 소스 코드
│   ├── ai/                        # AI 프로바이더
│   ├── core/                      # 핵심 로직
│   ├── database/                  # 데이터베이스
│   ├── memory/                    # 기억 시스템
│   ├── mcp/                       # MCP 통합
│   └── utils/                     # 유틸리티
└── athena-data/                   # 데이터베이스 파일
```

## 참고사항

- Athena-AI는 ES modules를 사용합니다
- better-sqlite3는 네이티브 모듈이므로 서버 사이드에서만 사용 가능합니다
- 데이터베이스는 `athena-data/athena.db`에 저장됩니다

