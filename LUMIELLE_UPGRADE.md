# 루미엘 텔레그램 봇 - OpenClaw급 업그레이드

**날짜**: 2026-02-24
**커밋**: `3908371` feat: 루미엘 텔레그램 봇 OpenClaw급 업그레이드 + Oracle 금융분석 제어

## 개요

루미엘 텔레그램 봇을 9개 기본 명령 + 단일 AI 대화에서 **24개 명령 + 멀티 AI**로 업그레이드.
서버 전체를 텔레그램에서 제어하고, Oracle 금융분석 플랫폼까지 접근 가능.

## 수정 파일 (3개)

| 파일 | 변경 | 라인 |
|------|------|------|
| `athena-ai/telegram/handler.js` | 15개 신규 명령, 헬퍼, /start·/help 업데이트 | +700줄 |
| `athena-ai/mcp/tools/systemExec.js` | SAFE/MODERATE 패턴 추가, DB 스키마 수정 | +6줄 |
| `athena-ai/core/orchestrator.js` | 멀티 AI 모드 감지 + `_telegramMultiAI()` | +60줄 |

## 새 명령어 (15개)

### 시스템 제어 (8개)

| 명령 | MCP 도구 | 보안 | 설명 |
|------|----------|------|------|
| `/exec <cmd>` | `system_exec` | 3-tier | 시스템 명령 실행 (SAFE→즉시, DANGEROUS→승인대기) |
| `/cat <path>` | `system_exec` | SAFE | 파일 내용 보기 (200줄 제한) |
| `/ls [path]` | `system_exec` | SAFE | 디렉토리 목록 (기본: /home/ubuntu) |
| `/search <query> [path]` | `system_exec` | SAFE | grep 기반 텍스트 검색 (py/js/json/md) |
| `/db <SQL> [db]` | `query_database` | SELECT만 | SQLite 쿼리 (Oracle DB 등 지정 가능) |
| `/log <name> [줄수]` | `process_manager` | - | PM2 로그 조회 (기본 50줄) |
| `/restart <name>` | `process_manager` | - | PM2 프로세스 재시작 |
| `/deploy <project>` | `system_exec` + `process_manager` | MODERATE | git pull → build(옵션) → pm2 restart |

### Oracle 금융분석 (7개)

| 명령 | 데이터 소스 | 설명 |
|------|-------------|------|
| `/oracle` | state.json + oracle.db + PM2 | 수집기 상태, DB 통계, PM2 상태 |
| `/oracle market` | regimes + market_data + analyses | 시장 레짐, 주요 자산 가격, AI 분석 |
| `/oracle guru [이름]` | guru_holdings | 투자 대가 컨버전스 or 개별 포트폴리오 |
| `/oracle ta [심볼]` | technical_analysis | TA 신호 (RSI/MACD/Trend/신뢰도) |
| `/oracle report [type]` | reports/ 파일 | 리포트 읽기 (daily/weekly/guru/ta/valuation) |
| `/oracle collect [name]` | python venv | 데이터 수집 트리거 (전체 or 개별) |
| `/oracle analyze` | python venv | AI 분석 실행 |

### 멀티 AI 모드

트리거 패턴: `여러 AI`, `멀티 AI`, `다른 AI들한테`, `토론`, `투표`, `비교해`

동작:
1. 사용 가능한 AI 최대 3개 선택 (ChatGPT/Gemini/Claude/Grok)
2. `Promise.allSettled`로 병렬 호출 (maxTokens: 500)
3. 각 AI 응답을 `[AI명]` 라벨로 표시
4. 메모리에 combined 저장

## 보안 패턴 변경

### SAFE 추가 (systemExec.js)
```
/^grep(\s|$)/    → 읽기전용 검색
/^find(\s|$)/    → 읽기전용 파일 찾기
```

### MODERATE 추가
```
/^python3?(\s|$)/                          → Oracle 수집/분석 트리거
/^\/home\/ubuntu\/\S+\/venv\/bin\/python/  → venv 내 python
```

## 기술 구현 상세

### executeTool 래핑 해제
`MCPBase.executeTool()`은 `{ success: true, result: <도구반환값> }`으로 래핑.
`_unwrapToolResult()` 헬퍼로 일관되게 내부 result 추출.

### Oracle DB 실제 스키마 매칭
계획의 컬럼명과 실제 스키마가 다른 부분 수정:

| 테이블 | 계획 → 실제 |
|--------|-------------|
| regimes | `detected_at` → `timestamp` |
| market_data | `change_24h` → `change_1d`, `updated_at` → `timestamp` |
| analyses | `title` → `type`, `created_at` → `timestamp` |
| guru_holdings | `symbol` → `ticker`, `value` → `value_usd` |
| technical_analysis | `rsi_14` → `rsi`, `overall_signal` → `signal`, `analyzed_at` → `collected_at` |

### command_approvals DB 스키마 수정
기존 DB와 코드 불일치 수정: `request_id` → `id`, `security_tier` → `security_level`

### 배포 프로젝트 맵
```js
oracle    → /home/ubuntu/oracle          (pm2: oracle,      build: false)
athena    → /home/ubuntu/athena           (pm2: athena,      build: npm run build)
heeviz    → /home/ubuntu/heeviz-next      (pm2: heeviz,      build: npm run build)
neomnium  → /home/ubuntu/neomnium-next    (pm2: neomnium,    build: npm run build)
hermes    → /home/ubuntu/hermes-brain-neo (pm2: hermes-neo,  build: false)
s-trader  → /home/ubuntu/heeviz/s-trader  (pm2: s-trader,    build: false)
vibensway → /home/ubuntu/vibensway        (pm2: vibensway,   build: false)
```

## 테스트 결과

**22/22 전체 통과** (자동화 테스트 + 텔레그램 실제 전송 확인)

| # | 테스트 | 결과 |
|---|--------|------|
| 1-7 | 기본 명령 (start/help/status/pm2/memory/identity/alert) | ✅ |
| 8 | `/exec uptime` (SAFE 즉시 실행) | ✅ |
| 9 | `/exec rm -rf /` (DANGEROUS 승인대기) | ✅ |
| 10-13 | 파일 명령 (cat/ls/search) | ✅ |
| 14 | `/db SELECT` (Oracle DB) | ✅ |
| 15 | `/log oracle` | ✅ |
| 16-17 | 사용법 안내 (restart/deploy) | ✅ |
| 18 | `/oracle` → 6테이블 통계 + PM2 | ✅ |
| 19 | `/oracle market` → RISK_OFF 레짐, 10자산, 3분석 | ✅ |
| 20 | `/oracle guru` → GOOG(9명), AMZN(9명) 컨버전스 | ✅ |
| 21 | `/oracle ta` → 15심볼 TA (ETH BULLISH 67%) | ✅ |
| 22 | `/oracle report` | ✅ |

## 명령어 총 목록 (24개)

**기본 (9개)**: /start, /status, /pm2, /screenshot, /memory, /remember, /identity, /alert, /help
**시스템 (8개)**: /exec, /cat, /ls, /search, /db, /log, /restart, /deploy
**Oracle (7개)**: /oracle, /oracle market, /oracle guru, /oracle ta, /oracle report, /oracle collect, /oracle analyze
**자연어**: 일반 대화 + "여러 AI한테 물어봐" 멀티 AI 모드
