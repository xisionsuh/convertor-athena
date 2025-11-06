#!/bin/bash

# 개발 모드 실행 스크립트
# 이 파일을 더블클릭하면 개발 모드로 앱이 실행됩니다

# 프로젝트 디렉토리 경로 (절대 경로 사용)
PROJECT_DIR="/Users/hee-seocksuh/Dev/convertor"

# 프로젝트 디렉토리로 이동
cd "$PROJECT_DIR" || {
    echo "오류: 프로젝트 디렉토리를 찾을 수 없습니다: $PROJECT_DIR"
    read -p "아무 키나 눌러 종료하세요..."
    exit 1
}

# 터미널 창 제목 설정
echo -e "\033]0;회의녹음변환기 개발 모드\007"

# 포트 정리 (이미 실행 중인 서버 종료)
echo "기존 서버 종료 중..."
lsof -ti:4000 | xargs kill -9 2>/dev/null || true

# 개발 모드 실행
echo "개발 모드 시작 중..."
echo "앱이 열릴 때까지 잠시 기다려주세요..."
echo ""

npm run electron:dev

# 스크립트 종료 시 대기 (에러 메시지 확인용)
echo ""
echo "앱이 종료되었습니다."
read -p "아무 키나 눌러 종료하세요..."

