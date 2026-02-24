import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.ATHENA_BACKEND_URL || 'http://localhost:3000';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/system/status`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Backend server unreachable' },
      { status: 502 }
    );
  }
}
