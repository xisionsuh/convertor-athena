import * as crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

export class ApprovalGate {
  constructor({ db, ttlMs = 300000 } = {}) {
    if (!db) {
      throw new Error('ApprovalGate requires a db instance');
    }

    this.db = db;
    this.ttlMs = ttlMs;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_approvals (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        security_level TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        result TEXT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        resolved_at DATETIME
      )
    `);

    this.insertRequestStmt = this.db.prepare(`
      INSERT INTO command_approvals (id, command, security_level, expires_at)
      VALUES (?, ?, ?, ?)
    `);

    this.getRequestStmt = this.db.prepare(`
      SELECT id, command, security_level, status, result, requested_at, expires_at, resolved_at
      FROM command_approvals
      WHERE id = ?
    `);

    this.expireOneStmt = this.db.prepare(`
      UPDATE command_approvals
      SET status = 'expired', resolved_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending' AND expires_at <= CURRENT_TIMESTAMP
    `);

    this.expireAllStmt = this.db.prepare(`
      UPDATE command_approvals
      SET status = 'expired', resolved_at = CURRENT_TIMESTAMP
      WHERE status = 'pending' AND expires_at <= CURRENT_TIMESTAMP
    `);

    this.getPendingStmt = this.db.prepare(`
      SELECT id, command, security_level, status, result, requested_at, expires_at, resolved_at
      FROM command_approvals
      WHERE status = 'pending'
      ORDER BY requested_at ASC
    `);

    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanExpired();
      } catch (error) {
        logger.error('Failed to auto-clean expired approval requests', error);
      }
    }, 60000);

    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  static toSqliteDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  static toIsoDateTime(sqliteDateTime) {
    return new Date(sqliteDateTime.replace(' ', 'T') + 'Z').toISOString();
  }

  requestApproval(command, securityLevel) {
    const requestId = crypto.randomUUID();
    const expiresAtDate = new Date(Date.now() + this.ttlMs);
    const expiresAt = ApprovalGate.toSqliteDateTime(expiresAtDate);

    this.insertRequestStmt.run(requestId, command, securityLevel, expiresAt);

    logger.info('Approval request created', {
      requestId,
      securityLevel,
      expiresAt
    });

    return {
      requestId,
      expiresAt: expiresAtDate.toISOString()
    };
  }

  checkApproval(requestId) {
    const row = this.getRequestStmt.get(requestId);

    if (!row) {
      return { status: 'not_found' };
    }

    if (row.status === 'pending') {
      const expireResult = this.expireOneStmt.run(requestId);
      if (expireResult.changes > 0) {
        return { status: 'expired' };
      }

      return { status: 'pending' };
    }

    if (row.status === 'approved' || row.status === 'denied') {
      return {
        status: row.status,
        result: row.result ?? undefined
      };
    }

    return { status: row.status };
  }

  cleanExpired() {
    const result = this.expireAllStmt.run();

    if (result.changes > 0) {
      logger.info('Expired approval requests cleaned', { expiredCount: result.changes });
    }

    return result.changes;
  }

  getPendingRequests() {
    this.cleanExpired();

    return this.getPendingStmt.all().map((row) => ({
      ...row,
      expires_at: ApprovalGate.toIsoDateTime(row.expires_at)
    }));
  }

  dispose() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
