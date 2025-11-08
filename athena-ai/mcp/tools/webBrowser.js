/**
 * 웹 브라우저 제어 도구
 * Puppeteer를 사용하여 웹 브라우저를 자동화하고 제어하는 MCP 도구
 */

import { logger } from '../../utils/logger.js';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 브라우저 인스턴스 관리
let browserInstance = null;
let pageInstance = null;

/**
 * 브라우저 인스턴스 가져오기 (싱글톤)
 */
async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    logger.info('Puppeteer browser launched');
  }
  return browserInstance;
}

/**
 * 페이지 인스턴스 가져오기
 */
async function getPage() {
  const browser = await getBrowser();
  if (!pageInstance) {
    pageInstance = await browser.newPage();
    // 기본 타임아웃 설정
    pageInstance.setDefaultTimeout(30000);
    // 뷰포트 설정
    await pageInstance.setViewport({ width: 1920, height: 1080 });
    logger.info('New page created');
  }
  return pageInstance;
}

/**
 * 페이지 닫기
 */
async function closePage() {
  if (pageInstance) {
    await pageInstance.close();
    pageInstance = null;
    logger.info('Page closed');
  }
}

/**
 * 브라우저 닫기
 */
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    pageInstance = null;
    logger.info('Browser closed');
  }
}

/**
 * 스크린샷 저장 디렉토리 생성
 */
function ensureScreenshotDir() {
  const screenshotDir = path.join(__dirname, '../../../data/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  return screenshotDir;
}

/**
 * 웹 브라우저 제어 도구 생성 함수
 */
export function createWebBrowserTool(options = {}) {
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const screenshotDir = ensureScreenshotDir();

  return {
    name: 'control_browser',
    description: '웹 브라우저를 자동화하여 웹 페이지 탐색, 스크린샷, 클릭, 텍스트 입력 등의 작업을 수행합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['navigate', 'screenshot', 'click', 'type', 'getContent', 'submit', 'wait', 'close'],
          description: '수행할 작업: navigate(페이지 이동), screenshot(스크린샷), click(클릭), type(텍스트 입력), getContent(페이지 내용 가져오기), submit(폼 제출), wait(대기), close(브라우저 닫기)'
        },
        url: {
          type: 'string',
          description: '이동할 URL (action이 navigate일 때 필수)'
        },
        selector: {
          type: 'string',
          description: 'CSS 선택자 (action이 click, type, submit일 때 필수)'
        },
        text: {
          type: 'string',
          description: '입력할 텍스트 (action이 type일 때 필수)'
        },
        waitFor: {
          type: 'string',
          enum: ['load', 'networkidle0', 'networkidle2', 'domcontentloaded'],
          description: '대기 조건 (action이 navigate일 때 선택, 기본값: load)',
          default: 'load'
        },
        timeout: {
          type: 'number',
          description: '타임아웃 (밀리초, 기본값: 30000)',
          default: 30000
        },
        screenshotPath: {
          type: 'string',
          description: '스크린샷 저장 경로 (action이 screenshot일 때 선택, 기본값: 자동 생성)'
        },
        fullPage: {
          type: 'boolean',
          description: '전체 페이지 스크린샷 여부 (action이 screenshot일 때 선택, 기본값: false)',
          default: false
        }
      },
      required: ['action']
    },
    execute: async (args) => {
      const { action, url, selector, text, waitFor = 'load', timeout = 30000, screenshotPath, fullPage = false } = args;

      try {
        const page = await getPage();

        switch (action) {
          case 'navigate':
            if (!url) {
              return {
                success: false,
                error: 'URL is required for navigate action'
              };
            }

            logger.info('Navigating to URL', { url, waitFor });
            await page.goto(url, {
              waitUntil: waitFor,
              timeout: timeout
            });

            const pageTitle = await page.title();
            const pageUrl = page.url();

            return {
              success: true,
              action: 'navigate',
              url: pageUrl,
              title: pageTitle,
              message: `Successfully navigated to ${pageUrl}`
            };

          case 'screenshot':
            logger.info('Taking screenshot', { fullPage });
            const timestamp = Date.now();
            const filename = screenshotPath || `screenshot-${timestamp}.png`;
            const filepath = path.isAbsolute(filename) 
              ? filename 
              : path.join(screenshotDir, filename);

            await page.screenshot({
              path: filepath,
              fullPage: fullPage
            });

            return {
              success: true,
              action: 'screenshot',
              filepath: filepath,
              message: `Screenshot saved to ${filepath}`
            };

          case 'click':
            if (!selector) {
              return {
                success: false,
                error: 'Selector is required for click action'
              };
            }

            logger.info('Clicking element', { selector });
            await page.waitForSelector(selector, { timeout: timeout });
            await page.click(selector);

            return {
              success: true,
              action: 'click',
              selector: selector,
              message: `Successfully clicked element: ${selector}`
            };

          case 'type':
            if (!selector || !text) {
              return {
                success: false,
                error: 'Selector and text are required for type action'
              };
            }

            logger.info('Typing text', { selector, textLength: text.length });
            await page.waitForSelector(selector, { timeout: timeout });
            await page.click(selector); // 포커스
            await page.type(selector, text, { delay: 50 }); // 타이핑 속도 조절

            return {
              success: true,
              action: 'type',
              selector: selector,
              textLength: text.length,
              message: `Successfully typed text into ${selector}`
            };

          case 'getContent':
            logger.info('Getting page content');
            const content = await page.content();
            const title = await page.title();
            const currentUrl = page.url();

            // 텍스트만 추출 (HTML 태그 제거)
            const textContent = await page.evaluate(() => {
              return document.body.innerText;
            });

            return {
              success: true,
              action: 'getContent',
              url: currentUrl,
              title: title,
              html: content.substring(0, 10000), // HTML은 처음 10000자만
              text: textContent.substring(0, 5000), // 텍스트는 처음 5000자만
              message: `Successfully retrieved content from ${currentUrl}`
            };

          case 'submit':
            if (!selector) {
              return {
                success: false,
                error: 'Selector is required for submit action'
              };
            }

            logger.info('Submitting form', { selector });
            await page.waitForSelector(selector, { timeout: timeout });
            await page.click(selector);

            // 폼 제출 후 페이지 로드 대기
            await page.waitForNavigation({ waitUntil: 'load', timeout: timeout });

            const submitTitle = await page.title();
            const submitUrl = page.url();

            return {
              success: true,
              action: 'submit',
              selector: selector,
              newUrl: submitUrl,
              newTitle: submitTitle,
              message: `Successfully submitted form: ${selector}`
            };

          case 'wait':
            const waitTime = timeout || 1000;
            logger.info('Waiting', { waitTime });
            await page.waitForTimeout(waitTime);

            return {
              success: true,
              action: 'wait',
              waitTime: waitTime,
              message: `Waited for ${waitTime}ms`
            };

          case 'close':
            await closePage();
            return {
              success: true,
              action: 'close',
              message: 'Browser page closed'
            };

          default:
            return {
              success: false,
              error: `Unknown action: ${action}`
            };
        }
      } catch (error) {
        logger.error('Web browser action failed', error, { action, url, selector });
        return {
          success: false,
          error: error.message,
          action: action
        };
      }
    }
  };
}

/**
 * 브라우저 정리 함수 (애플리케이션 종료 시 호출)
 */
export async function cleanupBrowser() {
  await closeBrowser();
}

