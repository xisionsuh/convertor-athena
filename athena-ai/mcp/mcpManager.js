/**
 * MCP Manager
 * MCP 도구와 리소스를 관리하고 AI와 통합하는 메인 클래스
 */

import { MCPBase } from './base.js';
import { createFileSystemTools } from './tools/fileSystem.js';
import { createCodeExecutorTool } from './tools/codeExecutor.js';
import { createAPICallerTool } from './tools/apiCaller.js';
import { createDatabaseQueryTool } from './tools/databaseQuery.js';
import { createImageProcessorTool } from './tools/imageProcessor.js';
import { createEmailSenderTool } from './tools/emailSender.js';
import { createWebBrowserTool } from './tools/webBrowser.js';
import { logger } from '../utils/logger.js';

/**
 * MCP Manager 클래스
 */
export class MCPManager extends MCPBase {
  constructor(options = {}) {
    super();
    this.workspaceRoot = options.workspaceRoot;
    this.enabled = options.enabled !== false; // 기본값: true
    this.dbPath = options.dbPath; // 데이터베이스 경로 저장
    
    if (this.enabled) {
      this.initializeTools();
    }
  }

  /**
   * 기본 도구 초기화
   */
  initializeTools() {
    try {
      // 파일 시스템 도구 등록
      const fileSystemTools = createFileSystemTools({
        workspaceRoot: this.workspaceRoot
      });
      
      fileSystemTools.forEach(tool => {
        this.registerTool(tool);
      });

      // 코드 실행 도구 등록
      const codeExecutorTool = createCodeExecutorTool({
        workspaceRoot: this.workspaceRoot
      });
      this.registerTool(codeExecutorTool);

      // API 호출 도구 등록
      const apiCallerTool = createAPICallerTool();
      this.registerTool(apiCallerTool);

      // 데이터베이스 쿼리 도구 등록
      const databaseQueryTool = createDatabaseQueryTool({
        dbPath: this.dbPath
      });
      this.registerTool(databaseQueryTool);

      // 이미지 처리 도구 등록 (sharp가 설치된 경우에만)
      try {
        const imageProcessorTool = createImageProcessorTool({
          workspaceRoot: this.workspaceRoot
        });
        this.registerTool(imageProcessorTool);
      } catch (error) {
        logger.warn('Image processor tool not available', { error: error.message });
      }

      // 이메일 전송 도구 등록 (nodemailer가 설치된 경우에만)
      try {
        const emailSenderTool = createEmailSenderTool();
        this.registerTool(emailSenderTool);
      } catch (error) {
        logger.warn('Email sender tool not available', { error: error.message });
      }

      // 웹 브라우저 제어 도구 등록 (puppeteer가 설치된 경우에만)
      try {
        const webBrowserTool = createWebBrowserTool({
          workspaceRoot: this.workspaceRoot
        });
        this.registerTool(webBrowserTool);
      } catch (error) {
        logger.warn('Web browser tool not available', { error: error.message });
      }

      logger.info('MCP tools initialized', {
        toolCount: this.tools.size,
        tools: Array.from(this.tools.keys())
      });
    } catch (error) {
      logger.error('Failed to initialize MCP tools', error);
      this.enabled = false;
    }
  }

  /**
   * AI 프롬프트에 사용 가능한 도구 정보 추가
   * @returns {string}
   */
  getToolsPrompt() {
    if (!this.enabled || this.tools.size === 0) {
      return '';
    }

    const toolsList = this.listTools().map(tool => {
      return `### ${tool.name}
설명: ${tool.description}
입력 스키마: ${JSON.stringify(tool.inputSchema, null, 2)}`;
    }).join('\n\n');

    return `\n\n## 사용 가능한 도구 (MCP Tools)

다음 도구들을 사용하여 작업을 수행할 수 있습니다. 도구를 사용하려면 다음 형식으로 요청하세요:

\`\`\`mcp_tool
{
  "tool": "도구이름",
  "arguments": {
    "파라미터": "값"
  }
}
\`\`\`

${toolsList}

중요: 도구를 사용할 때는 반드시 위의 형식을 따라야 합니다.`;
  }

  /**
   * 메시지에서 MCP 도구 호출 추출
   * @param {string} message - AI 응답 메시지
   * @returns {Array<Object>}
   */
  extractToolCalls(message) {
    const toolCalls = [];
    
    // MCP 도구 호출 패턴 찾기: ```mcp_tool ... ```
    const toolCallPattern = /```mcp_tool\s*\n([\s\S]*?)```/g;
    let match;
    
    while ((match = toolCallPattern.exec(message)) !== null) {
      try {
        const toolCall = JSON.parse(match[1]);
        if (toolCall.tool && toolCall.arguments) {
          toolCalls.push(toolCall);
        }
      } catch (error) {
        logger.warn('Failed to parse tool call', { error: error.message, content: match[1] });
      }
    }
    
    return toolCalls;
  }

  /**
   * AI 응답에서 도구 호출을 처리하고 결과를 반환
   * @param {string} aiResponse - AI 응답 메시지
   * @returns {Promise<Object>}
   */
  async processToolCalls(aiResponse) {
    if (!this.enabled) {
      return {
        hasToolCalls: false,
        results: [],
        updatedResponse: aiResponse
      };
    }

    const toolCalls = this.extractToolCalls(aiResponse);
    
    if (toolCalls.length === 0) {
      return {
        hasToolCalls: false,
        results: [],
        updatedResponse: aiResponse
      };
    }

    logger.info('Processing tool calls', { count: toolCalls.length });

    const results = [];
    let updatedResponse = aiResponse;

    for (const toolCall of toolCalls) {
      try {
        const result = await this.executeTool(toolCall.tool, toolCall.arguments);
        results.push({
          tool: toolCall.tool,
          arguments: toolCall.arguments,
          result
        });

        // 도구 호출 부분을 결과로 대체
        const toolCallText = `\`\`\`mcp_tool\n${JSON.stringify(toolCall, null, 2)}\n\`\`\``;
        const resultText = `\n\n**도구 실행 결과 (${toolCall.tool}):**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\n`;
        updatedResponse = updatedResponse.replace(toolCallText, resultText);
      } catch (error) {
        logger.error('Tool execution failed', error, { toolCall });
        results.push({
          tool: toolCall.tool,
          arguments: toolCall.arguments,
          result: {
            success: false,
            error: error.message
          }
        });
      }
    }

    return {
      hasToolCalls: true,
      results,
      updatedResponse
    };
  }
}

