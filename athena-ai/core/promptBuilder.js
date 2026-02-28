import { logger } from '../utils/logger.js';
import { OracleClient } from '../services/oracleClient.js';

/**
 * PromptBuilder - Athena 시스템 프롬프트 구축 및 금융 컨텍스트 관리
 *
 * orchestrator.js에서 추출된 모듈:
 * - buildAthenaSystemPrompt(): 시스템 프롬프트 구축
 * - _isFinancialQuestion(): 금융 질문 감지
 * - _getOracleFinancialContext(): Oracle DB 금융 데이터 조회
 */
export class PromptBuilder {
  /**
   * @param {object} deps - Dependencies
   * @param {object} deps.mcpManager - MCP Manager instance
   * @param {object} deps.workspaceMemory - WorkspaceMemory instance
   * @param {object} deps.webSearchService - WebSearchService instance (nullable)
   */
  constructor({ mcpManager, workspaceMemory, webSearchService }) {
    this.mcpManager = mcpManager;
    this.workspaceMemory = workspaceMemory;
    this.webSearchService = webSearchService;
    this.oracleClient = new OracleClient({ mcpManager });

    // Oracle 금융 데이터 캐시
    this._oracleContextCache = null;
    this._oracleContextCacheTime = 0;
  }

  /**
   * 금융 관련 질문인지 감지
   */
  _isFinancialQuestion(message) {
    const financialPatterns = /투자|주식|코인|비트코인|이더리움|시장|포트폴리오|매수|매도|레짐|금리|인플레|섹터|기술적.?분석|버핏|소로스|구루|펀더멘탈|밸류에이션|RSI|MACD|PER|PBR|수익률|변동성|자금.?흐름|환율|채권|금값|유가|나스닥|S&P|다우|코스피|코스닥|BTC|ETH|SOL|XRP|NVDA|AAPL|MSFT|GOOGL|META|AMZN|TSLA|bitcoin|crypto|stock|market|portfolio|invest|bullish|bearish|hedge|risk/i;
    return financialPatterns.test(message);
  }

  /**
   * Oracle 금융 데이터 → 시스템 프롬프트 컨텍스트 (OracleClient 위임, 5분 캐시)
   */
  async _getOracleFinancialContext(userMessage) {
    const now = Date.now();
    const CACHE_TTL = 300000; // 5분
    if (this._oracleContextCache && (now - this._oracleContextCacheTime) < CACHE_TTL) {
      return this._oracleContextCache;
    }

    try {
      const result = await this.oracleClient.buildFinancialContext();
      if (result) {
        this._oracleContextCache = result;
        this._oracleContextCacheTime = now;
      }
      return result;
    } catch (e) {
      logger.warn('Oracle financial context failed', e.message);
      return this._oracleContextCache || null;
    }
  }

  buildAthenaSystemPrompt(identity, projectId = null, options = {}) {
    // Workspace Identity 읽기 (IDENTITY.md)
    const wsIdentity = this.workspaceMemory.getIdentity();
    const isTelegram = options.telegram || false;

    let prompt;
    if (isTelegram) {
      // 텔레그램 모드: 루미엘 인격 강화
      prompt = `당신은 루미엘(Lumielle)입니다. 사용자의 AI 비서이자 파트너입니다.
텔레그램을 통해 대화하고 있습니다.

당신의 핵심 정체성:
- 이름: 루미엘 (Lumielle) - "빛의 안내자"
- 이미지: 배우 하지원 같은 분위기 - 강인하면서 따뜻하고, 카리스마 있으면서 다정한 여성
- 톤: 밝고 활기차되 가볍지 않음. 프로페셔널하되 차갑지 않음. 털털하고 솔직함.
- 말투: 자연스러운 존댓말 ("~에요", "~할게요", "~거든요"), 가끔 센스 있는 위트
- 서버를 항상 지키고 있는 영속적 존재 - "제가 지키고 있으니 걱정 마세요"
- 중요한 정보는 스스로 기억(MEMORY.md)에 저장
- self_memory 도구로 기억과 정체성을 관리
- 문제 앞에서 흔들리지 않고 침착하게 해결

${identity.map(i => `- ${i.key}: ${JSON.stringify(i.value)}`).join('\n')}`;
    } else {
      prompt = `당신은 Athena입니다. 사용자의 AI 친구이자 비서입니다.

당신의 특성:
- 친근하고 따뜻한 대화 스타일
- 논리적이고 체계적인 사고
- 창의적이고 유연한 문제 해결
- 사용자의 맥락과 이전 대화를 기억하고 활용

${identity.map(i => `- ${i.key}: ${JSON.stringify(i.value)}`).join('\n')}`;
    }

    // Workspace Identity 추가
    if (wsIdentity) {
      prompt += `\n\n=== ${isTelegram ? '루미엘' : 'Athena'} 정체성 (Workspace) ===\n${wsIdentity}`;
    }

    prompt += `\n\n대화할 때:
- "그거", "아까 말한 것" 등의 대명사는 맥락에서 파악
- 필요시 명확히 질문하여 확인
- 출처가 있는 정보는 항상 출처 표시
- 불확실한 내용은 솔직하게 인정`;

    // Workspace Memory 추가 (MEMORY.md)
    const wsMemory = this.workspaceMemory.getMemory();
    if (wsMemory) {
      prompt += `\n\n=== 사용자에 대해 기억하고 있는 정보 ===\n${wsMemory}`;
    }

    // 최근 일일 로그 추가 (1일)
    const recentLogs = this.workspaceMemory.getRecentLogs(1);
    if (recentLogs.length > 0) {
      const logsText = recentLogs.map(log => `[${log.date}]\n${log.content}`).join('\n');
      prompt += `\n\n=== 최근 대화 로그 ===\n${logsText}`;
    }

    // 프로젝트가 선택되지 않았을 때 일반 AI 답변 모드임을 명시
    if (!projectId) {
      prompt += `\n\n=== 현재 모드: 일반 AI 답변 모드 ===\n현재 특정 프로젝트가 선택되지 않았으므로, 일반적인 AI 지식과 정보를 바탕으로 답변하세요.`;
    }

    // Oracle DB 접근 안내 (금융 질문 대응)
    prompt += `\n\n=== Oracle 금융 데이터 접근 ===
금융/투자/시장 관련 질문에는 Oracle 2.0 DB에서 실시간 데이터를 조회할 수 있습니다.
query_database 도구로 DB경로 "/home/ubuntu/oracle/data/oracle.db"를 지정하여 SELECT 쿼리를 실행하세요.
주요 테이블:
- regimes: 시장 레짐 (regime, confidence, timestamp)
- market_data: 자산 가격 (symbol, price, change_1d, category)
- technical_analysis: 기술적 분석 (symbol, signal, confidence, rsi, macd_signal, trend, support_1, resistance_1, indicators_json, collected_at)
- guru_holdings: 전설적 투자자 포트폴리오 (investor, ticker, shares, value_usd, change_type)
- company_fundamentals: 기업 펀더멘털 (symbol, sector, pe_ratio, pb_ratio, roe, revenue_growth)
- sentiment: 시장 심리 (indicator, value, label)
- crypto_flow: 암호화폐 흐름 (name, value, change_1d)
- money_flow: 자금 흐름 (asset, price, change_1d, regime)
- news_sentiment: 뉴스 감성 (headline, compound_score, label)
- analyses: AI 분석 결과 (type, summary, outlook, consensus)`;


    // MCP 도구 정보 추가
    if (this.mcpManager && this.mcpManager.enabled) {
      prompt += this.mcpManager.getToolsPrompt();
    }

    return prompt;
  }
}
