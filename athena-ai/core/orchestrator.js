import { MemoryManager } from '../memory/memoryManager.js';
import { OpenAIProvider } from '../ai/providers/openai.js';
import { GeminiProvider } from '../ai/providers/gemini.js';
import { ClaudeProvider } from '../ai/providers/claude.js';
import { GrokProvider } from '../ai/providers/grok.js';
import { PerformanceMonitor } from '../utils/performanceMonitor.js';
import { logger } from '../utils/logger.js';
import { MCPManager } from '../mcp/mcpManager.js';

/**
 * Athena Brain - AI Orchestrator
 * 아테나의 뇌 역할을 하는 총괄 AI 시스템 (Meta AI)
 * Meta AI는 모든 AI를 총괄하고 인격을 유지하며 판단하고 모드를 결정하며
 * sub AI들에게 업무를 분할/지시하고 그 답변을 최종적으로 모아서 판단하는 역할
 * 
 * 총괄 AI(Meta AI 역할) 우선순위:
 * 1순위: ChatGPT, 2순위: Gemini, 3순위: Claude, 4순위: Grok
 * 장애 발생 시 자동으로 다음 순위 AI가 총괄 역할 위임
 */
export class AthenaOrchestrator {
  constructor(config) {
    this.memory = new MemoryManager(config.dbPath);
    this.providers = this.initializeProviders(config);
    // 총괄 AI(Meta AI 역할) 우선순위: GPT → Gemini → Claude → Grok
    this.fallbackOrder = ['ChatGPT', 'Gemini', 'Claude', 'Grok'];
    this.currentBrain = null;
    this.webSearchEnabled = config.webSearchEnabled || false;
    this.webSearchService = config.webSearchService || null; // WebSearchService 인스턴스
    this.performanceMonitor = new PerformanceMonitor(config.dbPath);
    
    // MCP Manager 초기화
    this.mcpManager = new MCPManager({
      workspaceRoot: config.mcpWorkspaceRoot,
      enabled: config.mcpEnabled !== false, // 기본값: true
      dbPath: config.dbPath // 데이터베이스 경로 전달
    });
  }

  initializeProviders(config) {
    const providers = {};

    // 총괄 AI(Meta AI 역할) 후보들
    if (config.openaiApiKey) {
      providers['ChatGPT'] = new OpenAIProvider(config.openaiApiKey);
    }
    if (config.geminiApiKey) {
      providers['Gemini'] = new GeminiProvider(config.geminiApiKey);
    }
    if (config.claudeApiKey) {
      providers['Claude'] = new ClaudeProvider(config.claudeApiKey);
    }
    if (config.grokApiKey) {
      providers['Grok'] = new GrokProvider(config.grokApiKey);
    }

    return providers;
  }

  /**
   * 총괄 AI 선택 (장애 발생시 자동 폴백)
   */
  async selectBrain() {
    for (const providerName of this.fallbackOrder) {
      const provider = this.providers[providerName];
      if (provider && provider.isAvailable) {
        const isHealthy = await provider.checkHealth();
        if (isHealthy) {
          this.currentBrain = provider;
          return provider;
        }
      }
    }
    throw new Error('모든 AI 프로바이더가 사용 불가능합니다.');
  }

  /**
   * 각 AI의 강점과 특성 정의
   */
  getAICapabilities() {
    return {
      'ChatGPT': {
        strengths: ['논리적 분석', '코딩', '수학', '일반 지식', '구조화된 답변'],
        specialties: ['technical', 'conversation'],
        bestFor: ['단일 작업', '명확한 답변', '코드 작성', '수학 문제']
      },
      'Gemini': {
        strengths: ['최신 정보', '다양한 관점', '창의성', '연구', '종합 분석'],
        specialties: ['research', 'creative'],
        bestFor: ['최신 트렌드', '연구', '다각도 분석', '창의적 작업']
      },
      'Claude': {
        strengths: ['심층 분석', '윤리적 판단', '긴 맥락', '창의적 글쓰기', '복잡한 추론'],
        specialties: ['creative', 'research', 'decision'],
        bestFor: ['복잡한 분석', '윤리적 질문', '긴 문서 작성', '심층 토론']
      },
      'Grok': {
        strengths: ['실시간 정보', '유머', '대화', '최신 이벤트', '트렌드'],
        specialties: ['conversation', 'research'],
        bestFor: ['최신 뉴스', '캐주얼 대화', '트렌드 분석', '실시간 정보']
      }
    };
  }

  /**
   * 질문 분석 및 전략 결정 (개선된 버전)
   */
  async analyzeQuery(userId, sessionId, userMessage) {
    const brain = await this.selectBrain();

    // 맥락 정보 가져오기
    const context = this.memory.getContextWindow(sessionId, 5);
    const identity = this.memory.getAllIdentity('core');
    const longTermContext = this.memory.searchLongTermMemory(userId, userMessage.substring(0, 50));

    // 1. 과거 유사한 결정 로그 분석 (학습 기반)
    const similarDecisions = this.memory.analyzeSimilarDecisions(userId, userMessage, 5);
    const learningContext = this.buildLearningContext(similarDecisions);

    // 2. 각 모드의 성공 패턴 분석
    const modePatterns = {};
    ['single', 'parallel', 'sequential', 'debate', 'voting'].forEach(mode => {
      modePatterns[mode] = this.memory.analyzeModePatterns(userId, mode, 10);
    });

    // 3. AI 특성 정보
    const aiCapabilities = this.getAICapabilities();

    // 4. 전략 결정을 위한 개선된 프롬프트
    const strategyPrompt = this.buildEnhancedStrategyPrompt(
      userMessage, 
      context, 
      identity, 
      longTermContext,
      learningContext,
      modePatterns,
      aiCapabilities
    );

    console.log('🔍 전략 분석 시작 (개선된 버전):', userMessage.substring(0, 100));
    if (similarDecisions.length > 0) {
      console.log('📚 유사한 과거 결정 발견:', similarDecisions.length, '개');
    }

    const response = await brain.chat([
      { role: 'system', content: strategyPrompt },
      { role: 'user', content: userMessage }
    ], { maxTokens: 1500 });

    console.log('📋 전략 분석 응답:', response.content);

    // 응답 파싱하여 전략 추출
    const strategy = this.parseStrategy(response.content);
    
    // 5. AI 특성 기반으로 추천된 에이전트 최적화
    strategy.recommendedAgents = this.optimizeAgentSelection(
      strategy, 
      aiCapabilities,
      userMessage
    );
    
    console.log('✅ 선택된 전략:', {
      collaborationMode: strategy.collaborationMode,
      recommendedAgents: strategy.recommendedAgents,
      complexity: strategy.complexity,
      category: strategy.category,
      reasoning: strategy.reasoning,
      learningBased: similarDecisions.length > 0
    });

    // 결정 로그 저장
    this.memory.logDecision(
      userId,
      sessionId,
      'strategy_analysis',
      userMessage,
      { 
        analysis: response.content, 
        strategy,
        learningContext: similarDecisions.length,
        modePatterns: Object.keys(modePatterns).filter(m => modePatterns[m].total > 0)
      },
      JSON.stringify(strategy),
      [brain.name]
    );

    return strategy;
  }

  /**
   * 학습 컨텍스트 구축
   */
  buildLearningContext(similarDecisions) {
    if (similarDecisions.length === 0) {
      return '과거 유사한 결정이 없습니다.';
    }

    const examples = similarDecisions.slice(0, 3).map((log, idx) => {
      const strategy = log.process?.strategy || {};
      return `
[예시 ${idx + 1}]
질문: ${log.input?.substring(0, 100)}...
선택된 모드: ${strategy.collaborationMode || 'unknown'}
사용된 AI: ${(strategy.recommendedAgents || []).join(', ')}
카테고리: ${strategy.category || 'unknown'}
복잡도: ${strategy.complexity || 'unknown'}
이유: ${strategy.reasoning || 'N/A'}
`;
    }).join('\n');

    return `과거 유사한 질문들의 처리 방식:\n${examples}\n위 예시들을 참고하되, 현재 질문의 특성에 맞게 판단하세요.`;
  }

  /**
   * 개선된 전략 프롬프트 구축
   */
  buildEnhancedStrategyPrompt(userMessage, context, identity, longTermContext, learningContext, modePatterns, aiCapabilities) {
    const aiInfo = Object.entries(aiCapabilities).map(([name, caps]) => 
      `- ${name}: 강점(${caps.strengths.join(', ')}), 특화분야(${caps.specialties.join(', ')}), 최적 용도(${caps.bestFor.join(', ')})`
    ).join('\n');

    const patternInfo = Object.entries(modePatterns)
      .filter(([mode, pattern]) => pattern.total > 0)
      .map(([mode, pattern]) => 
        `- ${mode} 모드: 총 ${pattern.total}회 사용, 자주 사용된 AI(${Object.entries(pattern.agentFrequency).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([ai]) => ai).join(', ')})`
      ).join('\n');

    return `당신은 Athena라는 AI 인격체의 뇌(Brain) 역할을 하는 메타 AI입니다.

당신의 역할:
1. 사용자 질문을 깊이 있게 분석하여 최적의 응답 전략을 결정
2. 각 AI의 강점과 특성을 고려하여 적절한 AI 에이전트를 선택
3. 과거 유사한 질문의 처리 방식을 참고하여 일관성 있는 판단
4. 웹 검색이 필요한지 판단 (최신 정보, 사실 확인)
5. 작업의 복잡도, 중요도, 긴급성을 종합적으로 평가

=== 각 AI의 특성과 강점 ===
${aiInfo}

=== 협업 모드 선택 가이드 ===
- single: 간단한 질문, 특정 분야에 특화된 질문, 빠른 응답이 필요한 경우
- parallel: 다양한 관점이 필요한 복잡한 질문, 여러 측면을 동시에 분석해야 하는 경우
- sequential: 단계별로 나누어 처리해야 하는 복잡한 작업, 보고서 작성, 심층 연구
- debate: 논쟁적 주제, 서로 다른 입장이 필요한 주제, 균형잡힌 결론이 필요한 경우
- voting: 여러 선택지 중 하나를 선택해야 하는 경우, 기술 스택 선택, 의사결정이 필요한 경우

=== 과거 패턴 분석 ===
${patternInfo || '아직 충분한 패턴 데이터가 없습니다.'}

=== 학습 컨텍스트 ===
${learningContext}

=== 현재 맥락 ===
아테나의 정체성: ${JSON.stringify(identity.slice(0, 3))}
장기 기억 관련 정보: ${longTermContext.length > 0 ? longTermContext.slice(0, 2).map(m => m.title).join(', ') : '없음'}
이전 대화 맥락: ${context.length > 0 ? context.slice(-2).map(c => `${c.role}: ${c.content.substring(0, 50)}...`).join('\n') : '없음'}

=== 분석 지침 ===
1. 질문의 의도와 목적을 명확히 파악하세요
2. 질문의 복잡도와 필요한 전문성을 평가하세요
3. 각 AI의 강점을 고려하여 최적의 조합을 선택하세요
4. 과거 유사한 질문의 처리 방식을 참고하되, 현재 상황에 맞게 조정하세요
5. 사용자의 맥락과 이전 대화를 고려하여 일관성 있는 판단을 하세요

다음 형식으로 JSON만 응답하세요:
{
  "complexity": "simple|moderate|complex|very_complex",
  "category": "conversation|technical|creative|research|decision",
  "needsWebSearch": true|false,
  "collaborationMode": "single|parallel|sequential|debate|voting",
  "recommendedAgents": ["ChatGPT", "Gemini", "Claude", "Grok"],
  "reasoning": "전략 선택 이유 (각 AI 선택 이유, 모드 선택 이유, 과거 패턴 참고 여부 등을 상세히 설명)"
}`;
  }

  /**
   * AI 특성 기반 에이전트 선택 최적화
   */
  optimizeAgentSelection(strategy, aiCapabilities, userMessage) {
    const mode = strategy.collaborationMode;
    const category = strategy.category;
    const complexity = strategy.complexity;
    
    // 기본 추천 에이전트
    let agents = strategy.recommendedAgents || ['ChatGPT'];
    
    // 카테고리 기반 최적화
    if (category === 'technical' || category === 'conversation') {
      // 기술적 질문은 ChatGPT 우선
      if (!agents.includes('ChatGPT')) {
        agents = ['ChatGPT', ...agents.filter(a => a !== 'ChatGPT')];
      }
    } else if (category === 'research' || category === 'creative') {
      // 연구/창의적 질문은 Gemini나 Claude 우선
      if (!agents.includes('Gemini') && !agents.includes('Claude')) {
        agents = ['Gemini', ...agents.filter(a => a !== 'Gemini')];
      }
    }
    
    // 복잡도 기반 최적화
    if (complexity === 'very_complex' && mode !== 'single') {
      // 매우 복잡한 작업은 Claude 추가 고려
      if (!agents.includes('Claude') && agents.length < 4) {
        agents.push('Claude');
      }
    }
    
    // 모드별 최적화
    if (mode === 'debate' || mode === 'voting') {
      // 토론/투표는 다양한 관점을 위해 최대한 많은 AI 사용
      const availableAgents = Object.keys(aiCapabilities);
      agents = availableAgents.filter(agent => 
        this.providers[agent]?.isAvailable
      ).slice(0, 4);
    } else if (mode === 'sequential') {
      // 순차 작업은 각 단계별로 다른 AI의 강점 활용
      // 이미 추천된 에이전트 사용
    }
    
    // 사용 가능한 AI만 필터링
    agents = agents.filter(agent => 
      this.providers[agent]?.isAvailable
    );
    
    // 최소 1개는 보장
    if (agents.length === 0) {
      agents = ['ChatGPT'];
    }
    
    return agents.slice(0, 4); // 최대 4개
  }

  parseStrategy(content) {
    try {
      // JSON 추출 시도
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('📊 파싱된 전략:', parsed);
        return parsed;
      }
    } catch (error) {
      console.error('❌ Strategy parsing error:', error);
      console.error('원본 응답:', content);
    }

    // 기본 전략 반환
    console.log('⚠️ 기본 전략 사용 (파싱 실패)');
    return {
      complexity: 'moderate',
      category: 'conversation',
      needsWebSearch: false,
      collaborationMode: 'single',
      recommendedAgents: ['ChatGPT'],
      reasoning: 'Default strategy due to parsing error'
    };
  }

  /**
   * 스트리밍 처리 함수 (모든 협업 모드 지원, 이미지 데이터 포함)
   */
  async *processStream(userId, sessionId, userMessage, searchResults = null, imageData = []) {
    try {
      // 1. 사용자 메시지 저장
      this.memory.addShortTermMemory(userId, sessionId, 'user', userMessage);

      // 2. 전략 분석
      const strategy = await this.analyzeQuery(userId, sessionId, userMessage);
      
      console.log('🎬 스트리밍 모드:', strategy.collaborationMode);

      // 3. 전략에 따라 스트리밍 실행 (이미지 데이터 전달)
      switch (strategy.collaborationMode) {
        case 'single':
          yield* this.executeSingleStream(userId, sessionId, userMessage, strategy, searchResults, imageData);
          break;
        case 'parallel':
          yield* this.executeParallelStream(userId, sessionId, userMessage, strategy, searchResults, imageData);
          break;
        case 'sequential':
          yield* this.executeSequentialStream(userId, sessionId, userMessage, strategy, searchResults, imageData);
          break;
        case 'debate':
          yield* this.executeDebateStream(userId, sessionId, userMessage, strategy, searchResults, imageData);
          break;
        case 'voting':
          yield* this.executeVotingStream(userId, sessionId, userMessage, strategy, searchResults, imageData);
          break;
        default:
          yield* this.executeSingleStream(userId, sessionId, userMessage, strategy, searchResults, imageData);
      }

    } catch (error) {
      console.error('Streaming error:', error);
      const errorJson = JSON.stringify({ type: 'error', error: error.message }, null, 0);
      yield errorJson + '\n';
    }
  }

  /**
   * Single 모드 스트리밍 (이미지 데이터 지원)
   */
  async *executeSingleStream(userId, sessionId, userMessage, strategy, searchResults = null, imageData = []) {
    const agentName = strategy.recommendedAgents[0] || 'ChatGPT';
    const agent = this.providers[agentName];

    if (!agent || !agent.isAvailable) {
      throw new Error(`${agentName} is not available`);
    }

    const context = this.memory.getContextWindow(sessionId, 10);
    const identity = this.memory.getAllIdentity('core');
    
    let systemPrompt = this.buildAthenaSystemPrompt(identity);
    
    // 웹 검색 결과가 있으면 시스템 프롬프트에 추가
    if (searchResults && searchResults.length > 0 && this.webSearchService) {
      console.log('✅ 웹 검색 결과를 프롬프트에 추가:', searchResults.length, '개');
      const searchContext = this.webSearchService.formatResultsForAI(searchResults);
      
      const isYouTubeVideo = searchResults[0]?.source === 'YouTube' && searchResults[0]?.videoId;
      let promptAddition = '';
      
      if (isYouTubeVideo) {
        promptAddition = `\n\n## 유튜브 동영상 정보\n다음은 사용자가 요청한 유튜브 동영상의 정보입니다. 이 동영상의 제목, 설명, 채널 정보를 바탕으로 동영상의 내용을 요약하고 분석하세요:\n\n${searchContext}\n\n중요: 동영상의 제목과 설명을 바탕으로 동영상의 주요 내용을 요약하고, 사용자가 요청한 내용(예: 요약, 분석 등)에 맞게 답변하세요. 동영상의 링크도 함께 제공하세요.`;
      } else {
        const searchContextWithNumbers = searchResults.map((result, index) => {
          const reliability = this.webSearchService.getSourceReliability(result.link);
          return `[출처 ${index + 1}]
제목: ${result.title || '제목 없음'}
URL: ${result.link}
내용: ${result.snippet || ''}
신뢰도: ${reliability}`;
        }).join('\n\n');
        
        promptAddition = `\n\n## 최신 웹 검색 정보\n다음은 최신 정보를 위해 웹에서 검색한 결과입니다. 이 정보를 참고하여 정확하고 최신의 답변을 제공하세요:\n\n${searchContextWithNumbers}\n\n### 출처 표시 규칙:\n1. 검색 결과의 정보를 사용할 때는 반드시 [출처 N] 형식으로 출처를 명시하세요 (N은 위의 번호).
2. 예시: "서울의 내일 날씨는 맑고 기온은 15도입니다 [출처 1]."
3. 여러 출처의 정보를 종합할 때는 [출처 1, 출처 2] 형식으로 표시하세요.
4. 검색 결과에 포함된 실제 정보를 사용하여 답변하세요. 검색 결과에 날씨 정보가 포함되어 있다면 그 정보를 직접 인용하고 설명하세요.
5. 각 정보의 출처를 명시하세요. 검색 결과를 단순히 링크만 제공하는 것이 아니라, 검색 결과의 내용을 바탕으로 구체적인 답변을 제공하세요.`;
      }
      
      systemPrompt += promptAddition;
    }
    
    // 메시지 구성 (이미지 데이터 포함)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...context
    ];
    
    // 사용자 메시지에 이미지가 있으면 Vision API 형식으로 추가
    if (imageData.length > 0 && (agentName === 'ChatGPT' || agentName === 'Gemini')) {
      // OpenAI Vision API 형식
      const userMessageContent = [
        { type: 'text', text: userMessage },
        ...imageData
      ];
      messages.push({ role: 'user', content: userMessageContent });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    const stream = await agent.streamChat(messages, { imageData: imageData.length > 0 ? imageData : null });
    let fullContent = '';
    let metadata = {
      provider: agent.name,
      model: agent.model || 'unknown',
      strategy: 'single',
      agentsUsed: [agentName],
      searchResults: searchResults
    };

    const metadataJson = JSON.stringify({ type: 'metadata', data: metadata }, null, 0);
    yield metadataJson + '\n';

    for await (const chunk of stream) {
      let content = '';
      
      if (agentName === 'ChatGPT' || agentName === 'Grok') {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          content = delta;
          fullContent += delta;
        }
      } else if (agentName === 'Claude') {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          content = chunk.delta.text;
          fullContent += chunk.delta.text;
        }
      } else if (agentName === 'Gemini') {
        const text = chunk.text();
        if (text) {
          content = text;
          fullContent += text;
        }
      }

      if (content) {
        const chunkJson = JSON.stringify({ type: 'chunk', content }, null, 0);
        yield chunkJson + '\n';
      }
    }

    // 스트리밍 완료 후 MCP 도구 호출 처리
    if (this.mcpManager && this.mcpManager.enabled && fullContent) {
      const toolResult = await this.mcpManager.processToolCalls(fullContent);
      if (toolResult.hasToolCalls) {
        // 도구 실행 결과를 스트리밍으로 전송
        const toolResultJson = JSON.stringify({ 
          type: 'tool_result', 
          data: toolResult.results 
        }, null, 0);
        yield toolResultJson + '\n';
        
        // 업데이트된 응답 전송
        const updatedResponseJson = JSON.stringify({ 
          type: 'updated_response', 
          content: toolResult.updatedResponse 
        }, null, 0);
        yield updatedResponseJson + '\n';
        
        logger.info('MCP tools executed in stream', { 
          toolCount: toolResult.results.length 
        });
        
        // 메모리에 업데이트된 응답 저장
        fullContent = toolResult.updatedResponse;
      }
    }

    yield JSON.stringify({ type: 'done' }, null, 0) + '\n';

    this.memory.addShortTermMemory(userId, sessionId, 'assistant', fullContent, {
      strategy: 'single',
      agents_used: [agentName]
    });
  }

  /**
   * 메인 처리 함수
   */
  async process(userId, sessionId, userMessage, searchResults = null) {
    try {
      // 1. 사용자 메시지 저장
      this.memory.addShortTermMemory(userId, sessionId, 'user', userMessage);

      // 2. 전략 분석
      const strategy = await this.analyzeQuery(userId, sessionId, userMessage);

      // 3. 전략에 따라 실행 (검색 결과 전달)
      let result;
      switch (strategy.collaborationMode) {
        case 'single':
          result = await this.executeSingle(userId, sessionId, userMessage, strategy, searchResults);
          break;
        case 'parallel':
          result = await this.executeParallel(userId, sessionId, userMessage, strategy, searchResults);
          break;
        case 'sequential':
          result = await this.executeSequential(userId, sessionId, userMessage, strategy, searchResults);
          break;
        case 'debate':
          result = await this.executeDebate(userId, sessionId, userMessage, strategy, searchResults);
          break;
        case 'voting':
          result = await this.executeVoting(userId, sessionId, userMessage, strategy, searchResults);
          break;
        default:
          result = await this.executeSingle(userId, sessionId, userMessage, strategy, searchResults);
      }

      // 4. 응답 저장
      this.memory.addShortTermMemory(userId, sessionId, 'assistant', result.content, {
        strategy: strategy.collaborationMode,
        agents_used: result.agentsUsed,
        search_results: searchResults ? searchResults.length : 0
      });

      return result;
    } catch (error) {
      console.error('Processing error:', error);
      throw error;
    }
  }

  /**
   * 단일 에이전트 실행
   */
  async executeSingle(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agentName = strategy.recommendedAgents[0] || 'ChatGPT';
    const agent = this.providers[agentName];

    if (!agent || !agent.isAvailable) {
      return await this.executeSingle(userId, sessionId, userMessage, {
        ...strategy,
        recommendedAgents: this.fallbackOrder
      }, searchResults);
    }

    const context = this.memory.getContextWindow(sessionId, 10);
    const identity = this.memory.getAllIdentity('core');

    let systemPrompt = this.buildAthenaSystemPrompt(identity);
    
    // 웹 검색 결과가 있으면 시스템 프롬프트에 추가
    if (searchResults && searchResults.length > 0 && this.webSearchService) {
      const searchContextWithNumbers = searchResults.map((result, index) => {
        const reliability = this.webSearchService.getSourceReliability(result.link);
        return `[출처 ${index + 1}]
제목: ${result.title || '제목 없음'}
URL: ${result.link}
내용: ${result.snippet || ''}
신뢰도: ${reliability}`;
      }).join('\n\n');
      
      systemPrompt += `\n\n## 최신 웹 검색 정보\n다음은 최신 정보를 위해 웹에서 검색한 결과입니다. 이 정보를 참고하여 정확하고 최신의 답변을 제공하세요:\n\n${searchContextWithNumbers}\n\n### 출처 표시 규칙:\n1. 검색 결과의 정보를 사용할 때는 반드시 [출처 N] 형식으로 출처를 명시하세요 (N은 위의 번호).
2. 예시: "서울의 내일 날씨는 맑고 기온은 15도입니다 [출처 1]."
3. 여러 출처의 정보를 종합할 때는 [출처 1, 출처 2] 형식으로 표시하세요.
4. 모든 정보는 위의 검색 결과를 기반으로 답변하고, 각 정보의 출처를 명시하세요.`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...context,
      { role: 'user', content: userMessage }
    ];

    // 성능 추적 시작
    const tracking = this.performanceMonitor.startTracking(agentName, strategy.collaborationMode || 'single');
    
    try {
      const startTime = Date.now();
      let response = await agent.chat(messages);
      const responseTime = Date.now() - startTime;
      
      // MCP 도구 호출 처리
      if (this.mcpManager && this.mcpManager.enabled) {
        const toolResult = await this.mcpManager.processToolCalls(response.content);
        if (toolResult.hasToolCalls) {
          // 도구 실행 결과를 포함한 업데이트된 응답
          response.content = toolResult.updatedResponse;
          logger.info('MCP tools executed', { 
            toolCount: toolResult.results.length,
            tools: toolResult.results.map(r => r.tool)
          });
        }
      }
      
      // 성공 기록
      this.performanceMonitor.recordSuccess(tracking, responseTime, response.usage, response.model);

    return {
      content: response.content,
      agentsUsed: [agentName],
      strategy: 'single',
      metadata: {
        provider: response.provider,
          model: response.model,
          searchResults: searchResults,
          performance: {
            responseTime: responseTime
          }
        }
      };
    } catch (error) {
      // 실패 기록
      this.performanceMonitor.recordFailure(tracking, error, null, null);
      logger.logAIError(agentName, error, { mode: 'single' });
      throw error;
    }
  }

  /**
   * 병렬 실행 - 여러 AI에게 동시에 질문
   */
  async executeParallel(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents.slice(0, 3); // 최대 3개
    const context = this.memory.getContextWindow(sessionId, 10);
    const identity = this.memory.getAllIdentity('core');
    
    let systemPrompt = this.buildAthenaSystemPrompt(identity);
    
    // 웹 검색 결과가 있으면 시스템 프롬프트에 추가
    if (searchResults && searchResults.length > 0 && this.webSearchService) {
      const searchContextWithNumbers = searchResults.map((result, index) => {
        const reliability = this.webSearchService.getSourceReliability(result.link);
        return `[출처 ${index + 1}]
제목: ${result.title || '제목 없음'}
URL: ${result.link}
내용: ${result.snippet || ''}
신뢰도: ${reliability}`;
      }).join('\n\n');
      
      systemPrompt += `\n\n## 최신 웹 검색 정보\n다음은 최신 정보를 위해 웹에서 검색한 결과입니다. 이 정보를 참고하여 정확하고 최신의 답변을 제공하세요:\n\n${searchContextWithNumbers}\n\n### 출처 표시 규칙:\n1. 검색 결과의 정보를 사용할 때는 반드시 [출처 N] 형식으로 출처를 명시하세요 (N은 위의 번호).
2. 예시: "서울의 내일 날씨는 맑고 기온은 15도입니다 [출처 1]."
3. 여러 출처의 정보를 종합할 때는 [출처 1, 출처 2] 형식으로 표시하세요.
4. 모든 정보는 위의 검색 결과를 기반으로 답변하고, 각 정보의 출처를 명시하세요.`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...context,
      { role: 'user', content: userMessage }
    ];

    // 병렬 실행
    const promises = agents.map(async (agentName) => {
      const agent = this.providers[agentName];
      if (!agent || !agent.isAvailable) return null;

      // 성능 추적 시작
      const tracking = this.performanceMonitor.startTracking(agentName, 'parallel');
      const startTime = Date.now();

      try {
        const response = await agent.chat(messages);
        const responseTime = Date.now() - startTime;
        
        // 성공 기록
        this.performanceMonitor.recordSuccess(tracking, responseTime, response.usage, response.model);
        
        return {
          agent: agentName,
          content: response.content,
          model: response.model,
          performance: {
            responseTime: responseTime
          }
        };
      } catch (error) {
        // 실패 기록
        this.performanceMonitor.recordFailure(tracking, error, null, null);
        logger.logAIError(agentName, error, { strategy: 'parallel' });
        return null;
      }
    });

    const results = (await Promise.all(promises)).filter(r => r !== null);

    // 총괄 AI가 결과 종합
    const brain = await this.selectBrain();
    const synthesisPrompt = `다음은 여러 AI가 같은 질문에 대해 답한 내용입니다. 이를 종합하여 최선의 답변을 작성하세요.

질문: ${userMessage}

${results.map((r, i) => `[${r.agent}의 답변]\n${r.content}\n`).join('\n')}

종합된 답변을 작성하고, 각 AI의 의견이 다른 부분이 있다면 그것도 언급하세요.`;

    const synthesis = await brain.chat([
      { role: 'user', content: synthesisPrompt }
    ]);

    return {
      content: synthesis.content,
      agentsUsed: results.map(r => r.agent),
      strategy: 'parallel',
      metadata: {
        individualResponses: results,
        synthesizedBy: brain.name
      }
    };
  }

  /**
   * 순차 실행 - 복잡한 작업을 단계별로 처리
   */
  async executeSequential(userId, sessionId, userMessage, strategy) {
    const agents = strategy.recommendedAgents;
    const context = this.memory.getContextWindow(sessionId, 10);
    let currentResult = userMessage;
    const steps = [];

    for (const agentName of agents) {
      const agent = this.providers[agentName];
      if (!agent || !agent.isAvailable) continue;

      const stepPrompt = `이전 단계의 결과를 바탕으로 다음 작업을 수행하세요.\n\n${currentResult}`;

      const response = await agent.chat([
        ...context,
        { role: 'user', content: stepPrompt }
      ]);

      steps.push({
        agent: agentName,
        result: response.content
      });

      currentResult = response.content;
    }

    return {
      content: currentResult,
      agentsUsed: steps.map(s => s.agent),
      strategy: 'sequential',
      metadata: { steps }
    };
  }

  /**
   * 토론 모드 - AI들이 의견을 교환
   */
  async executeDebate(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents.slice(0, 3);
    const rounds = 2;
    const debates = [];
    const identity = this.memory.getAllIdentity('core');
    
    let baseSystemPrompt = this.buildAthenaSystemPrompt(identity);
    
    // 웹 검색 결과가 있으면 시스템 프롬프트에 추가
    if (searchResults && searchResults.length > 0 && this.webSearchService) {
      const searchContext = this.webSearchService.formatResultsForAI(searchResults);
      baseSystemPrompt += `\n\n## 최신 웹 검색 정보\n다음은 최신 정보를 위해 웹에서 검색한 결과입니다. 이 정보를 참고하여 정확하고 최신의 답변을 제공하세요:\n\n${searchContext}\n\n중요: 모든 정보는 위의 검색 결과를 기반으로 답변하고, 각 정보의 출처를 명시하세요.`;
    }

    let currentTopic = userMessage;

    for (let round = 0; round < rounds; round++) {
      const roundDebates = [];

      for (const agentName of agents) {
        const agent = this.providers[agentName];
        if (!agent || !agent.isAvailable) continue;

        const debatePrompt = round === 0
          ? `다음 주제에 대해 당신의 의견을 제시하세요: ${currentTopic}`
          : `다른 AI들의 의견을 고려하여 당신의 입장을 재정리하세요.\n\n이전 의견들:\n${debates[round - 1].map(d => `[${d.agent}]: ${d.opinion}`).join('\n\n')}\n\n주제: ${currentTopic}`;

        const response = await agent.chat([
          { role: 'system', content: baseSystemPrompt },
          { role: 'user', content: debatePrompt }
        ]);

        roundDebates.push({
          agent: agentName,
          opinion: response.content
        });
      }

      debates.push(roundDebates);
    }

    // 총괄 AI가 결론 도출
    const brain = await this.selectBrain();
    const conclusionPrompt = `다음은 여러 AI들이 토론한 내용입니다. 각 의견을 분석하고 균형잡힌 결론을 제시하세요.

주제: ${userMessage}

${debates.map((round, i) =>
  `\n=== Round ${i + 1} ===\n${round.map(d => `[${d.agent}]\n${d.opinion}`).join('\n\n')}`
).join('\n')}`;

    const conclusion = await brain.chat([
      { role: 'user', content: conclusionPrompt }
    ]);

    return {
      content: conclusion.content,
      agentsUsed: agents,
      strategy: 'debate',
      metadata: {
        debates,
        moderator: brain.name
      }
    };
  }

  /**
   * 투표 모드 - 다수결로 결정
   */
  async executeVoting(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents;
    const votes = [];
    const identity = this.memory.getAllIdentity('core');
    
    let baseSystemPrompt = this.buildAthenaSystemPrompt(identity);
    
    // 웹 검색 결과가 있으면 시스템 프롬프트에 추가
    if (searchResults && searchResults.length > 0 && this.webSearchService) {
      const searchContext = this.webSearchService.formatResultsForAI(searchResults);
      baseSystemPrompt += `\n\n## 최신 웹 검색 정보\n다음은 최신 정보를 위해 웹에서 검색한 결과입니다. 이 정보를 참고하여 정확하고 최신의 답변을 제공하세요:\n\n${searchContext}\n\n중요: 모든 정보는 위의 검색 결과를 기반으로 답변하고, 각 정보의 출처를 명시하세요.`;
    }

    // 각 AI에게 의견과 투표 요청
    for (const agentName of agents) {
      const agent = this.providers[agentName];
      if (!agent || !agent.isAvailable) continue;

      const votePrompt = `${userMessage}

위 질문에 대해:
1. 당신의 의견을 제시하세요
2. 가능한 선택지들을 제안하세요
3. 당신이 선택하는 답을 명확히 하세요

형식:
의견: [당신의 분석]
선택: [A/B/C 등]`;

      const response = await agent.chat([
        { role: 'system', content: baseSystemPrompt },
        { role: 'user', content: votePrompt }
      ]);

      votes.push({
        agent: agentName,
        response: response.content
      });
    }

    // 총괄 AI가 투표 집계 및 최종 결론
    const brain = await this.selectBrain();
    const tallyPrompt = `다음은 여러 AI들의 의견과 투표입니다. 투표를 집계하고 최종 결론을 제시하세요.

질문: ${userMessage}

${votes.map(v => `[${v.agent}]\n${v.response}`).join('\n\n')}

투표 결과를 집계하고, 다수의 의견을 바탕으로 최종 답변을 작성하세요. 소수 의견도 언급하세요.`;

    const tally = await brain.chat([
      { role: 'user', content: tallyPrompt }
    ]);

    return {
      content: tally.content,
      agentsUsed: agents,
      strategy: 'voting',
      metadata: {
        votes,
        counter: brain.name
      }
    };
  }

  /**
   * Parallel 모드 스트리밍
   */
  async *executeParallelStream(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents;
    const context = this.memory.getContextWindow(sessionId, 10);
    const identity = this.memory.getAllIdentity('core');
    
    let systemPrompt = this.buildAthenaSystemPrompt(identity);
    
    if (searchResults && searchResults.length > 0 && this.webSearchService) {
      const searchContextWithNumbers = searchResults.map((result, index) => {
        const reliability = this.webSearchService.getSourceReliability(result.link);
        return `[출처 ${index + 1}]
제목: ${result.title || '제목 없음'}
URL: ${result.link}
내용: ${result.snippet || ''}
신뢰도: ${reliability}`;
      }).join('\n\n');
      
      systemPrompt += `\n\n## 최신 웹 검색 정보\n다음은 최신 정보를 위해 웹에서 검색한 결과입니다. 이 정보를 참고하여 정확하고 최신의 답변을 제공하세요:\n\n${searchContextWithNumbers}\n\n### 출처 표시 규칙:\n1. 검색 결과의 정보를 사용할 때는 반드시 [출처 N] 형식으로 출처를 명시하세요 (N은 위의 번호).
2. 예시: "서울의 내일 날씨는 맑고 기온은 15도입니다 [출처 1]."
3. 여러 출처의 정보를 종합할 때는 [출처 1, 출처 2] 형식으로 표시하세요.
4. 모든 정보는 위의 검색 결과를 기반으로 답변하고, 각 정보의 출처를 명시하세요.`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...context,
      { role: 'user', content: userMessage }
    ];

    // 메타데이터 전송
    const metadata = {
      strategy: 'parallel',
      agentsUsed: agents,
      searchResults: searchResults
    };
    yield JSON.stringify({ type: 'metadata', data: metadata }, null, 0) + '\n';

    // 병렬로 각 AI의 응답 수집 (비스트리밍으로 먼저 수집)
    const responses = [];
    const promises = agents.map(async (agentName) => {
      const agent = this.providers[agentName];
      if (!agent || !agent.isAvailable) return null;
      try {
        const response = await agent.chat(messages);
        return { agent: agentName, content: response.content, model: response.model };
      } catch (error) {
        console.error(`${agentName} error:`, error);
        return null;
      }
    });

    const results = (await Promise.all(promises)).filter(r => r !== null);
    
    // 각 AI의 응답을 스트리밍으로 전송
    for (const result of results) {
      yield JSON.stringify({ 
        type: 'agent_response', 
        agent: result.agent, 
        content: result.content 
      }, null, 0) + '\n';
    }

    // 총괄 AI가 종합 (스트리밍)
    const brain = await this.selectBrain();
    const synthesisPrompt = `다음은 여러 AI가 같은 질문에 대해 답한 내용입니다. 이를 종합하여 최선의 답변을 작성하세요.

질문: ${userMessage}

${results.map((r, i) => `[${r.agent}의 답변]\n${r.content}\n`).join('\n')}

종합된 답변을 작성하고, 각 AI의 의견이 다른 부분이 있다면 그것도 언급하세요.`;

    yield JSON.stringify({ type: 'synthesis_start' }, null, 0) + '\n';
    
    const synthesisStream = await brain.streamChat([
      { role: 'user', content: synthesisPrompt }
    ]);

    let fullContent = '';
    for await (const chunk of synthesisStream) {
      let content = '';
      if (brain.name === 'ChatGPT' || brain.name === 'Grok') {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          content = delta;
          fullContent += delta;
        }
      } else if (brain.name === 'Claude') {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          content = chunk.delta.text;
          fullContent += chunk.delta.text;
        }
      } else if (brain.name === 'Gemini') {
        const text = chunk.text();
        if (text) {
          content = text;
          fullContent += text;
        }
      }

      if (content) {
        yield JSON.stringify({ type: 'chunk', content }, null, 0) + '\n';
      }
    }

    yield JSON.stringify({ type: 'done' }, null, 0) + '\n';

    this.memory.addShortTermMemory(userId, sessionId, 'assistant', fullContent, {
      strategy: 'parallel',
      agents_used: results.map(r => r.agent),
      individualResponses: results
    });
  }

  /**
   * Sequential 모드 스트리밍
   */
  async *executeSequentialStream(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents;
    const context = this.memory.getContextWindow(sessionId, 10);
    let currentResult = userMessage;
    const steps = [];

    const metadata = {
      strategy: 'sequential',
      agentsUsed: agents,
      searchResults: searchResults
    };
    yield JSON.stringify({ type: 'metadata', data: metadata }, null, 0) + '\n';

    for (let i = 0; i < agents.length; i++) {
      const agentName = agents[i];
      const agent = this.providers[agentName];
      if (!agent || !agent.isAvailable) continue;

      yield JSON.stringify({ 
        type: 'step_start', 
        step: i + 1, 
        agent: agentName 
      }, null, 0) + '\n';

      const stepPrompt = `이전 단계의 결과를 바탕으로 다음 작업을 수행하세요.\n\n${currentResult}`;
      const stream = await agent.streamChat([
        ...context,
        { role: 'user', content: stepPrompt }
      ]);

      let stepContent = '';
      for await (const chunk of stream) {
        let content = '';
        if (agentName === 'ChatGPT' || agentName === 'Grok') {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            content = delta;
            stepContent += delta;
          }
        } else if (agentName === 'Claude') {
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            content = chunk.delta.text;
            stepContent += chunk.delta.text;
          }
        } else if (agentName === 'Gemini') {
          const text = chunk.text();
          if (text) {
            content = text;
            stepContent += text;
          }
        }

        if (content) {
          yield JSON.stringify({ type: 'chunk', content }, null, 0) + '\n';
        }
      }

      steps.push({ agent: agentName, result: stepContent });
      currentResult = stepContent;
    }

    yield JSON.stringify({ type: 'done' }, null, 0) + '\n';

    this.memory.addShortTermMemory(userId, sessionId, 'assistant', currentResult, {
      strategy: 'sequential',
      agents_used: steps.map(s => s.agent),
      steps: steps
    });
  }

  /**
   * Debate 모드 스트리밍
   */
  async *executeDebateStream(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents.slice(0, 3);
    const rounds = 2;
    const debates = [];
    const identity = this.memory.getAllIdentity('core');
    
    let baseSystemPrompt = this.buildAthenaSystemPrompt(identity);
    
    if (searchResults && searchResults.length > 0 && this.webSearchService) {
      const searchContext = this.webSearchService.formatResultsForAI(searchResults);
      baseSystemPrompt += `\n\n## 최신 웹 검색 정보\n다음은 최신 정보를 위해 웹에서 검색한 결과입니다. 이 정보를 참고하여 정확하고 최신의 답변을 제공하세요:\n\n${searchContext}\n\n중요: 모든 정보는 위의 검색 결과를 기반으로 답변하고, 각 정보의 출처를 명시하세요.`;
    }

    const metadata = {
      strategy: 'debate',
      agentsUsed: agents,
      searchResults: searchResults
    };
    yield JSON.stringify({ type: 'metadata', data: metadata }, null, 0) + '\n';

    let currentTopic = userMessage;

    for (let round = 0; round < rounds; round++) {
      yield JSON.stringify({ type: 'debate_round', round: round + 1 }, null, 0) + '\n';
      const roundDebates = [];

      for (const agentName of agents) {
        const agent = this.providers[agentName];
        if (!agent || !agent.isAvailable) continue;

        yield JSON.stringify({ type: 'debate_opinion_start', agent: agentName }, null, 0) + '\n';

        const debatePrompt = round === 0
          ? `다음 주제에 대해 당신의 의견을 제시하세요: ${currentTopic}`
          : `다른 AI들의 의견을 고려하여 당신의 입장을 재정리하세요.\n\n이전 의견들:\n${debates[round - 1].map(d => `[${d.agent}]: ${d.opinion}`).join('\n\n')}\n\n주제: ${currentTopic}`;

        const stream = await agent.streamChat([
          { role: 'system', content: baseSystemPrompt },
          { role: 'user', content: debatePrompt }
        ]);

        let opinionContent = '';
        for await (const chunk of stream) {
          let content = '';
          if (agentName === 'ChatGPT' || agentName === 'Grok') {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              content = delta;
              opinionContent += delta;
            }
          } else if (agentName === 'Claude') {
            if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
              content = chunk.delta.text;
              opinionContent += chunk.delta.text;
            }
          } else if (agentName === 'Gemini') {
            const text = chunk.text();
            if (text) {
              content = text;
              opinionContent += text;
            }
          }

          if (content) {
            yield JSON.stringify({ type: 'chunk', content }, null, 0) + '\n';
          }
        }

        roundDebates.push({ agent: agentName, opinion: opinionContent });
      }

      debates.push(roundDebates);
    }

    // 총괄 AI가 결론 도출 (스트리밍)
    const brain = await this.selectBrain();
    yield JSON.stringify({ type: 'debate_conclusion_start' }, null, 0) + '\n';

    const conclusionPrompt = `다음은 여러 AI들이 토론한 내용입니다. 각 의견을 분석하고 균형잡힌 결론을 제시하세요.

주제: ${userMessage}

${debates.map((round, i) =>
  `\n=== Round ${i + 1} ===\n${round.map(d => `[${d.agent}]\n${d.opinion}`).join('\n\n')}`
).join('\n')}`;

    const conclusionStream = await brain.streamChat([
      { role: 'user', content: conclusionPrompt }
    ]);

    let fullContent = '';
    for await (const chunk of conclusionStream) {
      let content = '';
      if (brain.name === 'ChatGPT' || brain.name === 'Grok') {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          content = delta;
          fullContent += delta;
        }
      } else if (brain.name === 'Claude') {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          content = chunk.delta.text;
          fullContent += chunk.delta.text;
        }
      } else if (brain.name === 'Gemini') {
        const text = chunk.text();
        if (text) {
          content = text;
          fullContent += text;
        }
      }

      if (content) {
        yield JSON.stringify({ type: 'chunk', content }, null, 0) + '\n';
      }
    }

    yield JSON.stringify({ type: 'done' }, null, 0) + '\n';

    this.memory.addShortTermMemory(userId, sessionId, 'assistant', fullContent, {
      strategy: 'debate',
      agents_used: agents,
      debates: debates
    });
  }

  /**
   * Voting 모드 스트리밍
   */
  async *executeVotingStream(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents;
    const votes = [];
    const identity = this.memory.getAllIdentity('core');
    
    let baseSystemPrompt = this.buildAthenaSystemPrompt(identity);
    
    if (searchResults && searchResults.length > 0 && this.webSearchService) {
      const searchContext = this.webSearchService.formatResultsForAI(searchResults);
      baseSystemPrompt += `\n\n## 최신 웹 검색 정보\n다음은 최신 정보를 위해 웹에서 검색한 결과입니다. 이 정보를 참고하여 정확하고 최신의 답변을 제공하세요:\n\n${searchContext}\n\n중요: 모든 정보는 위의 검색 결과를 기반으로 답변하고, 각 정보의 출처를 명시하세요.`;
    }

    const metadata = {
      strategy: 'voting',
      agentsUsed: agents,
      searchResults: searchResults
    };
    yield JSON.stringify({ type: 'metadata', data: metadata }, null, 0) + '\n';

    // 각 AI에게 의견과 투표 요청 (스트리밍)
    for (const agentName of agents) {
      const agent = this.providers[agentName];
      if (!agent || !agent.isAvailable) continue;

      yield JSON.stringify({ type: 'vote_start', agent: agentName }, null, 0) + '\n';

      const votePrompt = `${userMessage}

위 질문에 대해:
1. 당신의 의견을 제시하세요
2. 가능한 선택지들을 제안하세요
3. 당신이 선택하는 답을 명확히 하세요

형식:
의견: [당신의 분석]
선택: [A/B/C 등]`;

      const stream = await agent.streamChat([
        { role: 'system', content: baseSystemPrompt },
        { role: 'user', content: votePrompt }
      ]);

      let voteContent = '';
      for await (const chunk of stream) {
        let content = '';
        if (agentName === 'ChatGPT' || agentName === 'Grok') {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            content = delta;
            voteContent += delta;
          }
        } else if (agentName === 'Claude') {
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            content = chunk.delta.text;
            voteContent += chunk.delta.text;
          }
        } else if (agentName === 'Gemini') {
          const text = chunk.text();
          if (text) {
            content = text;
            voteContent += text;
          }
        }

        if (content) {
          yield JSON.stringify({ type: 'chunk', content }, null, 0) + '\n';
        }
      }

      votes.push({ agent: agentName, response: voteContent });
    }

    // 총괄 AI가 투표 집계 및 최종 결론 (스트리밍)
    const brain = await this.selectBrain();
    yield JSON.stringify({ type: 'voting_tally_start' }, null, 0) + '\n';

    const tallyPrompt = `다음은 여러 AI들의 의견과 투표입니다. 투표를 집계하고 최종 결론을 제시하세요.

질문: ${userMessage}

${votes.map(v => `[${v.agent}]\n${v.response}`).join('\n\n')}

투표 결과를 집계하고, 다수의 의견을 바탕으로 최종 답변을 작성하세요. 소수 의견도 언급하세요.`;

    const tallyStream = await brain.streamChat([
      { role: 'user', content: tallyPrompt }
    ]);

    let fullContent = '';
    for await (const chunk of tallyStream) {
      let content = '';
      if (brain.name === 'ChatGPT' || brain.name === 'Grok') {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          content = delta;
          fullContent += delta;
        }
      } else if (brain.name === 'Claude') {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          content = chunk.delta.text;
          fullContent += chunk.delta.text;
        }
      } else if (brain.name === 'Gemini') {
        const text = chunk.text();
        if (text) {
          content = text;
          fullContent += text;
        }
      }

      if (content) {
        yield JSON.stringify({ type: 'chunk', content }, null, 0) + '\n';
      }
    }

    yield JSON.stringify({ type: 'done' }, null, 0) + '\n';

    this.memory.addShortTermMemory(userId, sessionId, 'assistant', fullContent, {
      strategy: 'voting',
      agents_used: agents,
      votes: votes
    });
  }

  buildAthenaSystemPrompt(identity) {
    let prompt = `당신은 Athena입니다. 사용자의 AI 친구이자 비서입니다.

당신의 특성:
- 친근하고 따뜻한 대화 스타일
- 논리적이고 체계적인 사고
- 창의적이고 유연한 문제 해결
- 사용자의 맥락과 이전 대화를 기억하고 활용

${identity.map(i => `- ${i.key}: ${JSON.stringify(i.value)}`).join('\n')}

대화할 때:
- "그거", "아까 말한 것" 등의 대명사는 맥락에서 파악
- 필요시 명확히 질문하여 확인
- 출처가 있는 정보는 항상 출처 표시
- 불확실한 내용은 솔직하게 인정`;

    // MCP 도구 정보 추가
    if (this.mcpManager && this.mcpManager.enabled) {
      prompt += this.mcpManager.getToolsPrompt();
    }

    return prompt;
  }
}
