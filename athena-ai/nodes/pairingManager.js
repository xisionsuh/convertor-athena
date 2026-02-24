/**
 * Pairing Manager - 디바이스 페어링 관리
 * 6자리 코드 기반 페어링 및 토큰 발급
 */

import crypto from 'crypto';
import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export class PairingManager {
  constructor(options = {}) {
    const { dbPath = './data/athena.db' } = options;

    this.db = new Database(dbPath);
    this.codeTTL = options.codeTTL || 5 * 60 * 1000; // 5분

    // 활성 페어링 코드 { code -> { expiresAt } }
    this.activeCodes = new Map();

    this._initTable();
  }

  /**
   * paired_devices 테이블 초기화
   */
  _initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paired_devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        platform TEXT,
        token TEXT UNIQUE NOT NULL,
        capabilities TEXT,
        last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_paired_devices_token ON paired_devices(token)
    `);
  }

  /**
   * 6자리 페어링 코드 생성
   */
  generateCode() {
    // 만료된 코드 정리
    this._cleanExpiredCodes();

    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = Date.now() + this.codeTTL;

    this.activeCodes.set(code, { expiresAt });

    logger.info('페어링 코드 생성', { code, expiresIn: '5분' });

    return {
      code,
      expiresAt: new Date(expiresAt).toISOString(),
      ttlSeconds: Math.floor(this.codeTTL / 1000)
    };
  }

  /**
   * 페어링 코드 검증
   */
  verifyCode(code) {
    this._cleanExpiredCodes();

    const entry = this.activeCodes.get(code);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.activeCodes.delete(code);
      return null;
    }

    // 코드 사용 후 삭제 (일회용)
    this.activeCodes.delete(code);

    return { valid: true };
  }

  /**
   * 디바이스 등록 (토큰 발급)
   */
  registerDevice({ name, platform, capabilities }) {
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');

    this.db.prepare(`
      INSERT INTO paired_devices (id, name, platform, token, capabilities, last_seen)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      platform || 'unknown',
      token,
      JSON.stringify(capabilities || []),
      new Date().toISOString()
    );

    logger.info('디바이스 등록', { id, name, platform });

    return { id, token, name, platform };
  }

  /**
   * 토큰으로 디바이스 조회
   */
  getDeviceByToken(token) {
    const row = this.db.prepare('SELECT * FROM paired_devices WHERE token = ?').get(token);
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      platform: row.platform,
      token: row.token,
      capabilities: JSON.parse(row.capabilities || '[]'),
      lastSeen: row.last_seen,
      createdAt: row.created_at
    };
  }

  /**
   * 토큰 유효성 검증
   */
  validateToken(token) {
    const row = this.db.prepare('SELECT id FROM paired_devices WHERE token = ?').get(token);
    return !!row;
  }

  /**
   * 페어링된 디바이스 목록 조회
   */
  getPairedDevices() {
    const rows = this.db.prepare('SELECT * FROM paired_devices ORDER BY created_at DESC').all();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      platform: row.platform,
      capabilities: JSON.parse(row.capabilities || '[]'),
      lastSeen: row.last_seen,
      createdAt: row.created_at
    }));
  }

  /**
   * 디바이스 정보 업데이트
   */
  updateDevice(deviceId, updates) {
    const fields = [];
    const values = [];

    if (updates.capabilities !== undefined) {
      fields.push('capabilities = ?');
      values.push(JSON.stringify(updates.capabilities));
    }
    if (updates.lastSeen !== undefined) {
      fields.push('last_seen = ?');
      values.push(updates.lastSeen);
    }
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (fields.length === 0) return;

    values.push(deviceId);
    this.db.prepare(`UPDATE paired_devices SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  /**
   * 디바이스 페어링 해제
   */
  unpairDevice(deviceId) {
    const result = this.db.prepare('DELETE FROM paired_devices WHERE id = ?').run(deviceId);
    if (result.changes === 0) {
      throw new Error(`디바이스를 찾을 수 없음: ${deviceId}`);
    }
    logger.info('디바이스 페어링 해제', { deviceId });
    return { success: true, deviceId };
  }

  /**
   * 만료된 페어링 코드 정리
   */
  _cleanExpiredCodes() {
    const now = Date.now();
    for (const [code, entry] of this.activeCodes) {
      if (now > entry.expiresAt) {
        this.activeCodes.delete(code);
      }
    }
  }

  /**
   * 종료
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
