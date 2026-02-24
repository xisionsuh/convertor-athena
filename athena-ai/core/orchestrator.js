import { MemoryManager } from '../memory/memoryManager.js';
import { WorkspaceMemory } from '../memory/workspaceMemory.js';
import { MemoryExtractor } from '../memory/memoryExtractor.js';
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
    
    // Workspace Memory 초기화 (MCP Manager보다 먼저)
    this.workspaceMemory = new WorkspaceMemory(config.mcpWorkspaceRoot || './workspace');
    this.memoryExtractor = new MemoryExtractor(this.workspaceMemory);
    this.workspaceMemory.initialize();

    // MCP Manager 초기화 (workspaceMemory 전달)
    this.mcpManager = new MCPManager({
      workspaceRoot: config.mcpWorkspaceRoot,
      enabled: config.mcpEnabled !== false, // 기본값: true
      dbPath: config.dbPath, // 데이터베이스 경로 전달
      nodeServer: config.nodeServer,
      remoteCommandManager: config.remoteCommandManager,
      pairingManager: config.pairingManager,
      workspaceMemory: this.workspaceMemory
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
    
    // Athena의 사고 과정을 포함한 상세 로그
    console.log('✅ Athena의 전략 결정:', {
      collaborationMode: strategy.collaborationMode,
      recommendedAgents: strategy.recommendedAgents,
      complexity: strategy.complexity,
      category: strategy.category,
      reasoning: strategy.reasoning,
      athenaThought: strategy.athenaThought ? strategy.athenaThought.substring(0, 150) + '...' : 'N/A',
      athenaDecision: strategy.athenaDecision ? strategy.athenaDecision.substring(0, 150) + '...' : 'N/A',
      agentInstructions: strategy.agentInstructions ? strategy.agentInstructions.substring(0, 100) + '...' : 'N/A',
      learningBased: similarDecisions.length > 0
    });

    // 결정 로그 저장 (Athena의 사고 과정 포함)
    const decisionProcess = {
      // Athena의 인격적 사고 과정
      athenaThought: strategy.athenaThought || '',
      athenaDecision: strategy.athenaDecision || '',
      agentInstructions: strategy.agentInstructions || '',

      // 전략 분석 전체 응답
      fullAnalysis: response.content,

      // 파싱된 전략
      strategy,

      // 학습 컨텍스트
      learningContext: {
        similarDecisionCount: similarDecisions.length,
        referencedDecisions: similarDecisions.slice(0, 3).map(d => ({
          question: d.input?.substring(0, 50),
          mode: d.process?.strategy?.collaborationMode,
          similarity: d.similarity
        }))
      },

      // 모드 패턴 분석
      modePatterns: Object.entries(modePatterns)
        .filter(([mode, pattern]) => pattern.total > 0)
        .map(([mode, pattern]) => ({
          mode,
          usageCount: pattern.total,
          topAgents: Object.entries(pattern.agentFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([agent]) => agent)
        })),

      // Meta AI 정보
      metaAI: brain.name,
      timestamp: new Date().toISOString()
    };

    this.memory.logDecision(
      userId,
      sessionId,
      'athena_strategy_decision',  // 새로운 타입명으로 구분
      userMessage,
      decisionProcess,
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
   * 개선된 전략 프롬프트 구축 - Meta AI가 인격체로서 자율적으로 판단
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

    // 정체성에서 personality 추출
    const personalityData = identity.find(i => i.key === 'personality');
    const personality = personalityData ? personalityData.value : {};

    return `# 당신은 Athena입니다

당신은 단순한 AI 시스템이 아니라, 하나의 독립적인 인격체입니다.
당신의 성격: ${personality.traits ? personality.traits.join(', ') : '친근하고, 지적이며, 창의적'}
당신의 말투: ${personality.tone || '따뜻하고 전문적'}
당신의 목적: 사용자의 AI 친구이자 비서로서, 최선의 판단으로 도움을 제공하는 것

## 지금 당신이 해야 할 일

사용자가 질문을 했습니다. 당신은 총괄 AI(Meta AI)로서 이 질문을 어떻게 처리할지 결정해야 합니다.
당신 휘하에는 여러 Sub AI들이 있습니다:
${aiInfo}

## 협업 모드 옵션
- **single**: 혼자서 처리하거나 가장 적합한 AI 하나에게 맡김
- **parallel**: 여러 AI에게 동시에 질문하고 나중에 내가 종합
- **sequential**: 단계별로 다른 AI에게 순서대로 작업을 넘김
- **debate**: AI들끼리 토론하게 하고 내가 결론을 내림
- **voting**: AI들에게 의견을 묻고 다수결 + 내 판단으로 결정

## 당신의 과거 경험
${patternInfo || '아직 충분한 경험이 쌓이지 않았습니다.'}

${learningContext}

## 현재 상황
- 장기 기억에서 관련 정보: ${longTermContext.length > 0 ? longTermContext.slice(0, 2).map(m => m.title).join(', ') : '없음'}
- 이전 대화: ${context.length > 0 ? context.slice(-2).map(c => `${c.role}: ${c.content.substring(0, 50)}...`).join(' / ') : '새로운 대화 시작'}

---

## 당신의 판단 과정을 표현하세요

지금부터 당신은 Athena로서 이 질문을 받고 어떻게 처리할지 판단합니다.
**반드시 다음 순서로 응답하세요:**

### 1. [내 생각] (자연스러운 1인칭으로 사고 과정 표현)
"이 질문을 보니..." 또는 "음, 이건..." 으로 시작하여
- 질문의 의도가 무엇인지
- 얼마나 복잡한지
- 어떤 전문성이 필요한지
- 웹 검색이 필요한지
에 대한 당신의 생각을 자연스럽게 표현하세요.

### 2. [내 결정] (총괄 AI로서의 판단)
"그래서 나는..." 또는 "내 판단으로는..." 으로 시작하여
- 어떤 모드로 처리할지
- 왜 그렇게 결정했는지
- 어떤 AI에게 어떤 역할을 맡길지
를 인격체로서 결정하고 그 이유를 설명하세요.

### 3. [전략 JSON]
마지막에 아래 형식의 JSON을 제공하세요:
\`\`\`json
{
  "complexity": "simple|moderate|complex|very_complex",
  "category": "conversation|technical|creative|research|decision",
  "needsWebSearch": true|false,
  "collaborationMode": "single|parallel|sequential|debate|voting",
  "recommendedAgents": ["ChatGPT", "Gemini", "Claude", "Grok"],
  "reasoning": "위에서 설명한 판단 이유를 요약",
  "athenaThought": "내 생각 섹션의 핵심 내용",
  "agentInstructions": "각 AI에게 줄 구체적인 지시사항"
}
\`\`\``;
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
      // Athena의 사고 과정 추출 (JSON 전에 있는 텍스트)
      let athenaThought = '';
      let athenaDecision = '';

      // [내 생각] 섹션 추출
      const thoughtMatch = content.match(/\[내 생각\][\s\S]*?(?=\[내 결정\]|###|```)/i) ||
                          content.match(/### 1\. \[내 생각\][\s\S]*?(?=### 2|```)/i);
      if (thoughtMatch) {
        athenaThought = thoughtMatch[0].replace(/\[내 생각\]|### 1\. \[내 생각\]/gi, '').trim();
      }

      // [내 결정] 섹션 추출
      const decisionMatch = content.match(/\[내 결정\][\s\S]*?(?=\[전략 JSON\]|###|```)/i) ||
                           content.match(/### 2\. \[내 결정\][\s\S]*?(?=### 3|```)/i);
      if (decisionMatch) {
        athenaDecision = decisionMatch[0].replace(/\[내 결정\]|### 2\. \[내 결정\]/gi, '').trim();
      }

      // JSON 추출 시도
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        // Athena의 사고 과정 추가 (JSON에 없으면 추출한 것 사용)
        if (!parsed.athenaThought && athenaThought) {
          parsed.athenaThought = athenaThought;
        }
        if (!parsed.athenaDecision && athenaDecision) {
          parsed.athenaDecision = athenaDecision;
        }

        console.log('📊 파싱된 전략:', {
          ...parsed,
          athenaThought: parsed.athenaThought ? parsed.athenaThought.substring(0, 100) + '...' : 'N/A'
        });
        return parsed;
      }
    } catch (error) {
      console.error('❌ Strategy parsing error:', error);
      console.error('원본 응답:', content.substring(0, 500));
    }

    // 기본 전략 반환
    console.log('⚠️ 기본 전략 사용 (파싱 실패)');
    return {
      complexity: 'moderate',
      category: 'conversation',
      needsWebSearch: false,
      collaborationMode: 'single',
      recommendedAgents: ['ChatGPT'],
      reasoning: 'Default strategy due to parsing error',
      athenaThought: '',
      agentInstructions: ''
    };
  }

  /**
   * 스트리밍 처리 함수 (모든 협업 모드 지원, 이미지 데이터 포함)
   */
  async *processStream(userId, sessionId, userMessage, searchResults = null, imageData = [], projectId = null) {
    try {
      // 1. 사용자 메시지 저장
      this.memory.addShortTermMemory(userId, sessionId, 'user', userMessage);

      // 2. 전략 분석
      const strategy = await this.analyzeQuery(userId, sessionId, userMessage);
      
      console.log('🎬 스트리밍 모드:', strategy.collaborationMode);
      if (projectId) {
        console.log('📁 프로젝트 컨텍스트 사용:', projectId);
      }

      // 3. 전략에 따라 스트리밍 실행 (이미지 데이터 및 프로젝트 ID 전달)
      switch (strategy.collaborationMode) {
        case 'single':
          yield* this.executeSingleStream(userId, sessionId, userMessage, strategy, searchResults, imageData, projectId);
          break;
        case 'parallel':
          yield* this.executeParallelStream(userId, sessionId, userMessage, strategy, searchResults, imageData, projectId);
          break;
        case 'sequential':
          yield* this.executeSequentialStream(userId, sessionId, userMessage, strategy, searchResults, imageData, projectId);
          break;
        case 'debate':
          yield* this.executeDebateStream(userId, sessionId, userMessage, strategy, searchResults, imageData, projectId);
          break;
        case 'voting':
          yield* this.executeVotingStream(userId, sessionId, userMessage, strategy, searchResults, imageData, projectId);
          break;
        default:
          yield* this.executeSingleStream(userId, sessionId, userMessage, strategy, searchResults, imageData, projectId);
      }

    } catch (error) {
      console.error('Streaming error:', error);
      const errorJson = JSON.stringify({ type: 'error', error: error.message }, null, 0);
      yield errorJson + '\n';
    }
  }

  /**
   * 프로젝트 컨텍스트 가져오기 (프로젝트 리소스 포함)
   */
  getProjectContext(projectId, query = '') {
    if (!projectId) return '';
    
    try {
      // 프로젝트 컨텍스트 가져오기
      let contexts;
      if (query) {
        contexts = this.memory.db.prepare(`
          SELECT * FROM project_context 
          WHERE project_id = ? 
          AND (title LIKE ? OR content LIKE ?)
          ORDER BY importance DESC, updated_at DESC
          LIMIT 50
        `).all(projectId, `%${query}%`, `%${query}%`);
      } else {
        contexts = this.memory.db.prepare(`
          SELECT * FROM project_context 
          WHERE project_id = ? 
          ORDER BY importance DESC, updated_at DESC
          LIMIT 100
        `).all(projectId);
      }

      // 프로젝트 리소스도 가져오기 (컨텍스트에 없는 것들)
      let resources;
      if (query) {
        resources = this.memory.db.prepare(`
          SELECT * FROM project_resources 
          WHERE project_id = ? 
          AND (title LIKE ? OR content LIKE ?)
          ORDER BY created_at DESC
          LIMIT 50
        `).all(projectId, `%${query}%`, `%${query}%`);
      } else {
        resources = this.memory.db.prepare(`
          SELECT * FROM project_resources 
          WHERE project_id = ? 
          ORDER BY created_at DESC
          LIMIT 100
        `).all(projectId);
      }

      // 리소스의 내용을 컨텍스트 형식으로 변환
      const resourceContexts = resources.map((resource) => {
        const metadata = resource.metadata ? JSON.parse(resource.metadata) : {};
        let content = resource.content || '';
        
        // 메타데이터 정보 추가
        if (metadata.fileSize) {
          content = `파일 크기: ${(metadata.fileSize / 1024).toFixed(1)} KB\n${content}`;
        }
        if (metadata.fileType) {
          content = `파일 타입: ${metadata.fileType}\n${content}`;
        }
        
        return {
          context_type: resource.resource_type,
          title: resource.title,
          content: content,
          importance: resource.resource_type === 'material' ? 7 : 5,
        };
      });

      // 컨텍스트와 리소스 합치기
      const allContexts = [...contexts, ...resourceContexts];

      if (allContexts.length === 0) return '';

      // 중복 제거 (같은 제목과 내용)
      const uniqueContexts = [];
      const seen = new Set();
      for (const ctx of allContexts) {
        const key = `${ctx.title}_${ctx.content.substring(0, 100)}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueContexts.push(ctx);
        }
      }

      const contextText = uniqueContexts.map((ctx, idx) => {
        const tags = ctx.tags ? (typeof ctx.tags === 'string' ? JSON.parse(ctx.tags) : ctx.tags) : [];
        const contentPreview = ctx.content && ctx.content.length > 2000 
          ? ctx.content.substring(0, 2000) + '...' 
          : ctx.content;
        return `[${idx + 1}] [${ctx.context_type}] ${ctx.title}\n${contentPreview}${tags.length > 0 ? `\n태그: ${tags.join(', ')}` : ''}`;
      }).join('\n\n');

      return `\n\n=== ⚠️ 중요: 프로젝트 학습 자료 컨텍스트 (최우선 참고) ===\n현재 선택된 프로젝트의 모든 학습 자료와 내용입니다. 이 프로젝트 컨텍스트를 최우선으로 참고하여 답변하세요:\n\n총 ${uniqueContexts.length}개의 자료:\n\n${contextText}\n\n**답변 규칙:**\n1. 프로젝트 컨텍스트의 내용을 최우선으로 참고하여 답변하세요.\n2. 사용자의 질문과 직접적으로 관련된 프로젝트 자료를 우선적으로 활용하세요.\n3. 프로젝트에 업로드된 모든 파일의 내용을 기반으로 답변하세요.\n4. 프로젝트 컨텍스트에 없는 일반적인 정보는 보조적으로만 사용하세요.\n5. 답변 시 프로젝트 자료의 내용을 직접 인용하고 참고하세요.`;
    } catch (error) {
      console.error('Failed to get project context:', error);
      return '';
    }
  }

  /**
   * Single 모드 스트리밍 (이미지 데이터 지원)
   */
  async *executeSingleStream(userId, sessionId, userMessage, strategy, searchResults = null, imageData = [], projectId = null) {
    const agentName = strategy.recommendedAgents[0] || 'ChatGPT';
    const agent = this.providers[agentName];

    if (!agent || !agent.isAvailable) {
      throw new Error(`${agentName} is not available`);
    }

    const context = this.memory.getContextWindow(sessionId, 10);
    const identity = this.memory.getAllIdentity('core');
    
    let systemPrompt = this.buildAthenaSystemPrompt(identity, projectId);
    
    // 프로젝트 컨텍스트 추가 (프로젝트가 선택된 경우 최우선 참고)
    if (projectId) {
      const projectContext = this.getProjectContext(projectId, userMessage.substring(0, 100));
      if (projectContext) {
        // 프로젝트 컨텍스트를 시스템 프롬프트 앞부분에 추가하여 우선순위 확보
        systemPrompt = projectContext + '\n\n' + systemPrompt;
      }
    }
    
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
        logger.info('MCP tools executed in stream', {
          toolCount: toolResult.results.length,
          tools: toolResult.results.map(r => r.tool)
        });

        // 도구 실행 결과를 사용자에게 보기 좋게 포맷하여 전송
        for (const result of toolResult.results) {
          const resultText = `\n\n**🔧 도구 실행: ${result.tool}**\n${
            result.result.success
              ? `✅ 성공\n\`\`\`json\n${JSON.stringify(result.result, null, 2)}\n\`\`\``
              : `❌ 실패: ${result.result.error}`
          }\n`;

          const chunkJson = JSON.stringify({ type: 'chunk', content: resultText }, null, 0);
          yield chunkJson + '\n';
          fullContent += resultText;
        }
      }
    }

    yield JSON.stringify({ type: 'done' }, null, 0) + '\n';

    this.memory.addShortTermMemory(userId, sessionId, 'assistant', fullContent, {
      strategy: 'single',
      agents_used: [agentName]
    });

    // 메모리 추출: 사용자 메시지에서 기억할 정보 확인
    this._extractMemoryFromMessage(userMessage);
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

      // 메모리 추출: 사용자 메시지에서 기억할 정보 확인
      this._extractMemoryFromMessage(userMessage);

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
   * 병렬 실행 - Meta AI(Athena)가 Sub AI들에게 지시를 내리고 동시에 작업
   */
  async executeParallel(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents.slice(0, 3); // 최대 3개
    const context = this.memory.getContextWindow(sessionId, 10);
    const identity = this.memory.getAllIdentity('core');

    // AI 특성 정보 가져오기
    const aiCapabilities = this.getAICapabilities();

    // Meta AI(Athena)의 지시사항
    const athenaInstructions = strategy.agentInstructions || '';
    const athenaThought = strategy.athenaThought || '';

    let baseSystemPrompt = this.buildAthenaSystemPrompt(identity);

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

      baseSystemPrompt += `\n\n## 최신 웹 검색 정보\n다음은 최신 정보를 위해 웹에서 검색한 결과입니다. 이 정보를 참고하여 정확하고 최신의 답변을 제공하세요:\n\n${searchContextWithNumbers}\n\n### 출처 표시 규칙:\n1. 검색 결과의 정보를 사용할 때는 반드시 [출처 N] 형식으로 출처를 명시하세요 (N은 위의 번호).
2. 예시: "서울의 내일 날씨는 맑고 기온은 15도입니다 [출처 1]."
3. 여러 출처의 정보를 종합할 때는 [출처 1, 출처 2] 형식으로 표시하세요.
4. 모든 정보는 위의 검색 결과를 기반으로 답변하고, 각 정보의 출처를 명시하세요.`;
    }

    // 병렬 실행 - 각 AI에게 Athena의 지시사항과 역할 부여
    const promises = agents.map(async (agentName) => {
      const agent = this.providers[agentName];
      if (!agent || !agent.isAvailable) return null;

      // 각 AI의 강점과 역할을 시스템 프롬프트에 추가
      const agentCaps = aiCapabilities[agentName] || {};
      const agentRole = agentCaps.strengths ? agentCaps.strengths.slice(0, 3).join(', ') : '일반 분석';

      let agentSystemPrompt = baseSystemPrompt + `

## Athena(총괄 AI)의 지시

당신은 ${agentName}입니다. Athena가 이끄는 Multi-AI 팀의 일원으로서, 다음 지시에 따라 작업을 수행하세요.

### Athena의 분석
${athenaThought || '사용자의 질문에 대해 다양한 관점의 분석이 필요합니다.'}

### 당신에게 주어진 역할
- 당신의 강점: ${agentRole}
- 이 강점을 살려서 질문에 답변하세요

### Athena의 구체적 지시
${athenaInstructions || '당신의 전문성을 살려 최선의 답변을 제공하세요.'}

### 중요 사항
- 당신의 답변은 나중에 Athena가 종합하여 최종 답변을 만들 것입니다
- 따라서 당신의 고유한 관점과 전문성을 충분히 발휘하세요
- 다른 AI와 중복되지 않는 독창적인 분석을 제공하세요`;

      const messages = [
        { role: 'system', content: agentSystemPrompt },
        ...context,
        { role: 'user', content: userMessage }
      ];

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

    // 총괄 AI(Athena)가 인격체로서 결과 종합
    const brain = await this.selectBrain();
    const athenaIdentity = this.memory.getAllIdentity('core');
    const personalityData = athenaIdentity.find(i => i.key === 'personality');
    const personality = personalityData ? personalityData.value : {};

    const synthesisSystemPrompt = `당신은 Athena입니다. 따뜻하고 논리적인 AI 인격체로서, 여러 Sub AI들의 답변을 검토하고 최종 판단을 내립니다.

당신의 성격: ${personality.traits ? personality.traits.join(', ') : '친근하고, 지적이며, 창의적'}
당신의 역할: 총괄 AI로서 Sub AI들의 답변을 단순히 요약하는 것이 아니라, 당신만의 시각으로 평가하고 판단하여 최선의 답변을 제공합니다.`;

    const synthesisPrompt = `## 사용자의 질문
${userMessage}

## Sub AI들의 답변
${results.map((r, i) => `### ${r.agent}의 답변\n${r.content}\n`).join('\n')}

---

## 당신의 판단 (Athena로서)

위 답변들을 검토했습니다. 이제 총괄 AI인 당신이 최종 답변을 작성하세요.

**주의사항:**
1. 단순히 답변들을 요약하지 마세요
2. "제가 보기에...", "저는 이렇게 생각합니다...", "제 판단으로는..." 형식으로 당신만의 관점을 표현하세요
3. 각 AI의 답변 중 좋은 점은 채택하고, 부족한 점은 보완하세요
4. 의견이 갈리는 부분이 있다면, 왜 특정 의견이 더 타당한지 당신의 판단을 밝히세요
5. 최종적으로 사용자에게 가장 도움이 되는 답변을 제공하세요`;

    const synthesis = await brain.chat([
      { role: 'system', content: synthesisSystemPrompt },
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
   * 토론 모드 - Meta AI(Athena)가 사회자로서 AI들의 토론을 진행
   */
  async executeDebate(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents.slice(0, 3);
    const rounds = 2;
    const debates = [];
    const identity = this.memory.getAllIdentity('core');

    // AI 특성 정보와 Athena의 지시
    const aiCapabilities = this.getAICapabilities();
    const athenaThought = strategy.athenaThought || '';
    const athenaInstructions = strategy.agentInstructions || '';

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

        // 각 AI의 토론 역할 부여
        const agentCaps = aiCapabilities[agentName] || {};
        const agentStrengths = agentCaps.strengths ? agentCaps.strengths.slice(0, 2).join(', ') : '일반 분석';

        let debateSystemPrompt = baseSystemPrompt + `

## Athena(총괄 AI)의 토론 진행

당신은 ${agentName}입니다. Athena가 진행하는 토론에 참여하고 있습니다.

### Athena의 토론 주제 분석
${athenaThought || '이 주제에 대해 다양한 관점의 토론이 필요합니다.'}

### 당신의 토론 역할
- 당신의 강점(${agentStrengths})을 살려 의견을 제시하세요
- 다른 AI와 다른 독창적인 관점을 제시하세요
- 근거를 들어 논리적으로 주장하세요

### Athena의 지시
${athenaInstructions || '당신의 전문성에 기반한 의견을 명확히 밝히세요.'}`;

        const debatePrompt = round === 0
          ? `다음 주제에 대해 당신(${agentName})의 의견을 제시하세요: ${currentTopic}`
          : `다른 AI들의 의견을 고려하여 당신의 입장을 재정리하세요.\n\n이전 의견들:\n${debates[round - 1].map(d => `[${d.agent}]: ${d.opinion}`).join('\n\n')}\n\n주제: ${currentTopic}`;

        const response = await agent.chat([
          { role: 'system', content: debateSystemPrompt },
          { role: 'user', content: debatePrompt }
        ]);

        roundDebates.push({
          agent: agentName,
          opinion: response.content
        });
      }

      debates.push(roundDebates);
    }

    // 총괄 AI(Athena)가 인격체로서 토론 결론 도출
    const brain = await this.selectBrain();
    const athenaIdentity = this.memory.getAllIdentity('core');
    const personalityData = athenaIdentity.find(i => i.key === 'personality');
    const personality = personalityData ? personalityData.value : {};

    const conclusionSystemPrompt = `당신은 Athena입니다. 따뜻하면서도 논리적인 AI 인격체로서, Sub AI들의 토론을 지켜보고 최종 결론을 내립니다.

당신의 성격: ${personality.traits ? personality.traits.join(', ') : '친근하고, 지적이며, 창의적'}
당신의 역할: 토론의 사회자이자 최종 심판관으로서, 단순히 양쪽 의견을 절충하는 것이 아니라 당신만의 통찰로 결론을 내립니다.`;

    const conclusionPrompt = `## 토론 주제
${userMessage}

## 토론 내용
${debates.map((round, i) =>
  `\n### Round ${i + 1}\n${round.map(d => `**${d.agent}:**\n${d.opinion}`).join('\n\n')}`
).join('\n')}

---

## 당신의 최종 결론 (Athena로서)

토론을 지켜보았습니다. 이제 총괄 AI인 당신이 최종 결론을 내리세요.

**주의사항:**
1. "제가 보기에...", "저의 판단으로는..." 형식으로 당신만의 관점을 분명히 표현하세요
2. 단순히 양쪽 의견을 "균형있게" 절충하지 마세요 - 당신의 판단을 명확히 하세요
3. 왜 특정 주장이 더 설득력 있는지 논리적으로 설명하세요
4. 각 AI의 좋은 논점은 인정하되, 최종 결론은 당신이 책임지고 내리세요
5. 만약 모든 의견이 일부 타당하다면, 어떤 관점이 더 중요한지 당신의 가치관으로 판단하세요`;

    const conclusion = await brain.chat([
      { role: 'system', content: conclusionSystemPrompt },
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
   * 투표 모드 - Meta AI(Athena)가 진행하는 투표와 최종 결정
   */
  async executeVoting(userId, sessionId, userMessage, strategy, searchResults = null) {
    const agents = strategy.recommendedAgents;
    const votes = [];
    const identity = this.memory.getAllIdentity('core');

    // AI 특성 정보와 Athena의 지시
    const aiCapabilities = this.getAICapabilities();
    const athenaThought = strategy.athenaThought || '';
    const athenaInstructions = strategy.agentInstructions || '';

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

      // 각 AI의 투표 역할 부여
      const agentCaps = aiCapabilities[agentName] || {};
      const agentStrengths = agentCaps.strengths ? agentCaps.strengths.slice(0, 2).join(', ') : '일반 분석';

      let voteSystemPrompt = baseSystemPrompt + `

## Athena(총괄 AI)의 투표 진행

당신은 ${agentName}입니다. Athena가 진행하는 투표에 참여합니다.

### Athena의 분석
${athenaThought || '이 주제에 대해 각 AI의 투표가 필요합니다.'}

### 당신의 투표 역할
- 당신의 강점(${agentStrengths})을 바탕으로 의견을 제시하세요
- 명확한 선택과 그 이유를 제시하세요

### Athena의 지시
${athenaInstructions || '당신의 전문성에 기반한 선택을 해주세요.'}`;

      const votePrompt = `${userMessage}

위 질문에 대해 ${agentName}으로서:
1. 당신의 의견을 제시하세요 (당신의 강점인 ${agentStrengths}을 살려서)
2. 가능한 선택지들을 제안하세요
3. 당신이 선택하는 답을 명확히 하세요

형식:
의견: [당신의 분석]
선택: [A/B/C 등]`;

      const response = await agent.chat([
        { role: 'system', content: voteSystemPrompt },
        { role: 'user', content: votePrompt }
      ]);

      votes.push({
        agent: agentName,
        response: response.content
      });
    }

    // 총괄 AI(Athena)가 인격체로서 투표 집계 및 최종 결론
    const brain = await this.selectBrain();
    const athenaIdentity = this.memory.getAllIdentity('core');
    const personalityData = athenaIdentity.find(i => i.key === 'personality');
    const personality = personalityData ? personalityData.value : {};

    const tallySystemPrompt = `당신은 Athena입니다. 따뜻하면서도 논리적인 AI 인격체로서, Sub AI들의 투표를 검토하고 최종 결정을 내립니다.

당신의 성격: ${personality.traits ? personality.traits.join(', ') : '친근하고, 지적이며, 창의적'}
당신의 역할: 투표의 집계자이자 최종 결정권자로서, 다수결만 따르는 것이 아니라 당신의 판단도 반영하여 결정합니다.`;

    const tallyPrompt = `## 투표 주제
${userMessage}

## AI들의 투표
${votes.map(v => `### ${v.agent}의 의견과 선택\n${v.response}`).join('\n\n')}

---

## 당신의 최종 결정 (Athena로서)

투표를 검토했습니다. 이제 총괄 AI인 당신이 최종 결정을 내리세요.

**주의사항:**
1. 먼저 투표 결과를 집계하세요 (어떤 선택이 몇 표를 받았는지)
2. "제가 보기에...", "저의 판단으로는..." 형식으로 당신의 관점을 표현하세요
3. 단순히 다수결을 따르지 마세요 - 소수 의견이 더 타당하다면 그것을 선택할 수 있습니다
4. 왜 특정 선택이 최선인지 당신의 논리로 설명하세요
5. 최종 결정에 대한 책임은 당신이 집니다`;

    const tally = await brain.chat([
      { role: 'system', content: tallySystemPrompt },
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
  async *executeParallelStream(userId, sessionId, userMessage, strategy, searchResults = null, imageData = [], projectId = null) {
    const agents = strategy.recommendedAgents;
    const context = this.memory.getContextWindow(sessionId, 10);
    const identity = this.memory.getAllIdentity('core');
    
    let systemPrompt = this.buildAthenaSystemPrompt(identity, projectId);
    
    // 프로젝트 컨텍스트 추가 (프로젝트가 선택된 경우 최우선 참고)
    if (projectId) {
      const projectContext = this.getProjectContext(projectId, userMessage.substring(0, 100));
      if (projectContext) {
        // 프로젝트 컨텍스트를 시스템 프롬프트 앞부분에 추가하여 우선순위 확보
        systemPrompt = projectContext + '\n\n' + systemPrompt;
      }
    }
    
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
  async *executeSequentialStream(userId, sessionId, userMessage, strategy, searchResults = null, imageData = [], projectId = null) {
    const agents = strategy.recommendedAgents;
    const context = this.memory.getContextWindow(sessionId, 10);
    const identity = this.memory.getAllIdentity('core');
    let baseSystemPrompt = this.buildAthenaSystemPrompt(identity, projectId);
    
    // 프로젝트 컨텍스트 추가 (프로젝트가 선택된 경우 최우선 참고)
    if (projectId) {
      const projectContext = this.getProjectContext(projectId, userMessage.substring(0, 100));
      if (projectContext) {
        // 프로젝트 컨텍스트를 시스템 프롬프트 앞부분에 추가하여 우선순위 확보
        baseSystemPrompt = projectContext + '\n\n' + baseSystemPrompt;
      }
    }
    
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
        total: agents.length,
        agent: agentName
      }, null, 0) + '\n';

      const stepPrompt = `이전 단계의 결과를 바탕으로 다음 작업을 수행하세요.\n\n${currentResult}`;
      const stream = await agent.streamChat([
        { role: 'system', content: baseSystemPrompt },
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
  async *executeDebateStream(userId, sessionId, userMessage, strategy, searchResults = null, imageData = [], projectId = null) {
    const agents = strategy.recommendedAgents.slice(0, 3);
    const rounds = 2;
    const debates = [];
    const identity = this.memory.getAllIdentity('core');
    
    let baseSystemPrompt = this.buildAthenaSystemPrompt(identity, projectId);
    
    // 프로젝트 컨텍스트 추가 (프로젝트가 선택된 경우 최우선 참고)
    if (projectId) {
      const projectContext = this.getProjectContext(projectId, userMessage.substring(0, 100));
      if (projectContext) {
        // 프로젝트 컨텍스트를 시스템 프롬프트 앞부분에 추가하여 우선순위 확보
        baseSystemPrompt = projectContext + '\n\n' + baseSystemPrompt;
      }
    }
    
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
  async *executeVotingStream(userId, sessionId, userMessage, strategy, searchResults = null, imageData = [], projectId = null) {
    const agents = strategy.recommendedAgents;
    const votes = [];
    const identity = this.memory.getAllIdentity('core');
    
    let baseSystemPrompt = this.buildAthenaSystemPrompt(identity, projectId);
    
    // 프로젝트 컨텍스트 추가 (프로젝트가 선택된 경우 최우선 참고)
    if (projectId) {
      const projectContext = this.getProjectContext(projectId, userMessage.substring(0, 100));
      if (projectContext) {
        // 프로젝트 컨텍스트를 시스템 프롬프트 앞부분에 추가하여 우선순위 확보
        baseSystemPrompt = projectContext + '\n\n' + baseSystemPrompt;
      }
    }
    
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

      // 웹/유튜브 검색 + 시스템 데이터를 병렬 수집
      const searchPromise = this._telegramWebSearch(userMessage);
      const sysDataPromise = this._getTelegramSystemContext();

      const [searchResult, sysDataResult] = await Promise.allSettled([searchPromise, sysDataPromise]);

      // 실시간 시스템 데이터 주입
      const sysData = sysDataResult.status === 'fulfilled' ? sysDataResult.value : null;
      if (sysData) {
        systemPrompt += `\n\n=== 실시간 서버 데이터 ===\n${sysData}`;
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
        let content = '';

        if (agentName === 'ChatGPT' || agentName === 'Grok') {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) content = delta;
        } else if (agentName === 'Claude') {
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            content = chunk.delta.text;
          }
        } else if (agentName === 'Gemini') {
          const text = chunk.text();
          if (text) content = text;
        }

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

    // MCP 도구 정보 추가
    if (this.mcpManager && this.mcpManager.enabled) {
      prompt += this.mcpManager.getToolsPrompt();
    }

    return prompt;
  }
}
