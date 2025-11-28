/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../athena/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    // 파일 세션 조회
    const fileSessions = db.prepare(`
      SELECT * FROM file_sessions 
      WHERE user_id = ? 
      ORDER BY updated_at DESC
    `).all(userId);

    // 메모 세션 조회
    const memoSessions = db.prepare(`
      SELECT * FROM memo_sessions 
      WHERE user_id = ? 
      ORDER BY updated_at DESC
    `).all(userId);

    // 채팅 세션 조회 (sessions 테이블과 short_term_memory를 조인하여 조회)
    const chatSessions = db.prepare(`
      SELECT
        s.id,
        s.user_id,
        s.title,
        s.project_id,
        s.created_at,
        s.updated_at,
        COALESCE(m.message_count, 0) as message_count
      FROM sessions s
      LEFT JOIN (
        SELECT session_id, COUNT(*) as message_count
        FROM short_term_memory
        GROUP BY session_id
      ) m ON s.id = m.session_id
      WHERE s.user_id = ?
      ORDER BY s.updated_at DESC
      LIMIT 50
    `).all(userId);

    return NextResponse.json({
      success: true,
      fileSessions: fileSessions.map((s: any) => ({
        ...s,
        chunks: s.chunks ? JSON.parse(s.chunks) : [],
        fileMetadata: s.file_metadata ? JSON.parse(s.file_metadata) : null,
        createdAt: new Date(s.created_at),
        updatedAt: new Date(s.updated_at),
      })),
      memoSessions: memoSessions.map((m: any) => ({
        ...m,
        createdAt: new Date(m.created_at),
        updatedAt: new Date(m.updated_at),
      })),
      chatSessions: chatSessions.map((c: any) => ({
        id: c.id,
        userId: c.user_id,
        title: c.title || `채팅 세션 (${c.message_count}개 메시지)`,
        messageCount: c.message_count,
        projectId: c.project_id || undefined,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
        type: 'chat' as const,
      }))
    });
  } catch (error: any) {
    console.error('Sessions fetch error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, type, data } = body;

    if (!userId || !type || !data) {
      return NextResponse.json(
        { success: false, error: 'userId, type, data 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    if (type === 'file') {
      // 파일 세션 저장/업데이트
      const { id, fileName, transcription, minutes, chunks, status, projectId, fileMetadata } = data;
      
      db.prepare(`
        INSERT INTO file_sessions (id, user_id, file_name, transcription, minutes, chunks, status, project_id, file_metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          transcription = excluded.transcription,
          minutes = excluded.minutes,
          chunks = excluded.chunks,
          status = excluded.status,
          project_id = excluded.project_id,
          file_metadata = excluded.file_metadata,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        id,
        userId,
        fileName,
        transcription || '',
        minutes || '',
        JSON.stringify(chunks || []),
        status || 'pending',
        projectId || null,
        fileMetadata ? JSON.stringify(fileMetadata) : null
      );
    } else if (type === 'memo') {
      // 메모 세션 저장/업데이트
      const { id, title, content, projectId } = data;
      
      db.prepare(`
        INSERT INTO memo_sessions (id, user_id, title, content, project_id, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          content = excluded.content,
          project_id = excluded.project_id,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        id,
        userId,
        title,
        content,
        projectId || null
      );
    }

    return NextResponse.json({
      success: true,
      message: '세션이 저장되었습니다.'
    });
  } catch (error: any) {
    console.error('Session save error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const type = searchParams.get('type'); // 'file' or 'memo'

    if (!sessionId || !type) {
      return NextResponse.json(
        { success: false, error: 'sessionId와 type 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    if (type === 'file') {
      db.prepare('DELETE FROM file_sessions WHERE id = ?').run(sessionId);
    } else if (type === 'memo') {
      db.prepare('DELETE FROM memo_sessions WHERE id = ?').run(sessionId);
    }

    return NextResponse.json({
      success: true,
      message: '세션이 삭제되었습니다.'
    });
  } catch (error: any) {
    console.error('Session deletion error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
