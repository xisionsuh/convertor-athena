/**
 * Google Calendar Tool - 구글 캘린더 연동
 * Google Calendar API를 사용한 일정 관리 기능
 */

import { google } from 'googleapis';
import { logger } from '../../utils/logger.js';

/**
 * Google Calendar 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createGoogleCalendarTools(options = {}) {
  const {
    clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/google',
    refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  } = options;

  // OAuth2 클라이언트 생성
  const getAuth = () => {
    if (!clientId || !clientSecret) {
      throw new Error('Google Calendar API 자격 증명이 설정되지 않았습니다. GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET 환경변수를 설정하세요.');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    if (refreshToken) {
      oauth2Client.setCredentials({ refresh_token: refreshToken });
    }

    return oauth2Client;
  };

  const getCalendar = () => {
    const auth = getAuth();
    return google.calendar({ version: 'v3', auth });
  };

  return [
    // 일정 목록 조회
    {
      name: 'calendar_list_events',
      description: 'Google 캘린더에서 일정 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: '캘린더 ID (기본값: primary)',
            default: 'primary'
          },
          timeMin: {
            type: 'string',
            description: '조회 시작 시간 (ISO 8601 형식, 예: 2024-01-01T00:00:00Z)'
          },
          timeMax: {
            type: 'string',
            description: '조회 종료 시간 (ISO 8601 형식)'
          },
          maxResults: {
            type: 'number',
            description: '최대 결과 수 (기본값: 10)',
            default: 10
          },
          query: {
            type: 'string',
            description: '검색어 (일정 제목, 설명에서 검색)'
          }
        }
      },
      execute: async (args) => {
        const {
          calendarId = 'primary',
          timeMin,
          timeMax,
          maxResults = 10,
          query
        } = args;

        try {
          const calendar = getCalendar();

          const params = {
            calendarId,
            maxResults,
            singleEvents: true,
            orderBy: 'startTime'
          };

          if (timeMin) params.timeMin = timeMin;
          if (timeMax) params.timeMax = timeMax;
          if (query) params.q = query;

          // 기본값: 현재 시간부터
          if (!timeMin && !timeMax) {
            params.timeMin = new Date().toISOString();
          }

          const response = await calendar.events.list(params);

          const events = response.data.items.map(event => ({
            id: event.id,
            title: event.summary,
            description: event.description,
            location: event.location,
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            status: event.status,
            htmlLink: event.htmlLink,
            attendees: event.attendees?.map(a => ({
              email: a.email,
              name: a.displayName,
              responseStatus: a.responseStatus
            }))
          }));

          logger.info('캘린더 일정 조회 완료', { count: events.length });

          return {
            success: true,
            count: events.length,
            events
          };

        } catch (error) {
          logger.error('캘린더 일정 조회 오류', error);
          throw new Error(`캘린더 일정 조회 실패: ${error.message}`);
        }
      }
    },

    // 일정 생성
    {
      name: 'calendar_create_event',
      description: 'Google 캘린더에 새 일정을 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: '캘린더 ID (기본값: primary)',
            default: 'primary'
          },
          title: {
            type: 'string',
            description: '일정 제목'
          },
          description: {
            type: 'string',
            description: '일정 설명'
          },
          location: {
            type: 'string',
            description: '일정 장소'
          },
          startDateTime: {
            type: 'string',
            description: '시작 시간 (ISO 8601 형식, 예: 2024-01-15T09:00:00+09:00)'
          },
          endDateTime: {
            type: 'string',
            description: '종료 시간 (ISO 8601 형식)'
          },
          startDate: {
            type: 'string',
            description: '시작 날짜 (종일 일정용, 예: 2024-01-15)'
          },
          endDate: {
            type: 'string',
            description: '종료 날짜 (종일 일정용)'
          },
          attendees: {
            type: 'array',
            items: { type: 'string' },
            description: '참석자 이메일 목록'
          },
          reminders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                method: { type: 'string', enum: ['email', 'popup'] },
                minutes: { type: 'number' }
              }
            },
            description: '알림 설정 (예: [{method: "popup", minutes: 30}])'
          },
          recurrence: {
            type: 'array',
            items: { type: 'string' },
            description: '반복 규칙 (RRULE 형식, 예: ["RRULE:FREQ=WEEKLY;COUNT=10"])'
          },
          timeZone: {
            type: 'string',
            description: '시간대 (기본값: Asia/Seoul)',
            default: 'Asia/Seoul'
          }
        },
        required: ['title']
      },
      execute: async (args) => {
        const {
          calendarId = 'primary',
          title,
          description,
          location,
          startDateTime,
          endDateTime,
          startDate,
          endDate,
          attendees,
          reminders,
          recurrence,
          timeZone = 'Asia/Seoul'
        } = args;

        try {
          const calendar = getCalendar();

          const event = {
            summary: title,
            description,
            location
          };

          // 시작/종료 시간 설정
          if (startDateTime) {
            event.start = { dateTime: startDateTime, timeZone };
            event.end = { dateTime: endDateTime || startDateTime, timeZone };
          } else if (startDate) {
            event.start = { date: startDate };
            event.end = { date: endDate || startDate };
          } else {
            // 기본값: 현재 시간부터 1시간
            const now = new Date();
            const end = new Date(now.getTime() + 60 * 60 * 1000);
            event.start = { dateTime: now.toISOString(), timeZone };
            event.end = { dateTime: end.toISOString(), timeZone };
          }

          // 참석자 추가
          if (attendees && attendees.length > 0) {
            event.attendees = attendees.map(email => ({ email }));
          }

          // 알림 설정
          if (reminders && reminders.length > 0) {
            event.reminders = {
              useDefault: false,
              overrides: reminders
            };
          }

          // 반복 규칙
          if (recurrence) {
            event.recurrence = recurrence;
          }

          const response = await calendar.events.insert({
            calendarId,
            resource: event,
            sendUpdates: attendees ? 'all' : 'none'
          });

          logger.info('캘린더 일정 생성 완료', { eventId: response.data.id });

          return {
            success: true,
            event: {
              id: response.data.id,
              title: response.data.summary,
              start: response.data.start,
              end: response.data.end,
              htmlLink: response.data.htmlLink
            }
          };

        } catch (error) {
          logger.error('캘린더 일정 생성 오류', error);
          throw new Error(`캘린더 일정 생성 실패: ${error.message}`);
        }
      }
    },

    // 일정 수정
    {
      name: 'calendar_update_event',
      description: 'Google 캘린더의 기존 일정을 수정합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: '캘린더 ID (기본값: primary)',
            default: 'primary'
          },
          eventId: {
            type: 'string',
            description: '수정할 일정 ID'
          },
          title: {
            type: 'string',
            description: '새 일정 제목'
          },
          description: {
            type: 'string',
            description: '새 일정 설명'
          },
          location: {
            type: 'string',
            description: '새 일정 장소'
          },
          startDateTime: {
            type: 'string',
            description: '새 시작 시간'
          },
          endDateTime: {
            type: 'string',
            description: '새 종료 시간'
          },
          timeZone: {
            type: 'string',
            description: '시간대',
            default: 'Asia/Seoul'
          }
        },
        required: ['eventId']
      },
      execute: async (args) => {
        const {
          calendarId = 'primary',
          eventId,
          title,
          description,
          location,
          startDateTime,
          endDateTime,
          timeZone = 'Asia/Seoul'
        } = args;

        try {
          const calendar = getCalendar();

          // 기존 일정 가져오기
          const existing = await calendar.events.get({ calendarId, eventId });
          const event = existing.data;

          // 업데이트할 필드만 수정
          if (title) event.summary = title;
          if (description !== undefined) event.description = description;
          if (location !== undefined) event.location = location;
          if (startDateTime) event.start = { dateTime: startDateTime, timeZone };
          if (endDateTime) event.end = { dateTime: endDateTime, timeZone };

          const response = await calendar.events.update({
            calendarId,
            eventId,
            resource: event
          });

          logger.info('캘린더 일정 수정 완료', { eventId });

          return {
            success: true,
            event: {
              id: response.data.id,
              title: response.data.summary,
              start: response.data.start,
              end: response.data.end,
              htmlLink: response.data.htmlLink
            }
          };

        } catch (error) {
          logger.error('캘린더 일정 수정 오류', error);
          throw new Error(`캘린더 일정 수정 실패: ${error.message}`);
        }
      }
    },

    // 일정 삭제
    {
      name: 'calendar_delete_event',
      description: 'Google 캘린더에서 일정을 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: '캘린더 ID (기본값: primary)',
            default: 'primary'
          },
          eventId: {
            type: 'string',
            description: '삭제할 일정 ID'
          }
        },
        required: ['eventId']
      },
      execute: async (args) => {
        const { calendarId = 'primary', eventId } = args;

        try {
          const calendar = getCalendar();

          await calendar.events.delete({ calendarId, eventId });

          logger.info('캘린더 일정 삭제 완료', { eventId });

          return {
            success: true,
            message: `일정이 삭제되었습니다. (ID: ${eventId})`
          };

        } catch (error) {
          logger.error('캘린더 일정 삭제 오류', error);
          throw new Error(`캘린더 일정 삭제 실패: ${error.message}`);
        }
      }
    },

    // 빠른 일정 추가 (자연어)
    {
      name: 'calendar_quick_add',
      description: '자연어로 빠르게 일정을 추가합니다. (예: "내일 오후 3시 팀 미팅")',
      inputSchema: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: '캘린더 ID (기본값: primary)',
            default: 'primary'
          },
          text: {
            type: 'string',
            description: '자연어 일정 텍스트 (예: "내일 오후 3시 팀 미팅", "금요일 저녁 7시 회식")'
          }
        },
        required: ['text']
      },
      execute: async (args) => {
        const { calendarId = 'primary', text } = args;

        try {
          const calendar = getCalendar();

          const response = await calendar.events.quickAdd({
            calendarId,
            text
          });

          logger.info('캘린더 빠른 일정 추가 완료', { eventId: response.data.id });

          return {
            success: true,
            event: {
              id: response.data.id,
              title: response.data.summary,
              start: response.data.start,
              end: response.data.end,
              htmlLink: response.data.htmlLink
            }
          };

        } catch (error) {
          logger.error('캘린더 빠른 일정 추가 오류', error);
          throw new Error(`캘린더 빠른 일정 추가 실패: ${error.message}`);
        }
      }
    }
  ];
}
