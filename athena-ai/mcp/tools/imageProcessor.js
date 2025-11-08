/**
 * 이미지 처리 도구
 * 이미지 리사이즈, 포맷 변환, 메타데이터 추출 등의 기능을 제공하는 MCP 도구
 */

import { logger } from '../../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 이미지 처리 도구 생성 함수
 */
export function createImageProcessorTool(options = {}) {
  const workspaceRoot = options.workspaceRoot || path.join(__dirname, '../../../workspace');

  return {
    name: 'process_image',
    description: '이미지를 처리합니다. 리사이즈, 포맷 변환, 메타데이터 추출 등의 기능을 지원합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: {
          type: 'string',
          description: '처리할 이미지 파일 경로'
        },
        operation: {
          type: 'string',
          enum: ['resize', 'convert', 'metadata', 'crop', 'rotate', 'grayscale', 'blur'],
          description: '수행할 작업 유형'
        },
        width: {
          type: 'number',
          description: '리사이즈할 너비 (픽셀)'
        },
        height: {
          type: 'number',
          description: '리사이즈할 높이 (픽셀)'
        },
        format: {
          type: 'string',
          enum: ['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif'],
          description: '변환할 이미지 포맷'
        },
        quality: {
          type: 'number',
          description: '이미지 품질 (1-100, JPEG/WebP용)',
          minimum: 1,
          maximum: 100
        },
        output_path: {
          type: 'string',
          description: '출력 파일 경로 (지정하지 않으면 원본 파일명에 _processed 추가)'
        },
        x: {
          type: 'number',
          description: '크롭 시작 X 좌표'
        },
        y: {
          type: 'number',
          description: '크롭 시작 Y 좌표'
        },
        angle: {
          type: 'number',
          description: '회전 각도 (도)'
        },
        blur_sigma: {
          type: 'number',
          description: '블러 강도 (0.3-1000)'
        }
      },
      required: ['image_path', 'operation']
    },
    execute: async (args) => {
      const {
        image_path,
        operation,
        width,
        height,
        format,
        quality,
        output_path,
        x,
        y,
        angle,
        blur_sigma
      } = args;

      try {
        // Sharp 라이브러리 동적 import
        let sharp;
        try {
          sharp = (await import('sharp')).default;
        } catch (error) {
          return {
            success: false,
            error: 'Sharp library not available',
            message: '이미지 처리 기능을 사용하려면 sharp 패키지가 필요합니다. npm install sharp를 실행하세요.'
          };
        }

        // 이미지 경로 해결
        const resolvedInputPath = path.resolve(workspaceRoot, image_path);
        const workspacePath = path.resolve(workspaceRoot);

        // 보안: 작업 공간 밖의 파일 접근 방지
        if (!resolvedInputPath.startsWith(workspacePath)) {
          return {
            success: false,
            error: 'File path outside workspace',
            message: '파일 경로가 작업 공간 밖에 있습니다.'
          };
        }

        // 파일 존재 확인
        try {
          await fs.access(resolvedInputPath);
        } catch {
          return {
            success: false,
            error: 'Image file not found',
            message: `이미지 파일을 찾을 수 없습니다: ${resolvedInputPath}`
          };
        }

        // 출력 경로 결정
        let resolvedOutputPath;
        if (output_path) {
          resolvedOutputPath = path.resolve(workspaceRoot, output_path);
          if (!resolvedOutputPath.startsWith(workspacePath)) {
            return {
              success: false,
              error: 'Output path outside workspace',
              message: '출력 파일 경로가 작업 공간 밖에 있습니다.'
            };
          }
        } else {
          const ext = path.extname(resolvedInputPath);
          const name = path.basename(resolvedInputPath, ext);
          const dir = path.dirname(resolvedInputPath);
          resolvedOutputPath = path.join(dir, `${name}_processed${ext}`);
        }

        // 출력 디렉토리 생성
        const outputDir = path.dirname(resolvedOutputPath);
        await fs.mkdir(outputDir, { recursive: true });

        logger.info('이미지 처리 시작', { image_path: resolvedInputPath, operation });

        let image = sharp(resolvedInputPath);
        let metadata = null;

        // 작업 수행
        switch (operation) {
          case 'metadata':
            metadata = await image.metadata();
            return {
              success: true,
              operation: 'metadata',
              metadata: {
                format: metadata.format,
                width: metadata.width,
                height: metadata.height,
                channels: metadata.channels,
                hasAlpha: metadata.hasAlpha,
                size: metadata.size,
                density: metadata.density,
                orientation: metadata.orientation,
                hasProfile: metadata.hasProfile,
                hasAlpha: metadata.hasAlpha
              },
              timestamp: new Date().toISOString()
            };

          case 'resize':
            if (!width && !height) {
              return {
                success: false,
                error: 'Width or height required',
                message: '리사이즈를 위해서는 width 또는 height가 필요합니다.'
              };
            }
            image = image.resize(width, height, {
              fit: 'inside',
              withoutEnlargement: true
            });
            break;

          case 'convert':
            if (!format) {
              return {
                success: false,
                error: 'Format required',
                message: '포맷 변환을 위해서는 format 파라미터가 필요합니다.'
              };
            }
            const convertOptions = {};
            if (quality && (format === 'jpeg' || format === 'webp')) {
              convertOptions.quality = quality;
            }
            image = image.toFormat(format, convertOptions);
            // 출력 파일 확장자 변경
            const newExt = `.${format}`;
            if (!resolvedOutputPath.endsWith(newExt)) {
              resolvedOutputPath = resolvedOutputPath.replace(/\.[^.]+$/, newExt);
            }
            break;

          case 'crop':
            if (x === undefined || y === undefined || !width || !height) {
              return {
                success: false,
                error: 'Crop parameters required',
                message: '크롭을 위해서는 x, y, width, height 파라미터가 필요합니다.'
              };
            }
            image = image.extract({ left: x, top: y, width, height });
            break;

          case 'rotate':
            image = image.rotate(angle || 0);
            break;

          case 'grayscale':
            image = image.greyscale();
            break;

          case 'blur':
            image = image.blur(blur_sigma || 1);
            break;

          default:
            return {
              success: false,
              error: 'Unknown operation',
              message: `알 수 없는 작업 유형: ${operation}`
            };
        }

        // 이미지 저장
        await image.toFile(resolvedOutputPath);
        metadata = await sharp(resolvedOutputPath).metadata();

        logger.info('이미지 처리 완료', {
          input_path: resolvedInputPath,
          output_path: resolvedOutputPath,
          operation
        });

        return {
          success: true,
          operation,
          input_path: resolvedInputPath,
          output_path: resolvedOutputPath,
          metadata: {
            format: metadata.format,
            width: metadata.width,
            height: metadata.height,
            size: metadata.size
          },
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error('이미지 처리 실패', error, { image_path, operation });
        return {
          success: false,
          error: error.message,
          image_path,
          operation
        };
      }
    }
  };
}
