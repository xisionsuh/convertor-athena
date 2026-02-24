/**
 * MessageHandler - 텔레그램 명령어 + 자연어 라우팅
 * /start, /status, /pm2, /screenshot, /memory, /remember, /identity, /alert
 * 그 외 자연어 → orchestrator.processStream()
 */

import { logger } from '../utils/logger.js';

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

*Oracle 금융분석:*
/oracle - Oracle 시스템 상태
/oracle market - 시장 레짐 + 주요 지표
/oracle guru [이름] - 투자 대가 포트폴리오
/oracle ta [심볼] - 기술 분석 신호
/oracle report [type] - 리포트 (daily/weekly/guru/ta)
/oracle collect [name] - 데이터 수집 트리거
/oracle analyze - AI 분석 실행

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
          command: `cat "${filePath}" | head -200`
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
          command: `ls -la "${target}"`
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
          command: `grep -rl "${query}" "${searchPath}" --include="*.py" --include="*.js" --include="*.json" --include="*.md" | head -30`
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
            command: `pm2 logs ${name} --nostream --lines ${lines}`
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

  // ─── Oracle Commands ──────────────────────────────────

  async _cmdOracle(chatId, argStr) {
    const ORACLE_DB = '/home/ubuntu/oracle/data/oracle.db';
    const ORACLE_DIR = '/home/ubuntu/oracle';
    const ORACLE_VENV = '/home/ubuntu/oracle/venv/bin/python';

    const parts = argStr ? argStr.split(/\s+/) : [];
    const subCmd = (parts[0] || '').toLowerCase();
    const subArg = parts.slice(1).join(' ');

    switch (subCmd) {
      case 'collect':  return this._oracleCollect(chatId, subArg, ORACLE_DIR, ORACLE_VENV);
      case 'analyze':  return this._oracleAnalyze(chatId, ORACLE_DIR, ORACLE_VENV);
      case 'report':   return this._oracleReport(chatId, subArg, ORACLE_DIR);
      case 'market':   return this._oracleMarket(chatId, ORACLE_DB);
      case 'guru':     return this._oracleGuru(chatId, subArg, ORACLE_DB);
      case 'ta':       return this._oracleTa(chatId, subArg, ORACLE_DB);
      default:         return this._oracleStatus(chatId, ORACLE_DB, ORACLE_DIR);
    }
  }

  async _oracleStatus(chatId, dbPath, oracleDir) {
    await this.bot.sendTyping(chatId);
    try {
      // Parallel: state.json + DB stats + PM2 status
      const [stateRaw, dbRaw, pm2Raw] = await Promise.allSettled([
        this.orchestrator.mcpManager.executeTool('system_exec', {
          command: `cat "${oracleDir}/data/state.json" 2>/dev/null || echo "{}"`
        }),
        this.orchestrator.mcpManager.executeTool('query_database', {
          query: `SELECT
            (SELECT count(*) FROM market_data) as market_data,
            (SELECT count(*) FROM regimes) as regimes,
            (SELECT count(*) FROM guru_holdings) as guru_holdings,
            (SELECT count(*) FROM technical_analysis) as technical_analysis,
            (SELECT count(*) FROM news_sentiment) as news_sentiment,
            (SELECT count(*) FROM analyses) as analyses`,
          database_path: dbPath
        }),
        this.orchestrator.mcpManager.executeTool('process_manager', { action: 'list' })
      ]);
      const stateResult = stateRaw.status === 'fulfilled' ? { status: 'fulfilled', value: this._unwrapToolResult(stateRaw.value) } : stateRaw;
      const dbResult = dbRaw.status === 'fulfilled' ? { status: 'fulfilled', value: this._unwrapToolResult(dbRaw.value) } : dbRaw;
      const pm2Result = pm2Raw.status === 'fulfilled' ? { status: 'fulfilled', value: this._unwrapToolResult(pm2Raw.value) } : pm2Raw;

      let msg = '*Oracle 2.0 상태*\n';

      // State info
      if (stateResult.status === 'fulfilled' && stateResult.value?.success) {
        try {
          const state = JSON.parse(stateResult.value.output);
          const collectors = state.collectors || {};
          msg += '\n*수집기 상태:*';
          for (const [name, info] of Object.entries(collectors)) {
            const ago = info.last_run ? this._timeAgo(info.last_run) : 'never';
            msg += `\n  ${name}: ${ago}`;
          }
        } catch { msg += '\n수집기 상태: 파싱 불가'; }
      }

      // DB stats
      if (dbResult.status === 'fulfilled' && dbResult.value?.success) {
        const row = dbResult.value.rows?.[0];
        if (row) {
          msg += '\n\n*DB 레코드:*';
          for (const [key, val] of Object.entries(row)) {
            msg += `\n  ${key}: ${val?.toLocaleString() || 0}`;
          }
        }
      }

      // PM2
      if (pm2Result.status === 'fulfilled' && pm2Result.value?.success) {
        const procs = pm2Result.value.processes || [];
        const oracle = procs.find(p => (p.name || p.pm2_env?.name) === 'oracle');
        const dash = procs.find(p => (p.name || p.pm2_env?.name) === 'oracle-dashboard');
        if (oracle || dash) {
          msg += '\n\n*PM2:*';
          if (oracle) msg += `\n  oracle: ${oracle.pm2_env?.status || oracle.status || '?'}`;
          if (dash) msg += `\n  dashboard: ${dash.pm2_env?.status || dash.status || '?'}`;
        }
      }

      await this.bot.sendMessage(chatId, msg);
    } catch (error) {
      await this.bot.sendMessage(chatId, `Oracle 상태 조회 실패: ${error.message}`);
    }
  }

  async _oracleCollect(chatId, collectorName, oracleDir, venvPython) {
    await this.bot.sendMessage(chatId, `🔄 Oracle 수집 시작${collectorName ? `: ${collectorName}` : ' (전체)'}...`);
    await this.bot.sendTyping(chatId);
    try {
      const cmd = collectorName
        ? `${venvPython} -c "from collectors import ${collectorName}; ${collectorName}.collect()"`
        : `${venvPython} main.py --collect-only`;
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('system_exec', {
          command: cmd,
          cwd: oracleDir
        })
      );
      if (result.success) {
        await this.bot.sendMessage(chatId, `✅ 수집 완료\n\n\`\`\`\n${(result.output || '').substring(0, 3000)}\n\`\`\``);
      } else {
        await this.bot.sendMessage(chatId, `수집 실패: ${(result.error || '').substring(0, 1000)}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _oracleAnalyze(chatId, oracleDir, venvPython) {
    await this.bot.sendMessage(chatId, '🧠 Oracle AI 분석 시작...');
    await this.bot.sendTyping(chatId);
    try {
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('system_exec', {
          command: `${venvPython} main.py --analyze-only`,
          cwd: oracleDir
        })
      );
      if (result.success) {
        await this.bot.sendMessage(chatId, `✅ 분석 완료\n\n\`\`\`\n${(result.output || '').substring(0, 3000)}\n\`\`\``);
      } else {
        await this.bot.sendMessage(chatId, `분석 실패: ${(result.error || '').substring(0, 1000)}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _oracleReport(chatId, reportType, oracleDir) {
    const type = reportType || 'daily';
    await this.bot.sendTyping(chatId);
    try {
      // Find latest report of this type
      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('system_exec', {
          command: `ls -t "${oracleDir}/reports/"*${type}* 2>/dev/null | head -1`
        })
      );
      if (result.success && result.output?.trim()) {
        const filePath = result.output.trim();
        const content = this._unwrapToolResult(
          await this.orchestrator.mcpManager.executeTool('system_exec', {
            command: `cat "${filePath}" | head -200`
          })
        );
        if (content.success) {
          await this.bot.sendMessage(chatId, `*Oracle 리포트: ${type}*\n\n${(content.output || '').substring(0, 3500)}`);
        } else {
          await this.bot.sendMessage(chatId, `리포트 읽기 실패: ${content.error}`);
        }
      } else {
        await this.bot.sendMessage(chatId, `'${type}' 리포트를 찾을 수 없습니다.\n\n사용 가능: daily, weekly, guru, ta, valuation`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _oracleMarket(chatId, dbPath) {
    await this.bot.sendTyping(chatId);
    try {
      const [regimeRaw, marketRaw, analysisRaw] = await Promise.allSettled([
        this.orchestrator.mcpManager.executeTool('query_database', {
          query: `SELECT regime, confidence, timestamp FROM regimes ORDER BY timestamp DESC LIMIT 1`,
          database_path: dbPath
        }),
        this.orchestrator.mcpManager.executeTool('query_database', {
          query: `SELECT symbol, price, change_1d, timestamp FROM market_data ORDER BY timestamp DESC LIMIT 10`,
          database_path: dbPath
        }),
        this.orchestrator.mcpManager.executeTool('query_database', {
          query: `SELECT type, summary, timestamp FROM analyses ORDER BY timestamp DESC LIMIT 3`,
          database_path: dbPath
        })
      ]);
      const regimeResult = regimeRaw.status === 'fulfilled' ? { status: 'fulfilled', value: this._unwrapToolResult(regimeRaw.value) } : regimeRaw;
      const marketResult = marketRaw.status === 'fulfilled' ? { status: 'fulfilled', value: this._unwrapToolResult(marketRaw.value) } : marketRaw;
      const analysisResult = analysisRaw.status === 'fulfilled' ? { status: 'fulfilled', value: this._unwrapToolResult(analysisRaw.value) } : analysisRaw;

      let msg = '*Oracle Market Overview*\n';

      // Regime
      if (regimeResult.status === 'fulfilled' && regimeResult.value?.success) {
        const r = regimeResult.value.rows?.[0];
        if (r) {
          msg += `\n*시장 레짐:* ${r.regime} (신뢰도: ${r.confidence ? (r.confidence * 100).toFixed(0) + '%' : '?'})`;
          msg += `\n감지: ${this._timeAgo(r.timestamp)}`;
        }
      }

      // Market data
      if (marketResult.status === 'fulfilled' && marketResult.value?.success) {
        const rows = marketResult.value.rows || [];
        if (rows.length > 0) {
          msg += '\n\n*주요 자산:*';
          for (const r of rows) {
            const change = r.change_1d ? `${r.change_1d > 0 ? '+' : ''}${r.change_1d.toFixed(2)}%` : '?';
            msg += `\n  ${r.symbol}: $${r.price?.toLocaleString() || '?'} (${change})`;
          }
        }
      }

      // Recent analyses
      if (analysisResult.status === 'fulfilled' && analysisResult.value?.success) {
        const rows = analysisResult.value.rows || [];
        if (rows.length > 0) {
          msg += '\n\n*최근 AI 분석:*';
          for (const r of rows) {
            msg += `\n• ${r.type || '(제목 없음)'} - ${this._timeAgo(r.timestamp)}`;
          }
        }
      }

      await this.bot.sendMessage(chatId, msg);
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _oracleGuru(chatId, investor, dbPath) {
    await this.bot.sendTyping(chatId);
    try {
      let query, msg;
      if (investor) {
        // Specific guru
        query = `SELECT ticker, company_name, shares, value_usd, change_type, filing_date
                 FROM guru_holdings
                 WHERE investor LIKE '%${investor}%'
                 ORDER BY value_usd DESC LIMIT 20`;
        msg = `*${investor} 포트폴리오*\n`;
      } else {
        // Convergence: tickers held by 2+ gurus
        query = `SELECT ticker, COUNT(DISTINCT investor) as guru_count,
                 GROUP_CONCAT(DISTINCT investor) as investors,
                 SUM(value_usd) as total_value
                 FROM guru_holdings
                 WHERE ticker IS NOT NULL
                 GROUP BY ticker HAVING guru_count >= 2
                 ORDER BY guru_count DESC, total_value DESC LIMIT 20`;
        msg = '*Guru Convergence (2+ 투자자 보유)*\n';
      }

      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('query_database', {
          query,
          database_path: dbPath
        })
      );

      if (result.success) {
        const rows = result.rows || [];
        if (rows.length === 0) {
          msg += '\n결과 없음';
        } else if (investor) {
          for (const r of rows) {
            msg += `\n${r.ticker}: $${r.value_usd?.toLocaleString() || '?'} (${r.change_type || '?'}) - ${r.company_name || ''}`;
          }
        } else {
          for (const r of rows) {
            msg += `\n*${r.ticker}* (${r.guru_count}명): ${r.investors}`;
          }
        }
        await this.bot.sendMessage(chatId, msg.substring(0, 4000));
      } else {
        await this.bot.sendMessage(chatId, `쿼리 실패: ${result.error}`);
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `오류: ${error.message}`);
    }
  }

  async _oracleTa(chatId, symbol, dbPath) {
    await this.bot.sendTyping(chatId);
    try {
      let query, msg;
      if (symbol) {
        query = `SELECT symbol, rsi, macd_signal, trend, signal, confidence, collected_at
                 FROM technical_analysis
                 WHERE symbol = '${symbol.toUpperCase()}'
                 ORDER BY collected_at DESC LIMIT 1`;
        msg = `*${symbol.toUpperCase()} 기술 분석*\n`;
      } else {
        query = `SELECT symbol, signal, confidence, rsi, trend, collected_at
                 FROM technical_analysis
                 WHERE collected_at = (SELECT MAX(collected_at) FROM technical_analysis)
                 ORDER BY confidence DESC`;
        msg = '*전체 TA 신호*\n';
      }

      const result = this._unwrapToolResult(
        await this.orchestrator.mcpManager.executeTool('query_database', {
          query,
          database_path: dbPath
        })
      );

      if (result.success) {
        const rows = result.rows || [];
        if (rows.length === 0) {
          msg += '\n결과 없음';
        } else if (symbol) {
          const r = rows[0];
          msg += `\nRSI: ${r.rsi?.toFixed(1) || '?'}`;
          msg += `\nMACD Signal: ${r.macd_signal || '?'}`;
          msg += `\nTrend: ${r.trend || '?'}`;
          msg += `\n\n*종합: ${r.signal || '?'}* (신뢰도: ${r.confidence ? (r.confidence * 100).toFixed(0) + '%' : '?'})`;
          msg += `\n분석: ${this._timeAgo(r.collected_at)}`;
        } else {
          for (const r of rows) {
            const conf = r.confidence ? (r.confidence * 100).toFixed(0) + '%' : '?';
            const sig = r.signal || '?';
            msg += `\n${r.symbol}: *${sig}* (${conf}) RSI:${r.rsi?.toFixed(0) || '?'}`;
          }
        }
        await this.bot.sendMessage(chatId, msg.substring(0, 4000));
      } else {
        await this.bot.sendMessage(chatId, `쿼리 실패: ${result.error}`);
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
