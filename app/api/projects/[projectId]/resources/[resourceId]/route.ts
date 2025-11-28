import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../../../athena/utils';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; resourceId: string }> }
) {
  try {
    const { projectId, resourceId } = await params;

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    // 프로젝트 자료 삭제
    db.prepare('DELETE FROM project_resources WHERE id = ? AND project_id = ?').run(resourceId, projectId);

    // 관련 컨텍스트도 삭제
    db.prepare('DELETE FROM project_context WHERE source_resource_id = ?').run(resourceId);

    return NextResponse.json({
      success: true,
      message: '자료가 삭제되었습니다.',
    });
  } catch (error: unknown) {
    console.error('Project resource deletion error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
