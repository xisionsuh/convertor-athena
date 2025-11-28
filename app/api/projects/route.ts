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
    `).all(userId) as Array<{
      id: string;
      user_id: string;
      name: string;
      description?: string | null;
      created_at: string | number | Date;
      updated_at: string | number | Date;
    }>;

    return NextResponse.json({
      success: true,
      projects: projects.map((p) => ({
        ...p,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
      }))
    });
  } catch (error: unknown) {
    console.error('Projects fetch error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
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

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
      id: string;
      created_at: string | number | Date;
      updated_at: string | number | Date;
    };

    return NextResponse.json({
      success: true,
      project: {
        ...project,
        createdAt: new Date(project.created_at),
        updatedAt: new Date(project.updated_at),
      }
    });
  } catch (error: unknown) {
    console.error('Project creation error:', error);
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
  } catch (error: unknown) {
    console.error('Project deletion error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
