#!/bin/bash

# 회의녹음변환기 실행 스크립트
# 이 스크립트는 프로젝트 디렉토리로 이동하여 개발 서버를 시작합니다.

# 스크립트가 있는 디렉토리로 이동
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 터미널 창 열기 (macOS)
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR' && npm run dev\""

echo "개발 서버가 새 터미널 창에서 시작됩니다."
echo "브라우저에서 http://localhost:3000 을 열어주세요."

