import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../../athena/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q'); // 검색어

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    let contexts;
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
      contexts: contexts.map((c: any) => ({
        ...c,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
        tags: c.tags ? JSON.parse(c.tags) : [],
      }))
    });
  } catch (error: any) {
    console.error('Project context fetch error:', error);
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
    const { contextType, title, content, sourceResourceId, tags, importance } = body;

    if (!contextType || !title || !content) {
      return NextResponse.json(
        { success: false, error: 'contextType, title, content 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    const contextId = db.prepare(`
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
    ).lastInsertRowid;

    const context = db.prepare('SELECT * FROM project_context WHERE id = ?').get(contextId);

    return NextResponse.json({
      success: true,
      context: {
        ...context,
        createdAt: new Date((context as any).created_at),
        updatedAt: new Date((context as any).updated_at),
        tags: (context as any).tags ? JSON.parse((context as any).tags) : [],
      }
    });
  } catch (error: any) {
    console.error('Project context creation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

