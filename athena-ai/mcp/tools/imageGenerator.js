/**
 * Image Generator Tool - AI 이미지 생성
 * OpenAI DALL-E API를 사용한 이미지 생성 기능
 */

import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * 이미지 생성 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createImageGeneratorTools(options = {}) {
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

  return [
    // 이미지 생성
    {
      name: 'generate_image',
      description: 'DALL-E를 사용하여 텍스트 프롬프트로 이미지를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '생성할 이미지를 설명하는 텍스트 프롬프트 (영어 권장, 상세할수록 좋음)'
          },
          size: {
            type: 'string',
            enum: ['1024x1024', '1792x1024', '1024x1792'],
            description: '이미지 크기 (기본: 1024x1024, 가로형: 1792x1024, 세로형: 1024x1792)',
            default: '1024x1024'
          },
          quality: {
            type: 'string',
            enum: ['standard', 'hd'],
            description: '이미지 품질 (standard: 빠름, hd: 고품질)',
            default: 'standard'
          },
          style: {
            type: 'string',
            enum: ['vivid', 'natural'],
            description: '이미지 스타일 (vivid: 생동감, natural: 자연스러움)',
            default: 'vivid'
          },
          n: {
            type: 'number',
            description: '생성할 이미지 수 (1-4)',
            default: 1,
            minimum: 1,
            maximum: 4
          }
        },
        required: ['prompt']
      },
      execute: async (args) => {
        const {
          prompt,
          size = '1024x1024',
          quality = 'standard',
          style = 'vivid',
          n = 1
        } = args;

        try {
          logger.info('이미지 생성 시작', { prompt: prompt.substring(0, 100), size, quality });

          const openai = getOpenAI();

          const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt,
            size,
            quality,
            style,
            n: Math.min(n, 1), // DALL-E 3는 n=1만 지원
            response_format: 'url'
          });

          const images = response.data.map((img, index) => ({
            index: index + 1,
            url: img.url,
            revisedPrompt: img.revised_prompt
          }));

          logger.info('이미지 생성 완료', { count: images.length });

          return {
            success: true,
            images,
            originalPrompt: prompt,
            model: 'dall-e-3',
            size,
            quality,
            style
          };

        } catch (error) {
          logger.error('이미지 생성 오류', error);

          if (error.code === 'content_policy_violation') {
            throw new Error('콘텐츠 정책 위반: 요청한 이미지를 생성할 수 없습니다. 프롬프트를 수정해주세요.');
          }

          throw new Error(`이미지 생성 실패: ${error.message}`);
        }
      }
    },

    // 이미지 변형 (DALL-E 2)
    {
      name: 'create_image_variation',
      description: '기존 이미지를 기반으로 변형된 이미지를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          imagePath: {
            type: 'string',
            description: '변형할 원본 이미지 파일 경로 (PNG, 정사각형, 4MB 이하)'
          },
          imageUrl: {
            type: 'string',
            description: '변형할 원본 이미지 URL'
          },
          n: {
            type: 'number',
            description: '생성할 변형 이미지 수 (1-4)',
            default: 1
          },
          size: {
            type: 'string',
            enum: ['256x256', '512x512', '1024x1024'],
            description: '이미지 크기',
            default: '1024x1024'
          }
        }
      },
      execute: async (args) => {
        const { imagePath, imageUrl, n = 1, size = '1024x1024' } = args;

        try {
          logger.info('이미지 변형 시작', { size, n });

          const openai = getOpenAI();

          let imageFile;
          if (imagePath) {
            const fullPath = path.isAbsolute(imagePath)
              ? imagePath
              : path.join(workspaceRoot, imagePath);

            if (!fs.existsSync(fullPath)) {
              throw new Error(`이미지 파일을 찾을 수 없습니다: ${fullPath}`);
            }
            imageFile = fs.createReadStream(fullPath);
          } else if (imageUrl) {
            // URL에서 이미지 다운로드
            const response = await fetch(imageUrl);
            const buffer = await response.arrayBuffer();
            const tempPath = path.join(workspaceRoot, 'temp_variation.png');
            fs.writeFileSync(tempPath, Buffer.from(buffer));
            imageFile = fs.createReadStream(tempPath);
          } else {
            throw new Error('이미지 경로 또는 URL을 제공해야 합니다.');
          }

          const response = await openai.images.createVariation({
            model: 'dall-e-2',
            image: imageFile,
            n: Math.min(n, 4),
            size,
            response_format: 'url'
          });

          const variations = response.data.map((img, index) => ({
            index: index + 1,
            url: img.url
          }));

          logger.info('이미지 변형 완료', { count: variations.length });

          return {
            success: true,
            variations,
            model: 'dall-e-2',
            size
          };

        } catch (error) {
          logger.error('이미지 변형 오류', error);
          throw new Error(`이미지 변형 실패: ${error.message}`);
        }
      }
    },

    // 프롬프트 개선 도우미
    {
      name: 'improve_image_prompt',
      description: '이미지 생성을 위한 프롬프트를 개선합니다. 한국어를 영어로 번역하고 상세하게 만듭니다.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '개선할 프롬프트 (한국어 또는 영어)'
          },
          style: {
            type: 'string',
            description: '원하는 이미지 스타일 (예: 사실적, 애니메이션, 수채화, 유화, 3D 렌더링 등)'
          },
          mood: {
            type: 'string',
            description: '원하는 분위기 (예: 밝은, 어두운, 신비로운, 평화로운 등)'
          }
        },
        required: ['prompt']
      },
      execute: async (args) => {
        const { prompt, style, mood } = args;

        try {
          const openai = getOpenAI();

          const systemPrompt = `You are an expert at creating detailed image generation prompts for DALL-E.
Your task is to take a simple prompt and expand it into a detailed, effective prompt.

Guidelines:
1. Translate Korean to English if needed
2. Add specific visual details (lighting, composition, colors)
3. Include artistic style if specified
4. Add mood/atmosphere details
5. Keep the prompt under 1000 characters
6. Be specific but avoid overly complex descriptions

Return ONLY the improved prompt, nothing else.`;

          const userMessage = `Original prompt: ${prompt}
${style ? `Desired style: ${style}` : ''}
${mood ? `Desired mood: ${mood}` : ''}

Please create an improved, detailed prompt for DALL-E image generation.`;

          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            max_tokens: 500,
            temperature: 0.7
          });

          const improvedPrompt = response.choices[0].message.content.trim();

          logger.info('프롬프트 개선 완료');

          return {
            success: true,
            originalPrompt: prompt,
            improvedPrompt,
            style: style || 'not specified',
            mood: mood || 'not specified',
            tips: [
              '영어 프롬프트가 더 좋은 결과를 생성합니다',
              '구체적인 설명일수록 원하는 이미지에 가깝습니다',
              '아티스트 스타일 참조 가능 (예: in the style of Studio Ghibli)',
              '조명, 카메라 앵글, 색상 톤을 명시하면 좋습니다'
            ]
          };

        } catch (error) {
          logger.error('프롬프트 개선 오류', error);
          throw new Error(`프롬프트 개선 실패: ${error.message}`);
        }
      }
    }
  ];
}
