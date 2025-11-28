/**
 * Messaging Integration Tool - Slack/Discord 연동
 * Slack과 Discord로 메시지, 알림을 전송하는 기능
 */

import { logger } from '../../utils/logger.js';

/**
 * 메시징 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createMessagingTools(options = {}) {
  const {
    slackToken = process.env.SLACK_BOT_TOKEN,
    slackWebhookUrl = process.env.SLACK_WEBHOOK_URL,
    discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL
  } = options;

  // Slack API 호출 헬퍼
  const callSlackAPI = async (method, body) => {
    if (!slackToken) {
      throw new Error('Slack Bot Token이 설정되지 않았습니다. SLACK_BOT_TOKEN 환경변수를 설정하세요.');
    }

    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${slackToken}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack API 오류: ${data.error}`);
    }
    return data;
  };

  return [
    // Slack 메시지 전송
    {
      name: 'send_slack_message',
      description: 'Slack 채널 또는 사용자에게 메시지를 전송합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: '채널 ID 또는 이름 (#general) 또는 사용자 ID (@user)'
          },
          text: {
            type: 'string',
            description: '전송할 메시지 텍스트'
          },
          blocks: {
            type: 'array',
            description: 'Slack Block Kit 형식의 리치 메시지 (선택사항)',
            items: { type: 'object' }
          },
          threadTs: {
            type: 'string',
            description: '스레드 타임스탬프 (스레드 답장용)'
          },
          unfurlLinks: {
            type: 'boolean',
            description: '링크 미리보기 활성화',
            default: true
          }
        },
        required: ['channel', 'text']
      },
      execute: async (args) => {
        const { channel, text, blocks, threadTs, unfurlLinks = true } = args;

        try {
          logger.info('Slack 메시지 전송', { channel });

          const body = {
            channel,
            text,
            unfurl_links: unfurlLinks
          };

          if (blocks) {
            body.blocks = blocks;
          }
          if (threadTs) {
            body.thread_ts = threadTs;
          }

          const response = await callSlackAPI('chat.postMessage', body);

          logger.info('Slack 메시지 전송 완료', { ts: response.ts });

          return {
            success: true,
            messageId: response.ts,
            channel: response.channel,
            timestamp: new Date().toISOString()
          };

        } catch (error) {
          logger.error('Slack 메시지 전송 오류', error);
          throw new Error(`Slack 전송 실패: ${error.message}`);
        }
      }
    },

    // Slack Webhook으로 메시지 전송 (토큰 불필요)
    {
      name: 'send_slack_webhook',
      description: 'Slack Incoming Webhook을 통해 메시지를 전송합니다. Bot Token 없이 사용 가능.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '전송할 메시지'
          },
          blocks: {
            type: 'array',
            description: 'Block Kit 형식 메시지',
            items: { type: 'object' }
          },
          webhookUrl: {
            type: 'string',
            description: 'Webhook URL (환경변수 대신 직접 지정)'
          },
          username: {
            type: 'string',
            description: '표시할 봇 이름',
            default: 'Athena AI'
          },
          iconEmoji: {
            type: 'string',
            description: '표시할 이모지 아이콘',
            default: ':robot_face:'
          }
        },
        required: ['text']
      },
      execute: async (args) => {
        const {
          text,
          blocks,
          webhookUrl,
          username = 'Athena AI',
          iconEmoji = ':robot_face:'
        } = args;

        const url = webhookUrl || slackWebhookUrl;
        if (!url) {
          throw new Error('Slack Webhook URL이 설정되지 않았습니다.');
        }

        try {
          logger.info('Slack Webhook 메시지 전송');

          const body = {
            text,
            username,
            icon_emoji: iconEmoji
          };

          if (blocks) {
            body.blocks = blocks;
          }

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
          }

          logger.info('Slack Webhook 전송 완료');

          return {
            success: true,
            timestamp: new Date().toISOString()
          };

        } catch (error) {
          logger.error('Slack Webhook 오류', error);
          throw new Error(`Slack Webhook 실패: ${error.message}`);
        }
      }
    },

    // Discord Webhook으로 메시지 전송
    {
      name: 'send_discord_message',
      description: 'Discord Webhook을 통해 메시지를 전송합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '전송할 메시지 (2000자 이내)'
          },
          webhookUrl: {
            type: 'string',
            description: 'Discord Webhook URL (환경변수 대신 직접 지정)'
          },
          username: {
            type: 'string',
            description: '표시할 봇 이름',
            default: 'Athena AI'
          },
          avatarUrl: {
            type: 'string',
            description: '표시할 아바타 이미지 URL'
          },
          embeds: {
            type: 'array',
            description: 'Discord Embed 객체 배열 (리치 메시지)',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                color: { type: 'number' },
                fields: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      value: { type: 'string' },
                      inline: { type: 'boolean' }
                    }
                  }
                },
                footer: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' }
                  }
                },
                timestamp: { type: 'string' }
              }
            }
          },
          tts: {
            type: 'boolean',
            description: 'TTS(텍스트 음성 변환) 사용 여부',
            default: false
          }
        },
        required: ['content']
      },
      execute: async (args) => {
        const {
          content,
          webhookUrl,
          username = 'Athena AI',
          avatarUrl,
          embeds,
          tts = false
        } = args;

        const url = webhookUrl || discordWebhookUrl;
        if (!url) {
          throw new Error('Discord Webhook URL이 설정되지 않았습니다.');
        }

        if (content && content.length > 2000) {
          throw new Error('Discord 메시지는 2000자를 초과할 수 없습니다.');
        }

        try {
          logger.info('Discord 메시지 전송');

          const body = {
            content,
            username,
            tts
          };

          if (avatarUrl) {
            body.avatar_url = avatarUrl;
          }
          if (embeds) {
            body.embeds = embeds;
          }

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          logger.info('Discord 메시지 전송 완료');

          return {
            success: true,
            timestamp: new Date().toISOString()
          };

        } catch (error) {
          logger.error('Discord 메시지 오류', error);
          throw new Error(`Discord 전송 실패: ${error.message}`);
        }
      }
    },

    // 리치 알림 메시지 생성 (Slack/Discord 공용)
    {
      name: 'send_notification',
      description: '알림 메시지를 Slack과 Discord에 동시에 전송합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '알림 제목'
          },
          message: {
            type: 'string',
            description: '알림 내용'
          },
          type: {
            type: 'string',
            enum: ['info', 'success', 'warning', 'error'],
            description: '알림 유형',
            default: 'info'
          },
          targets: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['slack', 'discord']
            },
            description: '전송 대상 (기본: 모두)',
            default: ['slack', 'discord']
          },
          slackChannel: {
            type: 'string',
            description: 'Slack 채널 (Webhook 사용 시 불필요)'
          },
          fields: {
            type: 'array',
            description: '추가 필드 정보',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'string' }
              }
            }
          }
        },
        required: ['title', 'message']
      },
      execute: async (args) => {
        const {
          title,
          message,
          type = 'info',
          targets = ['slack', 'discord'],
          slackChannel,
          fields = []
        } = args;

        // 타입별 색상 및 이모지
        const typeConfig = {
          info: { color: 0x3498db, emoji: ':information_source:', slackColor: '#3498db' },
          success: { color: 0x2ecc71, emoji: ':white_check_mark:', slackColor: '#2ecc71' },
          warning: { color: 0xf39c12, emoji: ':warning:', slackColor: '#f39c12' },
          error: { color: 0xe74c3c, emoji: ':x:', slackColor: '#e74c3c' }
        };

        const config = typeConfig[type] || typeConfig.info;
        const results = { slack: null, discord: null };

        try {
          // Slack 전송
          if (targets.includes('slack')) {
            const slackBlocks = [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: `${config.emoji} ${title}`,
                  emoji: true
                }
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: message
                }
              }
            ];

            if (fields.length > 0) {
              slackBlocks.push({
                type: 'section',
                fields: fields.map(f => ({
                  type: 'mrkdwn',
                  text: `*${f.name}*\n${f.value}`
                }))
              });
            }

            slackBlocks.push({
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Sent by Athena AI | ${new Date().toLocaleString('ko-KR')}`
                }
              ]
            });

            try {
              if (slackWebhookUrl) {
                await fetch(slackWebhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    text: `${title}: ${message}`,
                    blocks: slackBlocks,
                    username: 'Athena AI',
                    icon_emoji: config.emoji
                  })
                });
                results.slack = { success: true };
              } else if (slackToken && slackChannel) {
                await callSlackAPI('chat.postMessage', {
                  channel: slackChannel,
                  text: `${title}: ${message}`,
                  blocks: slackBlocks
                });
                results.slack = { success: true };
              } else {
                results.slack = { success: false, error: 'Slack 설정 없음' };
              }
            } catch (e) {
              results.slack = { success: false, error: e.message };
            }
          }

          // Discord 전송
          if (targets.includes('discord')) {
            if (discordWebhookUrl) {
              try {
                const embed = {
                  title,
                  description: message,
                  color: config.color,
                  timestamp: new Date().toISOString(),
                  footer: {
                    text: 'Athena AI'
                  }
                };

                if (fields.length > 0) {
                  embed.fields = fields.map(f => ({
                    name: f.name,
                    value: f.value,
                    inline: true
                  }));
                }

                await fetch(discordWebhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    username: 'Athena AI',
                    embeds: [embed]
                  })
                });
                results.discord = { success: true };
              } catch (e) {
                results.discord = { success: false, error: e.message };
              }
            } else {
              results.discord = { success: false, error: 'Discord Webhook URL 없음' };
            }
          }

          logger.info('알림 전송 완료', results);

          return {
            success: true,
            results,
            timestamp: new Date().toISOString()
          };

        } catch (error) {
          logger.error('알림 전송 오류', error);
          throw new Error(`알림 전송 실패: ${error.message}`);
        }
      }
    },

    // Slack 채널 목록 조회
    {
      name: 'list_slack_channels',
      description: 'Slack 워크스페이스의 채널 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          types: {
            type: 'string',
            description: '채널 유형 (public_channel, private_channel)',
            default: 'public_channel'
          },
          limit: {
            type: 'number',
            description: '조회할 최대 채널 수',
            default: 100
          }
        }
      },
      execute: async (args) => {
        const { types = 'public_channel', limit = 100 } = args;

        try {
          const response = await callSlackAPI('conversations.list', {
            types,
            limit,
            exclude_archived: true
          });

          const channels = response.channels.map(ch => ({
            id: ch.id,
            name: ch.name,
            topic: ch.topic?.value || '',
            memberCount: ch.num_members,
            isPrivate: ch.is_private
          }));

          logger.info('Slack 채널 목록 조회', { count: channels.length });

          return {
            success: true,
            channels,
            total: channels.length
          };

        } catch (error) {
          logger.error('Slack 채널 목록 조회 오류', error);
          throw new Error(`채널 목록 조회 실패: ${error.message}`);
        }
      }
    },

    // 메시징 설정 가이드
    {
      name: 'messaging_setup_guide',
      description: 'Slack과 Discord 연동을 위한 설정 가이드를 제공합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        return {
          success: true,
          slack: {
            webhookSetup: [
              '1. https://api.slack.com/apps 에서 새 앱 생성',
              '2. "Incoming Webhooks" 활성화',
              '3. "Add New Webhook to Workspace" 클릭',
              '4. 채널 선택 후 Webhook URL 복사',
              '5. SLACK_WEBHOOK_URL 환경변수에 설정'
            ],
            botTokenSetup: [
              '1. https://api.slack.com/apps 에서 앱 선택',
              '2. "OAuth & Permissions" 메뉴',
              '3. Bot Token Scopes에 chat:write, channels:read 추가',
              '4. "Install to Workspace" 클릭',
              '5. Bot User OAuth Token 복사',
              '6. SLACK_BOT_TOKEN 환경변수에 설정'
            ],
            requiredScopes: [
              'chat:write - 메시지 전송',
              'channels:read - 채널 목록 조회',
              'users:read - 사용자 정보 조회 (선택)'
            ]
          },
          discord: {
            webhookSetup: [
              '1. Discord 서버 설정 > 연동',
              '2. "웹후크" 선택 > "새 웹후크" 클릭',
              '3. 이름과 채널 설정',
              '4. "웹후크 URL 복사" 클릭',
              '5. DISCORD_WEBHOOK_URL 환경변수에 설정'
            ]
          },
          environmentVariables: {
            SLACK_WEBHOOK_URL: 'Slack Incoming Webhook URL',
            SLACK_BOT_TOKEN: 'Slack Bot OAuth Token (xoxb-...)',
            DISCORD_WEBHOOK_URL: 'Discord Webhook URL'
          }
        };
      }
    }
  ];
}
