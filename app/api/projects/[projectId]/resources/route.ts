import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../../athena/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    const resources = db.prepare(`
      SELECT * FROM project_resources 
      WHERE project_id = ? 
      ORDER BY created_at DESC
    `).all(projectId);

    return NextResponse.json({
      success: true,
      resources: resources.map((r: any) => ({
        ...r,
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
        metadata: r.metadata ? JSON.parse(r.metadata) : null,
      }))
    });
  } catch (error: any) {
    console.error('Project resources fetch error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const body = await request.json();
    const { resourceType, resourceId, title, content, metadata } = body;

    if (!resourceType || !resourceId || !title) {
      return NextResponse.json(
        { success: false, error: 'resourceType, resourceId, title 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    const resourceDbId = `resource-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    db.prepare(`
      INSERT INTO project_resources (id, project_id, resource_type, resource_id, title, content, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      resourceDbId,
      projectId,
      resourceType,
      resourceId,
      title,
      content || '',
      metadata ? JSON.stringify(metadata) : null
    );

    // 프로젝트 컨텍스트에도 추가
    const contextId = db.prepare(`
      INSERT INTO project_context (project_id, context_type, title, content, source_resource_id, importance)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      resourceType === 'file' ? 'file_content' : resourceType === 'memo' ? 'memo' : 'material',
      title,
      content || '',
      resourceDbId,
      5
    ).lastInsertRowid;

    return NextResponse.json({
      success: true,
      resource: {
        id: resourceDbId,
        projectId,
        resourceType,
        resourceId,
        title,
        content,
        metadata,
      }
    });
  } catch (error: any) {
    console.error('Project resource creation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

