import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.ATHENA_BACKEND_URL || 'http://localhost:3000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  const body = await request.json();

  const res = await fetch(`${BACKEND_URL}/api/command/${requestId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data);
}
