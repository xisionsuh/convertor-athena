/**
 * Speech-to-Text Tool - 음성 인식
 * OpenAI Whisper API를 사용한 음성-텍스트 변환 기능
 */

import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * STT 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createSpeechToTextTools(options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    workspaceRoot = process.cwd()
  } = options;

  const getOpenAI = () => {
    if (!apiKey) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다. OPENAI_API_KEY 환경변수를 설정하세요.');
    }
    return new OpenAI({ apiKey });
  };

  // 지원되는 언어 목록
  const SUPPORTED_LANGUAGES = {
    ko: '한국어',
    en: '영어',
    ja: '일본어',
    zh: '중국어',
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
    id: '인도네시아어'
  };

  // 지원되는 오디오 형식
  const SUPPORTED_FORMATS = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'];

  return [
    // 음성을 텍스트로 변환
    {
      name: 'speech_to_text',
      description: '오디오 파일의 음성을 텍스트로 변환합니다. Whisper API를 사용하여 높은 정확도의 음성 인식을 제공합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          audioPath: {
            type: 'string',
            description: '변환할 오디오 파일 경로 (mp3, mp4, wav, m4a, webm, ogg, flac 지원)'
          },
          language: {
            type: 'string',
            enum: Object.keys(SUPPORTED_LANGUAGES),
            description: '음성 언어 코드 (ko: 한국어, en: 영어 등). 지정하지 않으면 자동 감지',
          },
          prompt: {
            type: 'string',
            description: '변환 힌트 (전문 용어, 고유명사 등을 미리 알려주면 정확도 향상)'
          },
          responseFormat: {
            type: 'string',
            enum: ['json', 'text', 'srt', 'verbose_json', 'vtt'],
            description: '응답 형식 (기본: text)',
            default: 'text'
          },
          temperature: {
            type: 'number',
            description: '변환 창의성 (0.0 ~ 1.0, 낮을수록 정확, 기본: 0)',
            default: 0,
            minimum: 0,
            maximum: 1
          }
        },
        required: ['audioPath']
      },
      execute: async (args) => {
        const {
          audioPath,
          language,
          prompt,
          responseFormat = 'text',
          temperature = 0
        } = args;

        try {
          // 파일 경로 확인
          const fullPath = path.isAbsolute(audioPath)
            ? audioPath
            : path.join(workspaceRoot, audioPath);

          if (!fs.existsSync(fullPath)) {
            throw new Error(`오디오 파일을 찾을 수 없습니다: ${fullPath}`);
          }

          // 파일 확장자 확인
          const ext = path.extname(fullPath).toLowerCase().slice(1);
          if (!SUPPORTED_FORMATS.includes(ext)) {
            throw new Error(`지원되지 않는 파일 형식입니다: ${ext}. 지원 형식: ${SUPPORTED_FORMATS.join(', ')}`);
          }

          // 파일 크기 확인 (25MB 제한)
          const stats = fs.statSync(fullPath);
          const fileSizeMB = stats.size / (1024 * 1024);
          if (fileSizeMB > 25) {
            throw new Error(`파일 크기가 25MB를 초과합니다 (${fileSizeMB.toFixed(2)}MB). 파일을 분할해주세요.`);
          }

          logger.info('STT 변환 시작', {
            audioPath: fullPath,
            language,
            fileSizeMB: fileSizeMB.toFixed(2)
          });

          const openai = getOpenAI();
          const audioFile = fs.createReadStream(fullPath);

          const transcriptionOptions = {
            file: audioFile,
            model: 'whisper-1',
            response_format: responseFormat,
            temperature
          };

          if (language) {
            transcriptionOptions.language = language;
          }
          if (prompt) {
            transcriptionOptions.prompt = prompt;
          }

          const response = await openai.audio.transcriptions.create(transcriptionOptions);

          logger.info('STT 변환 완료', {
            textLength: typeof response === 'string' ? response.length : JSON.stringify(response).length
          });

          // 응답 형식에 따라 결과 반환
          if (responseFormat === 'text') {
            return {
              success: true,
              text: response,
              language: language || 'auto-detected',
              audioFile: path.basename(fullPath),
              fileSizeMB: fileSizeMB.toFixed(2)
            };
          } else if (responseFormat === 'verbose_json') {
            return {
              success: true,
              transcription: response,
              language: response.language || language,
              duration: response.duration,
              audioFile: path.basename(fullPath)
            };
          } else {
            return {
              success: true,
              content: response,
              format: responseFormat,
              audioFile: path.basename(fullPath)
            };
          }

        } catch (error) {
          logger.error('STT 변환 오류', error);
          throw new Error(`음성 변환 실패: ${error.message}`);
        }
      }
    },

    // 음성 번역 (다른 언어 → 영어)
    {
      name: 'speech_translate',
      description: '오디오의 음성을 영어로 번역합니다. 어떤 언어의 음성이든 영어 텍스트로 변환됩니다.',
      inputSchema: {
        type: 'object',
        properties: {
          audioPath: {
            type: 'string',
            description: '번역할 오디오 파일 경로'
          },
          prompt: {
            type: 'string',
            description: '번역 힌트 (전문 용어 등)'
          },
          responseFormat: {
            type: 'string',
            enum: ['json', 'text', 'srt', 'verbose_json', 'vtt'],
            description: '응답 형식',
            default: 'text'
          }
        },
        required: ['audioPath']
      },
      execute: async (args) => {
        const {
          audioPath,
          prompt,
          responseFormat = 'text'
        } = args;

        try {
          const fullPath = path.isAbsolute(audioPath)
            ? audioPath
            : path.join(workspaceRoot, audioPath);

          if (!fs.existsSync(fullPath)) {
            throw new Error(`오디오 파일을 찾을 수 없습니다: ${fullPath}`);
          }

          const stats = fs.statSync(fullPath);
          const fileSizeMB = stats.size / (1024 * 1024);
          if (fileSizeMB > 25) {
            throw new Error(`파일 크기가 25MB를 초과합니다.`);
          }

          logger.info('음성 번역 시작', { audioPath: fullPath });

          const openai = getOpenAI();
          const audioFile = fs.createReadStream(fullPath);

          const translationOptions = {
            file: audioFile,
            model: 'whisper-1',
            response_format: responseFormat
          };

          if (prompt) {
            translationOptions.prompt = prompt;
          }

          const response = await openai.audio.translations.create(translationOptions);

          logger.info('음성 번역 완료');

          return {
            success: true,
            translatedText: response,
            targetLanguage: 'en',
            audioFile: path.basename(fullPath),
            fileSizeMB: fileSizeMB.toFixed(2)
          };

        } catch (error) {
          logger.error('음성 번역 오류', error);
          throw new Error(`음성 번역 실패: ${error.message}`);
        }
      }
    },

    // 실시간 음성 입력 (브라우저 Web Speech API 연동용)
    {
      name: 'process_voice_input',
      description: '브라우저에서 녹음된 음성 데이터를 처리합니다. Base64 인코딩된 오디오 데이터를 받아 텍스트로 변환합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          audioData: {
            type: 'string',
            description: 'Base64 인코딩된 오디오 데이터'
          },
          mimeType: {
            type: 'string',
            description: '오디오 MIME 타입 (예: audio/webm, audio/wav)',
            default: 'audio/webm'
          },
          language: {
            type: 'string',
            description: '음성 언어 코드'
          }
        },
        required: ['audioData']
      },
      execute: async (args) => {
        const {
          audioData,
          mimeType = 'audio/webm',
          language
        } = args;

        try {
          // Base64 디코딩 및 임시 파일 저장
          const buffer = Buffer.from(audioData, 'base64');
          const ext = mimeType.split('/')[1] || 'webm';
          const tempFileName = `voice_input_${Date.now()}.${ext}`;
          const tempFilePath = path.join(workspaceRoot, 'temp', tempFileName);

          // temp 디렉토리 생성
          const tempDir = path.join(workspaceRoot, 'temp');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          fs.writeFileSync(tempFilePath, buffer);

          logger.info('음성 입력 처리 시작', { tempFilePath, language });

          const openai = getOpenAI();
          const audioFile = fs.createReadStream(tempFilePath);

          const options = {
            file: audioFile,
            model: 'whisper-1',
            response_format: 'text'
          };

          if (language) {
            options.language = language;
          }

          const response = await openai.audio.transcriptions.create(options);

          // 임시 파일 삭제
          fs.unlinkSync(tempFilePath);

          logger.info('음성 입력 처리 완료', { textLength: response.length });

          return {
            success: true,
            text: response,
            language: language || 'auto-detected'
          };

        } catch (error) {
          logger.error('음성 입력 처리 오류', error);
          throw new Error(`음성 입력 처리 실패: ${error.message}`);
        }
      }
    },

    // 지원 언어 목록
    {
      name: 'list_stt_languages',
      description: '음성 인식에서 지원하는 언어 목록을 조회합니다.',
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
          supportedFormats: SUPPORTED_FORMATS,
          maxFileSizeMB: 25,
          tips: [
            'language를 지정하면 인식 정확도가 향상됩니다',
            'prompt에 전문 용어나 고유명사를 포함하면 정확도가 높아집니다',
            '25MB 초과 파일은 분할이 필요합니다',
            'verbose_json 형식을 사용하면 타임스탬프를 얻을 수 있습니다'
          ]
        };
      }
    },

    // 자막 생성 (SRT/VTT)
    {
      name: 'generate_subtitles',
      description: '오디오/비디오 파일에서 자막 파일(SRT 또는 VTT)을 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          audioPath: {
            type: 'string',
            description: '오디오/비디오 파일 경로'
          },
          language: {
            type: 'string',
            description: '음성 언어 코드'
          },
          format: {
            type: 'string',
            enum: ['srt', 'vtt'],
            description: '자막 형식 (기본: srt)',
            default: 'srt'
          },
          outputPath: {
            type: 'string',
            description: '출력 파일 경로 (기본: 원본 파일명.srt/vtt)'
          }
        },
        required: ['audioPath']
      },
      execute: async (args) => {
        const {
          audioPath,
          language,
          format = 'srt',
          outputPath
        } = args;

        try {
          const fullPath = path.isAbsolute(audioPath)
            ? audioPath
            : path.join(workspaceRoot, audioPath);

          if (!fs.existsSync(fullPath)) {
            throw new Error(`파일을 찾을 수 없습니다: ${fullPath}`);
          }

          logger.info('자막 생성 시작', { audioPath: fullPath, format });

          const openai = getOpenAI();
          const audioFile = fs.createReadStream(fullPath);

          const options = {
            file: audioFile,
            model: 'whisper-1',
            response_format: format
          };

          if (language) {
            options.language = language;
          }

          const response = await openai.audio.transcriptions.create(options);

          // 자막 파일 저장
          const baseName = path.basename(fullPath, path.extname(fullPath));
          const subtitlePath = outputPath || path.join(
            path.dirname(fullPath),
            `${baseName}.${format}`
          );

          fs.writeFileSync(subtitlePath, response);

          logger.info('자막 생성 완료', { subtitlePath });

          return {
            success: true,
            subtitlePath: path.relative(workspaceRoot, subtitlePath),
            format,
            language: language || 'auto-detected'
          };

        } catch (error) {
          logger.error('자막 생성 오류', error);
          throw new Error(`자막 생성 실패: ${error.message}`);
        }
      }
    }
  ];
}
