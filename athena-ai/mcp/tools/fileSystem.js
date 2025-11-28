/**
 * MCP File System Tools
 * 파일 읽기/쓰기 도구
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 파일 시스템 도구 생성
 * @param {Object} options - 옵션
 * @param {string} options.workspaceRoot - 작업 공간 루트 경로
 * @returns {Array<MCPTool>}
 */
export function createFileSystemTools(options = {}) {
  const workspaceRoot = options.workspaceRoot || path.join(__dirname, '../../../workspace');
  
  // 작업 공간 디렉토리 생성 (없으면)
  fs.mkdir(workspaceRoot, { recursive: true }).catch(() => {});

  return [
    {
      name: 'read_file',
      description: '파일 내용을 읽습니다. 파일 경로를 지정하면 해당 파일의 내용을 반환합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '읽을 파일의 경로 (상대 경로 또는 절대 경로)'
          }
        },
        required: ['file_path']
      },
      execute: async (args) => {
        const { file_path } = args;
        
        // 보안: 작업 공간 밖의 파일 접근 방지
        const resolvedPath = path.resolve(workspaceRoot, file_path);
        const workspacePath = path.resolve(workspaceRoot);
        
        if (!resolvedPath.startsWith(workspacePath)) {
          throw new Error('파일 경로가 작업 공간 밖에 있습니다.');
        }

        try {
          const content = await fs.readFile(resolvedPath, 'utf-8');
          logger.debug('File read', { file_path: resolvedPath });
          return {
            content,
            file_path: resolvedPath
          };
        } catch (error) {
          logger.error('File read error', error, { file_path: resolvedPath });
          throw new Error(`파일을 읽을 수 없습니다: ${error.message}`);
        }
      }
    },
    {
      name: 'write_file',
      description: '파일을 생성하거나 수정합니다. 파일 경로와 내용을 지정하면 해당 파일을 생성/수정합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '쓸 파일의 경로 (상대 경로 또는 절대 경로)'
          },
          content: {
            type: 'string',
            description: '파일에 쓸 내용'
          }
        },
        required: ['file_path', 'content']
      },
      execute: async (args) => {
        const { file_path, content } = args;
        
        // 보안: 작업 공간 밖의 파일 접근 방지
        const resolvedPath = path.resolve(workspaceRoot, file_path);
        const workspacePath = path.resolve(workspaceRoot);
        
        if (!resolvedPath.startsWith(workspacePath)) {
          throw new Error('파일 경로가 작업 공간 밖에 있습니다.');
        }

        try {
          // 디렉토리 생성 (없으면)
          const dir = path.dirname(resolvedPath);
          await fs.mkdir(dir, { recursive: true });
          
          await fs.writeFile(resolvedPath, content, 'utf-8');
          logger.debug('File written', { file_path: resolvedPath, contentLength: content.length });
          return {
            success: true,
            file_path: resolvedPath,
            message: '파일이 성공적으로 작성되었습니다.'
          };
        } catch (error) {
          logger.error('File write error', error, { file_path: resolvedPath });
          throw new Error(`파일을 쓸 수 없습니다: ${error.message}`);
        }
      }
    },
    {
      name: 'list_directory',
      description: '디렉토리의 파일 및 폴더 목록을 반환합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          directory_path: {
            type: 'string',
            description: '목록을 가져올 디렉토리 경로 (기본값: 작업 공간 루트)'
          }
        }
      },
      execute: async (args) => {
        const { directory_path = '.' } = args;
        
        // 보안: 작업 공간 밖의 디렉토리 접근 방지
        const resolvedPath = path.resolve(workspaceRoot, directory_path);
        const workspacePath = path.resolve(workspaceRoot);
        
        if (!resolvedPath.startsWith(workspacePath)) {
          throw new Error('디렉토리 경로가 작업 공간 밖에 있습니다.');
        }

        try {
          const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
          const items = await Promise.all(
            entries.map(async (entry) => {
              const fullPath = path.join(resolvedPath, entry.name);
              const stats = await fs.stat(fullPath);
              return {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                size: stats.size,
                modified: stats.mtime.toISOString()
              };
            })
          );
          
          logger.debug('Directory listed', { directory_path: resolvedPath, itemCount: items.length });
          return {
            directory_path: resolvedPath,
            items
          };
        } catch (error) {
          logger.error('Directory list error', error, { directory_path: resolvedPath });
          throw new Error(`디렉토리를 읽을 수 없습니다: ${error.message}`);
        }
      }
    },
    {
      name: 'delete_file',
      description: '파일 또는 디렉토리를 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '삭제할 파일 또는 디렉토리의 경로'
          }
        },
        required: ['file_path']
      },
      execute: async (args) => {
        const { file_path } = args;
        
        // 보안: 작업 공간 밖의 파일 접근 방지
        const resolvedPath = path.resolve(workspaceRoot, file_path);
        const workspacePath = path.resolve(workspaceRoot);
        
        if (!resolvedPath.startsWith(workspacePath)) {
          throw new Error('파일 경로가 작업 공간 밖에 있습니다.');
        }

        try {
          const stats = await fs.stat(resolvedPath);
          if (stats.isDirectory()) {
            await fs.rmdir(resolvedPath, { recursive: true });
          } else {
            await fs.unlink(resolvedPath);
          }
          
          logger.debug('File deleted', { file_path: resolvedPath });
          return {
            success: true,
            file_path: resolvedPath,
            message: '파일이 성공적으로 삭제되었습니다.'
          };
        } catch (error) {
          logger.error('File delete error', error, { file_path: resolvedPath });
          throw new Error(`파일을 삭제할 수 없습니다: ${error.message}`);
        }
      }
    }
  ];
}

