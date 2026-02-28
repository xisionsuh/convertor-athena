import { logger } from '../utils/logger.js';
import { OracleClient } from '../services/oracleClient.js';

/**
 * TelegramBridge - 텔레그램 전용 메시지 처리 모듈
 * orchestrator.js에서 Telegram 관련 메서드를 분리한 클래스
 *
 * 역할:
 * - 텔레그램 메시지 스트리밍 (단일 AI / 멀티 AI)
 * - 시스템 컨텍스트, Oracle 금융 데이터, 웹 검색 결과 수집
 * - 사용자 메시지에서 메모리 추출
 */
export class TelegramBridge {
  /**
   * @param {Object} deps - 의존성 주입
   * @param {Object} deps.providers - AI 프로바이더 맵 { ChatGPT, Gemini, Claude, Grok }
   * @param {Object} deps.memory - MemoryManager 인스턴스
   * @param {Object} deps.mcpManager - MCPManager 인스턴스
   * @param {Object} deps.workspaceMemory - WorkspaceMemory 인스턴스
   * @param {Object} deps.memoryExtractor - MemoryExtractor 인스턴스
   * @param {Object} deps.webSearchService - WebSearchService 인스턴스 (nullable)
   * @param {Function} deps.buildAthenaSystemPrompt - bound function from orchestrator
   * @param {Function} deps.extractChunkContent - bound function from orchestrator
   */
  constructor({ providers, memory, mcpManager, workspaceMemory, memoryExtractor, webSearchService, buildAthenaSystemPrompt, extractChunkContent }) {
    this.providers = providers;
    this.memory = memory;
    this.mcpManager = mcpManager;
    this.workspaceMemory = workspaceMemory;
    this.memoryExtractor = memoryExtractor;
    this.webSearchService = webSearchService;
    this.oracleClient = new OracleClient({ mcpManager });
    this.buildAthenaSystemPrompt = buildAthenaSystemPrompt;
    this._extractChunkContent = extractChunkContent;

    // 시스템 컨텍스트 캐시
    this._sysContextCache = null;
    this._sysContextCacheTime = 0;

    // Oracle 금융 데이터 캐시
    this._oracleContextCache = null;
    this._oracleContextCacheTime = 0;
  }

  /**
   * 사용자 메시지에서 기억할 정보를 추출하여 워크스페이스 메모리에 저장
   */
  _extractMemoryFromMessage(userMessage) {
    try {
      if (!this.memoryExtractor.shouldRemember(userMessage)) return;

      const extractions = this.memoryExtractor.extractFromConversation([
        { role: 'user', content: userMessage }
      ]);

      if (extractions.length > 0) {
        this.memoryExtractor.updateMemoryFromExtractions(extractions);
        this.memoryExtractor.logDailySummary(
          `메모리 추출: ${extractions.map(e => e.category).join(', ')}`
        );
      }
    } catch (error) {
      logger.error('메모리 추출 실패', { error: error.message });
    }
  }

  /**
   * 텔레그램 전용 빠른 스트리밍 - analyzeQuery() 생략, 단일 AI 직행
   */
  async *processTelegramStream(userId, sessionId, userMessage) {
    try {
      // 멀티 AI 모드 감지
      const multiAIPatterns = /여러\s?AI|멀티\s?AI|다른\s?AI들?한테|토론|투표|비교해/i;
      if (multiAIPatterns.test(userMessage)) {
        yield* this._telegramMultiAI(userId, sessionId, userMessage);
        return;
      }

      // 사용자 메시지 저장
      this.memory.addShortTermMemory(userId, sessionId, 'user', userMessage);

      // 텔레그램 전용 AI 우선순위: 속도 우선 (Gemini Flash → Grok Fast → ChatGPT → Claude)
      const telegramOrder = ['Gemini', 'Grok', 'ChatGPT', 'Claude'];
      let agent = null;
      let agentName = '';
      for (const name of telegramOrder) {
        const provider = this.providers[name];
        if (provider && provider.isAvailable) {
          agent = provider;
          agentName = name;
          break;
        }
      }

      if (!agent) {
        throw new Error('사용 가능한 AI가 없습니다');
      }

      // 대화 컨텍스트 (최근 6개만 - 텔레그램은 가볍게)
      const context = this.memory.getContextWindow(sessionId, 6);
      const identity = this.memory.getAllIdentity('core');

      // 텔레그램 전용 시스템 프롬프트
      let systemPrompt = this.buildAthenaSystemPrompt(identity, null, { telegram: true });

      // 텔레그램용 추가 지시
      systemPrompt += `\n\n=== 텔레그램 응답 규칙 ===
- 짧고 자연스럽게 답변 (200자 이내 권장, 필요시 더 길게)
- 마크다운은 텔레그램 호환만 사용 (*굵게*, _기울임_)
- 서버/시스템 관련 질문에는 아래 실시간 데이터를 활용해 자연스럽게 답변하세요
- 도구 호출 문법(mcp_tool 등)은 사용하지 마세요. 아래 데이터로 직접 답변하세요
- 검색 결과가 제공되면 해당 정보를 활용해 답변하고, 출처(URL)를 함께 알려주세요`;

      // 웹/유튜브 검색 + 시스템 데이터 + Oracle 금융 데이터를 병렬 수집
      const searchPromise = this._telegramWebSearch(userMessage);
      const sysDataPromise = this._getTelegramSystemContext();
      const isFinancialQuery = this._isFinancialQuestion(userMessage);
      const oraclePromise = isFinancialQuery ? this._getOracleFinancialContext(userMessage) : Promise.resolve(null);

      const [searchResult, sysDataResult, oracleResult] = await Promise.allSettled([searchPromise, sysDataPromise, oraclePromise]);

      // 실시간 시스템 데이터 주입
      const sysData = sysDataResult.status === 'fulfilled' ? sysDataResult.value : null;
      if (sysData) {
        systemPrompt += `\n\n=== 실시간 서버 데이터 ===\n${sysData}`;
      }

      // Oracle 금융 데이터 주입
      const oracleData = oracleResult.status === 'fulfilled' ? oracleResult.value : null;
      if (oracleData) {
        systemPrompt += oracleData;
      }

      // 검색 결과 주입
      const searchData = searchResult.status === 'fulfilled' ? searchResult.value : null;
      if (searchData) {
        systemPrompt += searchData;
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        ...context,
        { role: 'user', content: userMessage }
      ];

      logger.info('Telegram stream: calling AI', { agent: agentName });
      const stream = await agent.streamChat(messages);
      let fullContent = '';

      for await (const chunk of stream) {
        const content = this._extractChunkContent(agentName, chunk);
        if (content) {
          fullContent += content;
          yield content;
        }
      }

      logger.info('Telegram stream: AI response complete', { length: fullContent.length, agent: agentName });

      // 어시스턴트 응답 저장
      if (fullContent) {
        this.memory.addShortTermMemory(userId, sessionId, 'assistant', fullContent, {
          strategy: 'telegram_direct',
          agents_used: [agentName]
        });
      }

      // 메모리 추출
      this._extractMemoryFromMessage(userMessage);

    } catch (error) {
      console.error('Telegram stream error:', error);
      yield `죄송해요, 처리 중 오류가 발생했어요: ${error.message}`;
    }
  }

  /**
   * 멀티 AI 모드: 여러 AI에게 동시에 질문하고 응답 비교
   */
  async *_telegramMultiAI(userId, sessionId, userMessage) {
    this.memory.addShortTermMemory(userId, sessionId, 'user', userMessage);

    // 사용 가능한 AI 최대 3개 선택
    const available = [];
    for (const name of ['ChatGPT', 'Gemini', 'Claude', 'Grok']) {
      const provider = this.providers[name];
      if (provider && provider.isAvailable) {
        available.push({ name, provider });
      }
      if (available.length >= 3) break;
    }

    if (available.length === 0) {
      yield '사용 가능한 AI가 없습니다.';
      return;
    }

    yield `*멀티 AI 모드* (${available.map(a => a.name).join(', ')})\n\n`;

    const identity = this.memory.getAllIdentity('core');
    const systemPrompt = this.buildAthenaSystemPrompt(identity, null, { telegram: true })
      + '\n\n짧고 핵심적으로 답변하세요 (300자 이내).';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    // 병렬 호출
    const results = await Promise.allSettled(
      available.map(({ name, provider }) =>
        provider.chat(messages, { maxTokens: 500 })
          .then(r => ({ name, content: r.content }))
      )
    );

    const responses = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { name, content } = result.value;
        responses.push(`*[${name}]*\n${content}`);
        yield `*[${name}]*\n${content}\n\n`;
      } else {
        const name = available[results.indexOf(result)]?.name || '?';
        yield `*[${name}]* 응답 실패: ${result.reason?.message || '알 수 없는 오류'}\n\n`;
      }
    }

    // 메모리에 combined 저장
    if (responses.length > 0) {
      this.memory.addShortTermMemory(userId, sessionId, 'assistant', responses.join('\n\n'), {
        strategy: 'multi_ai',
        agents_used: available.map(a => a.name)
      });
    }
  }

  /**
   * 텔레그램 대화용 실시간 시스템 데이터 수집
   * 30초 캐시 + 병렬 수집으로 최적화
   */
  async _getTelegramSystemContext() {
    // 30초 캐시
    const now = Date.now();
    if (this._sysContextCache && (now - this._sysContextCacheTime) < 30000) {
      return this._sysContextCache;
    }

    try {
      const parts = [];
      const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

      // system_monitor + PM2 병렬 실행 (각 3초 타임아웃)
      const [sysResult, pm2Result] = await Promise.allSettled([
        Promise.race([this.mcpManager.executeTool('system_monitor', { action: 'overview' }), timeout(3000)]),
        Promise.race([this.mcpManager.executeTool('process_manager', { action: 'list' }), timeout(3000)])
      ]);

      // 시스템 모니터 결과
      if (sysResult.status === 'fulfilled' && sysResult.value?.success) {
        const d = sysResult.value.result || sysResult.value;
        const cpu = d.cpu || {};
        const mem = d.memory || {};
        const disks = Array.isArray(d.disk) ? d.disk : [];
        const rootDisk = disks.find(dk => dk.mountpoint === '/');

        parts.push(`[서버] ${d.hostname || 'unknown'}, uptime: ${d.uptime || '?'}`);
        parts.push(`[CPU] ${cpu.cores || '?'}코어, 사용률: ${cpu.usagePercent || '?'}, Load: ${Array.isArray(cpu.loadAvg) ? cpu.loadAvg.join(', ') : '?'}`);
        parts.push(`[메모리] 전체: ${mem.total || '?'}, 사용: ${mem.used || '?'}, 여유: ${mem.free || '?'}`);
        if (rootDisk) parts.push(`[디스크 /] ${rootDisk.used}/${rootDisk.size} (${rootDisk.usagePercent})`);
      }

      // PM2 결과
      if (pm2Result.status === 'fulfilled' && pm2Result.value?.success) {
        const procs = pm2Result.value.result?.processes || pm2Result.value.result || [];
        if (Array.isArray(procs) && procs.length > 0) {
          const summary = procs.map(p => {
            const name = p.name || p.pm2_env?.name || '?';
            const status = p.pm2_env?.status || p.status || '?';
            const mem = p.monit?.memory ? `${(p.monit.memory / 1024 / 1024).toFixed(0)}MB` : '-';
            return `${name}(${status}, ${mem})`;
          }).join(', ');
          parts.push(`[PM2] ${procs.length}개 프로세스: ${summary}`);
        }
      }

      const result = parts.length > 0 ? parts.join('\n') : null;
      this._sysContextCache = result;
      this._sysContextCacheTime = now;
      return result;
    } catch (e) {
      logger.warn('Telegram system context failed', e);
      return this._sysContextCache || null;
    }
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

  /**
   * 텔레그램 메시지에 대한 웹/유튜브 검색 수행
   * @returns {string|null} 시스템 프롬프트에 추가할 검색 결과 문자열
   */
  async _telegramWebSearch(userMessage) {
    if (!this.webSearchService) return null;

    try {
      const queryLower = userMessage.toLowerCase();
      const needsWeb = this.webSearchService.needsWebSearch(userMessage) ||
        /검색해\s?줘|검색해\s?봐|찾아\s?줘|찾아\s?봐|알려\s?줘.*최신|search\s+for/i.test(userMessage);
      const needsYouTube = this.webSearchService.needsYouTubeSearch(userMessage);

      if (!needsWeb && !needsYouTube) return null;

      const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
      const searchType = needsYouTube ? 'youtube' : 'web';

      logger.info('Telegram search triggered', { type: searchType, query: userMessage.substring(0, 50) });

      const searchResponse = await Promise.race([
        this.webSearchService.search(userMessage, { type: searchType, numResults: 3 }),
        timeout(3000)
      ]);

      const results = searchResponse?.results;
      if (!results || results.length === 0) return null;

      if (needsYouTube) {
        const items = results.map((r, i) =>
          `${i + 1}. ${r.title || '제목 없음'}\n   채널: ${r.channelTitle || r.channel || '-'}\n   URL: ${r.link}`
        ).join('\n');
        return `\n\n=== 유튜브 검색 결과 ===\n${items}\n\n위 영상 정보를 바탕으로 답변하고 URL을 함께 알려주세요.`;
      }

      const items = results.map((r, i) => {
        const reliability = this.webSearchService.getSourceReliability(r.link);
        return `[출처 ${i + 1}] ${r.title || '제목 없음'}\nURL: ${r.link}\n내용: ${r.snippet || ''}\n신뢰도: ${reliability}`;
      }).join('\n\n');
      return `\n\n=== 웹 검색 결과 ===\n${items}\n\n위 검색 결과를 참고하여 답변하고, 정보를 인용할 때 출처 URL을 함께 알려주세요.`;

    } catch (e) {
      logger.warn('Telegram web search failed', e.message);
      return null;
    }
  }
}
