/**
 * ChannelRouter - Manages multiple messaging channels.
 * Routes messages, broadcasts, and coordinates lifecycle across channels.
 */

import { logger } from '../utils/logger.js';

export class ChannelRouter {
  constructor({ channels = [] } = {}) {
    /** @type {Map<string, import('./channelInterface.js').ChannelInterface>} */
    this.channels = new Map();

    for (const channel of channels) {
      this.addChannel(channel);
    }
  }

  addChannel(channel) {
    if (!channel.channelType) {
      throw new Error('Channel must have a channelType property');
    }
    if (this.channels.has(channel.channelType)) {
      logger.warn(`ChannelRouter: Replacing existing channel "${channel.channelType}"`);
    }
    this.channels.set(channel.channelType, channel);
    logger.info(`ChannelRouter: Added channel "${channel.channelType}" (enabled=${channel.enabled})`);
  }

  removeChannel(channelType) {
    const removed = this.channels.delete(channelType);
    if (removed) {
      logger.info(`ChannelRouter: Removed channel "${channelType}"`);
    }
    return removed;
  }

  getChannel(channelType) {
    return this.channels.get(channelType) || null;
  }

  getEnabledChannels() {
    return [...this.channels.values()].filter(ch => ch.enabled);
  }

  /**
   * Broadcast a message to all enabled channels.
   * @returns {Object} Results keyed by channelType: true/false
   */
  async broadcast(text, options = {}) {
    const results = {};
    const enabled = this.getEnabledChannels();

    const promises = enabled.map(async (channel) => {
      try {
        // Use chatId from options or fall back to channel-specific default
        const chatId = options.chatIds?.[channel.channelType] || options.chatId || null;
        results[channel.channelType] = await channel.sendMessage(chatId, text, options);
      } catch (error) {
        logger.error(`ChannelRouter: broadcast failed for ${channel.channelType}`, error);
        results[channel.channelType] = false;
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  setHandler(handler) {
    for (const channel of this.channels.values()) {
      channel.setHandler(handler);
    }
  }

  startAll() {
    for (const channel of this.channels.values()) {
      if (channel.enabled) {
        try {
          channel.startListening();
          logger.info(`ChannelRouter: Started "${channel.channelType}"`);
        } catch (error) {
          logger.error(`ChannelRouter: Failed to start "${channel.channelType}"`, error);
        }
      } else {
        logger.info(`ChannelRouter: Skipping disabled channel "${channel.channelType}"`);
      }
    }
  }

  stopAll() {
    for (const channel of this.channels.values()) {
      try {
        channel.stopListening();
      } catch (error) {
        logger.error(`ChannelRouter: Failed to stop "${channel.channelType}"`, error);
      }
    }
    logger.info('ChannelRouter: All channels stopped');
  }
}
