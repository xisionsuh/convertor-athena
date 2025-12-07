'use client';

import { useEffect, useState } from 'react';

interface AuthState {
  userId: string;
  userName: string;
  isAuthenticated: boolean;
  loading: boolean;
}

const createUserId = () => `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export function useAuthUser(): AuthState {
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const persistUserId = (value: string) => {
      try {
        localStorage.setItem('athena-user-id', value);
      } catch (error) {
        console.error('Failed to persist user id:', error);
      }
    };

    const setState = (updater: () => void) => {
      if (!cancelled) updater();
    };

    const resolveUserId = async () => {
      try {
        const response = await fetch('/athena/api/auth/status');
        const data = await response.json();

        if (data.authenticated && data.user) {
          setState(() => {
            setUserId(data.user.id);
            setUserName(data.user.name || '');
            setIsAuthenticated(true);
          });
          persistUserId(data.user.id);
          return;
        }
      } catch (error) {
        console.error('인증 상태 확인 실패:', error);
      }

      try {
        const latestResponse = await fetch('/athena/api/sessions/latest-user');
        if (latestResponse.ok) {
          const latestData = await latestResponse.json();
          if (latestData.success && latestData.userId) {
            setState(() => {
              setUserId(latestData.userId);
              setIsAuthenticated(false);
            });
            persistUserId(latestData.userId);
            return;
          }
        }
      } catch (error) {
        console.error('최근 userId 조회 실패:', error);
      }

      // fallback: 새 ID 생성
      const fallbackId = createUserId();
      setState(() => {
        setUserId(fallbackId);
        setIsAuthenticated(false);
      });
      persistUserId(fallbackId);
    };

    resolveUserId().finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { userId, userName, isAuthenticated, loading };
}
