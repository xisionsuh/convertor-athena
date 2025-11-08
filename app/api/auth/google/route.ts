import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../athena/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action'); // 'login' or 'callback'

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    
    // 요청에서 호스트 정보 가져오기 (동적으로 처리)
    const requestUrl = new URL(request.url);
    const protocol = requestUrl.protocol;
    const host = requestUrl.host;
    const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || `${protocol}//${host}`;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Google OAuth 설정이 필요합니다.' },
        { status: 500 }
      );
    }

    // 리다이렉트 URI 설정 (구글 콘솔에 등록된 URI와 정확히 일치해야 함)
    const redirectUri = `${BASE_URL}/api/auth/google?action=callback`;
    
    console.log('🔍 OAuth 설정 확인:', {
      BASE_URL,
      redirectUri,
      clientId: GOOGLE_CLIENT_ID.substring(0, 20) + '...',
    });

    if (action === 'login') {
      // 구글 로그인 페이지로 리다이렉트
      const scope = 'profile email';
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
      
      console.log('🔗 구글 로그인 URL 생성:', googleAuthUrl.substring(0, 100) + '...');
      return NextResponse.redirect(googleAuthUrl);
    }

    if (action === 'callback') {
      const code = searchParams.get('code');
      if (!code) {
        console.error('❌ OAuth 콜백에 code가 없습니다.');
        return NextResponse.redirect(`${BASE_URL}?error=auth_failed`);
      }

      console.log('✅ OAuth 콜백 받음, 토큰 교환 시작...');

      // 구글에서 액세스 토큰 받기
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('❌ 토큰 교환 실패:', errorText);
        return NextResponse.redirect(`${BASE_URL}?error=token_failed&details=${encodeURIComponent(errorText)}`);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // 구글에서 사용자 정보 가져오기
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!userResponse.ok) {
        return NextResponse.redirect(`${BASE_URL}?error=userinfo_failed`);
      }

      const userData = await userResponse.json();
      const googleId = userData.id;
      const email = userData.email || '';
      const name = userData.name || userData.given_name || 'User';

      // DB에 사용자 저장 또는 업데이트
      const orchestratorInstance = getOrchestrator();
      const db = orchestratorInstance.memory.db;

      let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as any;

      if (!user) {
        // 새 사용자 생성
        const userId = `user_${googleId}_${Date.now()}`;
        db.prepare(`
          INSERT INTO users (id, google_id, email, name, last_login)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(userId, googleId, email, name);
        user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as any;
      } else {
        // 마지막 로그인 시간 업데이트
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE google_id = ?').run(googleId);
        user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as any;
      }

      // 로그인 성공 - 사용자 정보를 쿠키에 저장하고 리다이렉트
      const response = NextResponse.redirect(`${BASE_URL}?google_login=success`);
      
      // 사용자 정보를 쿠키에 저장 (보안을 위해 httpOnly 사용)
      response.cookies.set('athena_user_id', user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30일
      });
      
      response.cookies.set('athena_user_name', name, {
        httpOnly: false, // 프론트엔드에서 읽을 수 있도록
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });

      return response;
    }

    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  } catch (error: any) {
    console.error('Google auth error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '인증 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

