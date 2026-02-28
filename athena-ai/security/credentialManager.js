/**
 * CredentialManager - API 키 및 자격증명 관리
 * 키 상태 추적, 자동 폴백, 사용량 모니터링
 */
import { logger } from '../utils/logger.js';

export class CredentialManager {
  constructor({ dbPath, envConfig = {} }) {
    this._credentials = new Map(); // name → { keys: [{ value, status, failCount, lastUsed, lastError }], activeIndex }
    this._envConfig = envConfig;
    this._listeners = [];
  }

  /**
   * 자격증명 등록 (다중 키 지원)
   * @param {string} name - 자격증명 이름 (e.g., 'openai', 'gemini')
   * @param {string[]} keys - API 키 배열 (우선순위순)
   * @param {object} options - { maxFailures, cooldownMs }
   */
  register(name, keys, options = {}) {
    const { maxFailures = 5, cooldownMs = 300000 } = options;
    this._credentials.set(name, {
      keys: keys.filter(Boolean).map(value => ({
        value,
        status: 'active',   // active | degraded | disabled | cooldown
        failCount: 0,
        successCount: 0,
        lastUsed: null,
        lastError: null,
        cooldownUntil: null
      })),
      activeIndex: 0,
      maxFailures,
      cooldownMs
    });
    logger.info(`[CredentialManager] Registered: ${name} (${keys.filter(Boolean).length} key(s))`);
  }

  /**
   * 현재 활성 키 가져오기 (자동 폴백)
   */
  get(name) {
    const cred = this._credentials.get(name);
    if (!cred || cred.keys.length === 0) return null;

    const now = Date.now();
    // 쿨다운 만료 체크
    for (const key of cred.keys) {
      if (key.status === 'cooldown' && key.cooldownUntil && now > key.cooldownUntil) {
        key.status = 'active';
        key.failCount = 0;
        logger.info(`[CredentialManager] ${name}: key recovered from cooldown`);
      }
    }

    // 활성 키 찾기 (activeIndex부터 순회)
    for (let i = 0; i < cred.keys.length; i++) {
      const idx = (cred.activeIndex + i) % cred.keys.length;
      const key = cred.keys[idx];
      if (key.status === 'active' || key.status === 'degraded') {
        cred.activeIndex = idx;
        key.lastUsed = new Date().toISOString();
        return key.value;
      }
    }

    logger.warn(`[CredentialManager] ${name}: all keys exhausted`);
    return null;
  }

  /**
   * 키 사용 결과 보고
   */
  reportSuccess(name) {
    const cred = this._credentials.get(name);
    if (!cred) return;
    const key = cred.keys[cred.activeIndex];
    if (key) {
      key.successCount++;
      if (key.status === 'degraded') key.status = 'active';
    }
  }

  reportFailure(name, error) {
    const cred = this._credentials.get(name);
    if (!cred) return;
    const key = cred.keys[cred.activeIndex];
    if (!key) return;

    key.failCount++;
    key.lastError = error?.message || String(error);

    const isRateLimit = /429|rate.?limit|quota/i.test(key.lastError);
    const isAuth = /401|403|auth|invalid.?key|api.?key/i.test(key.lastError);

    if (isAuth) {
      key.status = 'disabled';
      logger.error(`[CredentialManager] ${name}: key DISABLED (auth error: ${key.lastError})`);
    } else if (isRateLimit) {
      key.status = 'cooldown';
      key.cooldownUntil = Date.now() + cred.cooldownMs;
      logger.warn(`[CredentialManager] ${name}: key in cooldown for ${cred.cooldownMs / 1000}s`);
    } else if (key.failCount >= cred.maxFailures) {
      key.status = 'cooldown';
      key.cooldownUntil = Date.now() + cred.cooldownMs;
      logger.warn(`[CredentialManager] ${name}: key in cooldown (${key.failCount} failures)`);
    } else {
      key.status = 'degraded';
    }

    // 다음 활성 키로 자동 폴백
    this._tryFallback(name, cred);
    this._emit('keyStatusChange', { name, status: key.status, error: key.lastError });
  }

  _tryFallback(name, cred) {
    for (let i = 1; i < cred.keys.length; i++) {
      const idx = (cred.activeIndex + i) % cred.keys.length;
      if (cred.keys[idx].status === 'active' || cred.keys[idx].status === 'degraded') {
        const oldIdx = cred.activeIndex;
        cred.activeIndex = idx;
        logger.info(`[CredentialManager] ${name}: fallback key ${oldIdx} → ${idx}`);
        return true;
      }
    }
    return false;
  }

  /**
   * 전체 자격증명 상태 보고서
   */
  getStatus() {
    const report = {};
    for (const [name, cred] of this._credentials) {
      report[name] = {
        activeKeyIndex: cred.activeIndex,
        totalKeys: cred.keys.length,
        keys: cred.keys.map((k, i) => ({
          index: i,
          status: k.status,
          failCount: k.failCount,
          successCount: k.successCount,
          lastUsed: k.lastUsed,
          lastError: k.lastError,
          active: i === cred.activeIndex
        }))
      };
    }
    return report;
  }

  /**
   * 특정 자격증명 요약 (텔레그램 표시용)
   */
  getSummary(name) {
    const cred = this._credentials.get(name);
    if (!cred) return `${name}: not registered`;
    const active = cred.keys.filter(k => k.status === 'active' || k.status === 'degraded').length;
    const total = cred.keys.length;
    const current = cred.keys[cred.activeIndex];
    return `${name}: ${active}/${total} keys active (current: ${current?.status || 'none'})`;
  }

  /**
   * .env 기반 자동 등록
   */
  registerFromEnv(env = process.env) {
    const keyMap = {
      openai: [env.OPENAI_API_KEY, env.OPENAI_MULTI_AI_KEY].filter(Boolean),
      gemini: [env.GOOGLE_AI_API_KEY, env.GEMINI_API_KEY_2].filter(Boolean),
      claude: [env.ANTHROPIC_API_KEY].filter(Boolean),
      grok: [env.XAI_API_KEY].filter(Boolean),
      perplexity: [env.PERPLEXITY_API_KEY].filter(Boolean),
      search: [env.SEARCH_API_KEY].filter(Boolean),
      github: [env.GITHUB_TOKEN].filter(Boolean),
      telegram: [env.TELEGRAM_BOT_TOKEN].filter(Boolean)
    };

    for (const [name, keys] of Object.entries(keyMap)) {
      if (keys.length > 0) this.register(name, keys);
    }
    return this;
  }

  /**
   * 키 강제 리셋 (수동 복구)
   */
  resetKey(name, index = -1) {
    const cred = this._credentials.get(name);
    if (!cred) return false;
    const targets = index >= 0 ? [cred.keys[index]] : cred.keys;
    for (const key of targets) {
      if (key) {
        key.status = 'active';
        key.failCount = 0;
        key.lastError = null;
        key.cooldownUntil = null;
      }
    }
    logger.info(`[CredentialManager] ${name}: key(s) reset`);
    return true;
  }

  /**
   * 이벤트 리스너
   */
  on(event, callback) {
    this._listeners.push({ event, callback });
  }

  _emit(event, data) {
    for (const l of this._listeners) {
      if (l.event === event) {
        try { l.callback(data); } catch (e) { /* ignore */ }
      }
    }
  }
}
