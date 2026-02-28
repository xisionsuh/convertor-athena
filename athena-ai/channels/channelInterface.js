/**
 * ChannelInterface - Abstract base class for messaging channels.
 * All channel adapters (Telegram, Discord, etc.) must extend this class.
 */

import { logger } from '../utils/logger.js';

export class ChannelInterface {
  constructor({ channelType, config = {} } = {}) {
    if (new.target === ChannelInterface) {
      throw new Error('ChannelInterface is abstract and cannot be instantiated directly');
    }
    this.channelType = channelType;
    this.config = config;
    this._handler = null;
  }

  get enabled() {
    return false;
  }

  setHandler(handler) {
    this._handler = handler;
  }

  async sendMessage(chatId, text, options = {}) {
    throw new Error(`sendMessage() not implemented for ${this.channelType}`);
  }

  async sendTyping(chatId) {
    throw new Error(`sendTyping() not implemented for ${this.channelType}`);
  }

  async editMessage(chatId, messageId, text) {
    throw new Error(`editMessage() not implemented for ${this.channelType}`);
  }

  async deleteMessage(chatId, messageId) {
    throw new Error(`deleteMessage() not implemented for ${this.channelType}`);
  }

  startListening() {
    throw new Error(`startListening() not implemented for ${this.channelType}`);
  }

  stopListening() {
    throw new Error(`stopListening() not implemented for ${this.channelType}`);
  }

  /**
   * Normalize a raw platform message into a unified format.
   * Subclasses should override this.
   */
  normalizeMessage(rawMessage) {
    return {
      id: null,
      chatId: null,
      userId: null,
      text: '',
      timestamp: Date.now(),
      channel: this.channelType,
      raw: rawMessage
    };
  }
}
