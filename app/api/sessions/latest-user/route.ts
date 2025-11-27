import { NextResponse } from 'next/server';
import { getOrchestrator } from '../../athena/utils';

export async function GET() {
  try {
    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    // 가장 최근에 생성된 세션이나 메모의 userId 찾기
    const latestFileSession = db.prepare(`
      SELECT user_id, MAX(created_at) as max_date FROM file_sessions 
      GROUP BY user_id
      ORDER BY max_date DESC 
      LIMIT 1
    `).get() as { user_id?: string } | undefined;

    const latestMemoSession = db.prepare(`
      SELECT user_id, MAX(created_at) as max_date FROM memo_sessions 
      GROUP BY user_id
      ORDER BY max_date DESC 
      LIMIT 1
    `).get() as { user_id?: string } | undefined;

    // 가장 최근의 userId 선택
    let latestUserId: string | null = null;
    
    if (latestFileSession?.user_id && latestMemoSession?.user_id) {
      // 둘 다 있으면 더 최근 것 선택
      const fileMax = db.prepare(`
        SELECT MAX(created_at) as max_date FROM file_sessions WHERE user_id = ?
      `).get(latestFileSession.user_id) as { max_date?: string } | undefined;
      
      const memoMax = db.prepare(`
        SELECT MAX(created_at) as max_date FROM memo_sessions WHERE user_id = ?
      `).get(latestMemoSession.user_id) as { max_date?: string } | undefined;

      if (fileMax?.max_date && memoMax?.max_date) {
        latestUserId = new Date(fileMax.max_date) > new Date(memoMax.max_date) 
          ? latestFileSession.user_id 
          : latestMemoSession.user_id;
      } else if (fileMax?.max_date) {
        latestUserId = latestFileSession.user_id;
      } else if (memoMax?.max_date) {
        latestUserId = latestMemoSession.user_id;
      }
    } else if (latestFileSession?.user_id) {
      latestUserId = latestFileSession.user_id;
    } else if (latestMemoSession?.user_id) {
      latestUserId = latestMemoSession.user_id;
    }

    return NextResponse.json({
      success: true,
      userId: latestUserId,
    });
  } catch (error: unknown) {
    console.error('Latest user ID fetch error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
