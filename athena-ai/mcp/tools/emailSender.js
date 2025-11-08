/**
 * 이메일 전송 도구
 * SMTP를 통해 이메일을 전송하는 MCP 도구
 */

import { logger } from '../../utils/logger.js';

/**
 * 이메일 전송 도구 생성 함수
 */
export function createEmailSenderTool(options = {}) {
  // 환경 변수에서 SMTP 설정 가져오기
  const smtpConfig = {
    host: options.smtpHost || process.env.SMTP_HOST,
    port: options.smtpPort || parseInt(process.env.SMTP_PORT || '587'),
    secure: options.smtpSecure !== undefined ? options.smtpSecure : (process.env.SMTP_SECURE === 'true'),
    auth: {
      user: options.smtpUser || process.env.SMTP_USER,
      pass: options.smtpPass || process.env.SMTP_PASS
    }
  };

  return {
    name: 'send_email',
    description: 'SMTP를 통해 이메일을 전송합니다. 환경 변수에 SMTP 설정이 필요합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: '수신자 이메일 주소 (여러 주소는 쉼표로 구분)'
        },
        subject: {
          type: 'string',
          description: '이메일 제목'
        },
        text: {
          type: 'string',
          description: '이메일 본문 (텍스트)'
        },
        html: {
          type: 'string',
          description: '이메일 본문 (HTML)'
        },
        cc: {
          type: 'string',
          description: '참조 이메일 주소 (여러 주소는 쉼표로 구분)'
        },
        bcc: {
          type: 'string',
          description: '숨은 참조 이메일 주소 (여러 주소는 쉼표로 구분)'
        },
        from: {
          type: 'string',
          description: '발신자 이메일 주소 (기본값: SMTP_USER)'
        },
        attachments: {
          type: 'array',
          description: '첨부 파일 배열',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              path: { type: 'string' },
              content: { type: 'string' }
            }
          }
        }
      },
      required: ['to', 'subject']
    },
    execute: async (args) => {
      const { to, subject, text, html, cc, bcc, from, attachments } = args;

      try {
        // Nodemailer 동적 import
        let nodemailer;
        try {
          nodemailer = (await import('nodemailer')).default;
        } catch (error) {
          return {
            success: false,
            error: 'Nodemailer library not available',
            message: '이메일 전송 기능을 사용하려면 nodemailer 패키지가 필요합니다. npm install nodemailer를 실행하세요.'
          };
        }

        // SMTP 설정 확인
        if (!smtpConfig.host || !smtpConfig.auth.user || !smtpConfig.auth.pass) {
          return {
            success: false,
            error: 'SMTP configuration missing',
            message: 'SMTP 설정이 완료되지 않았습니다. 환경 변수 SMTP_HOST, SMTP_USER, SMTP_PASS를 설정하세요.'
          };
        }

        // 본문 확인
        if (!text && !html) {
          return {
            success: false,
            error: 'Email body required',
            message: '이메일 본문(text 또는 html)이 필요합니다.'
          };
        }

        logger.info('이메일 전송 시작', {
          to,
          subject,
          hasText: !!text,
          hasHtml: !!html
        });

        // Nodemailer transporter 생성
        const transporter = nodemailer.createTransport({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          auth: smtpConfig.auth
        });

        // 이메일 옵션 구성
        const mailOptions = {
          from: from || smtpConfig.auth.user,
          to: to,
          subject: subject,
          text: text,
          html: html,
          cc: cc,
          bcc: bcc,
          attachments: attachments
        };

        // 이메일 전송
        const info = await transporter.sendMail(mailOptions);

        logger.info('이메일 전송 완료', {
          messageId: info.messageId,
          to,
          subject
        });

        return {
          success: true,
          messageId: info.messageId,
          to,
          subject,
          accepted: info.accepted,
          rejected: info.rejected,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error('이메일 전송 실패', error, { to, subject });
        return {
          success: false,
          error: error.message,
          to,
          subject
        };
      }
    }
  };
}
