import { app, BrowserWindow } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// V8 프로파일링 및 Inspector 비활성화 (크래시 방지)
// 환경 변수 설정 (app.commandLine.appendSwitch 전에 설정해야 함)
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
process.env.V8_COMPILE_HINTS_DISABLE = '1';
process.env.V8_ENABLE_COMPILE_HINTS = '0';
process.env.V8_COMPILE_HINTS_OFF = '1';

if (app.isPackaged) {
  // 프로덕션 모드에서 디버깅 기능 비활성화
  // Node.js Inspector 비활성화
  if (process.env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = process.env.NODE_OPTIONS.replace(/--inspect[^ ]*/g, '').trim();
    if (!process.env.NODE_OPTIONS) {
      delete process.env.NODE_OPTIONS;
    }
  }
}

// 안전한 로깅 함수
const safeLog = (message) => {
  try {
    process.stdout.write(message + '\n');
  } catch (err) {
    // 로깅 실패를 무시 (EIO 오류 방지)
  }
};

const safeWarn = (message) => {
  try {
    process.stderr.write(message + '\n');
  } catch (err) {
    // 로깅 실패를 무시 (EIO 오류 방지)
  }
};

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        process.env[key.trim()] = value;
      }
    });
    safeLog('Environment variables loaded from .env.local');
  } else {
    safeWarn('.env.local file not found at ' + envPath);
  }
} catch (err) {
  safeWarn('Failed to load .env.local: ' + err.message);
}

let mainWindow;
let nextServer;
let serverReady = false;

function startNextServer() {
  const appPath = app.getAppPath();
  // asar 패키징을 고려한 경로 처리
  const isAsar = appPath.includes('.asar');
  const standaloneDir = isAsar
    ? path.join(appPath, '..', '.next', 'standalone')
    : path.join(appPath, '.next', 'standalone');
  const standaloneServerPath = path.join(standaloneDir, 'server.js');

  safeLog('App Path: ' + appPath);
  safeLog('Standalone Dir: ' + standaloneDir);
  safeLog('Server Path: ' + standaloneServerPath);
  safeLog('Server exists: ' + fs.existsSync(standaloneServerPath));

  if (!fs.existsSync(standaloneServerPath)) {
    safeWarn('Next.js server not found. Please run `npm run build` first.');
    return;
  }

  // Next.js standalone 서버 시작
  const serverEnv = {
    ...process.env,
    PORT: '4000',
    HOSTNAME: 'localhost',
    NODE_ENV: 'production',
    // Inspector 및 프로파일링 비활성화
    NODE_OPTIONS: '',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    // V8 컴파일 힌트 비활성화
    V8_COMPILE_HINTS_DISABLE: '1',
    V8_ENABLE_COMPILE_HINTS: '0',
    V8_COMPILE_HINTS_OFF: '1'
  };
  
  // NODE_OPTIONS에서 inspect 관련 옵션 제거
  if (serverEnv.NODE_OPTIONS) {
    serverEnv.NODE_OPTIONS = serverEnv.NODE_OPTIONS.replace(/--inspect[^ ]*/g, '').trim();
  }
  
  // Electron의 execPath를 사용하되, V8 플래그를 추가하여 크래시 방지
  const nodeArgs = [
    '--no-profiling',
    '--no-turbo-profiling',
    '--no-trace-ic',
    '--no-compile-hints',
    '--no-compile-hints-collection',
    standaloneServerPath
  ];
  
  nextServer = spawn(process.execPath, nodeArgs, {
    cwd: standaloneDir,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // 안전한 로깅 함수 (로컬 스코프)
  const safeLogLocal = (message) => {
    try {
      if (nextServer && !nextServer.killed) {
        process.stdout.write(message + '\n');
      }
    } catch (err) {
      // 로깅 실패를 무시 (EIO 오류 방지)
    }
  };

  const safeErrorLogLocal = (message) => {
    try {
      if (nextServer && !nextServer.killed) {
        process.stderr.write(message + '\n');
      }
    } catch (err) {
      // 로깅 실패를 무시 (EIO 오류 방지)
    }
  };

  if (nextServer.stdout) {
    nextServer.stdout.on('data', (data) => {
      try {
        const output = data.toString();
        safeLogLocal(`Next.js: ${output}`);
        if (output.includes('Ready') || output.includes('started server')) {
          serverReady = true;
        }
      } catch (err) {
        // 출력 처리 오류 무시
      }
    });

    nextServer.stdout.on('error', (err) => {
      // 파이프 오류 무시 (EIO 방지)
    });
  }

  if (nextServer.stderr) {
    nextServer.stderr.on('data', (data) => {
      try {
        safeErrorLogLocal(`Next.js Error: ${data.toString()}`);
      } catch (err) {
        // 출력 처리 오류 무시
      }
    });

    nextServer.stderr.on('error', (err) => {
      // 파이프 오류 무시 (EIO 방지)
    });
  }

  nextServer.on('error', (err) => {
    safeErrorLogLocal('Failed to start Next.js server: ' + err.message);
  });

  nextServer.on('exit', (code, signal) => {
    safeLogLocal(`Next.js server exited with code ${code} and signal ${signal}`);
    serverReady = false;
  });
}

async function waitForServer(maxRetries = 20, interval = 500) {
  for (let i = 0; i < maxRetries; i++) {
    if (serverReady) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true,
      // 보안 강화: 외부 콘텐츠 차단
      allowRunningInsecureContent: false,
      // 프로덕션 모드에서 DevTools 비활성화 (크래시 방지)
      devTools: app.isPackaged ? false : true,
      // 프로파일링 비활성화 (크래시 방지)
      enableWebSQL: false,
      enableBlinkFeatures: '',
      disableBlinkFeatures: 'V8Inspector',
      // 한글 입력 문제 해결
      spellcheck: false,
      // IME 입력 개선
      experimentalFeatures: false,
    },
    icon: path.join(__dirname, 'icon.png'),
    // 초기 로딩 화면
    backgroundColor: '#ffffff',
    show: false, // 준비될 때까지 숨김
  });

  // 창이 준비되면 표시
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 개발 모드인지 프로덕션 모드인지 확인
  const isDev = !app.isPackaged;

  if (isDev) {
    // 개발 모드: localhost:4000 연결
    mainWindow.loadURL('http://localhost:4000');
    // 개발자 도구 자동 열림 비활성화 (원하면 주석 해제)
    // mainWindow.webContents.openDevTools();
  } else {
    // 프로덕션 모드: Next.js standalone 서버 시작
    startNextServer();

    // 서버가 준비될 때까지 대기 후 로드
    waitForServer().then(ready => {
      if (ready) {
        mainWindow.loadURL('http://localhost:4000').catch(err => {
          safeWarn('Failed to load URL: ' + err.message);
        });
      } else {
        safeWarn('Server failed to start in time');
      }
    });
  }

  // 외부 링크는 기본 브라우저로 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 앱 시작 전 크래시 방지 설정 (app.whenReady() 전에 호출되어야 함)
// V8 프로파일링 완전 비활성화 (크래시 방지)
app.commandLine.appendSwitch('no-profiling');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
// V8 옵티마이저 설정 (크래시 방지) - 프로파일링 및 컴파일 힌트 관련 기능 완전 비활성화
app.commandLine.appendSwitch('js-flags', '--no-lazy --no-expose-gc --max-old-space-size=4096 --no-turbo-profiling --no-trace-ic --no-compile-hints --no-compile-hints-collection');

app.whenReady().then(() => {
  // Content Security Policy 설정 (보안 경고 해결)
  const filter = {
    urls: ['http://localhost:4000/*', 'http://127.0.0.1:4000/*']
  };

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://localhost:4000 http://127.0.0.1:4000 https://unpkg.com https://api.openai.com https://*.openai.com; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob:; " +
          "font-src 'self' data:; " +
          "connect-src 'self' http://localhost:4000 http://127.0.0.1:4000 https://api.openai.com https://*.openai.com ws://localhost:*;"
        ]
      }
    });
  });

  // 추가 안전성 체크
  if (app.isPackaged) {
    // 프로덕션 모드에서만 추가 설정 적용
    app.commandLine.appendSwitch('disable-background-timer-throttling');
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (nextServer) {
    nextServer.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (nextServer) {
    nextServer.kill();
  }
});
