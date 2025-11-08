import OpenAI from 'openai';
import { AIProvider } from './base.js';

/**
 * Grok AI Provider (xAI)
 * Grok은 xAI에서 제공하는 AI 모델입니다.
 * OpenAI 호환 API를 사용합니다.
 */
export class GrokProvider extends AIProvider {
  constructor(apiKey, model = 'grok-4-fast') {
    super('Grok', apiKey);
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    this.model = model;
  }

  async chat(messages, options = {}) {
    try {
      // System 메시지 처리 (xAI API는 system 역할을 지원)
      const processedMessages = messages.map(msg => {
        if (msg.role === 'system') {
          // System 메시지를 user 메시지로 변환 (xAI 호환성)
          return {
            role: 'user',
            content: `[System Instructions] ${msg.content}`
          };
        }
        return msg;
      });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: processedMessages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
      });

      this.isAvailable = true;
      this.lastError = null;

      return {
        content: response.choices[0].message.content,
        provider: this.name,
        model: this.model,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0
        }
      };
    } catch (error) {
      this.isAvailable = false;
      this.lastError = error.message;
      console.error(`[Grok] Error:`, error.message);
      
      // 401, 403 에러는 API 키 문제
      if (error.status === 401 || error.status === 403) {
        throw new Error(`Grok API 인증 실패: API 키를 확인하세요.`);
      }
      
      // 404 에러는 모델 이름 문제
      if (error.status === 404) {
        console.warn(`[Grok] 모델 ${this.model}을 찾을 수 없습니다. grok-beta로 시도합니다.`);
        // grok-beta로 재시도
        if (this.model !== 'grok-beta') {
          this.model = 'grok-beta';
          return this.chat(messages, options);
        }
        throw new Error(`Grok 모델을 찾을 수 없습니다: ${this.model}`);
      }
      
      throw error;
    }
  }

  async streamChat(messages, options = {}) {
    try {
      // System 메시지 처리
      const processedMessages = messages.map(msg => {
        if (msg.role === 'system') {
          return {
            role: 'user',
            content: `[System Instructions] ${msg.content}`
          };
        }
        return msg;
      });

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: processedMessages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
        stream: true,
      });

      this.isAvailable = true;
      this.lastError = null;

      return stream;
    } catch (error) {
      this.isAvailable = false;
      this.lastError = error.message;
      console.error(`[Grok] Stream Error:`, error.message);
      
      // 404 에러는 모델 이름 문제
      if (error.status === 404 && this.model !== 'grok-beta') {
        console.warn(`[Grok] 모델 ${this.model}을 찾을 수 없습니다. grok-beta로 시도합니다.`);
        this.model = 'grok-beta';
        return this.streamChat(messages, options);
      }
      
      throw error;
    }
  }
}

