import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, projectId } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();

    // 사용자가 없으면 자동 생성
    try {
      const db = orchestratorInstance.memory.db;
      const userStmt = db.prepare(`
        INSERT OR IGNORE INTO users (id, email, name, last_login)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `);
      userStmt.run(userId, `${userId}@athena.ai`, userId);
    } catch (userError) {
      console.warn('User creation failed:', userError);
    }

    const sessionId = orchestratorInstance.memory.createSession(userId, title || '회의녹음변환기 코파일럿');

    // 프로젝트 ID가 있으면 세션에 연결
    if (projectId && sessionId) {
      try {
        const db = orchestratorInstance.memory.db;
        const updateStmt = db.prepare(`
          UPDATE sessions SET project_id = ? WHERE id = ?
        `);
        updateStmt.run(projectId, sessionId);
      } catch (updateError) {
        console.warn('Session project update failed:', updateError);
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      projectId: projectId || null
    });
  } catch (error: unknown) {
    console.error('Session creation error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
