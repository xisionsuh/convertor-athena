import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../athena/utils';

export async function GET(request: NextRequest) {
  try {
    const userId = request.cookies.get('athena_user_id')?.value;
    const userName = request.cookies.get('athena_user_name')?.value;

    if (!userId) {
      return NextResponse.json({
        authenticated: false,
      });
    }

    // DB에서 사용자 정보 확인
    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
      id: string;
      google_id?: string;
      email?: string;
      name?: string;
    } | undefined;

    if (!user) {
      return NextResponse.json({
        authenticated: false,
      });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        googleId: user.google_id,
        email: user.email,
        name: user.name || userName,
      },
    });
  } catch (error: unknown) {
    console.error('Auth status error:', error);
    const message = error instanceof Error ? error.message : undefined;
    return NextResponse.json({
      authenticated: false,
      error: message,
    });
  }
}
