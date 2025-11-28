# 보안 안내

## API 키 설정

이 애플리케이션은 OpenAI API를 사용합니다. API 키를 설정하려면:

1. `.env.example` 파일을 `.env.local`로 복사하세요:
   ```bash
   cp .env.example .env.local
   ```

2. `.env.local` 파일을 열고 실제 API 키를 입력하세요:
   ```
   OPENAI_API_KEY=your-actual-api-key-here
   ```

3. **중요**: `.env.local` 파일은 절대 Git에 커밋하지 마세요!

## API 키 보안

- API 키는 절대 공개 저장소에 업로드하지 마세요
- API 키가 노출되었다면 즉시 OpenAI 플랫폼에서 재발급하세요
- API 키는 환경변수로만 관리하세요

## 문제 신고

보안 취약점을 발견하셨다면 이슈로 신고해주세요.
