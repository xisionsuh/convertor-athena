/**
 * LumielleBot - Telegram Bot Core
 * Long polling 기반 텔레그램 봇. 메시지 수신/발신, 이미지 전송.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const MAX_MSG_LEN = 4096;
const POLL_TIMEOUT = 30;
const API_BASE = 'https://api.telegram.org/bot';

export class LumielleBot {
  constructor(options = {}) {
    this.token = options.token || process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = options.chatId || process.env.TELEGRAM_CHAT_ID || null;
    this.enabled = options.enabled !== false && !!this.token;
    this.baseUrl = `${API_BASE}${this.token}`;
    this.offset = 0;
    this.polling = false;
    this.handler = null; // MessageHandler, set externally
    this.envPath = options.envPath || null; // .env.local path for saving chat_id
    this._processedIds = new Set(); // 중복 방지

    if (!this.token) {
      logger.warn('LumielleBot: TELEGRAM_BOT_TOKEN not configured');
    }
  }

  /**
   * Set the message handler
   */
  setHandler(handler) {
    this.handler = handler;
  }

  /**
   * Start long polling loop
   */
  async startPolling() {
    if (!this.enabled) {
      logger.warn('LumielleBot: Bot disabled (no token)');
      return;
    }

    this.polling = true;
    logger.info('LumielleBot: Polling started');

    // Delete webhook to enable polling mode
    try {
      await this._apiCall('deleteWebhook');
    } catch (e) {
      // ignore
    }

    // Skip old messages on startup - consume all pending updates
    try {
      const resp = await this._apiCall('getUpdates', { offset: -1, limit: 1 });
      const results = resp?.result || [];
      if (results.length > 0) {
        this.offset = results[results.length - 1].update_id + 1;
        logger.info(`LumielleBot: Skipped old messages, offset=${this.offset}`);
      }
    } catch (e) {
      // ignore
    }

    this._pollLoop();
  }

  /**
   * Stop polling
   */
  stopPolling() {
    this.polling = false;
    logger.info('LumielleBot: Polling stopped');
  }

  /**
   * Main poll loop
   */
  async _pollLoop() {
    while (this.polling) {
      try {
        const updates = await this._getUpdates();
        if (updates && updates.length > 0) {
          logger.info(`LumielleBot: Received ${updates.length} updates`);
          for (const update of updates) {
            this.offset = update.update_id + 1;
            const text = update.message?.text || '(no text)';
            logger.info(`LumielleBot: Processing update ${update.update_id}: "${text.substring(0, 50)}"`);
            await this._handleUpdate(update);
          }
        }
      } catch (error) {
        if (this.polling) {
          const isTimeout = error.name === 'TimeoutError' || error.code === 23;
          if (isTimeout) {
            logger.debug('LumielleBot: Poll timeout (expected)');
            await this._sleep(1000);
          } else {
            logger.error('LumielleBot: Poll error', error);
            await this._sleep(5000);
          }
        }
      }
    }
  }

  /**
   * Fetch updates via long polling
   */
  async _getUpdates() {
    const resp = await this._apiCall('getUpdates', {
      offset: this.offset,
      timeout: POLL_TIMEOUT,
      allowed_updates: ['message']
    });
    return resp?.result || [];
  }

  /**
   * Route incoming update to handler
   */
  async _handleUpdate(update) {
    const msg = update.message;
    if (!msg || !msg.text) return;

    // 중복 메시지 방지
    const msgId = msg.message_id;
    if (this._processedIds.has(msgId)) return;
    this._processedIds.add(msgId);
    // 오래된 ID 정리 (최근 200개만 유지)
    if (this._processedIds.size > 200) {
      const ids = [...this._processedIds];
      this._processedIds = new Set(ids.slice(-100));
    }

    const chatId = msg.chat.id;

    // Auto-detect and save owner chat_id on first message
    if (!this.chatId) {
      this.chatId = String(chatId);
      logger.info(`LumielleBot: Owner chat_id detected: ${this.chatId}`);
      this._saveChatId(this.chatId);
    }

    // Auth check: only respond to owner
    if (String(chatId) !== String(this.chatId)) {
      logger.warn(`LumielleBot: Unauthorized message from ${chatId}`);
      await this.sendMessage(chatId, '죄송합니다, 저는 주인님만 모시고 있어요.');
      return;
    }

    // Delegate to handler
    if (this.handler) {
      try {
        await this.handler.handleMessage(msg);
      } catch (error) {
        logger.error('LumielleBot: Handler error', error);
        await this.sendMessage(chatId, '처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
      }
    }
  }

  /**
   * Send text message with auto-split and Markdown fallback
   */
  async sendMessage(chatId, text, parseMode = 'Markdown') {
    if (!this.enabled) return false;

    const targetChatId = chatId || this.chatId;
    if (!targetChatId) {
      logger.warn('LumielleBot: No chat_id available');
      return false;
    }

    const chunks = this._splitMessage(text);
    let success = true;

    for (const chunk of chunks) {
      const ok = await this._sendChunk(targetChatId, chunk, parseMode);
      if (!ok) success = false;
    }

    return success;
  }

  /**
   * Send a single text chunk
   */
  async _sendChunk(chatId, text, parseMode) {
    try {
      const body = {
        chat_id: chatId,
        text: text,
        disable_web_page_preview: true
      };
      if (parseMode) body.parse_mode = parseMode;

      const resp = await this._apiCall('sendMessage', body);

      if (!resp?.ok) {
        // Retry without parse_mode if Markdown fails
        if (parseMode === 'Markdown') {
          logger.warn('LumielleBot: Markdown failed, retrying as plain text');
          return this._sendChunk(chatId, text, null);
        }
        logger.error('LumielleBot: Send failed', { description: resp?.description });
        return false;
      }
      return true;
    } catch (error) {
      logger.error('LumielleBot: Send error', error);
      return false;
    }
  }

  /**
   * Send photo (file path or URL)
   */
  async sendPhoto(chatId, photoSource, caption = '') {
    if (!this.enabled) return false;

    const targetChatId = chatId || this.chatId;
    if (!targetChatId) return false;

    try {
      // If local file path, upload via multipart
      if (fs.existsSync(photoSource)) {
        const formData = new FormData();
        formData.append('chat_id', String(targetChatId));
        formData.append('photo', new Blob([fs.readFileSync(photoSource)]), path.basename(photoSource));
        if (caption) formData.append('caption', caption);

        const resp = await fetch(`${this.baseUrl}/sendPhoto`, {
          method: 'POST',
          body: formData
        });
        const data = await resp.json();
        return data.ok || false;
      } else {
        // URL
        const resp = await this._apiCall('sendPhoto', {
          chat_id: targetChatId,
          photo: photoSource,
          caption: caption || undefined
        });
        return resp?.ok || false;
      }
    } catch (error) {
      logger.error('LumielleBot: sendPhoto error', error);
      return false;
    }
  }

  /**
   * Send "typing..." action
   */
  async sendTyping(chatId) {
    const targetChatId = chatId || this.chatId;
    if (!targetChatId) return;
    try {
      await this._apiCall('sendChatAction', {
        chat_id: targetChatId,
        action: 'typing'
      });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Split message into chunks <= 4096 chars, preferring newline breaks
   */
  _splitMessage(text) {
    if (!text) return [''];
    if (text.length <= MAX_MSG_LEN) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining) {
      if (remaining.length <= MAX_MSG_LEN) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point (newline near the limit)
      let splitAt = remaining.lastIndexOf('\n', MAX_MSG_LEN);
      if (splitAt < MAX_MSG_LEN / 2) {
        splitAt = MAX_MSG_LEN; // Force split if no good newline
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).replace(/^\n+/, '');
    }

    return chunks;
  }

  /**
   * Save chat_id to .env.local
   */
  _saveChatId(chatId) {
    if (!this.envPath) return;
    try {
      let content = '';
      if (fs.existsSync(this.envPath)) {
        content = fs.readFileSync(this.envPath, 'utf-8');
      }

      if (content.includes('TELEGRAM_CHAT_ID=')) {
        content = content.replace(/TELEGRAM_CHAT_ID=.*/, `TELEGRAM_CHAT_ID=${chatId}`);
      } else {
        content += `\nTELEGRAM_CHAT_ID=${chatId}\n`;
      }

      fs.writeFileSync(this.envPath, content, 'utf-8');
      logger.info(`LumielleBot: Chat ID saved to ${this.envPath}`);
    } catch (error) {
      logger.error('LumielleBot: Failed to save chat_id', error);
    }
  }

  /**
   * Generic Telegram Bot API call
   */
  async _apiCall(method, body = {}) {
    const resp = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(method === 'getUpdates' ? (POLL_TIMEOUT + 15) * 1000 : 30000)
    });
    return resp.json();
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
