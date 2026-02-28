/**
 * SubAgentManager - Concurrent AI Task Execution System
 * Manages up to maxConcurrent (default 8) parallel tasks across
 * AI providers, MCP tools, web search, and multi-step analyses.
 */
import { logger } from '../utils/logger.js';

let _nextId = 1;
const VALID_TYPES = new Set(['ai_query', 'mcp_tool', 'web_search', 'analysis', 'parallel_ai']);

export class SubAgentManager {
  constructor({ orchestrator, mcpManager, maxConcurrent = 8 }) {
    this.orchestrator = orchestrator;
    this.mcpManager = mcpManager;
    this.maxConcurrent = maxConcurrent;
    this.tasks = new Map();
    this.queue = [];
    this.active = new Set();
    this._completeCbs = [];
    this._errorCbs = [];
  }

  // ─── Public API ──────────────────────────────────────────────────

  submit(task) {
    if (!VALID_TYPES.has(task.type)) {
      throw new Error(`Unknown task type: ${task.type}. Valid: ${[...VALID_TYPES]}`);
    }
    const id = `task_${_nextId++}`;
    this.tasks.set(id, {
      id, type: task.type, config: task,
      description: task.description || task.type,
      status: 'queued', result: null, error: null,
      createdAt: Date.now(), completedAt: null,
      abortController: new AbortController(),
    });
    this.queue.push(id);
    logger.debug(`[SubAgent] Queued ${id} (${task.type})`);
    this._drain();
    return id;
  }

  getStatus(taskId) {
    const t = this.tasks.get(taskId);
    if (!t) return null;
    const { id, type, status, description, result, error, createdAt, completedAt } = t;
    return { id, type, status, description, result, error, createdAt, completedAt };
  }

  cancel(taskId) {
    const t = this.tasks.get(taskId);
    if (!t) return false;
    if (t.status === 'queued') {
      this.queue = this.queue.filter(id => id !== taskId);
      t.status = 'failed'; t.error = 'Cancelled'; t.completedAt = Date.now();
      return true;
    }
    if (t.status === 'running') { t.abortController.abort(); return true; }
    return false;
  }

  listActive() { return [...this.active].map(id => this.getStatus(id)); }

  listAll(limit = 50) {
    return [...this.tasks.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit).map(t => this.getStatus(t.id));
  }

  waitFor(taskId, timeoutMs = 120_000) {
    const t = this.tasks.get(taskId);
    if (!t) return Promise.reject(new Error(`Task not found: ${taskId}`));
    if (t.status === 'completed' || t.status === 'failed') {
      return Promise.resolve(this.getStatus(taskId));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup(); this.cancel(taskId);
        reject(new Error(`Task ${taskId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const onDone = (r) => { if (r.id === taskId) { cleanup(); resolve(r); } };
      const onErr = (r) => { if (r.id === taskId) { cleanup(); resolve(r); } };
      const cleanup = () => {
        clearTimeout(timer);
        this._completeCbs = this._completeCbs.filter(cb => cb !== onDone);
        this._errorCbs = this._errorCbs.filter(cb => cb !== onErr);
      };
      this._completeCbs.push(onDone);
      this._errorCbs.push(onErr);
    });
  }

  async submitAndWait(task, timeoutMs = 120_000) {
    return this.waitFor(this.submit(task), timeoutMs);
  }

  onComplete(cb) { this._completeCbs.push(cb); }
  onError(cb) { this._errorCbs.push(cb); }

  // ─── Internal Engine ─────────────────────────────────────────────

  _drain() {
    while (this.active.size < this.maxConcurrent && this.queue.length > 0) {
      const id = this.queue.shift();
      const t = this.tasks.get(id);
      if (t?.status === 'queued') this._execute(t);
    }
  }

  async _execute(task) {
    task.status = 'running';
    this.active.add(task.id);
    const timer = setTimeout(() => task.abortController.abort(), task.config.timeoutMs || 120_000);
    try {
      const result = await this._dispatch(task);
      if (task.abortController.signal.aborted) throw new Error('Cancelled');
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      logger.info(`[SubAgent] ${task.id} done in ${task.completedAt - task.createdAt}ms`);
      this._emit(this._completeCbs, this.getStatus(task.id));
    } catch (err) {
      task.status = 'failed';
      task.error = task.abortController.signal.aborted ? 'Cancelled' : err.message;
      task.completedAt = Date.now();
      logger.warn(`[SubAgent] ${task.id} failed: ${task.error}`);
      this._emit(this._errorCbs, this.getStatus(task.id));
    } finally {
      clearTimeout(timer);
      this.active.delete(task.id);
      this._drain();
    }
  }

  // ─── Dispatcher ──────────────────────────────────────────────────

  async _dispatch(task) {
    const c = task.config;
    switch (c.type) {
      case 'ai_query':     return this._aiQuery(c);
      case 'mcp_tool':     return this._mcpTool(c);
      case 'web_search':   return this._webSearch(c);
      case 'analysis':     return this._analysis(c, task.abortController.signal);
      case 'parallel_ai':  return this._parallelAi(c);
      default: throw new Error(`Unhandled type: ${c.type}`);
    }
  }

  async _aiQuery({ provider, prompt, messages }) {
    const p = this._resolveProvider(provider);
    return p.chat(messages || [{ role: 'user', content: prompt }]);
  }

  async _mcpTool({ toolName, params }) {
    if (!toolName) throw new Error('mcp_tool requires toolName');
    return this.mcpManager.executeTool(toolName, params || {});
  }

  async _webSearch({ query }) {
    if (this.orchestrator.webSearchService) {
      return this.orchestrator.webSearchService.search(query);
    }
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}`;
    return this.mcpManager.executeTool('call_api', { url, method: 'GET' });
  }

  async _analysis({ steps }, signal) {
    if (!Array.isArray(steps) || !steps.length) {
      throw new Error('analysis requires a non-empty steps array');
    }
    const ctx = {};
    for (let i = 0; i < steps.length; i++) {
      if (signal.aborted) throw new Error('Cancelled');
      const resolved = this._resolveTemplates(steps[i], ctx);
      ctx[`step${i}`] = await this._dispatch({ config: resolved });
    }
    return ctx;
  }

  async _parallelAi({ providers, prompt, messages }) {
    const names = providers || Object.keys(this.orchestrator.providers);
    const msgs = messages || [{ role: 'user', content: prompt }];
    const settled = await Promise.allSettled(
      names.map(async (name) => {
        const p = this._resolveProvider(name);
        return { provider: name, response: await p.chat(msgs) };
      })
    );
    return settled.map((r, i) =>
      r.status === 'fulfilled' ? r.value
        : { provider: names[i], error: r.reason?.message || 'Unknown error' }
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  _resolveProvider(name) {
    const key = name || this.orchestrator.fallbackOrder.find(
      n => this.orchestrator.providers[n]?.isAvailable
    );
    const p = this.orchestrator.providers[key];
    if (!p) throw new Error(`Provider not found: ${key}`);
    return p;
  }

  _resolveTemplates(step, ctx) {
    const json = JSON.stringify(step);
    const out = json.replace(/\{\{(step\d+)\}\}/g, (_, k) => {
      const v = ctx[k];
      return v !== undefined ? JSON.stringify(v).slice(1, -1) : '';
    });
    try { return JSON.parse(out); } catch { return step; }
  }

  _emit(cbs, data) {
    for (const cb of cbs) {
      try { cb(data); } catch (e) { logger.warn(`[SubAgent] Callback error: ${e.message}`); }
    }
  }
}
