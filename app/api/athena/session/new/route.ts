import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title } = body;

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

    return NextResponse.json({
      success: true,
      sessionId
    });
  } catch (error: any) {
    console.error('Session creation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

