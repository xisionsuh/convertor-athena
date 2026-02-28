/**
 * TelegramChannel - Thin adapter wrapping the existing LumielleBot.
 * Delegates all operations to bot.js; no logic duplication.
 */

import { logger } from '../utils/logger.js';
import { ChannelInterface } from './channelInterface.js';

export class TelegramChannel extends ChannelInterface {
  /**
   * @param {Object} options
   * @param {import('../telegram/bot.js').LumielleBot} options.bot - existing bot instance
   */
  constructor({ bot }) {
    super({ channelType: 'telegram', config: {} });
    this.bot = bot;
  }

  get enabled() {
    return this.bot.enabled;
  }

  setHandler(handler) {
    super.setHandler(handler);
    this.bot.setHandler(handler);
  }

  async sendMessage(chatId, text, options = {}) {
    const parseMode = options.parseMode ?? 'Markdown';
    return this.bot.sendMessage(chatId, text, parseMode);
  }

  async sendTyping(chatId) {
    return this.bot.sendTyping(chatId);
  }

  async editMessage(chatId, messageId, text) {
    // Telegram Bot API editMessageText
    if (!this.bot.enabled) return false;
    try {
      const resp = await this.bot._apiCall('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        disable_web_page_preview: true
      });
      return resp?.ok || false;
    } catch (error) {
      logger.error('TelegramChannel: editMessage error', error);
      return false;
    }
  }

  async deleteMessage(chatId, messageId) {
    if (!this.bot.enabled) return false;
    try {
      const resp = await this.bot._apiCall('deleteMessage', {
        chat_id: chatId,
        message_id: messageId
      });
      return resp?.ok || false;
    } catch (error) {
      logger.error('TelegramChannel: deleteMessage error', error);
      return false;
    }
  }

  startListening() {
    this.bot.startPolling();
  }

  stopListening() {
    this.bot.stopPolling();
  }

  /**
   * Convert a Telegram message object to the unified format.
   */
  normalizeMessage(rawMessage) {
    const msg = rawMessage;
    return {
      id: String(msg.message_id),
      chatId: String(msg.chat?.id),
      userId: String(msg.from?.id || msg.chat?.id),
      text: msg.text || '',
      timestamp: (msg.date || 0) * 1000, // Telegram uses unix seconds
      channel: 'telegram',
      raw: msg
    };
  }

  /**
   * Passthrough to the bot's sendPhoto for Telegram-specific features.
   */
  async sendPhoto(chatId, photoSource, caption = '') {
    return this.bot.sendPhoto(chatId, photoSource, caption);
  }
}
