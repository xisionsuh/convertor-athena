'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// 번역 파일 import
import ko from '../locales/ko.json';
import en from '../locales/en.json';
import ja from '../locales/ja.json';

// 지원 언어 목록
export const SUPPORTED_LANGUAGES = {
  ko: { name: '한국어', nativeName: '한국어', flag: '🇰🇷' },
  en: { name: 'English', nativeName: 'English', flag: '🇺🇸' },
  ja: { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
} as const;

export type Language = keyof typeof SUPPORTED_LANGUAGES;

// 번역 리소스
const resources: Record<Language, typeof ko> = {
  ko,
  en,
  ja,
};

// 번역 키 타입 (단순화 - 무한 재귀 방지)
type TranslationKeys = typeof ko;

// Context 타입
interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (num: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (amount: number, currency?: string) => string;
  formatRelativeTime: (date: Date | string) => string;
  dir: 'ltr' | 'rtl';
}

const I18nContext = createContext<I18nContextType | null>(null);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

// 편의를 위한 단축 훅
export function useTranslation() {
  const { t, language } = useI18n();
  return { t, language };
}

interface I18nProviderProps {
  children: ReactNode;
  defaultLanguage?: Language;
}

export function I18nProvider({ children, defaultLanguage = 'ko' }: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>(defaultLanguage);

  // 초기 언어 설정 (localStorage 또는 브라우저 설정)
  useEffect(() => {
    const savedLanguage = localStorage.getItem('language') as Language;

    if (savedLanguage && savedLanguage in SUPPORTED_LANGUAGES) {
      setLanguageState(savedLanguage);
    } else {
      // 브라우저 언어 감지
      const browserLang = navigator.language.split('-')[0] as Language;
      if (browserLang in SUPPORTED_LANGUAGES) {
        setLanguageState(browserLang);
      }
    }
  }, []);

  // 언어 변경
  const setLanguage = useCallback((lang: Language) => {
    if (lang in SUPPORTED_LANGUAGES) {
      setLanguageState(lang);
      localStorage.setItem('language', lang);

      // HTML lang 속성 업데이트
      document.documentElement.lang = lang;
    }
  }, []);

  // 번역 함수
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: unknown = resources[language];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        // 키를 찾지 못하면 기본 언어(한국어)에서 검색
        value = resources.ko;
        for (const defaultKey of keys) {
          if (value && typeof value === 'object' && defaultKey in value) {
            value = (value as Record<string, unknown>)[defaultKey];
          } else {
            return key; // 찾지 못하면 키 자체 반환
          }
        }
        break;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // 파라미터 치환
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, paramKey) => {
        return params[paramKey]?.toString() ?? `{${paramKey}}`;
      });
    }

    return value;
  }, [language]);

  // 날짜 포맷
  const formatDate = useCallback((date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const locale = language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : 'en-US';

    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...options,
    };

    return new Intl.DateTimeFormat(locale, defaultOptions).format(d);
  }, [language]);

  // 숫자 포맷
  const formatNumber = useCallback((num: number, options?: Intl.NumberFormatOptions): string => {
    const locale = language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : 'en-US';
    return new Intl.NumberFormat(locale, options).format(num);
  }, [language]);

  // 통화 포맷
  const formatCurrency = useCallback((amount: number, currency: string = 'USD'): string => {
    const locale = language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : 'en-US';
    const defaultCurrency = language === 'ko' ? 'KRW' : language === 'ja' ? 'JPY' : 'USD';

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || defaultCurrency,
    }).format(amount);
  }, [language]);

  // 상대 시간 포맷
  const formatRelativeTime = useCallback((date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
      return t('time.justNow');
    } else if (diffMinutes < 60) {
      return t('time.minutesAgo', { count: diffMinutes });
    } else if (diffHours < 24) {
      return t('time.hoursAgo', { count: diffHours });
    } else if (diffDays === 1) {
      return t('time.yesterday');
    } else if (diffDays < 7) {
      return t('time.daysAgo', { count: diffDays });
    } else if (diffWeeks < 4) {
      return t('time.weeksAgo', { count: diffWeeks });
    } else if (diffMonths < 12) {
      return t('time.monthsAgo', { count: diffMonths });
    } else {
      return t('time.yearsAgo', { count: diffYears });
    }
  }, [t]);

  // 텍스트 방향 (RTL 지원 준비)
  const dir: 'ltr' | 'rtl' = 'ltr';

  const value: I18nContextType = {
    language,
    setLanguage,
    t,
    formatDate,
    formatNumber,
    formatCurrency,
    formatRelativeTime,
    dir,
  };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}
