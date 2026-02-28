import { logger } from '../utils/logger.js';

/**
 * StrategyAnalyzer - Extracted from AthenaOrchestrator
 * Handles query analysis, strategy determination, and agent selection.
 *
 * Responsible for:
 * - Analyzing user queries and determining collaboration strategy
 * - Building learning context from past decisions
 * - Constructing enhanced strategy prompts for the Meta AI
 * - Optimizing agent selection based on AI capabilities
 * - Parsing strategy responses (with improved JSON extraction)
 */
export class StrategyAnalyzer {
  /**
   * @param {Object} options
   * @param {Object} options.providers - Map of AI provider instances (e.g. { ChatGPT, Gemini, Claude, Grok })
   * @param {Object} options.memory - MemoryManager instance
   * @param {string[]} options.fallbackOrder - Provider fallback order (e.g. ['ChatGPT', 'Gemini', 'Claude', 'Grok'])
   */
  constructor({ providers, memory, fallbackOrder }) {
    this.providers = providers;
    this.memory = memory;
    this.fallbackOrder = fallbackOrder;
    this.currentBrain = null;
  }

  /**
   * Select the brain (Meta AI) with automatic fallback on failure
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
    throw new Error('All AI providers are unavailable.');
  }

  /**
   * AI capability definitions for each provider
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
   * Analyze query and determine strategy (enhanced version)
   */
  async analyzeQuery(userId, sessionId, userMessage) {
    const brain = await this.selectBrain();

    // Get context information
    const context = this.memory.getContextWindow(sessionId, 5);
    const identity = this.memory.getAllIdentity('core');
    const longTermContext = this.memory.searchLongTermMemory(userId, userMessage.substring(0, 50));

    // 1. Analyze similar past decisions (learning-based)
    const similarDecisions = this.memory.analyzeSimilarDecisions(userId, userMessage, 5);
    const learningContext = this.buildLearningContext(similarDecisions);

    // 2. Analyze success patterns for each mode
    const modePatterns = {};
    ['single', 'parallel', 'sequential', 'debate', 'voting'].forEach(mode => {
      modePatterns[mode] = this.memory.analyzeModePatterns(userId, mode, 10);
    });

    // 3. AI capability info
    const aiCapabilities = this.getAICapabilities();

    // 4. Build enhanced strategy prompt
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

    // Parse the response to extract strategy
    const strategy = this.parseStrategy(response.content);

    // 5. Optimize recommended agents based on AI capabilities
    strategy.recommendedAgents = this.optimizeAgentSelection(
      strategy,
      aiCapabilities,
      userMessage
    );

    // Detailed log including Athena's thought process
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

    // Save decision log (including Athena's thought process)
    const decisionProcess = {
      // Athena's personality-based thought process
      athenaThought: strategy.athenaThought || '',
      athenaDecision: strategy.athenaDecision || '',
      agentInstructions: strategy.agentInstructions || '',

      // Full strategy analysis response
      fullAnalysis: response.content,

      // Parsed strategy
      strategy,

      // Learning context
      learningContext: {
        similarDecisionCount: similarDecisions.length,
        referencedDecisions: similarDecisions.slice(0, 3).map(d => ({
          question: d.input?.substring(0, 50),
          mode: d.process?.strategy?.collaborationMode,
          similarity: d.similarity
        }))
      },

      // Mode pattern analysis
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

      // Meta AI info
      metaAI: brain.name,
      timestamp: new Date().toISOString()
    };

    this.memory.logDecision(
      userId,
      sessionId,
      'athena_strategy_decision',
      userMessage,
      decisionProcess,
      JSON.stringify(strategy),
      [brain.name]
    );

    return strategy;
  }

  /**
   * Build learning context from similar past decisions
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
   * Build enhanced strategy prompt - Meta AI judges autonomously as a persona
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

    // Extract personality from identity
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
   * Optimize agent selection based on AI capabilities
   */
  optimizeAgentSelection(strategy, aiCapabilities, userMessage) {
    const mode = strategy.collaborationMode;
    const category = strategy.category;
    const complexity = strategy.complexity;

    // Default recommended agents
    let agents = strategy.recommendedAgents || ['ChatGPT'];

    // Category-based optimization
    if (category === 'technical' || category === 'conversation') {
      // Technical questions prioritize ChatGPT
      if (!agents.includes('ChatGPT')) {
        agents = ['ChatGPT', ...agents.filter(a => a !== 'ChatGPT')];
      }
    } else if (category === 'research' || category === 'creative') {
      // Research/creative questions prioritize Gemini or Claude
      if (!agents.includes('Gemini') && !agents.includes('Claude')) {
        agents = ['Gemini', ...agents.filter(a => a !== 'Gemini')];
      }
    }

    // Complexity-based optimization
    if (complexity === 'very_complex' && mode !== 'single') {
      // Very complex tasks consider adding Claude
      if (!agents.includes('Claude') && agents.length < 4) {
        agents.push('Claude');
      }
    }

    // Mode-based optimization
    if (mode === 'debate' || mode === 'voting') {
      // Debate/voting uses as many AIs as possible for diverse perspectives
      const availableAgents = Object.keys(aiCapabilities);
      agents = availableAgents.filter(agent =>
        this.providers[agent]?.isAvailable
      ).slice(0, 4);
    } else if (mode === 'sequential') {
      // Sequential tasks leverage different AI strengths per step
      // Use already recommended agents
    }

    // Filter to only available AIs
    agents = agents.filter(agent =>
      this.providers[agent]?.isAvailable
    );

    // Guarantee at least 1
    if (agents.length === 0) {
      agents = ['ChatGPT'];
    }

    return agents.slice(0, 4); // Max 4
  }

  /**
   * Parse strategy response with improved JSON extraction.
   *
   * Bug 4 fix: Instead of the greedy regex /\{[\s\S]*\}/ which could match
   * across multiple JSON objects or grab too much content, this now uses:
   * 1. Code fence match first: /```json\s*([\s\S]*?)\s*```/
   * 2. Brace-depth counter to find the first complete JSON object
   */
  parseStrategy(content) {
    try {
      // Extract Athena's thought process (text before JSON)
      let athenaThought = '';
      let athenaDecision = '';

      // Extract [my thoughts] section
      const thoughtMatch = content.match(/\[내 생각\][\s\S]*?(?=\[내 결정\]|###|```)/i) ||
                          content.match(/### 1\. \[내 생각\][\s\S]*?(?=### 2|```)/i);
      if (thoughtMatch) {
        athenaThought = thoughtMatch[0].replace(/\[내 생각\]|### 1\. \[내 생각\]/gi, '').trim();
      }

      // Extract [my decision] section
      const decisionMatch = content.match(/\[내 결정\][\s\S]*?(?=\[전략 JSON\]|###|```)/i) ||
                           content.match(/### 2\. \[내 결정\][\s\S]*?(?=### 3|```)/i);
      if (decisionMatch) {
        athenaDecision = decisionMatch[0].replace(/\[내 결정\]|### 2\. \[내 결정\]/gi, '').trim();
      }

      // JSON extraction - try code fence first, then brace-depth counting
      let jsonStr = null;

      // Attempt 1: Code fence match (most reliable when present)
      const codeFenceMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeFenceMatch) {
        jsonStr = codeFenceMatch[1];
      }

      // Attempt 2: Brace-depth counter to find the first complete JSON object
      if (!jsonStr) {
        jsonStr = this._extractFirstJsonObject(content);
      }

      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);

        // Add Athena's thought process if not in JSON
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

    // Default strategy fallback
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
   * Extract the first complete JSON object from a string using brace-depth counting.
   * This avoids the greedy regex bug where /\{[\s\S]*\}/ would match from the first
   * opening brace to the LAST closing brace, potentially spanning multiple JSON objects
   * or capturing surrounding non-JSON text.
   *
   * @param {string} text - The text to search for a JSON object
   * @returns {string|null} - The first complete JSON object string, or null if not found
   */
  _extractFirstJsonObject(text) {
    let depth = 0;
    let startIndex = -1;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Handle escape sequences inside strings
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }

      // Toggle string mode on unescaped quotes
      if (char === '"') {
        inString = !inString;
        continue;
      }

      // Only count braces outside of strings
      if (!inString) {
        if (char === '{') {
          if (depth === 0) {
            startIndex = i;
          }
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0 && startIndex !== -1) {
            // Found a complete JSON object
            return text.substring(startIndex, i + 1);
          }
        }
      }
    }

    return null;
  }
}
