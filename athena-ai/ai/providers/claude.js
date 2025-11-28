import Anthropic from '@anthropic-ai/sdk';
import { AIProvider } from './base.js';

export class ClaudeProvider extends AIProvider {
  constructor(apiKey, model = 'claude-sonnet-4-5-20250929') {
    super('Claude', apiKey);
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(messages, options = {}) {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens || 4096,
        messages: messages.map(msg => ({
          role: msg.role === 'system' ? 'user' : msg.role,
          content: msg.content
        })),
        temperature: options.temperature || 0.7,
      });

      return {
        content: response.content[0].text,
        provider: this.name,
        model: this.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }

  async streamChat(messages, options = {}) {
    try {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens || 4096,
        messages: messages.map(msg => ({
          role: msg.role === 'system' ? 'user' : msg.role,
          content: msg.content
        })),
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
