/**
 * Node Server - WebSocket 기반 디바이스 노드 관리 서버
 * OpenClaw 스타일의 원격 디바이스 제어 시스템
 */

import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export class NodeServer {
  constructor(options = {}) {
    this.wss = null;
    this.devices = new Map(); // deviceId -> { ws, info, capabilities, lastHeartbeat }
    this.heartbeatInterval = options.heartbeatInterval || 60000; // 60초
    this.heartbeatTimer = null;
    this.pairingManager = options.pairingManager || null;

    // 이벤트 리스너
    this.listeners = new Map();
  }

  /**
   * HTTP 서버에 WebSocket 서버 연결
   */
  attach(server) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      // /ws 경로만 처리
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }

      // 토큰 인증
      const token = url.searchParams.get('token') ||
        (request.headers.authorization && request.headers.authorization.replace('Bearer ', ''));

      if (!token) {
        // 페어링 요청은 토큰 없이도 허용 (페어링 코드로 인증)
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          ws.isAuthenticated = false;
          ws.pendingPairing = true;
          this.wss.emit('connection', ws, request);
        });
        return;
      }

      // 토큰 검증
      if (!this.pairingManager || !this.pairingManager.validateToken(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        ws.isAuthenticated = true;
        ws.deviceToken = token;
        this.wss.emit('connection', ws, request);
      });
    });

    this.wss.on('connection', (ws, request) => {
      this._handleConnection(ws, request);
    });

    // 하트비트 체크 시작
    this._startHeartbeatCheck();

    logger.info('NodeServer WebSocket 서버 초기화 완료', { path: '/ws' });
  }

  /**
   * 새 연결 처리
   */
  _handleConnection(ws, request) {
    const clientIp = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
    logger.info('WebSocket 연결', { ip: clientIp, authenticated: ws.isAuthenticated });

    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this._handleMessage(ws, message);
      } catch (err) {
        logger.warn('잘못된 WebSocket 메시지', { error: err.message });
        this._send(ws, { type: 'error', message: '잘못된 메시지 형식' });
      }
    });

    ws.on('close', () => {
      this._handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket 에러', { error: err.message });
    });
  }

  /**
   * 메시지 처리
   */
  _handleMessage(ws, message) {
    const { type } = message;

    switch (type) {
      case 'pair':
        this._handlePair(ws, message);
        break;

      case 'register':
        this._handleRegister(ws, message);
        break;

      case 'heartbeat':
        this._handleHeartbeat(ws, message);
        break;

      case 'response':
        this._handleResponse(ws, message);
        break;

      default:
        logger.warn('알 수 없는 메시지 타입', { type });
        this._send(ws, { type: 'error', message: `알 수 없는 메시지 타입: ${type}` });
    }
  }

  /**
   * 페어링 요청 처리
   */
  _handlePair(ws, message) {
    const { code, deviceName, platform } = message;

    if (!this.pairingManager) {
      this._send(ws, { type: 'pair_result', success: false, error: 'PairingManager 미설정' });
      return;
    }

    const result = this.pairingManager.verifyCode(code);
    if (!result) {
      this._send(ws, { type: 'pair_result', success: false, error: '유효하지 않거나 만료된 페어링 코드' });
      return;
    }

    // 디바이스 등록
    const device = this.pairingManager.registerDevice({
      name: deviceName || 'Unknown Device',
      platform: platform || 'unknown'
    });

    ws.isAuthenticated = true;
    ws.deviceToken = device.token;
    ws.deviceId = device.id;
    ws.pendingPairing = false;

    this._send(ws, {
      type: 'pair_result',
      success: true,
      deviceId: device.id,
      token: device.token
    });

    logger.info('디바이스 페어링 완료', { deviceId: device.id, name: deviceName });
  }

  /**
   * 디바이스 등록 처리 (인증 후 capability 등록)
   */
  _handleRegister(ws, message) {
    if (!ws.isAuthenticated) {
      this._send(ws, { type: 'error', message: '인증되지 않은 연결' });
      return;
    }

    const { deviceId, capabilities, deviceName, platform } = message;

    // 토큰으로 디바이스 정보 조회
    let device = null;
    if (this.pairingManager && ws.deviceToken) {
      device = this.pairingManager.getDeviceByToken(ws.deviceToken);
    }

    const id = deviceId || (device && device.id) || crypto.randomUUID();

    ws.deviceId = id;

    this.devices.set(id, {
      ws,
      info: {
        id,
        name: deviceName || (device && device.name) || 'Unknown',
        platform: platform || (device && device.platform) || 'unknown'
      },
      capabilities: capabilities || [],
      lastHeartbeat: Date.now()
    });

    // DB 업데이트 (capabilities, last_seen)
    if (this.pairingManager && device) {
      this.pairingManager.updateDevice(device.id, {
        capabilities: capabilities || [],
        lastSeen: new Date().toISOString()
      });
    }

    this._send(ws, {
      type: 'registered',
      deviceId: id,
      message: '디바이스 등록 완료'
    });

    this._emit('device_connected', { deviceId: id, capabilities });
    logger.info('디바이스 등록', { deviceId: id, capabilities });
  }

  /**
   * 하트비트 처리
   */
  _handleHeartbeat(ws, message) {
    if (!ws.deviceId) return;

    const device = this.devices.get(ws.deviceId);
    if (device) {
      device.lastHeartbeat = Date.now();
      ws.isAlive = true;
    }

    this._send(ws, { type: 'heartbeat_ack', timestamp: Date.now() });
  }

  /**
   * 커맨드 응답 처리
   */
  _handleResponse(ws, message) {
    const { commandId, result, error } = message;
    this._emit('command_response', { commandId, result, error });
  }

  /**
   * 디바이스 연결 해제 처리
   */
  _handleDisconnect(ws) {
    if (ws.deviceId) {
      const device = this.devices.get(ws.deviceId);
      if (device) {
        logger.info('디바이스 연결 해제', { deviceId: ws.deviceId, name: device.info.name });
        this.devices.delete(ws.deviceId);
        this._emit('device_disconnected', { deviceId: ws.deviceId });
      }
    }
  }

  /**
   * 디바이스에 커맨드 전송
   */
  sendCommand(deviceId, command) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`디바이스를 찾을 수 없음: ${deviceId}`);
    }

    if (device.ws.readyState !== 1) { // WebSocket.OPEN
      this.devices.delete(deviceId);
      throw new Error(`디바이스 연결이 끊어짐: ${deviceId}`);
    }

    this._send(device.ws, {
      type: 'command',
      ...command
    });
  }

  /**
   * 연결된 디바이스 목록 반환
   */
  getConnectedDevices() {
    const devices = [];
    for (const [id, device] of this.devices) {
      devices.push({
        id,
        name: device.info.name,
        platform: device.info.platform,
        capabilities: device.capabilities,
        lastHeartbeat: device.lastHeartbeat,
        connected: device.ws.readyState === 1
      });
    }
    return devices;
  }

  /**
   * 특정 디바이스가 연결 중인지 확인
   */
  isDeviceConnected(deviceId) {
    const device = this.devices.get(deviceId);
    return device && device.ws.readyState === 1;
  }

  /**
   * WebSocket 메시지 전송
   */
  _send(ws, data) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * 하트비트 체크 시작
   */
  _startHeartbeatCheck() {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [deviceId, device] of this.devices) {
        // 60초 이상 하트비트 없으면 연결 해제
        if (now - device.lastHeartbeat > this.heartbeatInterval) {
          logger.warn('하트비트 타임아웃, 디바이스 연결 해제', { deviceId });
          device.ws.terminate();
          this.devices.delete(deviceId);
          this._emit('device_disconnected', { deviceId, reason: 'heartbeat_timeout' });
        }
      }

      // WebSocket 수준 ping/pong
      if (this.wss) {
        this.wss.clients.forEach((ws) => {
          if (!ws.isAlive) {
            ws.terminate();
            return;
          }
          ws.isAlive = false;
          ws.ping();
        });
      }
    }, 30000); // 30초 간격
  }

  /**
   * 이벤트 리스너 등록
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * 이벤트 발생
   */
  _emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    for (const cb of callbacks) {
      try {
        cb(data);
      } catch (err) {
        logger.error('이벤트 리스너 에러', { event, error: err.message });
      }
    }
  }

  /**
   * 서버 종료
   */
  close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // 모든 연결 종료
    for (const [, device] of this.devices) {
      this._send(device.ws, { type: 'server_shutdown' });
      device.ws.close();
    }
    this.devices.clear();

    if (this.wss) {
      this.wss.close();
    }

    logger.info('NodeServer 종료');
  }
}
