# 회의녹음변환기

OpenAI Whisper와 GPT를 활용한 음성 녹음 및 회의록 자동 생성 애플리케이션

## 주요 기능

- 🎙️ **실시간 음성 녹음** - 브라우저에서 직접 녹음 가능 (웨이브폼 시각화 포함)
- 🎵 **음성 파일 업로드** - 여러 파일 동시 업로드 및 일괄 처리
- 📝 **음성→텍스트 변환** - OpenAI Whisper API 사용
- 📋 **회의록 자동 생성** - GPT-4o-mini를 활용한 구조화된 회의록 생성
- ✂️ **대용량 파일 처리** - 25MB 초과 파일 자동 분할 (10분 단위)
- 💾 **세션 관리** - 브라우저 localStorage를 통한 작업 내용 저장
- 🖥️ **Electron 앱** - macOS/Windows 독립 실행 앱으로 빌드 가능

## 기술 스택

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Desktop**: Electron
- **Audio Processing**: FFmpeg.wasm
- **AI**: OpenAI API (Whisper, GPT-4o-mini)

## 시작하기

### 필수 요구사항

- Node.js 20 이상
- npm 또는 yarn
- OpenAI API 키 ([발급받기](https://platform.openai.com/api-keys))

### 설치

1. 저장소 클론
```bash
git clone <repository-url>
cd convertor
```

2. 의존성 설치
```bash
npm install
```

3. 환경변수 설정
```bash
cp .env.example .env.local
```

`.env.local` 파일을 열고 OpenAI API 키를 입력하세요:
```
OPENAI_API_KEY=your-api-key-here
```

### 개발 모드 실행

#### 웹 버전
```bash
npm run dev
```
브라우저에서 http://localhost:4000 접속

#### Electron 앱
```bash
npm run electron:dev
```

### 프로덕션 빌드

#### 웹 빌드
```bash
npm run build
npm start
```

#### Electron 앱 빌드 (macOS)
```bash
npm run electron:build
```
빌드된 앱은 `dist/` 폴더에 생성됩니다.

## 사용 방법

### 1. 녹음하기
- "녹음 시작" 버튼을 클릭하여 실시간 녹음 시작
- 웨이브폼으로 녹음 상태 확인
- 일시정지/재개 가능
- 녹음 완료 후 "저장" 또는 "저장 & 변환" 선택

### 2. 파일 업로드
- 음성 파일을 업로드 (여러 파일 동시 가능)
- 지원 형식: MP3, WAV, M4A, WebM 등
- 25MB 초과 파일은 자동으로 10분 단위로 분할

### 3. 텍스트 변환
- 업로드한 파일을 선택
- "텍스트로 변환" 버튼 클릭
- 대용량 파일은 자동으로 분할 처리됨

### 4. 회의록 생성
- 변환된 텍스트에서 "회의록 생성" 버튼 클릭
- AI가 구조화된 회의록 자동 생성

### 5. 내보내기
- 변환 텍스트 또는 회의록을 복사하거나 다운로드
- TXT 파일로 저장 가능

## 보안

⚠️ **중요**: `.env.local` 파일은 절대 Git에 커밋하지 마세요!

- API 키는 환경변수로만 관리
- API 키가 노출되었다면 즉시 재발급
- 자세한 내용은 [SECURITY.md](./SECURITY.md) 참조

## 프로젝트 구조

```
convertor/
├── app/                    # Next.js 앱
│   ├── api/               # API 라우트
│   │   ├── transcribe/    # 음성→텍스트 변환
│   │   └── summarize/     # 회의록 생성
│   ├── types/             # TypeScript 타입
│   ├── utils/             # 유틸리티 함수
│   ├── layout.tsx         # 레이아웃
│   └── page.tsx           # 메인 페이지
├── electron/              # Electron 메인 프로세스
│   └── main.js
├── public/                # 정적 파일
└── build/                 # Electron 빌드 설정
```

## 문제 해결

### FFmpeg 오류
- 브라우저 캐시를 지우고 재시도
- HTTPS 환경에서 실행 필요 (COOP/COEP 헤더)

### API 키 오류
- `.env.local` 파일의 API 키 확인
- OpenAI 계정의 크레딧 잔액 확인

### 녹음이 안 될 때
- 브라우저의 마이크 권한 확인
- HTTPS 환경에서 실행 (localhost는 HTTP 허용)

## 주의사항

- OpenAI API 사용량에 따라 비용이 발생할 수 있습니다
- 대용량 파일(25MB 초과)은 자동으로 분할 처리됩니다
- 파일 분할 및 변환에는 시간이 소요될 수 있습니다
- 브라우저에서 FFmpeg.wasm을 사용하므로 첫 실행 시 로딩 시간이 있을 수 있습니다

## 개발 참고사항

### TypeScript 설정
- Strict 모드 활성화
- 타입 안전성 강화

### 보안 설정
- Electron에서 contextIsolation 활성화
- ASAR 패키징으로 코드 보호
- CSP 헤더 설정 (COOP/COEP)

### 성능 최적화
- FFmpeg.wasm을 클라이언트에서만 로드
- 세션 데이터를 localStorage에 캐싱
- 재시도 로직으로 네트워크 오류 처리

## 라이선스

MIT

## 기여

이슈 및 풀 리퀘스트를 환영합니다!
