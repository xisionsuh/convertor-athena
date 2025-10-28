# Changelog

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
