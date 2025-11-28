/**
 * Text-to-Speech Tool - 음성 합성
 * OpenAI TTS API를 사용한 텍스트 음성 변환 기능
 */

import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * TTS 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createTextToSpeechTools(options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    workspaceRoot = process.cwd(),
    outputDir = 'audio-output'
  } = options;

  // 출력 디렉토리 생성
  const fullOutputDir = path.join(workspaceRoot, outputDir);
  if (!fs.existsSync(fullOutputDir)) {
    fs.mkdirSync(fullOutputDir, { recursive: true });
  }

  const getOpenAI = () => {
    if (!apiKey) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다. OPENAI_API_KEY 환경변수를 설정하세요.');
    }
    return new OpenAI({ apiKey });
  };

  // 음성 프로필 정의
  const VOICE_PROFILES = {
    alloy: { name: 'Alloy', description: '중성적, 균형잡힌 톤', gender: 'neutral', best_for: '일반 나레이션' },
    echo: { name: 'Echo', description: '남성적, 깊은 톤', gender: 'male', best_for: '다큐멘터리, 뉴스' },
    fable: { name: 'Fable', description: '영국식, 표현력 풍부', gender: 'neutral', best_for: '스토리텔링' },
    onyx: { name: 'Onyx', description: '남성적, 권위있는 톤', gender: 'male', best_for: '비즈니스, 프레젠테이션' },
    nova: { name: 'Nova', description: '여성적, 따뜻한 톤', gender: 'female', best_for: '친근한 안내, 교육' },
    shimmer: { name: 'Shimmer', description: '여성적, 밝은 톤', gender: 'female', best_for: '광고, 엔터테인먼트' }
  };

  return [
    // 텍스트를 음성으로 변환
    {
      name: 'text_to_speech',
      description: '텍스트를 자연스러운 음성으로 변환합니다. 다양한 목소리와 속도를 지원합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '음성으로 변환할 텍스트 (최대 4096자)'
          },
          voice: {
            type: 'string',
            enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
            description: '음성 선택 (alloy: 중성, echo/onyx: 남성, nova/shimmer: 여성, fable: 영국식)',
            default: 'nova'
          },
          model: {
            type: 'string',
            enum: ['tts-1', 'tts-1-hd'],
            description: '모델 선택 (tts-1: 빠름, tts-1-hd: 고품질)',
            default: 'tts-1'
          },
          speed: {
            type: 'number',
            description: '재생 속도 (0.25 ~ 4.0, 기본: 1.0)',
            default: 1.0,
            minimum: 0.25,
            maximum: 4.0
          },
          outputFormat: {
            type: 'string',
            enum: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
            description: '출력 오디오 포맷',
            default: 'mp3'
          },
          filename: {
            type: 'string',
            description: '출력 파일명 (확장자 제외, 기본: 자동 생성)'
          }
        },
        required: ['text']
      },
      execute: async (args) => {
        const {
          text,
          voice = 'nova',
          model = 'tts-1',
          speed = 1.0,
          outputFormat = 'mp3',
          filename
        } = args;

        if (!text || text.trim().length === 0) {
          throw new Error('텍스트를 입력해주세요.');
        }

        if (text.length > 4096) {
          throw new Error('텍스트가 너무 깁니다. 최대 4096자까지 가능합니다.');
        }

        try {
          logger.info('TTS 변환 시작', {
            textLength: text.length,
            voice,
            model,
            speed
          });

          const openai = getOpenAI();

          const response = await openai.audio.speech.create({
            model,
            voice,
            input: text,
            speed,
            response_format: outputFormat
          });

          // 파일로 저장
          const outputFilename = filename || `tts_${Date.now()}`;
          const outputPath = path.join(fullOutputDir, `${outputFilename}.${outputFormat}`);

          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(outputPath, buffer);

          // 상대 경로로 반환
          const relativePath = path.relative(workspaceRoot, outputPath);

          logger.info('TTS 변환 완료', {
            outputPath: relativePath,
            fileSize: buffer.length
          });

          return {
            success: true,
            filePath: relativePath,
            absolutePath: outputPath,
            format: outputFormat,
            voice: VOICE_PROFILES[voice],
            model,
            speed,
            textLength: text.length,
            fileSizeKB: Math.round(buffer.length / 1024)
          };

        } catch (error) {
          logger.error('TTS 변환 오류', error);
          throw new Error(`음성 변환 실패: ${error.message}`);
        }
      }
    },

    // 긴 텍스트를 여러 파트로 나눠서 변환
    {
      name: 'text_to_speech_long',
      description: '긴 텍스트를 여러 오디오 파일로 나눠서 변환합니다. 4096자 이상의 텍스트에 사용합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '음성으로 변환할 긴 텍스트'
          },
          voice: {
            type: 'string',
            enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
            description: '음성 선택',
            default: 'nova'
          },
          model: {
            type: 'string',
            enum: ['tts-1', 'tts-1-hd'],
            description: '모델 선택',
            default: 'tts-1'
          },
          speed: {
            type: 'number',
            description: '재생 속도',
            default: 1.0
          },
          baseFilename: {
            type: 'string',
            description: '기본 파일명 (파트 번호가 자동 추가됨)'
          }
        },
        required: ['text']
      },
      execute: async (args) => {
        const {
          text,
          voice = 'nova',
          model = 'tts-1',
          speed = 1.0,
          baseFilename
        } = args;

        if (!text || text.trim().length === 0) {
          throw new Error('텍스트를 입력해주세요.');
        }

        try {
          const openai = getOpenAI();

          // 텍스트를 4000자 단위로 분할 (여유를 두고)
          const chunkSize = 4000;
          const chunks = [];

          // 문장 단위로 자르기
          let currentChunk = '';
          const sentences = text.split(/(?<=[.!?。！？])\s*/);

          for (const sentence of sentences) {
            if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
              chunks.push(currentChunk.trim());
              currentChunk = sentence;
            } else {
              currentChunk += (currentChunk ? ' ' : '') + sentence;
            }
          }

          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }

          logger.info('긴 텍스트 TTS 변환 시작', {
            totalLength: text.length,
            chunks: chunks.length
          });

          const results = [];
          const baseName = baseFilename || `tts_long_${Date.now()}`;

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const partFilename = `${baseName}_part${String(i + 1).padStart(2, '0')}`;

            const response = await openai.audio.speech.create({
              model,
              voice,
              input: chunk,
              speed,
              response_format: 'mp3'
            });

            const outputPath = path.join(fullOutputDir, `${partFilename}.mp3`);
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(outputPath, buffer);

            results.push({
              part: i + 1,
              filePath: path.relative(workspaceRoot, outputPath),
              textLength: chunk.length,
              fileSizeKB: Math.round(buffer.length / 1024)
            });
          }

          logger.info('긴 텍스트 TTS 변환 완료', { totalParts: results.length });

          return {
            success: true,
            totalParts: results.length,
            totalTextLength: text.length,
            voice: VOICE_PROFILES[voice],
            model,
            speed,
            parts: results
          };

        } catch (error) {
          logger.error('긴 텍스트 TTS 변환 오류', error);
          throw new Error(`음성 변환 실패: ${error.message}`);
        }
      }
    },

    // 음성 목록 조회
    {
      name: 'list_voices',
      description: '사용 가능한 TTS 음성 목록과 특성을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        return {
          success: true,
          voices: Object.entries(VOICE_PROFILES).map(([id, profile]) => ({
            id,
            ...profile
          })),
          models: [
            { id: 'tts-1', description: '표준 모델 - 빠른 응답, 일반 품질' },
            { id: 'tts-1-hd', description: 'HD 모델 - 고품질 음성, 더 자연스러움' }
          ],
          formats: [
            { id: 'mp3', description: '가장 일반적, 좋은 압축률' },
            { id: 'opus', description: '스트리밍 최적화, 낮은 지연' },
            { id: 'aac', description: 'Apple 기기 호환' },
            { id: 'flac', description: '무손실, 큰 파일 크기' },
            { id: 'wav', description: '무압축, 가장 큰 파일' },
            { id: 'pcm', description: '원시 오디오 데이터' }
          ],
          tips: [
            '한국어 텍스트도 지원됩니다',
            'nova와 shimmer는 여성 음성, echo와 onyx는 남성 음성입니다',
            '속도는 0.25(매우 느림)부터 4.0(매우 빠름)까지 조절 가능합니다',
            'tts-1-hd는 더 자연스럽지만 생성 시간이 더 걸립니다'
          ]
        };
      }
    },

    // 발음 테스트 (짧은 샘플 생성)
    {
      name: 'voice_sample',
      description: '각 음성의 짧은 샘플을 생성하여 비교할 수 있게 합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          sampleText: {
            type: 'string',
            description: '샘플 텍스트 (기본: 한국어+영어 혼합 문장)',
            default: '안녕하세요, 저는 Athena AI 어시스턴트입니다. Hello, I am your AI assistant.'
          },
          voices: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
            },
            description: '샘플을 생성할 음성 목록 (기본: 전체)'
          }
        }
      },
      execute: async (args) => {
        const {
          sampleText = '안녕하세요, 저는 Athena AI 어시스턴트입니다. Hello, I am your AI assistant.',
          voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
        } = args;

        try {
          const openai = getOpenAI();

          logger.info('음성 샘플 생성 시작', { voices });

          const samples = [];
          const timestamp = Date.now();

          for (const voice of voices) {
            const response = await openai.audio.speech.create({
              model: 'tts-1',
              voice,
              input: sampleText,
              speed: 1.0,
              response_format: 'mp3'
            });

            const filename = `voice_sample_${voice}_${timestamp}.mp3`;
            const outputPath = path.join(fullOutputDir, filename);
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(outputPath, buffer);

            samples.push({
              voice,
              profile: VOICE_PROFILES[voice],
              filePath: path.relative(workspaceRoot, outputPath),
              fileSizeKB: Math.round(buffer.length / 1024)
            });
          }

          logger.info('음성 샘플 생성 완료', { count: samples.length });

          return {
            success: true,
            sampleText,
            samples
          };

        } catch (error) {
          logger.error('음성 샘플 생성 오류', error);
          throw new Error(`샘플 생성 실패: ${error.message}`);
        }
      }
    }
  ];
}
