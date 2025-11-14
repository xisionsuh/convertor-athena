'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// DOM에 테마 클래스 적용하는 헬퍼 함수
function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 초기 테마 설정
    let initialTheme: Theme = 'light';
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as Theme | null;
      if (savedTheme) {
        initialTheme = savedTheme;
      } else {
        // 시스템 설정 확인
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        initialTheme = prefersDark ? 'dark' : 'light';
      }
      
      // 즉시 HTML 요소에 클래스 적용
      applyTheme(initialTheme);
      setTheme(initialTheme);
    }
    
    setMounted(true);
  }, []);

  // 테마가 변경될 때마다 localStorage에 저장 (초기 마운트 후에만)
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    localStorage.setItem('theme', theme);
  }, [theme, mounted]);

  const toggleTheme = () => {
    // 현재 상태를 직접 확인하여 정확한 새 테마 계산
    const currentRoot = typeof window !== 'undefined' ? document.documentElement : null;
    const hasDarkClass = currentRoot?.classList.contains('dark') ?? false;
    
    // 현재 상태와 클래스가 일치하는지 확인
    const actualTheme = hasDarkClass ? 'dark' : 'light';
    const newTheme = actualTheme === 'light' ? 'dark' : 'light';
    
    console.log('toggleTheme - 현재 상태:', { theme, actualTheme, hasDarkClass, newTheme });
    
    // 즉시 DOM에 적용
    applyTheme(newTheme);
    
    // 상태 업데이트
    setTheme(newTheme);
    
    // localStorage에도 즉시 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

