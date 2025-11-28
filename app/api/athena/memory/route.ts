import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const type = searchParams.get('type') || 'all'; // 'identity', 'short-term', 'long-term', 'all'

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    const orchestrator = getOrchestrator();
    const memories = await orchestrator.memory.getMemories(userId, type);

    return NextResponse.json({
      success: true,
      memories
    });
  } catch (error: unknown) {
    console.error('Memory API error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const memoryId = searchParams.get('memoryId');

    if (!userId || !memoryId) {
      return NextResponse.json(
        { success: false, error: 'userId와 memoryId 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    const orchestrator = getOrchestrator();
    await orchestrator.memory.deleteMemory(userId, memoryId);

    return NextResponse.json({
      success: true,
      message: '기억이 삭제되었습니다.'
    });
  } catch (error: unknown) {
    console.error('Memory delete error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
