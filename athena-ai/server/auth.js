import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { getDatabase } from '../database/schema.js';

/**
 * Passport Google OAuth 전략 설정
 */
export function setupPassport(dbPath) {
  const db = getDatabase(dbPath);

  // Google OAuth 전략 설정
  // callbackURL은 전체 URL이어야 합니다 (예: http://localhost:3000/auth/google/callback)
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || 
    `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`;
  
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: callbackURL
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value || '';
          const name = profile.displayName || profile.name?.givenName || 'User';

          // 사용자 조회 또는 생성
          let user = db
            .prepare('SELECT * FROM users WHERE google_id = ?')
            .get(googleId);

          if (!user) {
            // 새 사용자 생성
            const userId = `user_${googleId}_${Date.now()}`;
            const stmt = db.prepare(`
              INSERT INTO users (id, google_id, email, name, last_login)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            stmt.run(userId, googleId, email, name);
            user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
          } else {
            // 마지막 로그인 시간 업데이트
            db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE google_id = ?').run(googleId);
            user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );

  // 사용자 직렬화 (세션에 저장)
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // 사용자 역직렬화 (세션에서 복원)
  passport.deserializeUser((id, done) => {
    try {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}

/**
 * 인증 미들웨어 - 로그인 필요
 */
export function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: '인증이 필요합니다' });
}

/**
 * 선택적 인증 미들웨어 - 로그인 안해도 됨
 */
export function optionalAuth(req, res, next) {
  // req.user는 있으면 사용, 없으면 null
  next();
}

