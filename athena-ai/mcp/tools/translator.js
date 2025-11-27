/**
 * Translator Tool - 다국어 번역 도구
 * Google Cloud Translation API 또는 무료 대안 사용
 */

import { logger } from '../../utils/logger.js';

// 지원 언어 목록
const SUPPORTED_LANGUAGES = {
  ko: '한국어',
  en: '영어',
  ja: '일본어',
  zh: '중국어 (간체)',
  'zh-TW': '중국어 (번체)',
  es: '스페인어',
  fr: '프랑스어',
  de: '독일어',
  it: '이탈리아어',
  pt: '포르투갈어',
  ru: '러시아어',
  ar: '아랍어',
  hi: '힌디어',
  th: '태국어',
  vi: '베트남어',
  id: '인도네시아어',
  nl: '네덜란드어',
  pl: '폴란드어',
  tr: '터키어',
  uk: '우크라이나어'
};

/**
 * Google Cloud Translation API를 사용한 번역
 */
async function translateWithGoogleCloud(text, targetLang, sourceLang, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2`;

  const params = new URLSearchParams({
    q: text,
    target: targetLang,
    key: apiKey,
    format: 'text'
  });

  if (sourceLang && sourceLang !== 'auto') {
    params.append('source', sourceLang);
  }

  const response = await fetch(`${url}?${params.toString()}`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Google 번역 API 오류');
  }

  const data = await response.json();
  return {
    translatedText: data.data.translations[0].translatedText,
    detectedSourceLanguage: data.data.translations[0].detectedSourceLanguage
  };
}

/**
 * 무료 번역 API (LibreTranslate 또는 MyMemory) 사용
 */
async function translateWithFreeAPI(text, targetLang, sourceLang) {
  // MyMemory API 사용 (무료, 일일 한도 있음)
  const langPair = `${sourceLang || 'auto'}|${targetLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('번역 API 요청 실패');
  }

  const data = await response.json();

  if (data.responseStatus !== 200) {
    throw new Error(data.responseDetails || '번역 실패');
  }

  return {
    translatedText: data.responseData.translatedText,
    detectedSourceLanguage: sourceLang || 'auto',
    match: data.responseData.match
  };
}

/**
 * 번역 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createTranslatorTools(options = {}) {
  const { apiKey = process.env.GOOGLE_TRANSLATE_API_KEY } = options;

  return [
    // 텍스트 번역
    {
      name: 'translate',
      description: '텍스트를 다른 언어로 번역합니다. 한국어, 영어, 일본어, 중국어 등 다양한 언어를 지원합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '번역할 텍스트'
          },
          targetLanguage: {
            type: 'string',
            description: '목표 언어 코드 (ko: 한국어, en: 영어, ja: 일본어, zh: 중국어 등)',
            enum: Object.keys(SUPPORTED_LANGUAGES)
          },
          sourceLanguage: {
            type: 'string',
            description: '원본 언어 코드 (자동 감지하려면 비워두세요)',
            enum: ['auto', ...Object.keys(SUPPORTED_LANGUAGES)]
          }
        },
        required: ['text', 'targetLanguage']
      },
      execute: async (args) => {
        const { text, targetLanguage, sourceLanguage } = args;

        if (!text || text.trim().length === 0) {
          throw new Error('번역할 텍스트를 입력해주세요.');
        }

        if (!SUPPORTED_LANGUAGES[targetLanguage]) {
          throw new Error(`지원하지 않는 목표 언어입니다: ${targetLanguage}`);
        }

        try {
          logger.info('번역 시작', { targetLanguage, sourceLanguage, textLength: text.length });

          let result;

          // Google Cloud API 키가 있으면 사용, 없으면 무료 API 사용
          if (apiKey) {
            result = await translateWithGoogleCloud(text, targetLanguage, sourceLanguage, apiKey);
          } else {
            result = await translateWithFreeAPI(text, targetLanguage, sourceLanguage);
          }

          logger.info('번역 완료', {
            targetLanguage,
            detectedSource: result.detectedSourceLanguage
          });

          return {
            success: true,
            originalText: text,
            translatedText: result.translatedText,
            sourceLanguage: result.detectedSourceLanguage || sourceLanguage || 'auto',
            targetLanguage,
            sourceLanguageName: SUPPORTED_LANGUAGES[result.detectedSourceLanguage] || '자동 감지',
            targetLanguageName: SUPPORTED_LANGUAGES[targetLanguage]
          };

        } catch (error) {
          logger.error('번역 오류', error);
          throw new Error(`번역 실패: ${error.message}`);
        }
      }
    },

    // 언어 감지
    {
      name: 'detect_language',
      description: '텍스트의 언어를 감지합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '언어를 감지할 텍스트'
          }
        },
        required: ['text']
      },
      execute: async (args) => {
        const { text } = args;

        if (!text || text.trim().length === 0) {
          throw new Error('텍스트를 입력해주세요.');
        }

        try {
          // Google Cloud API 사용
          if (apiKey) {
            const url = `https://translation.googleapis.com/language/translate/v2/detect`;
            const params = new URLSearchParams({
              q: text,
              key: apiKey
            });

            const response = await fetch(`${url}?${params.toString()}`, {
              method: 'POST'
            });

            if (!response.ok) {
              throw new Error('언어 감지 API 오류');
            }

            const data = await response.json();
            const detection = data.data.detections[0][0];

            return {
              success: true,
              language: detection.language,
              languageName: SUPPORTED_LANGUAGES[detection.language] || detection.language,
              confidence: detection.confidence,
              isReliable: detection.confidence > 0.8
            };
          }

          // 무료 API로 감지 (번역 후 감지된 언어 반환)
          const result = await translateWithFreeAPI(text.substring(0, 100), 'en', null);

          return {
            success: true,
            language: result.detectedSourceLanguage || 'unknown',
            languageName: SUPPORTED_LANGUAGES[result.detectedSourceLanguage] || '알 수 없음',
            confidence: result.match || 0,
            isReliable: (result.match || 0) > 0.8
          };

        } catch (error) {
          logger.error('언어 감지 오류', error);
          throw new Error(`언어 감지 실패: ${error.message}`);
        }
      }
    },

    // 지원 언어 목록
    {
      name: 'list_languages',
      description: '지원하는 언어 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        return {
          success: true,
          languages: Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
            code,
            name
          })),
          count: Object.keys(SUPPORTED_LANGUAGES).length
        };
      }
    },

    // 다중 언어 번역 (한 번에 여러 언어로)
    {
      name: 'translate_multi',
      description: '텍스트를 여러 언어로 동시에 번역합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '번역할 텍스트'
          },
          targetLanguages: {
            type: 'array',
            items: {
              type: 'string',
              enum: Object.keys(SUPPORTED_LANGUAGES)
            },
            description: '목표 언어 코드 배열 (예: ["en", "ja", "zh"])'
          },
          sourceLanguage: {
            type: 'string',
            description: '원본 언어 코드'
          }
        },
        required: ['text', 'targetLanguages']
      },
      execute: async (args) => {
        const { text, targetLanguages, sourceLanguage } = args;

        if (!text || text.trim().length === 0) {
          throw new Error('번역할 텍스트를 입력해주세요.');
        }

        if (!targetLanguages || targetLanguages.length === 0) {
          throw new Error('목표 언어를 하나 이상 지정해주세요.');
        }

        try {
          logger.info('다중 번역 시작', {
            targetLanguages,
            textLength: text.length
          });

          const translations = {};
          const errors = {};

          // 병렬로 번역 실행
          await Promise.all(
            targetLanguages.map(async (targetLang) => {
              try {
                let result;
                if (apiKey) {
                  result = await translateWithGoogleCloud(text, targetLang, sourceLanguage, apiKey);
                } else {
                  result = await translateWithFreeAPI(text, targetLang, sourceLanguage);
                }
                translations[targetLang] = {
                  text: result.translatedText,
                  languageName: SUPPORTED_LANGUAGES[targetLang]
                };
              } catch (error) {
                errors[targetLang] = error.message;
              }
            })
          );

          logger.info('다중 번역 완료', {
            successCount: Object.keys(translations).length,
            errorCount: Object.keys(errors).length
          });

          return {
            success: true,
            originalText: text,
            translations,
            errors: Object.keys(errors).length > 0 ? errors : undefined
          };

        } catch (error) {
          logger.error('다중 번역 오류', error);
          throw new Error(`다중 번역 실패: ${error.message}`);
        }
      }
    }
  ];
}
