/**
 * OracleClient - Oracle 2.0 REST API 클라이언트
 * API 가용 시 REST, 불가 시 직접 DB 쿼리로 폴백
 */
import { logger } from '../utils/logger.js';

const DEFAULT_API_URL = 'http://127.0.0.1:8765/api/v1';
const ORACLE_DB = '/home/ubuntu/oracle/data/oracle.db';
const REQUEST_TIMEOUT = 5000;

export class OracleClient {
  constructor({ apiUrl, mcpManager, apiToken } = {}) {
    this.apiUrl = apiUrl || process.env.ORACLE_API_URL || DEFAULT_API_URL;
    this.mcpManager = mcpManager;
    this.apiToken = apiToken || process.env.ORACLE_API_TOKEN || null;
    this._apiAvailable = null; // null = unknown, true/false = checked
    this._lastHealthCheck = 0;
  }

  /**
   * API 가용성 체크 (60초 캐시)
   */
  async isApiAvailable() {
    const now = Date.now();
    if (this._apiAvailable !== null && (now - this._lastHealthCheck) < 60000) {
      return this._apiAvailable;
    }
    try {
      const resp = await this._fetch('/health');
      this._apiAvailable = resp?.success === true;
    } catch {
      this._apiAvailable = false;
    }
    this._lastHealthCheck = now;
    return this._apiAvailable;
  }

  // ─── Public API ─────────────────────────────────────────

  async getMarketRegime() {
    if (await this.isApiAvailable()) {
      const resp = await this._fetch('/market-regime');
      return resp?.data || null;
    }
    return this._dbQuery(
      'SELECT regime, confidence, timestamp FROM regimes ORDER BY timestamp DESC LIMIT 1'
    ).then(rows => rows?.[0] || null);
  }

  async getMarketData(limit = 15, category = null) {
    if (await this.isApiAvailable()) {
      const params = new URLSearchParams({ limit });
      if (category) params.set('category', category);
      const resp = await this._fetch(`/market-data?${params}`);
      return resp?.data || [];
    }
    const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 15));
    if (category && !/^[a-zA-Z0-9_\- ]+$/.test(category)) {
      logger.warn('OracleClient: invalid category rejected:', category);
      return [];
    }
    let query = `SELECT symbol, price, change_1d, category FROM market_data
                 WHERE timestamp = (SELECT MAX(timestamp) FROM market_data)`;
    if (category) query += ` AND category = '${category}'`;
    query += ` ORDER BY ABS(change_1d) DESC LIMIT ${safeLimit}`;
    return this._dbQuery(query);
  }

  async getTechnicalSignals(symbol = null) {
    // 심볼 정규화: BTC → BTC-USD, ETH → ETH-USD (크립토 약칭 지원)
    const normalizedSymbol = symbol ? this._normalizeSymbol(symbol) : null;
    if (await this.isApiAvailable()) {
      const path = normalizedSymbol ? `/technical/${encodeURIComponent(normalizedSymbol)}` : '/technical';
      try {
        const resp = await this._fetch(path);
        return resp?.data || [];
      } catch {
        // 정규화된 심볼 실패 시 원본으로 재시도
        if (normalizedSymbol !== symbol?.toUpperCase()) {
          try {
            const resp2 = await this._fetch(`/technical/${encodeURIComponent(symbol.toUpperCase())}`);
            return resp2?.data || [];
          } catch { /* fall through to DB */ }
        }
        return [];
      }
    }
    const s = normalizedSymbol || symbol?.toUpperCase();
    if (s && !/^[A-Z0-9.\-]+$/.test(s)) {
      logger.warn('OracleClient: invalid symbol rejected:', s);
      return [];
    }
    let query = `SELECT symbol, signal, confidence, rsi, trend FROM technical_analysis
                 WHERE collected_at = (SELECT MAX(collected_at) FROM technical_analysis)`;
    if (s) query = `SELECT * FROM technical_analysis WHERE UPPER(symbol) = '${s}' LIMIT 1`;
    else query += ' ORDER BY confidence DESC';
    return this._dbQuery(query);
  }

  _normalizeSymbol(symbol) {
    const s = symbol.toUpperCase().trim();
    const cryptoMap = { BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', XRP: 'XRP-USD', ADA: 'ADA-USD', DOGE: 'DOGE-USD', DOT: 'DOT-USD', AVAX: 'AVAX-USD' };
    return cryptoMap[s] || s;
  }

  async getSentiment() {
    if (await this.isApiAvailable()) {
      const resp = await this._fetch('/sentiment');
      return resp?.data || [];
    }
    return this._dbQuery('SELECT indicator, value, label FROM sentiment ORDER BY timestamp DESC LIMIT 3');
  }

  async getGuruHoldings(investor = null) {
    if (await this.isApiAvailable()) {
      const path = investor ? `/guru/${encodeURIComponent(investor)}` : '/guru';
      const resp = await this._fetch(path);
      return resp?.data || [];
    }
    if (investor) {
      const safeInvestor = investor.replace(/[^a-zA-Z0-9\s.\-]/g, '').toLowerCase();
      if (!safeInvestor) {
        logger.warn('OracleClient: invalid investor name rejected:', investor);
        return [];
      }
      return this._dbQuery(
        `SELECT symbol, shares, value, change_pct FROM guru_holdings WHERE LOWER(investor) LIKE '%${safeInvestor}%' ORDER BY value DESC LIMIT 20`
      );
    }
    return this._dbQuery(
      `SELECT symbol, COUNT(DISTINCT investor) as guru_count, GROUP_CONCAT(DISTINCT investor) as investors
       FROM guru_holdings GROUP BY symbol HAVING guru_count >= 2 ORDER BY guru_count DESC LIMIT 20`
    );
  }

  async getReport(type = 'daily') {
    if (await this.isApiAvailable()) {
      const resp = await this._fetch(`/report/${encodeURIComponent(type)}`);
      return resp?.data || null;
    }
    // 폴백: 파일시스템으로 리포트 읽기
    try {
      const result = await this.mcpManager.executeTool('read_file', {
        path: `/home/ubuntu/oracle/reports/${type}_report.md`
      });
      return result?.success ? { content: result.result?.content || result.content } : null;
    } catch { return null; }
  }

  async getStatus() {
    if (await this.isApiAvailable()) {
      const resp = await this._fetch('/status');
      return resp?.data || null;
    }
    // 폴백: state 파일 + DB 통계
    try {
      const result = await this.mcpManager.executeTool('read_file', {
        path: '/home/ubuntu/oracle/data/orchestrator_state.json'
      });
      return result?.success ? JSON.parse(result.result?.content || result.content || '{}') : null;
    } catch { return null; }
  }

  async triggerCollect(collectorName = null) {
    if (await this.isApiAvailable()) {
      const resp = await this._fetch('/collect', 'POST', { collector: collectorName });
      return resp?.data || resp;
    }
    const cmd = collectorName
      ? `cd /home/ubuntu/oracle && ./venv/bin/python main.py --collect ${collectorName}`
      : 'cd /home/ubuntu/oracle && ./venv/bin/python main.py --collect-only';
    return this.mcpManager.executeTool('system_exec', { command: cmd });
  }

  async triggerAnalyze() {
    if (await this.isApiAvailable()) {
      const resp = await this._fetch('/analyze', 'POST');
      return resp?.data || resp;
    }
    return this.mcpManager.executeTool('system_exec', {
      command: 'cd /home/ubuntu/oracle && ./venv/bin/python main.py --analyze-only'
    });
  }

  async getHealth() {
    try {
      const resp = await this._fetch('/health');
      return resp?.data || resp;
    } catch {
      return { status: 'unreachable', api: this.apiUrl };
    }
  }

  /**
   * Oracle 금융 컨텍스트를 시스템 프롬프트용으로 빌드
   */
  async buildFinancialContext() {
    try {
      const [regime, market, ta, sentiment] = await Promise.allSettled([
        this.getMarketRegime(),
        this.getMarketData(15),
        this.getTechnicalSignals(),
        this.getSentiment()
      ]);

      const parts = [];
      parts.push('당신은 Oracle 2.0 AI 금융분석 플랫폼의 실시간 데이터에 접근할 수 있습니다.');
      parts.push('아래 데이터를 기반으로 구체적인 수치와 함께 전문적으로 답변하세요.');
      parts.push('데이터 출처: Oracle 2.0 (자체 수집, 최신 업데이트)\n');

      const r = regime.status === 'fulfilled' ? regime.value : null;
      if (r) parts.push(`[시장 레짐] ${r.regime} (신뢰도: ${r.confidence ? (r.confidence * 100).toFixed(0) + '%' : '?'}, 시점: ${r.timestamp})`);

      const mRows = market.status === 'fulfilled' ? market.value : [];
      if (mRows?.length > 0) {
        parts.push('\n[주요 자산 현황]');
        for (const m of mRows) {
          const change = m.change_1d != null ? `${m.change_1d > 0 ? '+' : ''}${Number(m.change_1d).toFixed(2)}%` : '?';
          parts.push(`  ${m.symbol}: $${Number(m.price).toLocaleString()} (${change}) [${m.category || ''}]`);
        }
      }

      const taRows = ta.status === 'fulfilled' ? ta.value : [];
      if (taRows?.length > 0) {
        parts.push('\n[기술적 분석 신호]');
        for (const t of taRows) {
          const conf = t.confidence ? (t.confidence * 100).toFixed(0) + '%' : '?';
          parts.push(`  ${t.symbol}: ${t.signal || 'N/A'} (신뢰도 ${conf}, RSI: ${t.rsi ? Number(t.rsi).toFixed(1) : '?'}, 추세: ${t.trend || '?'})`);
        }
      }

      const sRows = sentiment.status === 'fulfilled' ? sentiment.value : [];
      if (sRows?.length > 0) {
        parts.push('\n[시장 심리]');
        for (const s of sRows) parts.push(`  ${s.indicator}: ${s.value} (${s.label || ''})`);
      }

      parts.push('\n[추가 데이터 접근]');
      parts.push('더 상세한 분석이 필요하면 Oracle API 또는 query_database로 조회할 수 있습니다.');

      if (parts.length <= 4) return null;
      return `\n\n=== Oracle 2.0 실시간 금융 데이터 ===\n${parts.join('\n')}`;
    } catch (e) {
      logger.warn('OracleClient: buildFinancialContext failed', e.message);
      return null;
    }
  }

  // ─── Internal ─────────────────────────────────────────

  async _fetch(path, method = 'GET', body = null) {
    const url = `${this.apiUrl}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiToken) headers['Authorization'] = `Bearer ${this.apiToken}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const opts = { method, headers, signal: controller.signal };
      if (body) opts.body = JSON.stringify(body);
      const resp = await fetch(url, opts);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async _dbQuery(query) {
    try {
      const result = await this.mcpManager.executeTool('query_database', {
        query,
        database_path: ORACLE_DB
      });
      return result?.result?.rows || result?.rows || [];
    } catch (e) {
      logger.warn('OracleClient: DB query failed', e.message);
      return [];
    }
  }
}
