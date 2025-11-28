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
import { createOCRTool } from './tools/ocr.js';
import { createGoogleCalendarTools } from './tools/googleCalendar.js';
import { createTranslatorTools } from './tools/translator.js';
import { createGitHubTools } from './tools/github.js';
import { createImageGeneratorTools } from './tools/imageGenerator.js';
import { createTextToSpeechTools } from './tools/textToSpeech.js';
import { createNotificationTools } from './tools/notifications.js';
import { createAnalyticsTools } from './tools/analytics.js';
import { createSpeechToTextTools } from './tools/speechToText.js';
import { createMessagingTools } from './tools/messaging.js';
import { createWorkflowTools } from './tools/workflow.js';
import { createVectorStoreTools } from './tools/vectorStore.js';
import { createExportDocumentTools } from './tools/exportDocument.js';
import { createBudgetControlTools } from './tools/budgetControl.js';
import { createUserSettingsTools } from './tools/userSettings.js';
import { createSchedulerTools } from './tools/scheduler.js';
import { createFeedbackLearningTools } from './tools/feedbackLearning.js';
import { createCollaborationTools } from './tools/collaboration.js';
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

      // OCR 도구 등록 (tesseract.js가 설치된 경우에만)
      try {
        const ocrTool = createOCRTool({
          workspaceRoot: this.workspaceRoot
        });
        this.registerTool(ocrTool);
      } catch (error) {
        logger.warn('OCR tool not available', { error: error.message });
      }

      // Google Calendar 도구 등록
      try {
        const calendarTools = createGoogleCalendarTools();
        calendarTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Google Calendar tools not available', { error: error.message });
      }

      // 번역 도구 등록
      try {
        const translatorTools = createTranslatorTools();
        translatorTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Translator tools not available', { error: error.message });
      }

      // GitHub 도구 등록
      try {
        const githubTools = createGitHubTools();
        githubTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('GitHub tools not available', { error: error.message });
      }

      // 이미지 생성 도구 등록 (DALL-E)
      try {
        const imageGeneratorTools = createImageGeneratorTools({
          workspaceRoot: this.workspaceRoot
        });
        imageGeneratorTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Image generator tools not available', { error: error.message });
      }

      // TTS 도구 등록
      try {
        const ttsTools = createTextToSpeechTools({
          workspaceRoot: this.workspaceRoot
        });
        ttsTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('TTS tools not available', { error: error.message });
      }

      // 알림 도구 등록
      try {
        const notificationTools = createNotificationTools({
          dbPath: this.dbPath
        });
        notificationTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Notification tools not available', { error: error.message });
      }

      // 분석 도구 등록
      try {
        const analyticsTools = createAnalyticsTools({
          dbPath: this.dbPath
        });
        analyticsTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Analytics tools not available', { error: error.message });
      }

      // STT(음성 인식) 도구 등록
      try {
        const sttTools = createSpeechToTextTools({
          workspaceRoot: this.workspaceRoot
        });
        sttTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('STT tools not available', { error: error.message });
      }

      // 메시징(Slack/Discord) 도구 등록
      try {
        const messagingTools = createMessagingTools();
        messagingTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Messaging tools not available', { error: error.message });
      }

      // 워크플로우 자동화 도구 등록
      try {
        const workflowTools = createWorkflowTools({
          dbPath: this.dbPath,
          mcpManager: this
        });
        workflowTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Workflow tools not available', { error: error.message });
      }

      // 벡터 스토어(RAG) 도구 등록
      try {
        const vectorStoreTools = createVectorStoreTools({
          dbPath: this.dbPath,
          workspaceRoot: this.workspaceRoot
        });
        vectorStoreTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Vector store tools not available', { error: error.message });
      }

      // 문서 내보내기 도구 등록
      try {
        const exportTools = createExportDocumentTools({
          dbPath: this.dbPath,
          workspaceRoot: this.workspaceRoot
        });
        exportTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Export tools not available', { error: error.message });
      }

      // 예산 제어 도구 등록
      try {
        const budgetTools = createBudgetControlTools({
          dbPath: this.dbPath
        });
        budgetTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Budget control tools not available', { error: error.message });
      }

      // 사용자 설정 도구 등록
      try {
        const userSettingsTools = createUserSettingsTools({
          dbPath: this.dbPath
        });
        userSettingsTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('User settings tools not available', { error: error.message });
      }

      // 스케줄러 도구 등록
      try {
        const schedulerTools = createSchedulerTools({
          dbPath: this.dbPath,
          mcpManager: this
        });
        schedulerTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Scheduler tools not available', { error: error.message });
      }

      // AI 피드백 학습 도구 등록
      try {
        const feedbackTools = createFeedbackLearningTools({
          dbPath: this.dbPath
        });
        feedbackTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Feedback learning tools not available', { error: error.message });
      }

      // 실시간 협업 도구 등록
      try {
        const collaborationTools = createCollaborationTools({
          dbPath: this.dbPath
        });
        collaborationTools.forEach(tool => {
          this.registerTool(tool);
        });
      } catch (error) {
        logger.warn('Collaboration tools not available', { error: error.message });
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

다음 도구들을 사용하여 작업을 수행할 수 있습니다. 하지만 **일반적인 질문이나 대화에는 도구를 사용하지 마세요**. 도구는 **명시적으로 파일 조작, 코드 실행, API 호출 등의 작업이 필요할 때만** 사용하세요.

도구를 사용하려면 다음 형식으로 요청하세요:

\`\`\`mcp_tool
{
  "tool": "도구이름",
  "arguments": {
    "파라미터": "값"
  }
}
\`\`\`

${toolsList}

**중요 규칙:**
1. 웹 검색, 정보 제공, 일반 대화에는 도구를 사용하지 마세요
2. 사용자가 명시적으로 파일 작업, 코드 실행 등을 요청했을 때만 도구를 사용하세요
3. 도구 사용이 필요한 경우에만 위의 형식을 따르세요`;
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

