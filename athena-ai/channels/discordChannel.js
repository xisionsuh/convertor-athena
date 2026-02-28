/**
 * DiscordChannel - Discord adapter for the channel abstraction layer.
 * Uses discord.js if available; falls back to disabled state with a warning.
 */

import { logger } from '../utils/logger.js';
import { ChannelInterface } from './channelInterface.js';

let Discord = null;

try {
  Discord = await import('discord.js');
} catch {
  // discord.js not installed - handled in constructor
}

export class DiscordChannel extends ChannelInterface {
  /**
   * @param {Object} options
   * @param {string} options.token - Discord bot token
   * @param {string} [options.guildId] - Target guild (server) ID
   * @param {string[]} [options.channelIds] - Allowed channel IDs to listen on
   */
  constructor({ token, guildId = null, channelIds = [] } = {}) {
    super({ channelType: 'discord', config: { guildId, channelIds } });
    this.token = token;
    this.guildId = guildId;
    this.channelIds = new Set(channelIds);
    this.client = null;
    this._enabled = false;

    if (!Discord) {
      logger.warn('DiscordChannel: discord.js not installed. Run "npm install discord.js" to enable.');
      return;
    }

    if (!this.token) {
      logger.warn('DiscordChannel: No token provided, channel disabled');
      return;
    }

    const { Client, GatewayIntentBits } = Discord;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this._setupEventHandlers();
    this._enabled = true;
  }

  get enabled() {
    return this._enabled && this.client !== null;
  }

  _setupEventHandlers() {
    this.client.on('ready', () => {
      logger.info(`DiscordChannel: Logged in as ${this.client.user.tag}`);
    });

    this.client.on('messageCreate', async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Filter by allowed channels if configured
      if (this.channelIds.size > 0 && !this.channelIds.has(message.channel.id)) return;

      // Filter by guild if configured
      if (this.guildId && message.guild?.id !== this.guildId) return;

      if (this._handler) {
        try {
          const normalized = this.normalizeMessage(message);
          await this._handler.handleMessage(normalized);
        } catch (error) {
          logger.error('DiscordChannel: Handler error', error);
        }
      }
    });

    this.client.on('error', (error) => {
      logger.error('DiscordChannel: Client error', error);
    });
  }

  async sendMessage(chatId, text, options = {}) {
    if (!this.enabled) return false;
    try {
      const channel = await this.client.channels.fetch(chatId);
      if (!channel) return false;

      // Discord has a 2000 char limit; split if needed
      const chunks = this._splitText(text, 2000);
      for (const chunk of chunks) {
        await channel.send(chunk);
      }
      return true;
    } catch (error) {
      logger.error('DiscordChannel: sendMessage error', error);
      return false;
    }
  }

  async sendTyping(chatId) {
    if (!this.enabled) return;
    try {
      const channel = await this.client.channels.fetch(chatId);
      if (channel) await channel.sendTyping();
    } catch {
      // ignore
    }
  }

  async editMessage(chatId, messageId, text) {
    if (!this.enabled) return false;
    try {
      const channel = await this.client.channels.fetch(chatId);
      if (!channel) return false;
      const message = await channel.messages.fetch(messageId);
      if (!message) return false;
      await message.edit(text);
      return true;
    } catch (error) {
      logger.error('DiscordChannel: editMessage error', error);
      return false;
    }
  }

  async deleteMessage(chatId, messageId) {
    if (!this.enabled) return false;
    try {
      const channel = await this.client.channels.fetch(chatId);
      if (!channel) return false;
      const message = await channel.messages.fetch(messageId);
      if (!message) return false;
      await message.delete();
      return true;
    } catch (error) {
      logger.error('DiscordChannel: deleteMessage error', error);
      return false;
    }
  }

  async startListening() {
    if (!this.enabled) {
      logger.warn('DiscordChannel: Cannot start - channel disabled');
      return;
    }
    try {
      await this.client.login(this.token);
    } catch (error) {
      logger.error('DiscordChannel: Login failed', error);
      this._enabled = false;
    }
  }

  stopListening() {
    if (this.client) {
      this.client.destroy();
      logger.info('DiscordChannel: Client destroyed');
    }
  }

  normalizeMessage(rawMessage) {
    return {
      id: rawMessage.id,
      chatId: rawMessage.channel?.id || null,
      userId: rawMessage.author?.id || null,
      text: rawMessage.content || '',
      timestamp: rawMessage.createdTimestamp || Date.now(),
      channel: 'discord',
      raw: rawMessage
    };
  }

  /**
   * Split text into chunks respecting Discord's character limit.
   */
  _splitText(text, maxLen) {
    if (!text) return [''];
    if (text.length <= maxLen) return [text];

    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }
      let splitAt = remaining.lastIndexOf('\n', maxLen);
      if (splitAt < maxLen / 2) splitAt = maxLen;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).replace(/^\n+/, '');
    }
    return chunks;
  }
}
