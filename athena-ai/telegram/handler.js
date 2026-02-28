/**
 * MessageHandler - 텔레그램 명령어 + 자연어 라우팅
 * /start, /status, /pm2, /screenshot, /memory, /remember, /identity, /alert
 * /approve, /deny, /pending, /schedule
 * 그 외 자연어 → orchestrator.processStream()
 */

import { logger } from '../utils/logger.js';

// Shell injection sanitizer: remove dangerous characters from user input
function sanitizeShellArg(str) {
  if (!str) return '';
  // Remove shell metacharacters: $, `, ;, |, &, (, ), {, }, <, >, \n, \r
  return str.replace(/[\$`;\|&\(\)\{\}<>\n\r]/g, '').trim();
}

// SQL parameter sanitizer: only allow alphanumeric, space, dash, underscore, dot
function sanitizeSqlLiteral(str) {
  if (!str) return '';
  return str.replace(/[^a-zA-Z0-9\s\-_\.]/g, '').trim();
}

// Valid Oracle collector names (whitelist)
const VALID_COLLECTORS = [
  'money_flow', 'market_data', 'crypto_flow', 'macro_intel', 'sentiment',
  'institutional', 'korea_market', 'guru_tracker', 'technical_data', 'fundamentals'
];

export class MessageHandler {
  constructor(options = {}) {
    this.bot = options.bot;
    this.orchestrator = options.orchestrator;
    this.workspaceMemory = options.workspaceMemory;
    this.notifier = options.notifier; // ProactiveNotifier reference

    // Persistent session for telegram conversations
    this.userId = 'telegram_owner';
    this.sessionId = 'telegram_session';

    // Ensure telegram user exists in DB (for foreign key)
    this._ensureTelegramUser();
  }

  _ensureTelegramUser() {
    try {
      const db = this.orchestrator.memory.db;
      const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(this.userId);
      if (!existing) {
        db.prepare(`
          INSERT INTO users (id, name, email, created_at, last_login)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(this.userId, 'Telegram Owner', 'telegram@lumielle.local');
        logger.info('MessageHandler: Telegram user created in DB');
      }
    } catch (error) {
      logger.error('MessageHandler: Failed to create telegram user', error);
    }
  }

  /**
   * Route incoming message to command or natural language
   */
  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    if (!text) return;

    // Command routing
    if (text.startsWith('/')) {
      const [cmd, ...args] = text.split(/\s+/);
      const command = cmd.toLowerCase();
      const argStr = args.join(' ');

      switch (command) {
        case '/start':
          return this._cmdStart(chatId);
        case '/status':
          return this._cmdStatus(chatId);
        case '/pm2':
          return this._cmdPm2(chatId);
        case '/screenshot':
          return this._cmdScreenshot(chatId, argStr);
        case '/memory':
          return this._cmdMemory(chatId);
        case '/remember':
          return this._cmdRemember(chatId, argStr);
        case '/identity':
          return this._cmdIdentity(chatId);
        case '/alert':
          return this._cmdAlert(chatId, argStr);
        case '/help':
          return this._cmdHelp(chatId);
        case '/exec':
          return this._cmdExec(chatId, argStr);
        case '/cat':
        case '/file':
          return this._cmdCat(chatId, argStr);
        case '/ls':
          return this._cmdLs(chatId, argStr);
        case '/search':
          return this._cmdSearch(chatId, argStr);
        case '/db':
          return this._cmdDb(chatId, argStr);
        case '/log':
          return this._cmdLog(chatId, argStr);
        case '/restart':
          return this._cmdRestart(chatId, argStr);
        case '/deploy':
          return this._cmdDeploy(chatId, argStr);
        case '/oracle':
          return this._cmdOracle(chatId, argStr);
        case '/approve':
          return this._cmdApprove(chatId, argStr);
        case '/deny':
          return this._cmdDeny(chatId, argStr);
        case '/schedule':
          return this._cmdSchedule(chatId, argStr);
        case '/pending':
          return this._cmdPending(chatId);
        case '/credentials':
        case '/creds':
          return this._cmdCredentials(chatId, argStr);
        default:
          // Unknown command → treat as natural language
          return this._handleNaturalLanguage(chatId, text);
      }
    }

    // Natural language
    return this._handleNaturalLanguage(chatId, text);
  }

  // ─── Commands ────────────────────────────────────────

  async _cmdStart(chatId) {
    const greeting = `안녕하세요! 저는 *루미엘(Lumielle)*이에요. ✨

당신의 AI 비서로서 서버 관리부터 금융 분석까지, 뭐든 도와드릴게요.

*기본 명령:*
/status - 서버 상태 | /pm2 - 프로세스 목록
/screenshot <url> - 스크린샷 | /memory - 기억 보기
/remember <내용> - 기억 저장 | /alert on|off - 알림

*시스템 제어:*
/exec <cmd> - 명령 실행 | /cat <path> - 파일 보기
/ls [path] - 디렉토리 | /search <query> [path] - 검색
/db <SQL> [db] - DB 쿼리 | /log <name> [줄수] - 로그
/restart <name> - 재시작 | /deploy <project> - 배포

*승인 & 스케줄:*
/pending - 대기 중인 승인 요청 목록
/approve <id> - 명령 승인 + 실행
/deny <id> - 명령 거부
/schedule list|run|toggle|delete - 스케줄 관리

*Oracle 금융분석:*
/oracle - 상태 | /oracle market - 시장 현황
/oracle guru - 투자 대가 | /oracle ta [심볼] - 기술분석
/oracle report [type] - 리포트 | /oracle collect - 수집

자연어로 말씀하셔도 돼요. "여러 AI한테 물어봐"로 멀티 AI 모드도 가능!`;

    await this.bot.sendMessage(chatId, greeting);
  }

  async _cmdStatus(chatId) {
    await this.bot.sendTyping(chatId);

    try {
      // Use system_monitor MCP tool
      const result = await this.orchestrator.mcpManager.executeTool('system_monitor', {
        action: 'overview'
      });

      if (result.success) {
        const d = result.result || result.data || result;
        const text = this._formatSystemStatus(d);
        await this.bot.sendMessage(chatId, text);
      } else {
        await this.bot.sendMessage(chatId, `시스템 상태 조회 실패: ${result.error}`);
      }
    } catch (error) {
      logger.error('Handler: /status error', error);
      // Fallback: direct system info
      await this._cmdStatusFallback(chatId);
    }
  }

  async _cmdStatusFallback(chatId) {
    try {
      const { execSync } = await import('child_process');

      const uptime = execSync('uptime -p', { encoding: 'utf-8' }).trim();
      const loadavg = execSync("cat /proc/loadavg | awk '{print $1, $2, $3}'", { encoding: 'utf-8' }).trim();
      const memInfo = execSync("free -h | grep Mem | awk '{print $2, $3, $4}'", { encoding: 'utf-8' }).trim();
      const [memTotal, memUsed, memFree] = memInfo.split(/\s+/);
      const diskInfo = execSync("df -h / | tail -1 | awk '{print $2, $3, $4, $5}'", { encoding: 'utf-8' }).trim();
      const [diskTotal, diskUsed, diskAvail, diskPct] = diskInfo.split(/\s+/);

      const text = `*서버 상태*

Uptime: ${uptime}
Load: ${loadavg}

*메모리*
Total: ${memTotal} | Used: ${memUsed} | Free: ${memFree}

*디스크 (/)*
Total: ${diskTotal} | Used: ${diskUsed} (${diskPct}) | Avail: ${diskAvail}`;

      await this.bot.sendMessage(chatId, text);
    } catch (error) {
      await this.bot.sendMessage(chatId, '서버 상태를 가져오지 못했어요.');
    }
  }

  async _cmdPm2(chatId) {
    await this.bot.sendTyping(chatId);

    try {
      const result = await this.orchestrator.mcpManager.executeTool('process_manager', {
        action: 'list'
      });

      if (result.success) {
        const toolResult = result.result || result;
        const processes = toolResult.processes || toolResult.data || (Array.isArray(toolResult) ? toolResult : []);
        const text = this._formatPm2List(processes);
        await this.bot.sendMessage(chatId, text);
      } else {
        await this._cmdPm2Fallback(chatId);
      }
    } catch (error) {
      await this._cmdPm2Fallback(chatId);
    }
  }

  async _cmdPm2Fallback(chatId) {
    try {
      const { execSync } = await import('child_process');
      const output = execSync('pm2 jlist', { encoding: 'utf-8', timeout: 10000 });
      const processes = JSON.parse(output);
      const text = this._formatPm2List(processes);
      await this.bot.sendMessage(chatId, text);
    } catch (error) {
      await this.bot.sendMessage(chatId, 'PM2 프로세스 목록을 가져오지 못했어요.');
    }
  }

  async _cmdScreenshot(chatId, url) {
    if (!url) {
      await this.bot.sendMessage(chatId, '사용법: /screenshot <URL>\n예: /screenshot https://vibensway.com');
      return;
    }

    await this.bot.sendTyping(chatId);

    try {
      const result = await this.orchestrator.mcpManager.executeTool('screen_capture', {
        url: url,
        format: 'png'
      });

      if (result.success && result.filePath) {
        await this.bot.sendPhoto(chatId, result.filePath, url);
      } else {
        await this.bot.sendMessage(chatId, `스크린샷 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      logger.error('Handler: /screenshot error', error);
      await this.bot.sendMessage(chatId, '스크린샷을 찍지 못했어요.');
    }
  }

  async _cmdMemory(chatId) {
    const memory = this.workspaceMemory.getMemory();
    if (memory) {
      await this.bot.sendMessage(chatId, `*MEMORY.md*\n\n${memory}`);
    } else {
      await this.bot.sendMessage(chatId, '아직 저장된 기억이 없어요.');
    }
  }

  async _cmdRemember(chatId, content) {
    if (!content) {
      await this.bot.sendMessage(chatId, '사용법: /remember <기억할 내용>\n예: /remember 내 생일은 3월 15일');
      return;
    }

    this.workspaceMemory.appendMemory('Important Facts', content);
    await this.bot.sendMessage(chatId, `기억했어요! ✨\n\n"${content}"\n\nMEMORY.md에 저장했습니다.`);

    // Also log to daily log
    this.workspaceMemory.appendDailyLog(`사용자 기억 저장: ${content}`);
  }

  async _cmdIdentity(chatId) {
    const identity = this.workspaceMemory.getIdentity();
    if (identity) {
      await this.bot.sendMessage(chatId, `*IDENTITY.md*\n\n${identity}`);
    } else {
      await this.bot.sendMessage(chatId, '정체성 파일을 찾을 수 없어요.');
    }
  }

  async _cmdAlert(chatId, arg) {
    if (!this.notifier) {
      await this.bot.sendMessage(chatId, '알림 시스템이 초기화되지 않았어요.');
      return;
    }

    const setting = arg.toLowerCase().trim();
    if (setting === 'on') {
      this.notifier.setEnabled(true);
      await this.bot.sendMessage(chatId, '알림이 활성화되었어요! 시스템 경고와 모닝 브리핑을 보내드릴게요.');
    } else if (setting === 'off') {
      this.notifier.setEnabled(false);
      await this.bot.sendMessage(chatId, '알림이 비활성화되었어요.');
    } else {
      const status = this.notifier.isEnabled() ? '활성' : '비활성';
      await this.bot.sendMessage(chatId, `현재 알림 상태: *${status}*\n\n사용법: /alert on 또는 /alert off`);
    }
  }

  async _cmdHelp(chatId) {
    const help = `*루미엘 도움말*

*기본 명령:*
/start - 인사
/status - 서버 CPU/메모리/디스크
/pm2 - PM2 프로세스 상태
/screenshot <url> - 웹 스크린샷
/memory - 저장된 기억 보기
/remember <내용> - 새 기억 저장
/identity - 루미엘 정체성 보기
/alert on|off - 알림 켜기/끄기

*시스템 제어:*
/exec <cmd> - 시스템 명령 실행 (3-tier 보안)
/cat <path> - 파일 내용 보기 (200줄)
/ls [path] - 디렉토리 목록 (기본: /home/ubuntu)
/search <query> [path] - 파일 내 텍스트 검색
/db <SQL> [db경로] - DB 쿼리 (SELECT만)
/log <name> [줄수] - PM2 로그 (기본 50줄)
/restart <name> - PM2 프로세스 재시작
/deploy <project> - git pull + build + restart

*승인 & 스케줄:*
/pending - 대기 중인 승인 요청 목록
/approve <id> - DANGEROUS 명령 승인 + 실행
/deny <id> - 명령 거부
/schedule list - 예약 작업 목록
/schedule run <id> - 즉시 실행
/schedule toggle <id> - 활성/비활성 전환
/schedule delete <id> - 예약 삭제

*Oracle 금융분석:*
/oracle - Oracle 시스템 상태
/oracle market - 시장 레짐 + 주요 지표
/oracle guru [이름] - 투자 대가 포트폴리오
/oracle ta [심볼] - 기술 분석 신호
/oracle report [type] - 리포트 (daily/weekly/guru/ta)
/oracle collect [name] - 데이터 수집 트리거
/oracle analyze - AI 분석 실행

*보안 & 모니터링:*
/credentials - API 키 상태 (활성/쿨다운/비활성)
/creds reset <name> - 키 상태 수동 리셋

*자연어 & 멀티 AI:*
명령어 없이 자유롭게 대화하면 AI가 답변합니다.
"여러 AI한테 물어봐 [질문]" → 멀티 AI 모드`;

    await this.bot.sendMessage(chatId, help);
  }

  // ─── Power Commands ─────────────────────────────────

  /**
   * executeTool 래핑 해제: { success, result: { ... } } → 내부 result 반환
   */
  _unwrapToolResult(wrapped) {
    if (wrapped && wrapped.success && wrapped.result) {
      return wrapped.result;
    }
    return wrapped;
  }

  async _cmdExec(chatId, command) {
    if (!command) {
      await this.bot.sendMessage(chatId, '사용법: /exec <명령어>\n예: /exec uptime');
      return;
    }
    await this.bot.sendTyping(chatId);
    try {
      const wrapped = await this.orchestrator.mcpManager.executeTool('system_exec', { command });
      const result = this._unwrapToolResult(wrapped);
      if (result.status === 'pending_approval') {
        await this.bot.sendMessage(chatId, `⚠️ *DANGEROUS 명령 - 승인 필요*\n\n\`${command}\`\n\nRequest ID: \`${result.requestId}\`\n보안 등급: ${result.securityTier}`);
        return;
      }
      if (result.success) {
        const output = (result.output || '(빈 출력)').substring(0, 3500);
        await this.bot.sendMessage(chatId, `*[${result.securityTier}]* \`${command}\`\n\n\`\`\`\n${output}\n\`\`\``);
      } else {
        const errMsg = result.error || result.stderr || '알 수 없는 오류';
        await this.bot.sendMessage(chatId, `실행 실패: ${errMsg.substring(0, 1000)}`);
      }
    } catch (error) {
      logger.error('Handler: /exec error', error);
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdCat(chatId, filePath) {
    if (!filePath) {
      await this.bot.sendMessage(chatId, '사용법: /cat <파일경로>\n예: /cat /home/ubuntu/oracle/config.json');
      return;
    }
    await this.bot.sendTyping(chatId);
    try {
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('system_exec', {
          command: `cat "${sanitizeShellArg(filePath)}" | head -200`
        })
      );
      if (result.success) {
        const output = (result.output || '(빈 파일)').substring(0, 3500);
        await this.bot.sendMessage(chatId, `*${filePath}*\n\n\`\`\`\n${output}\n\`\`\``);
      } else {
        await this.bot.sendMessage(chatId, `파일 읽기 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdLs(chatId, dirPath) {
    const target = dirPath || '/home/ubuntu';
    await this.bot.sendTyping(chatId);
    try {
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('system_exec', {
          command: `ls -la "${sanitizeShellArg(target)}"`
        })
      );
      if (result.success) {
        const output = (result.output || '(빈 디렉토리)').substring(0, 3500);
        await this.bot.sendMessage(chatId, `*${target}*\n\n\`\`\`\n${output}\n\`\`\``);
      } else {
        await this.bot.sendMessage(chatId, `디렉토리 조회 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdSearch(chatId, argStr) {
    if (!argStr) {
      await this.bot.sendMessage(chatId, '사용법: /search <검색어> [경로]\n예: /search "import express" /home/ubuntu/athena');
      return;
    }
    await this.bot.sendTyping(chatId);
    // Parse: first quoted or first word = query, rest = path
    let query, searchPath;
    const quotedMatch = argStr.match(/^"([^"]+)"\s*(.*)?$/);
    if (quotedMatch) {
      query = quotedMatch[1];
      searchPath = quotedMatch[2]?.trim() || '/home/ubuntu';
    } else {
      const parts = argStr.split(/\s+/);
      query = parts[0];
      searchPath = parts[1] || '/home/ubuntu';
    }
    try {
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('system_exec', {
          command: `grep -rl "${sanitizeShellArg(query)}" "${sanitizeShellArg(searchPath)}" --include="*.py" --include="*.js" --include="*.json" --include="*.md" | head -30`
        })
      );
      if (result.success) {
        const output = result.output?.trim() || '결과 없음';
        await this.bot.sendMessage(chatId, `*검색: "${query}"*\n경로: ${searchPath}\n\n\`\`\`\n${output.substring(0, 3500)}\n\`\`\``);
      } else {
        await this.bot.sendMessage(chatId, `검색 실패: ${result.error || '결과 없음'}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdDb(chatId, argStr) {
    if (!argStr) {
      await this.bot.sendMessage(chatId, '사용법: /db <SQL쿼리> [DB경로]\n예: /db SELECT count(*) FROM regimes /home/ubuntu/oracle/data/oracle.db');
      return;
    }
    await this.bot.sendTyping(chatId);
    // Parse SQL and optional DB path at the end
    let sql = argStr;
    let dbPath = null;
    const dbMatch = argStr.match(/\s+(\/\S+\.db)\s*$/);
    if (dbMatch) {
      dbPath = dbMatch[1];
      sql = argStr.substring(0, dbMatch.index).trim();
    }
    try {
      const params = { query: sql };
      if (dbPath) params.database_path = dbPath;
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('query_database', params)
      );
      if (result.success) {
        const formatted = this._formatDbResult(result);
        await this.bot.sendMessage(chatId, formatted.substring(0, 4000));
      } else {
        await this.bot.sendMessage(chatId, `쿼리 실패: ${result.error || result.message}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdLog(chatId, argStr) {
    if (!argStr) {
      await this.bot.sendMessage(chatId, '사용법: /log <PM2이름> [줄수]\n예: /log oracle 100');
      return;
    }
    const parts = argStr.split(/\s+/);
    const name = parts[0];
    const lines = parseInt(parts[1]) || 50;
    await this.bot.sendTyping(chatId);
    try {
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('process_manager', {
          action: 'logs',
          name,
          lines
        })
      );
      if (result.success) {
        const logs = (result.logs || result.output || '(로그 없음)');
        const output = typeof logs === 'string' ? logs : JSON.stringify(logs);
        await this.bot.sendMessage(chatId, `*${name} 로그* (최근 ${lines}줄)\n\n\`\`\`\n${output.substring(0, 3500)}\n\`\`\``);
      } else {
        // Fallback to system_exec
        const fallback = this._unwrapToolResult(
          await this.orchestrator.mcpManager.executeTool('system_exec', {
            command: `pm2 logs "${sanitizeShellArg(name)}" --nostream --lines ${lines}`
          })
        );
        if (fallback.success) {
          await this.bot.sendMessage(chatId, `*${name} 로그* (최근 ${lines}줄)\n\n\`\`\`\n${(fallback.output || '').substring(0, 3500)}\n\`\`\``);
        } else {
          await this.bot.sendMessage(chatId, `로그 조회 실패: ${result.error || '알 수 없는 오류'}`);
        }
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdRestart(chatId, name) {
    if (!name) {
      await this.bot.sendMessage(chatId, '사용법: /restart <PM2이름|id>\n예: /restart oracle');
      return;
    }
    await this.bot.sendTyping(chatId);
    try {
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('process_manager', {
          action: 'restart',
          name: name.trim()
        })
      );
      if (result.success) {
        await this.bot.sendMessage(chatId, `✅ *${name}* 재시작 완료`);
      } else {
        await this.bot.sendMessage(chatId, `재시작 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdDeploy(chatId, projectName) {
    if (!projectName) {
      await this.bot.sendMessage(chatId, '사용법: /deploy <프로젝트>\n\n프로젝트 목록: oracle, athena, heeviz, neomnium, hermes, s-trader, vibensway');
      return;
    }

    const PROJECT_MAP = {
      oracle:    { path: '/home/ubuntu/oracle',          pm2: 'oracle',         build: false },
      athena:    { path: '/home/ubuntu/athena',           pm2: 'athena',         build: true, buildCmd: 'npm run build' },
      heeviz:    { path: '/home/ubuntu/heeviz-next',      pm2: 'heeviz',         build: true, buildCmd: 'npm run build' },
      neomnium:  { path: '/home/ubuntu/neomnium-next',    pm2: 'neomnium',       build: true, buildCmd: 'npm run build' },
      hermes:    { path: '/home/ubuntu/hermes-brain-neo', pm2: 'hermes-neo',     build: false },
      's-trader':{ path: '/home/ubuntu/heeviz/s-trader',  pm2: 's-trader',       build: false },
      vibensway: { path: '/home/ubuntu/vibensway',        pm2: 'vibensway',      build: false },
    };

    const project = PROJECT_MAP[projectName.toLowerCase()];
    if (!project) {
      await this.bot.sendMessage(chatId, `알 수 없는 프로젝트: ${projectName}\n\n사용 가능: ${Object.keys(PROJECT_MAP).join(', ')}`);
      return;
    }

    await this.bot.sendMessage(chatId, `🚀 *${projectName}* 배포 시작...\n경로: ${project.path}`);
    await this.bot.sendTyping(chatId);

    try {
      // Step 1: git pull
      const pullResult = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('system_exec', {
          command: `git -C "${project.path}" pull`
        })
      );
      const pullOutput = pullResult.success ? (pullResult.output || '').trim() : `실패: ${pullResult.error}`;
      let msg = `*git pull:* ${pullOutput.substring(0, 500)}`;

      // Step 2: build (if needed)
      if (project.build && project.buildCmd) {
        await this.bot.sendTyping(chatId);
        const buildResult = this._unwrapToolResult(
          await this.orchestrator.mcpManager.executeTool('system_exec', {
            command: project.buildCmd,
            cwd: project.path
          })
        );
        msg += `\n\n*build:* ${buildResult.success ? '✅ 성공' : '❌ ' + (buildResult.error || '').substring(0, 300)}`;
      }

      // Step 3: pm2 restart
      await this.bot.sendTyping(chatId);
      const restartResult = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('process_manager', {
          action: 'restart',
          name: project.pm2
        })
      );
      msg += `\n\n*pm2 restart ${project.pm2}:* ${restartResult.success ? '✅ 완료' : '❌ ' + (restartResult.error || '')}`;

      await this.bot.sendMessage(chatId, `🚀 *${projectName} 배포 결과*\n\n${msg}`);
    } catch (error) {
      logger.error('Handler: /deploy error', error);
      await this.bot.sendMessage(chatId, `배포 실패: ${error.message}`);
    }
  }

  // ─── Oracle Commands (OracleClient 기반) ──────────────

  _getOracleClient() {
    return this.orchestrator.oracleClient;
  }

  async _cmdOracle(chatId, argStr) {
    const parts = argStr ? argStr.split(/\s+/) : [];
    const subCmd = (parts[0] || '').toLowerCase();
    const subArg = parts.slice(1).join(' ');

    switch (subCmd) {
      case 'collect':  return this._oracleCollect(chatId, subArg);
      case 'analyze':  return this._oracleAnalyze(chatId);
      case 'report':   return this._oracleReport(chatId, subArg);
      case 'market':   return this._oracleMarket(chatId);
      case 'guru':     return this._oracleGuru(chatId, subArg);
      case 'ta':       return this._oracleTa(chatId, subArg);
      case 'health':   return this._oracleHealth(chatId);
      default:         return this._oracleStatus(chatId);
    }
  }

  async _oracleStatus(chatId) {
    await this.bot.sendTyping(chatId);
    try {
      const oc = this._getOracleClient();
      const [status, health, pm2Raw] = await Promise.allSettled([
        oc.getStatus(),
        oc.getHealth(),
        this.orchestrator.mcpManager.executeTool('process_manager', { action: 'list' })
      ]);

      let msg = '*Oracle 2.0 상태*\n';

      // API health
      const h = health.status === 'fulfilled' ? health.value : null;
      if (h?.uptime_seconds) {
        msg += `\n*API:* 가동 중 (${Math.floor(h.uptime_seconds / 3600)}h)`;
        if (h.db_size_mb) msg += `, DB: ${h.db_size_mb}MB`;
      } else {
        msg += '\n*API:* 직접 DB 모드 (REST 미가동)';
      }

      // State info
      const state = status.status === 'fulfilled' ? status.value : null;
      if (state && typeof state === 'object') {
        const entries = state.collectors || state;
        if (typeof entries === 'object') {
          msg += '\n\n*수집기 상태:*';
          for (const [name, val] of Object.entries(entries)) {
            const lastRun = typeof val === 'string' ? val : val?.last_run;
            msg += `\n  ${name}: ${lastRun ? this._timeAgo(lastRun) : 'never'}`;
          }
        }
      }

      // PM2
      const pm2Result = pm2Raw.status === 'fulfilled' ? this._unwrapToolResult(pm2Raw.value) : null;
      if (pm2Result?.success) {
        const procs = pm2Result.processes || [];
        const oracle = procs.find(p => (p.name || p.pm2_env?.name) === 'oracle');
        const dash = procs.find(p => (p.name || p.pm2_env?.name) === 'oracle-dashboard');
        const api = procs.find(p => (p.name || p.pm2_env?.name) === 'oracle-api');
        if (oracle || dash || api) {
          msg += '\n\n*PM2:*';
          if (oracle) msg += `\n  oracle: ${oracle.pm2_env?.status || oracle.status || '?'}`;
          if (dash) msg += `\n  dashboard: ${dash.pm2_env?.status || dash.status || '?'}`;
          if (api) msg += `\n  api: ${api.pm2_env?.status || api.status || '?'}`;
        }
      }

      await this.bot.sendMessage(chatId, msg);
    } catch (error) {
      await this.bot.sendMessage(chatId, `Oracle 상태 조회 실패: ${error.message}`);
    }
  }

  async _oracleCollect(chatId, collectorName) {
    if (collectorName) {
      const safeName = sanitizeSqlLiteral(collectorName);
      if (!VALID_COLLECTORS.includes(safeName)) {
        await this.bot.sendMessage(chatId, `잘못된 수집기: ${safeName}\n\n사용 가능: ${VALID_COLLECTORS.join(', ')}`);
        return;
      }
    }
    await this.bot.sendMessage(chatId, `Oracle 수집 시작${collectorName ? `: ${collectorName}` : ' (전체)'}...`);
    await this.bot.sendTyping(chatId);
    try {
      const result = await this._getOracleClient().triggerCollect(collectorName || null);
      const output = result?.output || result?.message || JSON.stringify(result);
      await this.bot.sendMessage(chatId, `수집 완료\n\n\`\`\`\n${String(output).substring(0, 3000)}\n\`\`\``);
    } catch (error) {
      await this.bot.sendMessage(chatId, `수집 실패: ${error.message}`);
    }
  }

  async _oracleAnalyze(chatId) {
    await this.bot.sendMessage(chatId, 'Oracle AI 분석 시작...');
    await this.bot.sendTyping(chatId);
    try {
      const result = await this._getOracleClient().triggerAnalyze();
      const output = result?.output || result?.message || JSON.stringify(result);
      await this.bot.sendMessage(chatId, `분석 완료\n\n\`\`\`\n${String(output).substring(0, 3000)}\n\`\`\``);
    } catch (error) {
      await this.bot.sendMessage(chatId, `분석 실패: ${error.message}`);
    }
  }

  async _oracleReport(chatId, reportType) {
    const type = reportType || 'daily';
    await this.bot.sendTyping(chatId);
    try {
      const report = await this._getOracleClient().getReport(type);
      if (report?.content) {
        await this.bot.sendMessage(chatId, `*Oracle 리포트: ${type}*\n\n${report.content.substring(0, 3500)}`);
      } else {
        await this.bot.sendMessage(chatId, `'${type}' 리포트를 찾을 수 없습니다.\n\n사용 가능: daily, weekly, guru, ta, valuation`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _oracleMarket(chatId) {
    await this.bot.sendTyping(chatId);
    try {
      const oc = this._getOracleClient();
      const [regime, market, ta] = await Promise.allSettled([
        oc.getMarketRegime(),
        oc.getMarketData(10),
        oc.getTechnicalSignals()
      ]);

      let msg = '*Oracle Market Overview*\n';

      const r = regime.status === 'fulfilled' ? regime.value : null;
      if (r) {
        msg += `\n*시장 레짐:* ${r.regime} (신뢰도: ${r.confidence ? (r.confidence * 100).toFixed(0) + '%' : '?'})`;
        if (r.timestamp) msg += `\n감지: ${this._timeAgo(r.timestamp)}`;
      }

      const mRows = market.status === 'fulfilled' ? market.value : [];
      if (mRows?.length > 0) {
        msg += '\n\n*주요 자산:*';
        for (const m of mRows) {
          const change = m.change_1d != null ? `${m.change_1d > 0 ? '+' : ''}${Number(m.change_1d).toFixed(2)}%` : '?';
          msg += `\n  ${m.symbol}: $${Number(m.price || 0).toLocaleString()} (${change})`;
        }
      }

      const taRows = ta.status === 'fulfilled' ? ta.value : [];
      if (taRows?.length > 0) {
        msg += '\n\n*TA 신호 (상위):*';
        for (const t of taRows.slice(0, 5)) {
          const conf = t.confidence ? (t.confidence * 100).toFixed(0) + '%' : '?';
          msg += `\n  ${t.symbol}: ${t.signal || '?'} (${conf})`;
        }
      }

      await this.bot.sendMessage(chatId, msg);
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _oracleGuru(chatId, investor) {
    await this.bot.sendTyping(chatId);
    try {
      const rows = await this._getOracleClient().getGuruHoldings(investor || null);
      let msg;
      if (investor) {
        msg = `*${investor} 포트폴리오*\n`;
        if (!rows?.length) { msg += '\n결과 없음'; }
        else {
          for (const r of rows) {
            msg += `\n${r.ticker || r.symbol}: $${(r.value_usd || r.value || 0).toLocaleString()} (${r.change_type || r.change_pct || '?'}) - ${r.company_name || ''}`;
          }
        }
      } else {
        msg = '*Guru Convergence (2+ 투자자 보유)*\n';
        if (!rows?.length) { msg += '\n결과 없음'; }
        else {
          for (const r of rows) {
            msg += `\n*${r.ticker || r.symbol}* (${r.guru_count}명): ${r.investors}`;
          }
        }
      }
      await this.bot.sendMessage(chatId, msg.substring(0, 4000));
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _oracleTa(chatId, symbol) {
    await this.bot.sendTyping(chatId);
    try {
      const rows = await this._getOracleClient().getTechnicalSignals(symbol || null);
      let msg;
      if (symbol) {
        msg = `*${symbol.toUpperCase()} 기술 분석*\n`;
        const r = Array.isArray(rows) ? rows[0] : rows;
        if (!r) { msg += '\n결과 없음'; }
        else {
          msg += `\nRSI: ${r.rsi != null ? Number(r.rsi).toFixed(1) : '?'}`;
          msg += `\nMACD Signal: ${r.macd_signal || '?'}`;
          msg += `\nTrend: ${r.trend || '?'}`;
          msg += `\n\n*종합: ${r.signal || '?'}* (신뢰도: ${r.confidence ? (r.confidence * 100).toFixed(0) + '%' : '?'})`;
          if (r.collected_at) msg += `\n분석: ${this._timeAgo(r.collected_at)}`;
        }
      } else {
        msg = '*전체 TA 신호*\n';
        if (!rows?.length) { msg += '\n결과 없음'; }
        else {
          for (const r of rows) {
            const conf = r.confidence ? (r.confidence * 100).toFixed(0) + '%' : '?';
            msg += `\n${r.symbol}: *${r.signal || '?'}* (${conf}) RSI:${r.rsi != null ? Number(r.rsi).toFixed(0) : '?'}`;
          }
        }
      }
      await this.bot.sendMessage(chatId, msg.substring(0, 4000));
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _oracleHealth(chatId) {
    await this.bot.sendTyping(chatId);
    try {
      const health = await this._getOracleClient().getHealth();
      let msg = '*Oracle API Health*\n';
      if (health?.uptime_seconds) {
        msg += `\n상태: 가동 중`;
        msg += `\n가동 시간: ${Math.floor(health.uptime_seconds / 3600)}h ${Math.floor((health.uptime_seconds % 3600) / 60)}m`;
        if (health.db_size_mb) msg += `\nDB 크기: ${health.db_size_mb}MB`;
        if (health.last_collections) {
          msg += '\n\n*최근 수집:*';
          for (const [k, v] of Object.entries(health.last_collections)) {
            msg += `\n  ${k}: ${v ? this._timeAgo(v) : 'never'}`;
          }
        }
      } else {
        msg += `\n상태: API 미가동 (DB 직접 접속 모드)`;
        msg += `\nURL: ${this._getOracleClient().apiUrl}`;
      }
      await this.bot.sendMessage(chatId, msg);
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  // ─── Approval & Schedule Commands ────────────────────

  _getApprovalGate() {
    // The systemExec tool has an approvalGate reference
    const execTool = this.orchestrator.mcpManager.tools?.get('system_exec');
    return execTool?.approvalGate || null;
  }

  async _cmdApprove(chatId, requestId) {
    if (!requestId) {
      await this.bot.sendMessage(chatId, '사용법: /approve <requestId>');
      return;
    }
    try {
      const gate = this._getApprovalGate();
      if (!gate) {
        await this.bot.sendMessage(chatId, '승인 시스템이 초기화되지 않았어요.');
        return;
      }
      const result = gate.approveRequest(requestId.trim());
      if (result.status === 'approved') {
        // Execute the approved command
        const execResult = this._unwrapToolResult(
          await this.orchestrator.mcpManager.executeTool('system_exec', { command: result.command })
        );
        const output = execResult.success ? (execResult.output || '(빈 출력)').substring(0, 3000) : `실패: ${execResult.error}`;
        await this.bot.sendMessage(chatId, `✅ *승인 + 실행 완료*\n\n명령: \`${result.command}\`\n\n\`\`\`\n${output}\n\`\`\``);
      } else {
        await this.bot.sendMessage(chatId, `승인 실패: ${result.status}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdDeny(chatId, requestId) {
    if (!requestId) {
      await this.bot.sendMessage(chatId, '사용법: /deny <requestId>');
      return;
    }
    try {
      const gate = this._getApprovalGate();
      if (!gate) {
        await this.bot.sendMessage(chatId, '승인 시스템이 초기화되지 않았어요.');
        return;
      }
      const result = gate.denyRequest(requestId.trim());
      if (result.status === 'denied') {
        await this.bot.sendMessage(chatId, `❌ *거부됨*\n\n명령: \`${result.command}\``);
      } else {
        await this.bot.sendMessage(chatId, `거부 실패: ${result.status}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdCredentials(chatId, argStr) {
    try {
      const cm = this.orchestrator.credentialManager;
      if (!cm) {
        await this.bot.sendMessage(chatId, '자격증명 관리자가 초기화되지 않았어요.');
        return;
      }

      // /creds reset <name> - 키 상태 리셋
      if (argStr && argStr.startsWith('reset')) {
        const name = argStr.split(/\s+/)[1];
        if (!name) {
          await this.bot.sendMessage(chatId, '사용법: /creds reset <name> (예: openai, gemini)');
          return;
        }
        const ok = cm.resetKey(name);
        await this.bot.sendMessage(chatId, ok ? `${name} 키 상태를 리셋했어요.` : `${name}은(는) 등록되지 않았어요.`);
        return;
      }

      // 전체 상태 보고
      const status = cm.getStatus();
      const names = Object.keys(status);
      if (names.length === 0) {
        await this.bot.sendMessage(chatId, '등록된 자격증명이 없어요.');
        return;
      }

      let msg = '*API 키 상태*\n';
      for (const name of names) {
        const s = status[name];
        const icons = s.keys.map(k => {
          if (k.active) return k.status === 'active' ? '🟢' : '🟡';
          return k.status === 'disabled' ? '🔴' : k.status === 'cooldown' ? '🟠' : '⚪';
        });
        msg += `\n*${name}*: ${icons.join('')} (${s.keys.filter(k => k.status === 'active' || k.status === 'degraded').length}/${s.totalKeys} active)`;
        const current = s.keys.find(k => k.active);
        if (current?.lastError) msg += `\n  └ 마지막 에러: ${current.lastError.substring(0, 50)}`;
      }
      msg += '\n\n키 리셋: /creds reset <name>';
      await this.bot.sendMessage(chatId, msg);
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdPending(chatId) {
    try {
      const gate = this._getApprovalGate();
      if (!gate) {
        await this.bot.sendMessage(chatId, '승인 시스템이 초기화되지 않았어요.');
        return;
      }
      const pending = gate.getPendingRequests();
      if (pending.length === 0) {
        await this.bot.sendMessage(chatId, '대기 중인 승인 요청이 없어요.');
        return;
      }
      let msg = `*대기 중인 승인 요청* (${pending.length}건)\n`;
      for (const req of pending) {
        msg += `\nID: \`${req.id.substring(0, 8)}...\`\n명령: \`${req.command}\`\n등급: ${req.security_level}\n만료: ${req.expires_at}\n`;
      }
      msg += '\n/approve <id> 또는 /deny <id>';
      await this.bot.sendMessage(chatId, msg);
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _cmdSchedule(chatId, argStr) {
    if (!argStr) {
      await this.bot.sendMessage(chatId, `*스케줄 관리*\n\n/schedule list - 예약 목록\n/schedule run <id> - 즉시 실행\n/schedule toggle <id> - 활성/비활성 전환\n/schedule delete <id> - 삭제`);
      return;
    }
    await this.bot.sendTyping(chatId);
    const parts = argStr.split(/\s+/);
    const subCmd = parts[0].toLowerCase();
    const subArg = parts.slice(1).join(' ');

    try {
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool(
          subCmd === 'list' ? 'list_scheduled_tasks' :
          subCmd === 'run' ? 'run_scheduled_task' :
          subCmd === 'toggle' ? 'toggle_scheduled_task' :
          subCmd === 'delete' ? 'delete_scheduled_task' :
          'list_scheduled_tasks',
          subCmd === 'list' ? {} : { taskId: subArg }
        )
      );
      if (result.success) {
        const output = typeof result.data === 'object' ? JSON.stringify(result.data, null, 2) : String(result.data || result.message || 'OK');
        await this.bot.sendMessage(chatId, `*스케줄 ${subCmd}*\n\n\`\`\`\n${output.substring(0, 3500)}\n\`\`\``);
      } else {
        await this.bot.sendMessage(chatId, `실패: ${result.error || result.message}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  // ─── Helpers ───────────────────────────────────────────

  _formatDbResult(result) {
    const { rows, columns, rowCount, query } = result;
    if (!rows || rows.length === 0) {
      return `*쿼리 결과*\n\n\`${query}\`\n\n결과: 0건`;
    }

    let msg = `*쿼리 결과* (${rowCount}건)\n\n`;

    // Simple table for small results
    if (rows.length <= 10 && columns.length <= 5) {
      // Header
      msg += '`' + columns.join(' | ') + '`\n';
      msg += '`' + columns.map(c => '-'.repeat(c.length)).join('-+-') + '`\n';
      for (const row of rows) {
        const vals = columns.map(c => String(row[c] ?? 'NULL'));
        msg += '`' + vals.join(' | ') + '`\n';
      }
    } else {
      // JSON format for complex results
      msg += '```\n' + JSON.stringify(rows.slice(0, 20), null, 2) + '\n```';
      if (rows.length > 20) msg += `\n\n... +${rows.length - 20}건 생략`;
    }

    return msg;
  }

  _timeAgo(isoString) {
    if (!isoString) return 'unknown';
    try {
      const now = Date.now();
      const then = new Date(isoString).getTime();
      const diffMs = now - then;
      if (isNaN(diffMs)) return isoString;

      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return isoString;
    }
  }

  // ─── Natural Language ────────────────────────────────

  async _handleNaturalLanguage(chatId, text) {
    await this.bot.sendTyping(chatId);

    // 60초 타임아웃 보호
    const timeoutMs = 60000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    );

    try {
      await Promise.race([
        this._streamNaturalLanguage(chatId, text),
        timeoutPromise
      ]);

      this.workspaceMemory.appendDailyLog(`텔레그램: "${text.substring(0, 40)}"`);

    } catch (error) {
      if (error.message === 'TIMEOUT') {
        logger.error('Handler: Natural language TIMEOUT (60s)', { text: text.substring(0, 50) });
        await this.bot.sendMessage(chatId, '응답 시간이 너무 길어졌어요. 다시 시도해주세요.');
      } else {
        logger.error('Handler: Natural language error', error);
        await this.bot.sendMessage(chatId, '처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
      }
    }
  }

  async _streamNaturalLanguage(chatId, text) {
    logger.info('Handler: Starting telegram stream', { text: text.substring(0, 50) });
    const stream = this.orchestrator.processTelegramStream(
      this.userId,
      this.sessionId,
      text
    );

    let buffer = '';
    let sentCount = 0;
    let lastTypingTime = Date.now();

    for await (const content of stream) {
      buffer += content;

      if (Date.now() - lastTypingTime > 3000) {
        await this.bot.sendTyping(chatId);
        lastTypingTime = Date.now();
      }

      const shouldSend = buffer.includes('\n\n') || buffer.length >= 500;

      if (shouldSend && buffer.trim()) {
        await this.bot.sendMessage(chatId, buffer.trim());
        sentCount++;
        buffer = '';
      }
    }

    if (buffer.trim()) {
      await this.bot.sendMessage(chatId, buffer.trim());
      sentCount++;
    }

    logger.info('Handler: Stream completed', { sentCount });

    if (sentCount === 0) {
      await this.bot.sendMessage(chatId, '응답을 생성하지 못했어요. 다시 시도해주세요.');
    }
  }

  // ─── Formatters ──────────────────────────────────────

  _formatSystemStatus(data) {
    try {
      const cpu = data.cpu || {};
      const mem = data.memory || {};
      const disks = Array.isArray(data.disk) ? data.disk : [];

      let text = '*서버 상태* ✨\n';

      if (data.uptime) text += `\nUptime: ${data.uptime}`;
      if (data.hostname) text += `\nHost: ${data.hostname}`;

      // CPU
      if (cpu.usagePercent || cpu.loadAvg) {
        text += '\n\n*CPU*';
        if (cpu.cores) text += `\nCores: ${cpu.cores}`;
        if (cpu.usagePercent) text += `\nUsage: ${cpu.usagePercent}`;
        if (cpu.loadAvg) text += `\nLoad: ${Array.isArray(cpu.loadAvg) ? cpu.loadAvg.join(', ') : cpu.loadAvg}`;
      }

      // Memory
      if (mem.total || mem.used) {
        text += '\n\n*메모리*';
        if (mem.total) text += `\nTotal: ${mem.total}`;
        if (mem.used) text += `\nUsed: ${mem.used}`;
        if (mem.free) text += `\nFree: ${mem.free}`;
      }

      // Disk (array of mountpoints)
      if (disks.length > 0) {
        text += '\n\n*디스크*';
        // Show root partition first, then others
        const rootDisk = disks.find(d => d.mountpoint === '/');
        const showDisks = rootDisk ? [rootDisk] : disks.slice(0, 3);
        for (const d of showDisks) {
          text += `\n${d.mountpoint}: ${d.used}/${d.size} (${d.usagePercent})`;
        }
      }

      return text || '*서버 상태*\n정보를 파싱할 수 없습니다.';
    } catch (e) {
      return `*서버 상태*\n\`\`\`\n${JSON.stringify(data, null, 2).substring(0, 3000)}\n\`\`\``;
    }
  }

  _formatPm2List(processes) {
    if (!Array.isArray(processes) || processes.length === 0) {
      return '실행 중인 PM2 프로세스가 없습니다.';
    }

    let text = '*PM2 프로세스*\n';

    for (const p of processes) {
      const name = p.name || p.pm2_env?.name || '?';
      const id = p.pm_id ?? p.id ?? '?';
      const status = p.pm2_env?.status || p.status || '?';
      const emoji = status === 'online' ? '🟢' : status === 'stopped' ? '🔴' : '🟡';
      const mem = p.monit?.memory
        ? `${(p.monit.memory / 1024 / 1024).toFixed(0)}MB`
        : '-';
      const cpu = p.monit?.cpu !== undefined ? `${p.monit.cpu}%` : '-';
      const restarts = p.pm2_env?.restart_time ?? p.restart_time ?? 0;

      text += `\n${emoji} *${name}* (id:${id})`;
      text += `\n   Status: ${status} | CPU: ${cpu} | Mem: ${mem} | Restarts: ${restarts}`;
    }

    return text;
  }
}
