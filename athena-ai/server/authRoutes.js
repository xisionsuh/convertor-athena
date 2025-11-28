import express from 'express';
import passport from 'passport';

export function createAuthRoutes() {
  const router = express.Router();

  /**
   * GET /auth/google
   * Google 로그인 시작
   */
  router.get(
    '/google',
    passport.authenticate('google', {
      scope: ['profile', 'email']
    })
  );

  /**
   * GET /auth/google/callback
   * Google OAuth 콜백 처리
   */
  router.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/login.html?error=auth_failed'
    }),
    (req, res) => {
      // 로그인 성공 시 메인 페이지로 리다이렉트
      res.redirect('/');
    }
  );

  /**
   * GET /auth/logout
   * 로그아웃
   */
  router.get('/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: '로그아웃 실패' });
      }
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
        }
        res.redirect('/login.html');
      });
    });
  });

  /**
   * GET /auth/status
   * 현재 로그인 상태 확인
   */
  router.get('/status', (req, res) => {
    if (req.isAuthenticated()) {
      res.json({
        authenticated: true,
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email
        }
      });
    } else {
      res.json({
        authenticated: false
      });
    }
  });

  return router;
}

