/**
 * Remote Device Tool - 원격 디바이스 제어 MCP 도구
 * 디바이스 목록 조회, 화면 캡처, 시스템 정보, 커맨드 실행 등
 */

import { logger } from '../../utils/logger.js';

/**
 * 원격 디바이스 제어 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createRemoteDeviceTools(options = {}) {
  const { nodeServer, remoteCommandManager, pairingManager } = options;

  return [
    // 디바이스 목록 조회
    {
      name: 'list_devices',
      description: '연결된 원격 디바이스 목록을 조회합니다. 페어링된 디바이스와 현재 온라인 디바이스를 모두 표시합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          includeOffline: {
            type: 'boolean',
            description: '오프라인(페어링됨) 디바이스도 포함',
            default: true
          }
        }
      },
      execute: async (args) => {
        const { includeOffline = true } = args;

        try {
          const connected = nodeServer ? nodeServer.getConnectedDevices() : [];
          const connectedIds = new Set(connected.map(d => d.id));

          let allDevices = connected.map(d => ({
            ...d,
            status: 'online'
          }));

          // 오프라인 디바이스 추가
          if (includeOffline && pairingManager) {
            const paired = pairingManager.getPairedDevices();
            const offline = paired
              .filter(d => !connectedIds.has(d.id))
              .map(d => ({
                id: d.id,
                name: d.name,
                platform: d.platform,
                capabilities: d.capabilities,
                lastSeen: d.lastSeen,
                status: 'offline'
              }));
            allDevices = allDevices.concat(offline);
          }

          return {
            success: true,
            devices: allDevices,
            onlineCount: connected.length,
            totalCount: allDevices.length
          };
        } catch (error) {
          logger.error('디바이스 목록 조회 실패', { error: error.message });
          throw new Error(`디바이스 목록 조회 실패: ${error.message}`);
        }
      }
    },

    // 페어링 코드 생성
    {
      name: 'generate_pairing_code',
      description: '새 디바이스 페어링을 위한 6자리 코드를 생성합니다. 코드는 5분간 유효합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        if (!pairingManager) {
          throw new Error('PairingManager가 초기화되지 않음');
        }

        try {
          const result = pairingManager.generateCode();
          return {
            success: true,
            code: result.code,
            expiresAt: result.expiresAt,
            ttlSeconds: result.ttlSeconds,
            message: `페어링 코드: ${result.code} (${result.ttlSeconds}초 유효)`
          };
        } catch (error) {
          throw new Error(`페어링 코드 생성 실패: ${error.message}`);
        }
      }
    },

    // 디바이스 페어링 해제
    {
      name: 'unpair_device',
      description: '디바이스의 페어링을 해제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: {
            type: 'string',
            description: '해제할 디바이스 ID'
          }
        },
        required: ['deviceId']
      },
      execute: async (args) => {
        if (!pairingManager) {
          throw new Error('PairingManager가 초기화되지 않음');
        }

        try {
          const result = pairingManager.unpairDevice(args.deviceId);
          return { success: true, ...result };
        } catch (error) {
          throw new Error(`페어링 해제 실패: ${error.message}`);
        }
      }
    },

    // 화면 캡처
    {
      name: 'screen_capture',
      description: '원격 디바이스의 화면을 캡처합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: {
            type: 'string',
            description: '대상 디바이스 ID'
          },
          display: {
            type: 'number',
            description: '캡처할 디스플레이 번호 (기본: 메인 디스플레이)',
            default: 0
          }
        },
        required: ['deviceId']
      },
      execute: async (args) => {
        if (!remoteCommandManager) {
          throw new Error('RemoteCommandManager가 초기화되지 않음');
        }

        try {
          const result = await remoteCommandManager.sendCommand(
            args.deviceId,
            'screen_capture',
            { display: args.display || 0 }
          );
          return { success: true, ...result };
        } catch (error) {
          throw new Error(`화면 캡처 실패: ${error.message}`);
        }
      }
    },

    // 시스템 정보 조회
    {
      name: 'device_system_info',
      description: '원격 디바이스의 시스템 정보(CPU, 메모리, 디스크 등)를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: {
            type: 'string',
            description: '대상 디바이스 ID'
          }
        },
        required: ['deviceId']
      },
      execute: async (args) => {
        if (!remoteCommandManager) {
          throw new Error('RemoteCommandManager가 초기화되지 않음');
        }

        try {
          const result = await remoteCommandManager.sendCommand(
            args.deviceId,
            'system_info',
            {}
          );
          return { success: true, ...result };
        } catch (error) {
          throw new Error(`시스템 정보 조회 실패: ${error.message}`);
        }
      }
    },

    // 원격 커맨드 실행
    {
      name: 'device_run_command',
      description: '원격 디바이스에서 셸 커맨드를 실행합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: {
            type: 'string',
            description: '대상 디바이스 ID'
          },
          command: {
            type: 'string',
            description: '실행할 셸 커맨드'
          },
          cwd: {
            type: 'string',
            description: '작업 디렉토리 (선택)'
          }
        },
        required: ['deviceId', 'command']
      },
      execute: async (args) => {
        if (!remoteCommandManager) {
          throw new Error('RemoteCommandManager가 초기화되지 않음');
        }

        try {
          const result = await remoteCommandManager.sendCommand(
            args.deviceId,
            'run_command',
            { command: args.command, cwd: args.cwd }
          );
          return { success: true, ...result };
        } catch (error) {
          throw new Error(`커맨드 실행 실패: ${error.message}`);
        }
      }
    },

    // 알림 전송
    {
      name: 'device_send_notification',
      description: '원격 디바이스에 알림을 전송합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: {
            type: 'string',
            description: '대상 디바이스 ID'
          },
          title: {
            type: 'string',
            description: '알림 제목'
          },
          message: {
            type: 'string',
            description: '알림 메시지'
          }
        },
        required: ['deviceId', 'title', 'message']
      },
      execute: async (args) => {
        if (!remoteCommandManager) {
          throw new Error('RemoteCommandManager가 초기화되지 않음');
        }

        try {
          const result = await remoteCommandManager.sendCommand(
            args.deviceId,
            'notification',
            { title: args.title, message: args.message }
          );
          return { success: true, ...result };
        } catch (error) {
          throw new Error(`알림 전송 실패: ${error.message}`);
        }
      }
    }
  ];
}
