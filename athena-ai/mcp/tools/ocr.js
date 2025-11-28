/**
 * OCR Tool - 이미지에서 텍스트 추출
 * Tesseract.js를 사용한 OCR 기능
 */

import { createWorker } from 'tesseract.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * OCR 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Object} MCP Tool 객체
 */
export function createOCRTool(options = {}) {
  const { workspaceRoot = process.cwd() } = options;

  return {
    name: 'ocr',
    description: '이미지에서 텍스트를 추출합니다. 스캔 문서, 스크린샷, 사진 등에서 텍스트를 인식할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: {
          type: 'string',
          description: '텍스트를 추출할 이미지 파일 경로 (상대 경로 또는 절대 경로)'
        },
        imageUrl: {
          type: 'string',
          description: '텍스트를 추출할 이미지 URL'
        },
        imageBase64: {
          type: 'string',
          description: 'Base64로 인코딩된 이미지 데이터'
        },
        language: {
          type: 'string',
          description: '인식할 언어 (kor: 한국어, eng: 영어, kor+eng: 한국어+영어, jpn: 일본어, chi_sim: 중국어 간체)',
          default: 'kor+eng'
        }
      },
      oneOf: [
        { required: ['imagePath'] },
        { required: ['imageUrl'] },
        { required: ['imageBase64'] }
      ]
    },
    execute: async (args) => {
      const { imagePath, imageUrl, imageBase64, language = 'kor+eng' } = args;

      try {
        logger.info('OCR 실행 시작', { language });

        // 이미지 소스 결정
        let imageSource;
        if (imagePath) {
          const fullPath = path.isAbsolute(imagePath)
            ? imagePath
            : path.join(workspaceRoot, imagePath);

          if (!fs.existsSync(fullPath)) {
            throw new Error(`이미지 파일을 찾을 수 없습니다: ${fullPath}`);
          }
          imageSource = fullPath;
        } else if (imageUrl) {
          imageSource = imageUrl;
        } else if (imageBase64) {
          // Base64 데이터 처리
          const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
          imageSource = Buffer.from(base64Data, 'base64');
        } else {
          throw new Error('이미지 경로, URL, 또는 Base64 데이터 중 하나를 제공해야 합니다.');
        }

        // Tesseract 워커 생성 및 실행
        const worker = await createWorker(language);

        const { data } = await worker.recognize(imageSource);

        await worker.terminate();

        logger.info('OCR 완료', {
          textLength: data.text.length,
          confidence: data.confidence
        });

        return {
          text: data.text.trim(),
          confidence: data.confidence,
          words: data.words?.length || 0,
          lines: data.lines?.length || 0,
          paragraphs: data.paragraphs?.length || 0,
          language: language
        };

      } catch (error) {
        logger.error('OCR 실행 오류', error);
        throw new Error(`OCR 처리 중 오류가 발생했습니다: ${error.message}`);
      }
    }
  };
}
