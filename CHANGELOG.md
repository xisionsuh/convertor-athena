# Changelog

## [버그 수정] - 2025-11-07 (최신)

### 버그 수정
- ✅ **녹음 저장 후 변환 오류 해결**: "저장&변환" 버튼 클릭 시 "세션이나 파일을 찾을 수 없습니다" 오류 해결
  - 세션 객체를 직접 전달하여 React 상태 업데이트 지연 문제 해결
  - `transcribeSingleSession` 함수가 세션 ID 또는 세션 객체를 모두 받을 수 있도록 개선
- ✅ **ServiceWorker 등록 오류 해결**: 개발 환경에서 ServiceWorker 등록 실패 오류 해결
  - 개발 환경(`localhost`, `127.0.0.1`)에서 ServiceWorker 등록 비활성화
  - ServiceWorker 등록 실패 시 에러 처리 추가
- ✅ **localStorage 데이터 보호 강화**: 세션 데이터 손실 방지
  - `localStorage` 접근 시 `try-catch` 블록으로 안전성 확보
  - 배열 타입 검증 및 기본값 제공으로 데이터 무결성 보장
  - 세션 속성 기본값 설정으로 손상된 데이터 복구

### UX 개선
- ✅ 변환 진행 상태 표시 개선 (로딩 스피너 및 진행 메시지)
- ✅ 에러 메시지 상세화 (네트워크 오류, 서버 응답 오류 구분)

### 파일 변경사항
- `app/page.tsx`: 녹음 저장 후 변환 로직 개선, localStorage 보호 강화
- `app/layout.tsx`: ServiceWorker 등록 오류 해결

## [개선 사항] - 2025-11-07

### 개발 환경 개선
- ✅ 포트 번호 변경: 3001 → 4000 (다른 개발 프로그램과 충돌 방지)
- ✅ 개발 모드 실행 스크립트 추가 (`start-dev.command`)
  - 바탕화면에서 더블클릭으로 실행 가능
  - 터미널 명령어 입력 불필요
- ✅ 개발자 도구 자동 열림 비활성화 (선택적 사용 가능)
- ✅ Electron 38.4.0 → 38.5.0 업그레이드

### 크래시 방지 시도
- ✅ V8 프로파일링 및 컴파일 힌트 비활성화 설정 추가
- ✅ 안전한 로깅 함수 구현 (EIO 오류 방지)
- ✅ Next.js 서버 프로세스에 V8 플래그 전달
- ⚠️ **알려진 문제**: macOS 26.1 (베타)에서 프로덕션 빌드 크래시 발생
  - 개발 모드(`npm run electron:dev`)는 정상 작동
  - 프로덕션 빌드는 V8 컴파일 힌트 관련 크래시 발생
  - 원인: macOS 베타 버전과 Electron 38.5.0 호환성 문제
  - 해결 방법: 개발 모드 사용 또는 macOS 안정 버전 사용 권장

### 파일 변경사항
- `package.json`: 포트 번호 및 Electron 버전 업데이트
- `electron/main.js`: 포트 변경, 크래시 방지 설정, 개발자 도구 설정
- `start-dev.command`: 개발 모드 실행 스크립트 (신규)
- `README.md`: 포트 번호 문서 업데이트
- `src-tauri/tauri.conf.json`: Tauri 설정 포트 업데이트
- `run-app.sh`: 스크립트 포트 업데이트

## [개선 사항] - 2025-01-26

### 보안
- ✅ `.gitignore`에 `/dist` 디렉토리 추가
- ✅ `.env.example` 파일 생성 및 API 키 보호 가이드 추가
- ✅ `SECURITY.md` 문서 생성
- ✅ Electron ASAR 패키징 활성화 (코드 보호)
- ✅ Electron sandbox 모드 활성화
- ✅ 외부 링크를 기본 브라우저로 열기 설정
- ✅ macOS arm64 + x64 빌드 타겟 추가

### 에러 처리
- ✅ API 라우트에 상세한 에러 처리 추가
  - API 키 검증
  - 파일 크기 검증 (25MB)
  - 파일 타입 검증
  - OpenAI API 상태 코드별 에러 메시지
  - 401 Unauthorized 처리
  - 429 Rate Limit 처리
- ✅ 재시도 로직 유틸리티 함수 추가 (`app/utils/api.ts`)
- ✅ 에러 메시지 추출 함수 추가

### 코드 품질
- ✅ TypeScript 타입 정의 분리 (`app/types/index.ts`)
- ✅ 유틸리티 함수 모듈화 (`app/utils/api.ts`)
  - `fetchWithRetry`: 지수 백오프 재시도 로직
  - `formatFileSize`: 파일 크기 포맷팅
  - `formatTime`: 시간 포맷팅
  - `getErrorMessage`: 에러 메시지 추출
- ✅ Electron 서버 시작 로직 개선
  - ASAR 패키징 경로 처리
  - 서버 준비 상태 확인
  - 최대 재시도 로직

### UX 개선
- ✅ Electron 창 표시 최적화 (ready-to-show 이벤트)
- ✅ 로딩 화면 배경색 설정
- ✅ 에러 메시지 사용자 친화적으로 개선

### 문서
- ✅ `README.md` 대폭 개선
  - 기능 목록 이모지 추가
  - 설치 및 실행 가이드 명확화
  - 문제 해결 섹션 추가
  - 보안 섹션 추가
- ✅ `SECURITY.md` 보안 가이드 추가
- ✅ `.env.example` 예시 파일 생성

### 빌드 설정
- ✅ package.json 스크립트 추가
  - `type-check`: TypeScript 타입 체크
  - `clean`: 빌드 캐시 정리
  - `electron:build:all`: 모든 플랫폼 빌드

## 권장 다음 단계

1. **API 키 재발급**: 현재 노출된 API 키를 즉시 재발급하세요
2. **Git 히스토리 정리**: `.env.local` 파일이 커밋되지 않았는지 확인
3. **테스트**: 개선된 코드를 테스트하세요
   ```bash
   npm run type-check  # 타입 체크
   npm run dev        # 웹 버전 테스트
   npm run electron:dev  # Electron 앱 테스트
   ```
4. **빌드 테스트**: 프로덕션 빌드가 정상 동작하는지 확인
   ```bash
   npm run build
   npm run electron:build
   ```
