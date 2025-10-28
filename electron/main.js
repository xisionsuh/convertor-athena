const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      process.env[key.trim()] = value;
    }
  });
  console.log('Environment variables loaded from .env.local');
} else {
  console.warn('.env.local file not found at', envPath);
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

  console.log('App Path:', appPath);
  console.log('Standalone Dir:', standaloneDir);
  console.log('Server Path:', standaloneServerPath);
  console.log('Server exists:', fs.existsSync(standaloneServerPath));

  if (!fs.existsSync(standaloneServerPath)) {
    console.error('Next.js server not found. Please run `npm run build` first.');
    return;
  }

  // Next.js standalone 서버 시작
  nextServer = spawn(process.execPath, [standaloneServerPath], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: '3001',
      HOSTNAME: 'localhost',
      NODE_ENV: 'production'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  nextServer.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`Next.js: ${output}`);
    if (output.includes('Ready') || output.includes('started server')) {
      serverReady = true;
    }
  });

  nextServer.stderr.on('data', (data) => {
    console.error(`Next.js Error: ${data.toString()}`);
  });

  nextServer.on('error', (err) => {
    console.error('Failed to start Next.js server:', err);
  });

  nextServer.on('exit', (code, signal) => {
    console.log(`Next.js server exited with code ${code} and signal ${signal}`);
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
    // 개발 모드: localhost:3001 연결
    mainWindow.loadURL('http://localhost:3001');
    mainWindow.webContents.openDevTools();
  } else {
    // 프로덕션 모드: Next.js standalone 서버 시작
    startNextServer();

    // 서버가 준비될 때까지 대기 후 로드
    waitForServer().then(ready => {
      if (ready) {
        mainWindow.loadURL('http://localhost:3001').catch(err => {
          console.error('Failed to load URL:', err);
        });
      } else {
        console.error('Server failed to start in time');
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

app.whenReady().then(createWindow);

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
