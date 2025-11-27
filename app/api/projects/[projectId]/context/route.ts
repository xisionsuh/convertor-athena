import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../../athena/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q'); // 검색어

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    let contexts: Array<{
      id: string;
      project_id: string;
      context_type: string;
      title: string;
      content: string;
      source_resource_id?: string | null;
      tags?: string | null;
      importance?: number;
      created_at: string | number | Date;
      updated_at: string | number | Date;
    }>;
    if (query) {
      // 검색어가 있으면 제목과 내용에서 검색
      contexts = db.prepare(`
        SELECT * FROM project_context
        WHERE project_id = ?
        AND (title LIKE ? OR content LIKE ?)
        ORDER BY importance DESC, updated_at DESC
        LIMIT 20
      `).all(projectId, `%${query}%`, `%${query}%`);
    } else {
      contexts = db.prepare(`
        SELECT * FROM project_context
        WHERE project_id = ?
        ORDER BY importance DESC, updated_at DESC
        LIMIT 50
      `).all(projectId);
    }

    return NextResponse.json({
      success: true,
      contexts: contexts.map((c) => ({
        ...c,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
        tags: c.tags ? JSON.parse(c.tags) : [],
      }))
    });
  } catch (error: unknown) {
    console.error('Project context fetch error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { contextType, title, content, sourceResourceId, tags, importance } = body;

    if (!contextType || !title || !content) {
      return NextResponse.json(
        { success: false, error: 'contextType, title, content 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    db.prepare(`
      INSERT INTO project_context (project_id, context_type, title, content, source_resource_id, tags, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      contextType,
      title,
      content,
      sourceResourceId || null,
      tags ? JSON.stringify(tags) : null,
      importance || 5
    );

    const context = db.prepare('SELECT * FROM project_context WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(projectId) as {
      id: string;
      created_at: string | number | Date;
      updated_at: string | number | Date;
      tags?: string | null;
    };

    return NextResponse.json({
      success: true,
      context: {
        ...context,
        createdAt: new Date(context.created_at),
        updatedAt: new Date(context.updated_at),
        tags: context.tags ? JSON.parse(context.tags) : [],
      }
    });
  } catch (error: unknown) {
    console.error('Project context creation error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
