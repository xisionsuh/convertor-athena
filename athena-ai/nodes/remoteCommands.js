/**
 * Remote Command Manager - 원격 디바이스 커맨드 관리
 * Promise 기반 커맨드 전송 및 응답 추적
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export class RemoteCommandManager {
  constructor(options = {}) {
    this.nodeServer = options.nodeServer;
    this.timeout = options.timeout || 30000; // 30초 기본 타임아웃

    // 대기 중인 커맨드 { commandId -> { resolve, reject, timer } }
    this.pendingCommands = new Map();

    // NodeServer에서 응답 이벤트 수신
    if (this.nodeServer) {
      this.nodeServer.on('command_response', (data) => {
        this._handleResponse(data);
      });
    }
  }

  /**
   * 디바이스에 커맨드 전송 (Promise 반환)
   * @param {string} deviceId - 대상 디바이스 ID
   * @param {string} action - 커맨드 액션 (screen_capture, system_info, run_command, etc.)
   * @param {Object} params - 커맨드 파라미터
   * @returns {Promise<Object>} 커맨드 실행 결과
   */
  sendCommand(deviceId, action, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.nodeServer) {
        reject(new Error('NodeServer가 초기화되지 않음'));
        return;
      }

      if (!this.nodeServer.isDeviceConnected(deviceId)) {
        reject(new Error(`디바이스가 연결되어 있지 않음: ${deviceId}`));
        return;
      }

      const commandId = crypto.randomUUID();

      const command = {
        id: commandId,
        action,
        params,
        timestamp: Date.now()
      };

      // 타임아웃 설정
      const timer = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`커맨드 타임아웃 (${this.timeout / 1000}초): ${action}`));
      }, this.timeout);

      // 대기 목록에 추가
      this.pendingCommands.set(commandId, { resolve, reject, timer, action, deviceId });

      try {
        this.nodeServer.sendCommand(deviceId, command);
        logger.debug('커맨드 전송', { commandId, deviceId, action });
      } catch (err) {
        clearTimeout(timer);
        this.pendingCommands.delete(commandId);
        reject(err);
      }
    });
  }

  /**
   * 커맨드 응답 처리
   */
  _handleResponse(data) {
    const { commandId, result, error } = data;

    const pending = this.pendingCommands.get(commandId);
    if (!pending) {
      logger.warn('알 수 없는 커맨드 응답', { commandId });
      return;
    }

    clearTimeout(pending.timer);
    this.pendingCommands.delete(commandId);

    if (error) {
      logger.warn('커맨드 실행 실패', { commandId, action: pending.action, error });
      pending.reject(new Error(error));
    } else {
      logger.debug('커맨드 응답 수신', { commandId, action: pending.action });
      pending.resolve(result);
    }
  }

  /**
   * 대기 중인 커맨드 수
   */
  get pendingCount() {
    return this.pendingCommands.size;
  }

  /**
   * 모든 대기 중인 커맨드 취소
   */
  cancelAll() {
    for (const [commandId, pending] of this.pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(new Error('커맨드 취소됨'));
    }
    this.pendingCommands.clear();
  }

  /**
   * 종료
   */
  close() {
    this.cancelAll();
  }
}
