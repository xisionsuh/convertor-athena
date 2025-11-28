/**
 * AI Feedback Learning Tools
 * 사용자 피드백을 수집하고 AI 응답 품질 개선에 활용하는 MCP 도구
 */

import { logger } from '../../utils/logger.js';

/**
 * AI 피드백 학습 도구 생성
 * @param {Object} options - 옵션
 * @param {string} options.dbPath - 데이터베이스 경로
 * @returns {Array<Object>} MCP 도구 배열
 */
export function createFeedbackLearningTools(options = {}) {
  const { dbPath } = options;

  // 피드백 데이터 저장소 (실제로는 DB 사용)
  const feedbackStore = {
    feedback: [],
    improvements: [],
    patterns: new Map()
  };

  return [
    {
      name: 'submit_feedback',
      description: 'AI 응답에 대한 사용자 피드백 제출 (좋아요/싫어요/댓글)',
      inputSchema: {
        type: 'object',
        properties: {
          message_id: {
            type: 'string',
            description: '피드백 대상 메시지 ID'
          },
          conversation_id: {
            type: 'string',
            description: '대화 ID'
          },
          rating: {
            type: 'string',
            enum: ['positive', 'negative', 'neutral'],
            description: '평가 (positive: 좋음, negative: 나쁨, neutral: 중립)'
          },
          feedback_type: {
            type: 'string',
            enum: ['accuracy', 'helpfulness', 'clarity', 'completeness', 'tone', 'other'],
            description: '피드백 유형'
          },
          comment: {
            type: 'string',
            description: '추가 코멘트 (선택)'
          },
          expected_response: {
            type: 'string',
            description: '기대했던 응답 (선택, 개선을 위한 참고)'
          },
          context: {
            type: 'object',
            description: '추가 컨텍스트 정보',
            properties: {
              model: { type: 'string' },
              prompt: { type: 'string' },
              response: { type: 'string' },
              temperature: { type: 'number' }
            }
          }
        },
        required: ['message_id', 'rating']
      },
      execute: async (args) => {
        try {
          const feedback = {
            id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            message_id: args.message_id,
            conversation_id: args.conversation_id,
            rating: args.rating,
            feedback_type: args.feedback_type || 'other',
            comment: args.comment,
            expected_response: args.expected_response,
            context: args.context,
            created_at: new Date().toISOString(),
            processed: false
          };

          feedbackStore.feedback.push(feedback);

          // 패턴 분석 업데이트
          if (args.context?.prompt) {
            updatePatterns(feedbackStore.patterns, feedback);
          }

          logger.info('Feedback submitted', { feedbackId: feedback.id, rating: args.rating });

          return {
            success: true,
            feedback_id: feedback.id,
            message: '피드백이 성공적으로 제출되었습니다. 서비스 개선에 활용됩니다.'
          };
        } catch (error) {
          logger.error('Failed to submit feedback', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'get_feedback_stats',
      description: '피드백 통계 조회',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: '시작 날짜 (ISO 형식)'
          },
          end_date: {
            type: 'string',
            description: '종료 날짜 (ISO 형식)'
          },
          group_by: {
            type: 'string',
            enum: ['day', 'week', 'month', 'feedback_type', 'model'],
            description: '그룹화 기준'
          }
        }
      },
      execute: async (args) => {
        try {
          let filteredFeedback = [...feedbackStore.feedback];

          // 날짜 필터
          if (args.start_date) {
            filteredFeedback = filteredFeedback.filter(
              f => new Date(f.created_at) >= new Date(args.start_date)
            );
          }
          if (args.end_date) {
            filteredFeedback = filteredFeedback.filter(
              f => new Date(f.created_at) <= new Date(args.end_date)
            );
          }

          // 통계 계산
          const stats = {
            total: filteredFeedback.length,
            positive: filteredFeedback.filter(f => f.rating === 'positive').length,
            negative: filteredFeedback.filter(f => f.rating === 'negative').length,
            neutral: filteredFeedback.filter(f => f.rating === 'neutral').length,
            by_type: {},
            satisfaction_rate: 0,
            trends: []
          };

          // 유형별 통계
          filteredFeedback.forEach(f => {
            if (!stats.by_type[f.feedback_type]) {
              stats.by_type[f.feedback_type] = { positive: 0, negative: 0, neutral: 0 };
            }
            stats.by_type[f.feedback_type][f.rating]++;
          });

          // 만족도 계산
          if (stats.total > 0) {
            stats.satisfaction_rate = Math.round(
              (stats.positive / (stats.positive + stats.negative)) * 100
            ) || 0;
          }

          // 트렌드 분석 (최근 7일)
          const last7Days = [];
          for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const dayFeedback = filteredFeedback.filter(
              f => f.created_at.startsWith(dateStr)
            );

            last7Days.push({
              date: dateStr,
              total: dayFeedback.length,
              positive: dayFeedback.filter(f => f.rating === 'positive').length,
              negative: dayFeedback.filter(f => f.rating === 'negative').length
            });
          }
          stats.trends = last7Days;

          return { success: true, stats };
        } catch (error) {
          logger.error('Failed to get feedback stats', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'analyze_feedback_patterns',
      description: '피드백 패턴 분석 및 개선 제안',
      inputSchema: {
        type: 'object',
        properties: {
          min_occurrences: {
            type: 'number',
            description: '최소 발생 횟수 (기본: 3)'
          },
          include_examples: {
            type: 'boolean',
            description: '예시 포함 여부 (기본: true)'
          }
        }
      },
      execute: async (args) => {
        try {
          const minOccurrences = args.min_occurrences || 3;
          const includeExamples = args.include_examples !== false;

          const patterns = [];
          const negativeKeywords = new Map();
          const problemAreas = new Map();

          // 부정적 피드백 분석
          const negativeFeedback = feedbackStore.feedback.filter(f => f.rating === 'negative');

          negativeFeedback.forEach(f => {
            // 키워드 추출 (간단한 분석)
            if (f.comment) {
              const words = f.comment.toLowerCase().split(/\s+/);
              words.forEach(word => {
                if (word.length > 2) {
                  negativeKeywords.set(word, (negativeKeywords.get(word) || 0) + 1);
                }
              });
            }

            // 문제 영역 집계
            const area = f.feedback_type || 'other';
            if (!problemAreas.has(area)) {
              problemAreas.set(area, { count: 0, examples: [] });
            }
            const areaData = problemAreas.get(area);
            areaData.count++;
            if (includeExamples && areaData.examples.length < 3) {
              areaData.examples.push({
                prompt: f.context?.prompt?.substring(0, 100),
                response: f.context?.response?.substring(0, 100),
                comment: f.comment
              });
            }
          });

          // 패턴 식별
          const sortedAreas = [...problemAreas.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .filter(([_, data]) => data.count >= minOccurrences);

          sortedAreas.forEach(([area, data]) => {
            patterns.push({
              area,
              occurrences: data.count,
              percentage: Math.round((data.count / negativeFeedback.length) * 100),
              examples: includeExamples ? data.examples : undefined,
              suggestion: getImprovementSuggestion(area)
            });
          });

          // 자주 언급되는 키워드
          const frequentKeywords = [...negativeKeywords.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => ({ word, count }));

          return {
            success: true,
            analysis: {
              total_negative_feedback: negativeFeedback.length,
              patterns,
              frequent_keywords: frequentKeywords,
              overall_insights: generateInsights(patterns, frequentKeywords)
            }
          };
        } catch (error) {
          logger.error('Failed to analyze feedback patterns', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'get_improvement_suggestions',
      description: 'AI 응답 개선 제안 조회',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['accuracy', 'helpfulness', 'clarity', 'completeness', 'tone', 'all'],
            description: '개선 카테고리 (기본: all)'
          },
          limit: {
            type: 'number',
            description: '최대 결과 수 (기본: 10)'
          }
        }
      },
      execute: async (args) => {
        try {
          const category = args.category || 'all';
          const limit = args.limit || 10;

          let suggestions = [...feedbackStore.improvements];

          if (category !== 'all') {
            suggestions = suggestions.filter(s => s.category === category);
          }

          // 우선순위 정렬 (영향도 * 빈도)
          suggestions.sort((a, b) =>
            (b.impact * b.frequency) - (a.impact * a.frequency)
          );

          suggestions = suggestions.slice(0, limit);

          // 각 카테고리별 기본 제안 추가
          if (suggestions.length === 0) {
            suggestions = getDefaultSuggestions(category);
          }

          return {
            success: true,
            suggestions,
            summary: {
              total_suggestions: suggestions.length,
              categories: [...new Set(suggestions.map(s => s.category))],
              highest_priority: suggestions[0]?.title || 'N/A'
            }
          };
        } catch (error) {
          logger.error('Failed to get improvement suggestions', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'create_improvement_rule',
      description: 'AI 응답 개선 규칙 생성',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '규칙 이름'
          },
          description: {
            type: 'string',
            description: '규칙 설명'
          },
          trigger_pattern: {
            type: 'string',
            description: '트리거 패턴 (정규식 또는 키워드)'
          },
          improvement_action: {
            type: 'string',
            description: '개선 액션 설명'
          },
          priority: {
            type: 'number',
            description: '우선순위 (1-10, 높을수록 우선)'
          },
          enabled: {
            type: 'boolean',
            description: '활성화 여부 (기본: true)'
          }
        },
        required: ['name', 'trigger_pattern', 'improvement_action']
      },
      execute: async (args) => {
        try {
          const rule = {
            id: `rule_${Date.now()}`,
            name: args.name,
            description: args.description,
            trigger_pattern: args.trigger_pattern,
            improvement_action: args.improvement_action,
            priority: args.priority || 5,
            enabled: args.enabled !== false,
            created_at: new Date().toISOString(),
            applied_count: 0
          };

          // 규칙 저장
          if (!feedbackStore.rules) {
            feedbackStore.rules = [];
          }
          feedbackStore.rules.push(rule);

          logger.info('Improvement rule created', { ruleId: rule.id });

          return {
            success: true,
            rule,
            message: '개선 규칙이 생성되었습니다.'
          };
        } catch (error) {
          logger.error('Failed to create improvement rule', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'get_learning_context',
      description: '특정 프롬프트에 대한 학습된 컨텍스트 조회',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '분석할 프롬프트'
          },
          include_similar: {
            type: 'boolean',
            description: '유사 프롬프트 포함 여부'
          }
        },
        required: ['prompt']
      },
      execute: async (args) => {
        try {
          const prompt = args.prompt.toLowerCase();
          const context = {
            applicable_rules: [],
            learned_preferences: [],
            similar_feedback: [],
            recommended_improvements: []
          };

          // 적용 가능한 규칙 찾기
          if (feedbackStore.rules) {
            feedbackStore.rules
              .filter(r => r.enabled)
              .forEach(rule => {
                try {
                  const regex = new RegExp(rule.trigger_pattern, 'i');
                  if (regex.test(prompt)) {
                    context.applicable_rules.push({
                      name: rule.name,
                      action: rule.improvement_action,
                      priority: rule.priority
                    });
                  }
                } catch (e) {
                  // 정규식 오류 무시
                  if (prompt.includes(rule.trigger_pattern.toLowerCase())) {
                    context.applicable_rules.push({
                      name: rule.name,
                      action: rule.improvement_action,
                      priority: rule.priority
                    });
                  }
                }
              });
          }

          // 유사 피드백 검색
          if (args.include_similar) {
            const similarFeedback = feedbackStore.feedback
              .filter(f => f.context?.prompt)
              .map(f => ({
                ...f,
                similarity: calculateSimilarity(prompt, f.context.prompt.toLowerCase())
              }))
              .filter(f => f.similarity > 0.3)
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, 5);

            context.similar_feedback = similarFeedback.map(f => ({
              rating: f.rating,
              feedback_type: f.feedback_type,
              comment: f.comment,
              similarity: Math.round(f.similarity * 100) + '%'
            }));

            // 유사 피드백 기반 추천
            const negativeCount = similarFeedback.filter(f => f.rating === 'negative').length;
            if (negativeCount > similarFeedback.length / 2) {
              context.recommended_improvements.push({
                type: 'caution',
                message: '유사한 프롬프트에서 부정적 피드백이 많습니다.',
                suggestion: '응답의 정확성과 명확성에 특별히 주의하세요.'
              });
            }
          }

          // 학습된 선호도
          context.learned_preferences = getLearnedPreferences(feedbackStore.feedback);

          return { success: true, context };
        } catch (error) {
          logger.error('Failed to get learning context', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'export_feedback_data',
      description: '피드백 데이터 내보내기 (분석 및 학습용)',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['json', 'csv', 'jsonl'],
            description: '내보내기 형식'
          },
          include_context: {
            type: 'boolean',
            description: '컨텍스트 포함 여부'
          },
          anonymize: {
            type: 'boolean',
            description: '익명화 여부 (기본: true)'
          }
        }
      },
      execute: async (args) => {
        try {
          const format = args.format || 'json';
          const includeContext = args.include_context !== false;
          const anonymize = args.anonymize !== false;

          let data = feedbackStore.feedback.map(f => {
            const item = {
              id: anonymize ? hashId(f.id) : f.id,
              rating: f.rating,
              feedback_type: f.feedback_type,
              comment: f.comment,
              created_at: f.created_at
            };

            if (includeContext && f.context) {
              item.context = {
                model: f.context.model,
                prompt_length: f.context.prompt?.length,
                response_length: f.context.response?.length
              };

              if (!anonymize) {
                item.context.prompt = f.context.prompt;
                item.context.response = f.context.response;
              }
            }

            return item;
          });

          let output;
          let contentType;

          switch (format) {
            case 'csv':
              output = convertToCsv(data);
              contentType = 'text/csv';
              break;
            case 'jsonl':
              output = data.map(d => JSON.stringify(d)).join('\n');
              contentType = 'application/jsonl';
              break;
            default:
              output = JSON.stringify(data, null, 2);
              contentType = 'application/json';
          }

          return {
            success: true,
            format,
            record_count: data.length,
            content: output,
            content_type: contentType
          };
        } catch (error) {
          logger.error('Failed to export feedback data', error);
          return { success: false, error: error.message };
        }
      }
    },

    {
      name: 'train_improvement_model',
      description: '피드백 데이터를 기반으로 개선 모델 학습 시뮬레이션',
      inputSchema: {
        type: 'object',
        properties: {
          model_type: {
            type: 'string',
            enum: ['classifier', 'ranker', 'generator'],
            description: '학습 모델 유형'
          },
          training_config: {
            type: 'object',
            description: '학습 설정',
            properties: {
              epochs: { type: 'number' },
              batch_size: { type: 'number' },
              learning_rate: { type: 'number' }
            }
          }
        }
      },
      execute: async (args) => {
        try {
          const modelType = args.model_type || 'classifier';
          const config = args.training_config || {
            epochs: 10,
            batch_size: 32,
            learning_rate: 0.001
          };

          // 학습 데이터 준비
          const trainingData = feedbackStore.feedback.filter(
            f => f.context?.prompt && f.context?.response
          );

          if (trainingData.length < 10) {
            return {
              success: false,
              error: '학습 데이터가 충분하지 않습니다. (최소 10개 필요)',
              current_count: trainingData.length
            };
          }

          // 학습 시뮬레이션
          const trainingResult = {
            model_type: modelType,
            config,
            training_samples: trainingData.length,
            start_time: new Date().toISOString(),
            metrics: {
              accuracy: 0.85 + Math.random() * 0.1,
              precision: 0.82 + Math.random() * 0.1,
              recall: 0.80 + Math.random() * 0.1,
              f1_score: 0.81 + Math.random() * 0.1
            },
            insights: [
              '정확성(accuracy) 관련 피드백이 가장 많은 학습 영향을 미쳤습니다.',
              '짧은 응답보다 긴 응답에서 부정적 피드백 비율이 높습니다.',
              '코드 관련 질문에서 명확성 개선이 필요합니다.'
            ],
            model_id: `model_${modelType}_${Date.now()}`,
            status: 'completed'
          };

          logger.info('Model training completed', { modelId: trainingResult.model_id });

          return { success: true, training_result: trainingResult };
        } catch (error) {
          logger.error('Failed to train improvement model', error);
          return { success: false, error: error.message };
        }
      }
    }
  ];
}

// 헬퍼 함수들

function updatePatterns(patterns, feedback) {
  const key = feedback.feedback_type;
  if (!patterns.has(key)) {
    patterns.set(key, { positive: 0, negative: 0, neutral: 0 });
  }
  patterns.get(key)[feedback.rating]++;
}

function getImprovementSuggestion(area) {
  const suggestions = {
    accuracy: '정보의 정확성을 높이기 위해 최신 데이터를 참조하고, 불확실한 경우 명시적으로 표시하세요.',
    helpfulness: '사용자의 실제 목표를 파악하고, 단계별 실행 가능한 조언을 제공하세요.',
    clarity: '복잡한 개념은 간단한 예시와 함께 설명하고, 전문 용어 사용을 최소화하세요.',
    completeness: '관련된 모든 측면을 다루되, 핵심 정보를 먼저 제시하세요.',
    tone: '사용자의 상황에 공감하며, 친근하지만 전문적인 톤을 유지하세요.',
    other: '사용자 피드백을 면밀히 검토하고, 반복되는 패턴을 식별하세요.'
  };
  return suggestions[area] || suggestions.other;
}

function generateInsights(patterns, keywords) {
  const insights = [];

  if (patterns.length > 0) {
    const topPattern = patterns[0];
    insights.push(`가장 많은 부정적 피드백을 받는 영역은 '${topPattern.area}'입니다 (${topPattern.percentage}%).`);
  }

  if (keywords.length > 0) {
    const topKeywords = keywords.slice(0, 3).map(k => k.word).join(', ');
    insights.push(`자주 언급되는 키워드: ${topKeywords}`);
  }

  if (patterns.some(p => p.area === 'accuracy')) {
    insights.push('정확성 관련 피드백이 있습니다. 사실 확인 프로세스를 강화하세요.');
  }

  return insights;
}

function getDefaultSuggestions(category) {
  const defaults = {
    accuracy: [
      {
        title: '사실 확인 강화',
        description: '응답 전 정보의 정확성을 검증하세요.',
        category: 'accuracy',
        impact: 9,
        frequency: 10
      }
    ],
    helpfulness: [
      {
        title: '실행 가능한 조언 제공',
        description: '추상적인 조언보다 구체적인 단계를 제시하세요.',
        category: 'helpfulness',
        impact: 8,
        frequency: 8
      }
    ],
    clarity: [
      {
        title: '구조화된 응답',
        description: '긴 응답은 섹션으로 나누어 가독성을 높이세요.',
        category: 'clarity',
        impact: 7,
        frequency: 9
      }
    ],
    completeness: [
      {
        title: '맥락 고려',
        description: '질문의 배경과 의도를 파악하여 포괄적으로 답변하세요.',
        category: 'completeness',
        impact: 8,
        frequency: 7
      }
    ],
    tone: [
      {
        title: '공감적 소통',
        description: '사용자의 상황을 이해하고 적절한 톤으로 응답하세요.',
        category: 'tone',
        impact: 6,
        frequency: 5
      }
    ]
  };

  if (category === 'all') {
    return Object.values(defaults).flat();
  }

  return defaults[category] || [];
}

function calculateSimilarity(str1, str2) {
  // 간단한 자카드 유사도
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return union > 0 ? intersection / union : 0;
}

function getLearnedPreferences(feedback) {
  const positiveFeedback = feedback.filter(f => f.rating === 'positive');
  const preferences = [];

  // 긍정적 피드백에서 패턴 추출
  const patterns = {
    detailed: 0,
    concise: 0,
    examples: 0,
    technical: 0,
    simple: 0
  };

  positiveFeedback.forEach(f => {
    if (f.context?.response) {
      const len = f.context.response.length;
      if (len > 500) patterns.detailed++;
      else patterns.concise++;

      if (f.context.response.includes('예시') || f.context.response.includes('example')) {
        patterns.examples++;
      }
      if (f.context.response.includes('```')) {
        patterns.technical++;
      }
    }
  });

  const total = positiveFeedback.length || 1;

  if (patterns.detailed / total > 0.6) {
    preferences.push({ type: 'detail_level', value: 'detailed', confidence: patterns.detailed / total });
  } else if (patterns.concise / total > 0.6) {
    preferences.push({ type: 'detail_level', value: 'concise', confidence: patterns.concise / total });
  }

  if (patterns.examples / total > 0.5) {
    preferences.push({ type: 'include_examples', value: true, confidence: patterns.examples / total });
  }

  return preferences;
}

function hashId(id) {
  // 간단한 해시 (실제로는 더 강력한 해시 사용)
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'anon_' + Math.abs(hash).toString(36);
}

function convertToCsv(data) {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(item =>
    headers.map(h => {
      const val = item[h];
      if (typeof val === 'object') return JSON.stringify(val);
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return val;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
