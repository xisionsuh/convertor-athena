/**
 * Screen Capture Tool
 * Puppeteer 화면 캡처 + Tesseract OCR
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { logger } from '../../utils/logger.js';
import { getBrowser } from './webBrowser.js';

function resolveWorkspaceRoot(workspaceRoot) {
  return path.resolve(workspaceRoot || process.cwd());
}

async function ensureScreenshotDir(workspaceRoot) {
  const screenshotDir = path.join(resolveWorkspaceRoot(workspaceRoot), 'data', 'screenshots');
  await fs.mkdir(screenshotDir, { recursive: true });
  return screenshotDir;
}

async function getImageDimensions(filepath) {
  const metadata = await sharp(filepath).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0
  };
}

function createScreenshotFilename(prefix = 'screenshot') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${timestamp}.png`;
}

async function captureUrl({ url, waitUntil = 'networkidle2', timeout = 30000, fullPage = true, workspaceRoot }) {
  if (!url) {
    throw new Error('url is required for capture_url action');
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil, timeout });

    const screenshotDir = await ensureScreenshotDir(workspaceRoot);
    const filename = createScreenshotFilename('capture');
    const filepath = path.join(screenshotDir, filename);

    await page.screenshot({ path: filepath, fullPage });

    const dimensions = await getImageDimensions(filepath);
    return { filepath, dimensions };
  } finally {
    await page.close();
  }
}

async function preprocessImageForOCR(filepath) {
  const pipeline = sharp(filepath).rotate().grayscale().normalize().sharpen();
  const metadata = await pipeline.metadata();

  if ((metadata.width || 0) < 1200) {
    pipeline.resize({ width: 1200, withoutEnlargement: false, fit: 'inside' });
  }

  return pipeline.png({ quality: 100 }).toBuffer();
}

async function runOCR(filepath, language = 'eng') {
  const preprocessedBuffer = await preprocessImageForOCR(filepath);
  const worker = await createWorker(language);

  try {
    const { data } = await worker.recognize(preprocessedBuffer);
    return data.text?.trim() || '';
  } finally {
    await worker.terminate();
  }
}

function resolveInputFilePath(filepath, workspaceRoot) {
  if (!filepath) {
    throw new Error('filepath is required for ocr_file action');
  }

  const base = resolveWorkspaceRoot(workspaceRoot);
  const resolved = path.isAbsolute(filepath) ? path.resolve(filepath) : path.resolve(base, filepath);
  return resolved;
}

/**
 * 스크린 캡처 + OCR 도구 생성
 */
export function createScreenCaptureTool(options = {}) {
  const { workspaceRoot = process.cwd() } = options;

  return {
    name: 'screen_capture',
    description: 'URL 화면 캡처와 이미지 OCR을 수행합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['capture_url', 'ocr_file', 'capture_and_ocr'],
          description: '수행할 작업 유형'
        },
        url: {
          type: 'string',
          description: '캡처할 URL (capture_url, capture_and_ocr에서 사용)'
        },
        filepath: {
          type: 'string',
          description: 'OCR할 이미지 파일 경로 (ocr_file에서 사용)'
        },
        language: {
          type: 'string',
          default: 'eng',
          description: 'OCR 언어 코드 (예: eng, kor, kor+eng)'
        },
        waitUntil: {
          type: 'string',
          enum: ['load', 'networkidle0', 'networkidle2', 'domcontentloaded'],
          default: 'networkidle2',
          description: '페이지 로드 대기 조건'
        },
        timeout: {
          type: 'number',
          default: 30000,
          description: '페이지 로드 타임아웃(ms)'
        },
        fullPage: {
          type: 'boolean',
          default: true,
          description: '전체 페이지 캡처 여부'
        }
      },
      required: ['action']
    },
    execute: async (args) => {
      const {
        action,
        url,
        filepath,
        language = 'eng',
        waitUntil = 'networkidle2',
        timeout = 30000,
        fullPage = true
      } = args;

      try {
        if (action === 'capture_url') {
          logger.info('Screen capture: capture_url', { url, waitUntil, fullPage });
          return await captureUrl({
            url,
            waitUntil,
            timeout,
            fullPage,
            workspaceRoot
          });
        }

        if (action === 'ocr_file') {
          const resolvedPath = resolveInputFilePath(filepath, workspaceRoot);
          const dimensions = await getImageDimensions(resolvedPath);
          const ocrText = await runOCR(resolvedPath, language);

          logger.info('Screen capture: ocr_file completed', {
            filepath: resolvedPath,
            textLength: ocrText.length
          });

          return {
            filepath: resolvedPath,
            ocrText,
            dimensions
          };
        }

        if (action === 'capture_and_ocr') {
          logger.info('Screen capture: capture_and_ocr', { url, waitUntil, fullPage, language });
          const captureResult = await captureUrl({
            url,
            waitUntil,
            timeout,
            fullPage,
            workspaceRoot
          });

          const ocrText = await runOCR(captureResult.filepath, language);

          return {
            filepath: captureResult.filepath,
            ocrText,
            dimensions: captureResult.dimensions
          };
        }

        throw new Error(`Unknown action: ${action}`);
      } catch (error) {
        logger.error('Screen capture tool failed', error, { action, url, filepath });
        return {
          error: error.message
        };
      }
    }
  };
}
