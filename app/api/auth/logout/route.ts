import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4000';
    
    const response = NextResponse.redirect(`${BASE_URL}?logout=success`);
    
    // 쿠키 삭제
    response.cookies.delete('athena_user_id');
    response.cookies.delete('athena_user_name');
    
    return response;
  } catch (error: unknown) {
    console.error('Logout error:', error);
    const message = error instanceof Error ? error.message : '로그아웃 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
