/**
 * ProactiveNotifier - 능동적 알림 시스템
 * 모닝 브리핑, 시스템 경고, 헬스체크
 */

import { logger } from '../utils/logger.js';

export class ProactiveNotifier {
  constructor(options = {}) {
    this.bot = options.bot;
    this.orchestrator = options.orchestrator;
    this.workspaceMemory = options.workspaceMemory;
    this._enabled = true;
    this._healthInterval = null;
    this._morningInterval = null;
    this._lastPm2State = {}; // name → status
    this._lastAlerts = {}; // type → timestamp (debounce)
  }

  /**
   * Start all proactive monitoring
   */
  start() {
    if (!this.bot?.enabled) {
      logger.warn('ProactiveNotifier: Bot not available');
      return;
    }

    // Health check every 5 minutes
    this._healthInterval = setInterval(() => this._healthCheck(), 5 * 60 * 1000);

    // Morning briefing check every minute (fires at 09:00 KST)
    this._morningInterval = setInterval(() => this._checkMorningBriefing(), 60 * 1000);

    // Initial health check after 30 seconds
    setTimeout(() => this._healthCheck(), 30 * 1000);

    logger.info('ProactiveNotifier: Started');
  }

  /**
   * Stop all monitoring
   */
  stop() {
    if (this._healthInterval) clearInterval(this._healthInterval);
    if (this._morningInterval) clearInterval(this._morningInterval);
    this._healthInterval = null;
    this._morningInterval = null;
    logger.info('ProactiveNotifier: Stopped');
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    logger.info(`ProactiveNotifier: ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  isEnabled() {
    return this._enabled;
  }

  // ─── Health Check ────────────────────────────────────

  async _healthCheck() {
    if (!this._enabled) return;

    try {
      await this._checkSystemResources();
      await this._checkPm2Status();
    } catch (error) {
      logger.error('ProactiveNotifier: Health check error', error);
    }
  }

  async _checkSystemResources() {
    try {
      const { execSync } = await import('child_process');

      // Memory check
      const memLine = execSync("free | grep Mem | awk '{print $3/$2 * 100}'", { encoding: 'utf-8' }).trim();
      const memPct = parseFloat(memLine);

      if (memPct >= 90 && this._shouldAlert('mem_critical', 30 * 60 * 1000)) {
        await this.bot.sendMessage(null,
          `*시스템 경고* ⚠️\n\n메모리 사용률이 ${memPct.toFixed(1)}%입니다!\n즉시 확인이 필요합니다.`
        );
      }

      // Disk check
      const diskLine = execSync("df / | tail -1 | awk '{print $5}' | tr -d '%'", { encoding: 'utf-8' }).trim();
      const diskPct = parseFloat(diskLine);

      if (diskPct >= 90 && this._shouldAlert('disk_critical', 60 * 60 * 1000)) {
        await this.bot.sendMessage(null,
          `*시스템 경고* ⚠️\n\n디스크 사용률이 ${diskPct.toFixed(0)}%입니다!\n공간 확보가 필요합니다.`
        );
      }
    } catch (error) {
      logger.error('ProactiveNotifier: Resource check error', error);
    }
  }

  async _checkPm2Status() {
    try {
      const { execSync } = await import('child_process');
      const output = execSync('pm2 jlist', { encoding: 'utf-8', timeout: 10000 });
      const processes = JSON.parse(output);

      for (const p of processes) {
        const name = p.name || p.pm2_env?.name;
        if (!name) continue;

        const status = p.pm2_env?.status || p.status || 'unknown';
        const prevStatus = this._lastPm2State[name];

        // Detect newly stopped/errored process
        if (prevStatus === 'online' && status !== 'online') {
          if (this._shouldAlert(`pm2_${name}`, 10 * 60 * 1000)) {
            await this.bot.sendMessage(null,
              `*PM2 경고* 🔴\n\n*${name}* 프로세스가 중단되었습니다!\nStatus: ${status}\n\n\`pm2 restart ${name}\` 으로 재시작할 수 있어요.`
            );
          }
        }

        // Detect recovery
        if (prevStatus && prevStatus !== 'online' && status === 'online') {
          await this.bot.sendMessage(null,
            `*PM2 복구* 🟢\n\n*${name}* 프로세스가 다시 정상 작동합니다.`
          );
        }

        this._lastPm2State[name] = status;
      }
    } catch (error) {
      logger.error('ProactiveNotifier: PM2 check error', error);
    }
  }

  // ─── Morning Briefing ───────────────────────────────

  async _checkMorningBriefing() {
    if (!this._enabled) return;

    const now = new Date();
    const kstHour = (now.getUTCHours() + 9) % 24;
    const kstMin = now.getUTCMinutes();

    // 09:00 KST
    if (kstHour === 9 && kstMin === 0) {
      if (this._shouldAlert('morning_briefing', 23 * 60 * 60 * 1000)) {
        await this._sendMorningBriefing();
      }
    }
  }

  async _sendMorningBriefing() {
    try {
      const { execSync } = await import('child_process');

      // Gather system info
      const uptime = execSync('uptime -p', { encoding: 'utf-8' }).trim();
      const memLine = execSync("free -h | grep Mem | awk '{print $2, $3, $7}'", { encoding: 'utf-8' }).trim();
      const [memTotal, memUsed, memAvail] = memLine.split(/\s+/);
      const diskLine = execSync("df -h / | tail -1 | awk '{print $3, $4, $5}'", { encoding: 'utf-8' }).trim();
      const [diskUsed, diskAvail, diskPct] = diskLine.split(/\s+/);

      // PM2 summary
      let pm2Summary = '';
      try {
        const pm2Output = execSync('pm2 jlist', { encoding: 'utf-8', timeout: 10000 });
        const processes = JSON.parse(pm2Output);
        const online = processes.filter(p => (p.pm2_env?.status || p.status) === 'online').length;
        const total = processes.length;
        pm2Summary = `PM2: ${online}/${total} online`;

        // List stopped ones
        const stopped = processes.filter(p => (p.pm2_env?.status || p.status) !== 'online');
        if (stopped.length > 0) {
          pm2Summary += `\n⚠️ Stopped: ${stopped.map(p => p.name || p.pm2_env?.name).join(', ')}`;
        }
      } catch (e) {
        pm2Summary = 'PM2: 조회 실패';
      }

      // Yesterday's daily log
      let yesterdayLog = '';
      if (this.workspaceMemory) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        const log = this.workspaceMemory.getDailyLog(dateStr);
        if (log) {
          // Truncate if too long
          yesterdayLog = log.length > 1000 ? log.substring(0, 1000) + '...' : log;
        }
      }

      const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

      let briefing = `*모닝 브리핑* ☀️\n${kstDate}\n`;
      briefing += `\n*서버*\n${uptime}\nMemory: ${memUsed}/${memTotal} (avail: ${memAvail})\nDisk: ${diskUsed} used, ${diskAvail} avail (${diskPct})`;
      briefing += `\n\n*프로세스*\n${pm2Summary}`;

      if (yesterdayLog) {
        briefing += `\n\n*어제의 기록*\n${yesterdayLog}`;
      }

      briefing += '\n\n좋은 하루 되세요! ✨';

      await this.bot.sendMessage(null, briefing);

      // Log this briefing
      if (this.workspaceMemory) {
        this.workspaceMemory.appendDailyLog('모닝 브리핑 발송');
      }
    } catch (error) {
      logger.error('ProactiveNotifier: Morning briefing error', error);
    }
  }

  // ─── Helpers ─────────────────────────────────────────

  /**
   * Debounce alerts: only fire once per cooldown period
   */
  _shouldAlert(key, cooldownMs) {
    const now = Date.now();
    const last = this._lastAlerts[key] || 0;
    if (now - last < cooldownMs) return false;
    this._lastAlerts[key] = now;
    return true;
  }
}
