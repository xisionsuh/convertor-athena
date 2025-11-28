// Base AI Provider Interface
export class AIProvider {
  constructor(name, apiKey, config = {}) {
    this.name = name;
    this.apiKey = apiKey;
    this.config = config;
    this.isAvailable = true;
    this.lastError = null;
  }

  async chat(messages, options = {}) {
    throw new Error('chat() must be implemented by subclass');
  }

  async streamChat(messages, options = {}) {
    throw new Error('streamChat() must be implemented by subclass');
  }

  async checkHealth() {
    try {
      const response = await this.chat([
        { role: 'user', content: 'ping' }
      ], { maxTokens: 10 });
      this.isAvailable = true;
      this.lastError = null;
      return true;
    } catch (error) {
      this.isAvailable = false;
      this.lastError = error.message;
      return false;
    }
  }

  getStatus() {
    return {
      name: this.name,
      isAvailable: this.isAvailable,
      lastError: this.lastError
    };
  }
}
