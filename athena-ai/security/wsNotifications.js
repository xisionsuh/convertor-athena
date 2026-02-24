/**
 * WebSocket 알림 시스템
 * 실시간 이벤트를 프론트엔드에 전달
 */
import { logger } from '../utils/logger.js';

export class WSNotifications {
  constructor() {
    this.clients = new Set();
  }

  /**
   * WebSocket 클라이언트 등록
   */
  addClient(ws) {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    logger.info('WS notification client connected', { total: this.clients.size });
  }

  /**
   * 모든 클라이언트에 알림 전송
   */
  broadcast(event) {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(message);
        }
      } catch (error) {
        logger.warn('Failed to send WS notification', { error: error.message });
      }
    }
  }

  /**
   * 명령 승인 요청 알림
   */
  notifyApprovalRequest(request) {
    this.broadcast({
      type: 'approval_request',
      data: {
        requestId: request.requestId,
        command: request.command,
        securityLevel: request.securityLevel,
        expiresAt: request.expiresAt
      }
    });
  }

  /**
   * 디바이스 상태 변경 알림
   */
  notifyDeviceStatus(device) {
    this.broadcast({
      type: 'device_status',
      data: {
        deviceId: device.id,
        name: device.name,
        status: device.status,
        platform: device.platform
      }
    });
  }

  /**
   * 작업 완료 알림
   */
  notifyTaskComplete(task) {
    this.broadcast({
      type: 'task_complete',
      data: task
    });
  }

  /**
   * 시스템 알림
   */
  notifySystem(message, level = 'info') {
    this.broadcast({
      type: 'system',
      data: { message, level, timestamp: new Date().toISOString() }
    });
  }
}
