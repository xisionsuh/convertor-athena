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
      // system 메시지 분리 → systemInstruction으로 전달
      let systemInstruction = undefined;
      const filtered = [];
      for (const msg of messages) {
        if (msg.role === 'system') {
          systemInstruction = msg.content;
        } else {
          filtered.push(msg);
        }
      }

      const modelOpts = { model: this.model };
      if (systemInstruction) {
        modelOpts.systemInstruction = systemInstruction;
      }
      const model = this.client.getGenerativeModel(modelOpts);

      const lastMessage = filtered[filtered.length - 1]?.content || messages[messages.length - 1].content;

      // Build history from all but the last message, merging consecutive same-role messages
      let history = [];
      if (filtered.length > 1) {
        const merged = [];
        for (const msg of filtered.slice(0, -1)) {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          const last = merged[merged.length - 1];
          if (last && last.role === role) {
            last.parts[0].text += '\n' + msg.content;
          } else {
            merged.push({ role, parts: [{ text: msg.content }] });
          }
        }

        // Gemini requires history to start with 'user' role - drop leading 'model' messages
        while (merged.length > 0 && merged[0].role === 'model') {
          merged.shift();
        }

        history = merged;
      }

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastMessage);
      const response = await result.response;

      return {
        content: response.text(),
        provider: this.name,
        model: this.model,
        usage: {
          inputTokens: 0,
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
      // system 메시지 분리 → systemInstruction으로 전달
      let systemInstruction = undefined;
      const filtered = [];
      for (const msg of messages) {
        if (msg.role === 'system') {
          systemInstruction = msg.content;
        } else {
          filtered.push(msg);
        }
      }

      const modelOpts = { model: this.model };
      if (systemInstruction) {
        modelOpts.systemInstruction = systemInstruction;
      }
      const model = this.client.getGenerativeModel(modelOpts);

      // 연속 같은 role 병합 (Gemini는 user/model 교대 필수)
      const merged = [];
      if (filtered.length > 1) {
        for (const msg of filtered.slice(0, -1)) {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          const last = merged[merged.length - 1];
          if (last && last.role === role) {
            last.parts[0].text += '\n' + msg.content;
          } else {
            merged.push({ role, parts: [{ text: msg.content }] });
          }
        }

        // Gemini requires history to start with 'user' role - drop leading 'model' messages
        while (merged.length > 0 && merged[0].role === 'model') {
          merged.shift();
        }
      }

      const lastMessage = filtered[filtered.length - 1]?.content || messages[messages.length - 1].content;

      const chat = model.startChat({ history: merged });
      const result = await chat.sendMessageStream(lastMessage);

      return result.stream;
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }
}
