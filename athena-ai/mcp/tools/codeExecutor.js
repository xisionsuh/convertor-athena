/**
 * MCP Code Executor Tool
 * 코드 실행 도구 (Sandbox 환경)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 코드 실행 도구 생성
 * @param {Object} options - 옵션
 * @param {string} options.workspaceRoot - 작업 공간 루트 경로
 * @param {number} options.timeout - 실행 타임아웃 (ms, 기본값: 10000)
 * @returns {MCPTool}
 */
export function createCodeExecutorTool(options = {}) {
  const workspaceRoot = options.workspaceRoot || path.join(__dirname, '../../../workspace');
  const timeout = options.timeout || 10000;

  return {
    name: 'execute_code',
    description: '코드를 실행하고 결과를 반환합니다. Python, JavaScript, Shell 스크립트 등을 실행할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['python', 'javascript', 'node', 'bash', 'shell'],
          description: '실행할 코드의 언어'
        },
        code: {
          type: 'string',
          description: '실행할 코드'
        },
        timeout: {
          type: 'number',
          description: '실행 타임아웃 (밀리초, 기본값: 10000)'
        }
      },
      required: ['language', 'code']
    },
    execute: async (args) => {
      const { language, code, timeout: customTimeout } = args;
      const execTimeout = customTimeout || timeout;

      // 보안: 허용된 언어만 실행
      const allowedLanguages = ['python', 'javascript', 'node', 'bash', 'shell'];
      if (!allowedLanguages.includes(language)) {
        throw new Error(`지원하지 않는 언어입니다: ${language}`);
      }

      // 보안: 위험한 명령어 차단
      const dangerousPatterns = [
        /rm\s+-rf/,
        /del\s+\/f/,
        /format\s+/,
        /mkfs/,
        /dd\s+if=/,
        /shutdown/,
        /reboot/,
        /sudo\s+rm/,
        /sudo\s+del/
      ];

      if (dangerousPatterns.some(pattern => pattern.test(code))) {
        throw new Error('위험한 명령어는 실행할 수 없습니다.');
      }

      try {
        let command;
        let tempFile;

        switch (language) {
          case 'python':
            tempFile = path.join(workspaceRoot, `temp_${Date.now()}.py`);
            await fs.writeFile(tempFile, code, 'utf-8');
            command = `python3 "${tempFile}"`;
            break;
          case 'javascript':
          case 'node':
            tempFile = path.join(workspaceRoot, `temp_${Date.now()}.js`);
            await fs.writeFile(tempFile, code, 'utf-8');
            command = `node "${tempFile}"`;
            break;
          case 'bash':
          case 'shell':
            tempFile = path.join(workspaceRoot, `temp_${Date.now()}.sh`);
            await fs.writeFile(tempFile, code, 'utf-8');
            await fs.chmod(tempFile, 0o755);
            command = `bash "${tempFile}"`;
            break;
          default:
            throw new Error(`지원하지 않는 언어입니다: ${language}`);
        }

        logger.debug('Code execution started', { language, codeLength: code.length });

        const { stdout, stderr } = await Promise.race([
          execAsync(command, {
            cwd: workspaceRoot,
            maxBuffer: 1024 * 1024 * 10 // 10MB
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('실행 시간 초과')), execTimeout)
          )
        ]);

        // 임시 파일 삭제
        try {
          await fs.unlink(tempFile);
        } catch (e) {
          // 무시
        }

        logger.debug('Code execution completed', { language, hasOutput: !!stdout, hasError: !!stderr });

        return {
          success: true,
          stdout: stdout || '',
          stderr: stderr || '',
          language
        };
      } catch (error) {
        logger.error('Code execution error', error, { language });
        
        // 임시 파일 정리
        if (tempFile) {
          try {
            await fs.unlink(tempFile);
          } catch (e) {
            // 무시
          }
        }

        return {
          success: false,
          error: error.message,
          stdout: '',
          stderr: error.message
        };
      }
    }
  };
}

