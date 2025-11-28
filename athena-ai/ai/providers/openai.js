import OpenAI from 'openai';
import { AIProvider } from './base.js';

export class OpenAIProvider extends AIProvider {
  constructor(apiKey, model = 'gpt-5') {
    super('ChatGPT', apiKey);
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(messages, options = {}) {
    try {
      const requestOptions = {
        model: this.model,
        messages: messages,
      };

      // gpt-5 모델은 max_completion_tokens 사용, temperature는 기본값만 지원
      if (this.model.startsWith('gpt-5') || this.model.includes('gpt-5')) {
        requestOptions.max_completion_tokens = options.maxTokens || 4096;
        // gpt-5는 temperature를 지원하지 않으므로 제외
      } else {
        requestOptions.max_tokens = options.maxTokens || 4096;
        requestOptions.temperature = options.temperature || 0.7;
      }

      const response = await this.client.chat.completions.create(requestOptions);

      return {
        content: response.choices[0].message.content,
        provider: this.name,
        model: this.model,
        usage: {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens
        }
      };
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }

  async streamChat(messages, options = {}) {
    try {
      const requestOptions = {
        model: this.model,
        messages: messages,
        stream: true,
      };

      // gpt-5 모델은 max_completion_tokens 사용, temperature는 기본값만 지원
      if (this.model.startsWith('gpt-5') || this.model.includes('gpt-5')) {
        requestOptions.max_completion_tokens = options.maxTokens || 4096;
      } else {
        requestOptions.max_tokens = options.maxTokens || 4096;
        requestOptions.temperature = options.temperature || 0.7;
      }

      // Vision API 지원: 이미지가 포함된 경우 gpt-4o 또는 gpt-4-vision-preview 모델 사용
      if (options.imageData && options.imageData.length > 0) {
        // 이미지가 포함된 메시지가 있는지 확인
        const hasImageContent = messages.some(msg => 
          Array.isArray(msg.content) && msg.content.some(item => item.type === 'image_url')
        );
        
        if (hasImageContent) {
          // Vision API를 지원하는 모델로 변경
          if (this.model.startsWith('gpt-5')) {
            requestOptions.model = 'gpt-4o'; // gpt-5는 Vision을 지원하지 않을 수 있으므로 gpt-4o 사용
          } else if (!this.model.includes('vision') && !this.model.includes('gpt-4o')) {
            requestOptions.model = 'gpt-4o'; // Vision 지원 모델로 변경
          }
        }
      }

      const stream = await this.client.chat.completions.create(requestOptions);

      return stream;
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }
}
