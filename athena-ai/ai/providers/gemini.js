import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider } from './base.js';

export class GeminiProvider extends AIProvider {
  constructor(apiKey, model = 'gemini-2.5-flash') {
    super('Gemini', apiKey);
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async chat(messages, options = {}) {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      // Convert messages to Gemini format
      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const lastMessage = messages[messages.length - 1].content;

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastMessage);
      const response = await result.response;

      return {
        content: response.text(),
        provider: this.name,
        model: this.model,
        usage: {
          inputTokens: 0, // Gemini doesn't provide token count in free tier
          outputTokens: 0
        }
      };
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }

  async streamChat(messages, options = {}) {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const lastMessage = messages[messages.length - 1].content;

      const chat = model.startChat({ history });
      const result = await chat.sendMessageStream(lastMessage);

      return result.stream;
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }
}
