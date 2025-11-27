import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const messages = orchestratorInstance.memory.getShortTermMemory(sessionId) as Array<{
      id: string;
      message_type: 'user' | 'assistant';
      content: string;
      created_at: string | number | Date;
    }>;

    return NextResponse.json({
      success: true,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.message_type === 'user' ? 'user' : 'assistant',
        content: m.content,
        timestamp: new Date(m.created_at),
      }))
    });
  } catch (error: unknown) {
    console.error('Session messages fetch error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    orchestratorInstance.memory.deleteSession(sessionId);

    return NextResponse.json({
      success: true,
      message: '채팅 세션이 삭제되었습니다.'
    });
  } catch (error: unknown) {
    console.error('Session deletion error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
