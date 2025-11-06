#!/bin/bash

# 회의녹음변환기 실행 스크립트

echo "회의녹음변환기를 시작합니다..."

# 서버가 실행 중인지 확인
if ! lsof -Pi :4000 -sTCP:LISTEN -t >/dev/null ; then
    echo "Next.js 서버를 시작합니다..."
    cd "$(dirname "$0")"
    npm run dev > /dev/null 2>&1 &
    echo "서버 시작 대기 중..."
    sleep 5
fi

# Chrome 앱 모드로 실행
echo "앱을 엽니다..."
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --app=http://localhost:4000 --new-window

echo "완료!"
