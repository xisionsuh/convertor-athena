# 회의 녹음 변환기

OpenAI의 Whisper API와 GPT API를 사용하여 녹음 파일을 텍스트로 변환하고, 자동으로 회의록 형태로 정리해주는 웹 애플리케이션입니다.

## 주요 기능

- **음성-텍스트 변환**: OpenAI Whisper API를 사용하여 녹음 파일을 텍스트로 변환
- **자동 회의록 생성**: GPT API를 사용하여 변환된 텍스트를 구조화된 회의록으로 정리
- **대용량 파일 자동 분할**: 25MB 초과 파일을 10분 단위로 자동 분할하여 처리
- **브라우저 기반 오디오 처리**: FFmpeg.wasm을 사용한 클라이언트 사이드 파일 분할 및 압축
- **텍스트 복사**: 생성된 회의록을 클립보드에 복사하는 기능
- **반응형 UI**: Tailwind CSS를 사용한 깔끔하고 사용하기 쉬운 인터페이스

## 시작하기

### 1. OpenAI API 키 설정

`.env.local` 파일에서 OpenAI API 키를 설정하세요:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

OpenAI API 키는 [OpenAI Platform](https://platform.openai.com/api-keys)에서 발급받을 수 있습니다.

### 2. 개발 서버 실행

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 앱을 확인하세요.

## 사용 방법

1. **음성 파일 업로드**: "음성 파일 선택" 버튼을 클릭하여 녹음 파일을 선택합니다 (지원 형식: mp3, mp4, wav, m4a 등)
   - 25MB 이하: 바로 변환 가능
   - 25MB 초과: 자동으로 10분 단위로 분할하여 처리 (최대 60분)
2. **텍스트 변환**: "텍스트로 변환" 버튼을 클릭하여 음성을 텍스트로 변환합니다
   - 큰 파일의 경우 분할 처리 확인 메시지가 표시됩니다
   - 분할된 파일은 순차적으로 변환되어 하나의 텍스트로 합쳐집니다
3. **회의록 생성**: "회의록 생성" 버튼을 클릭하여 구조화된 회의록을 자동으로 생성합니다
4. **복사하기**: "복사하기" 버튼을 클릭하여 회의록을 클립보드에 복사합니다

## 기술 스택

- **프레임워크**: Next.js 15 (App Router)
- **언어**: TypeScript
- **스타일링**: Tailwind CSS
- **AI API**: OpenAI (Whisper, GPT-4o-mini)
- **오디오 처리**: FFmpeg.wasm (브라우저 기반 파일 분할/압축)

## 프로젝트 구조

```
.
├── app/
│   ├── api/
│   │   ├── transcribe/
│   │   │   └── route.ts      # Whisper API 엔드포인트
│   │   └── summarize/
│   │       └── route.ts      # GPT API 엔드포인트
│   ├── page.tsx              # 메인 UI 페이지
│   └── layout.tsx
├── .env.local                # 환경 변수 (API 키)
└── package.json
```

## 주의사항

- OpenAI API 사용량에 따라 비용이 발생할 수 있습니다
- 대용량 파일(25MB 초과)은 자동으로 분할 처리됩니다
- 파일 분할 및 변환에는 시간이 소요될 수 있습니다 (파일 크기에 따라 수 분)
- 브라우저에서 FFmpeg.wasm을 사용하므로 첫 실행 시 로딩 시간이 있을 수 있습니다
- 최대 60분 분량의 녹음까지 처리 가능합니다 (10분 × 6개 청크)

## 라이선스

MIT
