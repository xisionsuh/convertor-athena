/**
 * CronScheduler - 예약 작업 런타임 실행기
 * DB의 scheduled_tasks를 주기적으로 확인하고 due 작업을 실행
 */
import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export class CronScheduler {
  constructor({ dbPath, mcpManager, bot, interval = 60000 }) {
    this.db = new Database(dbPath, { readonly: false });
    this.db.pragma('journal_mode = WAL');
    this.mcpManager = mcpManager;
    this.bot = bot;
    this.interval = interval;
    this._timer = null;
    this._running = false;
  }

  start() {
    if (this._timer) return;
    logger.info('[CronScheduler] Started', { interval: this.interval });
    this._tick();
    this._timer = setInterval(() => this._tick(), this.interval);
  }

  stop() {
    if (!this._timer) return;
    clearInterval(this._timer);
    this._timer = null;
    logger.info('[CronScheduler] Stopped');
  }

  _tick() {
    if (this._running) return;
    this._running = true;
    this._checkDueTasks()
      .catch(err => logger.error('[CronScheduler] Tick error', err))
      .finally(() => { this._running = false; });
  }

  async _checkDueTasks() {
    const dueTasks = this.db.prepare(
      `SELECT * FROM scheduled_tasks WHERE is_active = 1 AND next_run <= datetime('now')`
    ).all();
    if (!dueTasks.length) return;
    logger.info(`[CronScheduler] ${dueTasks.length} due task(s)`);

    for (const task of dueTasks) {
      try { await this._executeTask(task); }
      catch (err) { logger.error(`[CronScheduler] Task ${task.id} error`, err); }
    }
  }

  async _executeTask(task) {
    const taskConfig = JSON.parse(task.task_config);
    const startedAt = new Date().toISOString();
    const { lastInsertRowid: logId } = this.db.prepare(
      `INSERT INTO task_execution_log (task_id, status, started_at) VALUES (?, 'running', ?)`
    ).run(task.id, startedAt);

    let error = null;
    try {
      const result = await this._dispatch(task.task_type, taskConfig);
      this.db.prepare(
        `UPDATE task_execution_log SET status='completed', completed_at=?, result=? WHERE id=?`
      ).run(new Date().toISOString(), JSON.stringify(result), logId);
    } catch (err) {
      error = err.message || String(err);
      this.db.prepare(
        `UPDATE task_execution_log SET status='failed', completed_at=?, error=? WHERE id=?`
      ).run(new Date().toISOString(), error, logId);
      this._notify(`[Scheduler] Task failed: ${task.name}\n${error}`);
    }

    // next_run 계산 및 작업 상태 업데이트
    const scheduleConfig = JSON.parse(task.schedule_config);
    const nextRun = this._calculateNextRun(task.schedule_type, scheduleConfig, new Date());
    this.db.prepare(
      `UPDATE scheduled_tasks SET last_run=?, next_run=?, run_count=run_count+1, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).run(startedAt, nextRun ? nextRun.toISOString() : null, task.id);

    if (task.max_runs && task.run_count + 1 >= task.max_runs) {
      this.db.prepare(`UPDATE scheduled_tasks SET is_active=0 WHERE id=?`).run(task.id);
      logger.info(`[CronScheduler] Task ${task.id} max_runs reached, deactivated`);
    }
    if (!error && taskConfig.notify) {
      this._notify(`[Scheduler] Completed: ${task.name}`);
    }
  }

  async _dispatch(taskType, config) {
    switch (taskType) {
      case 'mcp_tool':
        return await this.mcpManager.executeTool(
          config.toolName || config.tool, config.toolParams || config.params || {}
        );
      case 'system_command':
        return await this.mcpManager.executeTool('system_exec', {
          command: config.command, ...(config.cwd && { cwd: config.cwd })
        });
      case 'oracle_collect':
        return await this.mcpManager.executeTool('system_exec', {
          command: config.command || 'python main.py --collect-only',
          cwd: config.cwd || '/home/ubuntu/oracle'
        });
      case 'telegram_message':
        await this.bot.sendMessage(null, config.message);
        return { sent: true };
      case 'workflow':
        return await this.mcpManager.executeTool('run_workflow', {
          workflowId: config.workflowId, inputs: config.inputs || {}
        });
      case 'notification':
        return await this.mcpManager.executeTool('send_notification', config.notificationConfig || config);
      case 'report':
        return await this.mcpManager.executeTool('get_dashboard_summary', { userId: config.userId || 'system' });
      default:
        throw new Error(`Unknown task_type: ${taskType}`);
    }
  }

  _calculateNextRun(type, config, lastRun) {
    const now = new Date();
    const base = lastRun || now;
    switch (type) {
      case 'once': return null;
      case 'interval': {
        const ms = (config.intervalMinutes || 60) * 60_000;
        const next = new Date(base.getTime() + ms);
        return next <= now ? new Date(now.getTime() + ms) : next;
      }
      case 'daily': {
        const [h, m] = (config.time || '09:00').split(':').map(Number);
        const next = new Date(base); next.setHours(h, m, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next;
      }
      case 'weekly': {
        const [h, m] = (config.time || '09:00').split(':').map(Number);
        const next = new Date(base); next.setHours(h, m, 0, 0);
        let d = (config.dayOfWeek || 0) - next.getDay();
        if (d < 0 || (d === 0 && next <= now)) d += 7;
        next.setDate(next.getDate() + d);
        return next;
      }
      case 'monthly': {
        const [h, m] = (config.time || '09:00').split(':').map(Number);
        const next = new Date(base);
        next.setDate(config.dayOfMonth || 1); next.setHours(h, m, 0, 0);
        if (next <= now) next.setMonth(next.getMonth() + 1);
        return next;
      }
      case 'cron': return this._nextCronRun(config.expression, now);
      default:
        logger.warn(`[CronScheduler] Unknown schedule_type: ${type}`);
        return new Date(now.getTime() + 3600_000);
    }
  }

  /**
   * 간단한 cron 다음 실행 시간 계산 (5-field: 분 시 일 월 요일)
   */
  _nextCronRun(expr, from) {
    const parts = (expr || '0 * * * *').split(/\s+/);
    if (parts.length !== 5) return new Date(from.getTime() + 3600_000);
    const minute = parts[0] === '*' ? null : parseInt(parts[0], 10);
    const hour = parts[1] === '*' ? null : parseInt(parts[1], 10);
    const next = new Date(from); next.setSeconds(0, 0);

    if (minute !== null && hour !== null) {
      next.setHours(hour, minute, 0, 0);
      if (next <= from) next.setDate(next.getDate() + 1);
    } else if (minute === null && hour !== null) {
      next.setMinutes(next.getMinutes() + 1); next.setHours(hour);
      if (next <= from) next.setDate(next.getDate() + 1);
    } else if (minute !== null) {
      next.setMinutes(minute);
      if (next <= from) next.setHours(next.getHours() + 1);
    } else {
      next.setMinutes(next.getMinutes() + 1);
    }
    return next;
  }

  async _notify(message) {
    try { if (this.bot) await this.bot.sendMessage(null, message); }
    catch (err) { logger.warn('[CronScheduler] Notify failed', err.message); }
  }
}
