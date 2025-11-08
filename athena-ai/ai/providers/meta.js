import OpenAI from 'openai';
import { AIProvider } from './base.js';

// Meta AI를 사용하려면 Llama API 또는 Together AI, Replicate 등의 서비스 필요
// 여기서는 Together AI를 사용하는 예시
export class MetaAIProvider extends AIProvider {
  constructor(apiKey, model = 'meta-llama/Llama-3.3-70B-Instruct-Turbo') {
    super('Meta-AI', apiKey);
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.together.xyz/v1',
    });
    this.model = model;
  }

  async chat(messages, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
      });

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
      this.lastError = error.message;
      throw error;
    }
  }

  async streamChat(messages, options = {}) {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
        stream: true,
      });

      return stream;
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }
}
