#!/bin/bash

# 회의녹음변환기 실행 스크립트 (macOS .command 파일)
# 이 파일을 더블클릭하면 개발 서버가 시작됩니다.

# 스크립트가 있는 디렉토리 찾기
# 바탕화면에서 실행된 경우 프로젝트 디렉토리로 이동
if [ -L "${BASH_SOURCE[0]}" ]; then
    # 심볼릭 링크인 경우 실제 파일 경로 찾기
    SCRIPT_DIR="$( cd "$( dirname "$(readlink "${BASH_SOURCE[0]}")" )" && pwd )"
else
    # 일반 파일인 경우
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
fi

# 프로젝트 디렉토리로 이동 (바탕화면에서 실행된 경우)
PROJECT_DIR="/Users/hee-seocksuh/Dev/convertor-athena"
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    echo "📁 프로젝트 디렉토리로 이동: $PROJECT_DIR"
else
    # 상대 경로로 찾기 시도
    cd "$SCRIPT_DIR"
    echo "📁 현재 디렉토리: $(pwd)"
fi

# 환경 변수 확인 (선택사항 - 없어도 개발 서버는 실행 가능)
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local 파일이 없습니다."
    echo "   (선택사항) API 키가 필요하면 .env.local 파일을 생성하세요."
    echo "   예: OPENAI_API_KEY=your_key"
    echo ""
    echo "   개발 서버는 계속 실행됩니다..."
    echo ""
    sleep 2
fi

# Node.js 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되어 있지 않습니다."
    echo "https://nodejs.org 에서 Node.js를 설치해주세요."
    read -p "아무 키나 눌러 종료하세요..."
    exit 1
fi

# npm 확인
if ! command -v npm &> /dev/null; then
    echo "❌ npm이 설치되어 있지 않습니다."
    read -p "아무 키나 눌러 종료하세요..."
    exit 1
fi

# 의존성 확인 및 설치
if [ ! -d "node_modules" ]; then
    echo "📦 의존성 패키지를 설치하는 중..."
    npm install
fi

# 포트 4000이 사용 중인지 확인하고 기존 프로세스 종료
PORT_PID=$(lsof -ti:4000 2>/dev/null)
if [ ! -z "$PORT_PID" ]; then
    echo "⚠️  포트 4000이 이미 사용 중입니다. 기존 프로세스를 종료합니다..."
    kill $PORT_PID 2>/dev/null
    sleep 2
    # 여전히 사용 중이면 강제 종료
    PORT_PID=$(lsof -ti:4000 2>/dev/null)
    if [ ! -z "$PORT_PID" ]; then
        kill -9 $PORT_PID 2>/dev/null
        sleep 1
    fi
    echo "✅ 기존 프로세스 종료 완료"
fi

echo "🚀 회의녹음변환기를 시작합니다..."
echo "📍 프로젝트 경로: $(pwd)"
echo ""
echo "서버를 중지하려면 이 창에서 Ctrl+C를 누르세요."
echo ""

# 개발 서버 시작 (백그라운드로 시작하고 브라우저 열기)
npm run dev &
DEV_PID=$!

# 서버가 준비될 때까지 대기 (최대 30초)
echo "⏳ 서버 시작 대기 중..."
for i in {1..30}; do
    if curl -s http://localhost:4000 > /dev/null 2>&1; then
        echo "✅ 서버가 준비되었습니다!"
        break
    fi
    sleep 1
    echo -n "."
done
echo ""

# 브라우저 자동 열기 (macOS)
echo "🌐 브라우저를 엽니다..."
open http://localhost:4000 2>/dev/null || echo "⚠️  브라우저를 수동으로 열어주세요: http://localhost:4000"

# 서버 프로세스가 종료될 때까지 대기
echo ""
echo "서버가 실행 중입니다. 이 창을 닫으면 서버가 종료됩니다."
echo "브라우저에서 http://localhost:4000 을 확인하세요."
echo ""
echo "서버를 중지하려면 이 창에서 Ctrl+C를 누르거나 창을 닫으세요."
echo ""

# 서버 프로세스가 종료될 때까지 대기
trap "kill $DEV_PID 2>/dev/null; exit" INT TERM
wait $DEV_PID 2>/dev/null || true

echo ""
echo "서버가 종료되었습니다."
read -p "아무 키나 눌러 창을 닫으세요..."

