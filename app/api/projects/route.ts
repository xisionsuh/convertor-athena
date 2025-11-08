import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../athena/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    const projects = db.prepare(`
      SELECT * FROM projects 
      WHERE user_id = ? 
      ORDER BY updated_at DESC
    `).all(userId);

    return NextResponse.json({
      success: true,
      projects: projects.map((p: any) => ({
        ...p,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
      }))
    });
  } catch (error: any) {
    console.error('Projects fetch error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, name, description } = body;

    if (!userId || !name) {
      return NextResponse.json(
        { success: false, error: 'userId와 name 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    const projectId = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    db.prepare(`
      INSERT INTO projects (id, user_id, name, description)
      VALUES (?, ?, ?, ?)
    `).run(projectId, userId, name, description || '');

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

    return NextResponse.json({
      success: true,
      project: {
        ...project,
        createdAt: new Date((project as any).created_at),
        updatedAt: new Date((project as any).updated_at),
      }
    });
  } catch (error: any) {
    console.error('Project creation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId 필요' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

    return NextResponse.json({
      success: true,
      message: '프로젝트가 삭제되었습니다.'
    });
  } catch (error: any) {
    console.error('Project deletion error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

