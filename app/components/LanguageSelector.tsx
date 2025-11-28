'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useI18n, SUPPORTED_LANGUAGES, Language } from '../contexts/I18nContext';

interface LanguageSelectorProps {
  variant?: 'dropdown' | 'inline' | 'compact';
  showFlags?: boolean;
  showNativeNames?: boolean;
  className?: string;
}

export function LanguageSelector({
  variant = 'dropdown',
  showFlags = true,
  showNativeNames = true,
  className = '',
}: LanguageSelectorProps) {
  const { language, setLanguage, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLang = SUPPORTED_LANGUAGES[language];

  // 인라인 버전 (버튼들이 나란히)
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {(Object.keys(SUPPORTED_LANGUAGES) as Language[]).map((lang) => {
          const langInfo = SUPPORTED_LANGUAGES[lang];
          const isActive = language === lang;

          return (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
              title={langInfo.name}
            >
              {showFlags && <span className="mr-1">{langInfo.flag}</span>}
              {showNativeNames ? langInfo.nativeName : lang.toUpperCase()}
            </button>
          );
        })}
      </div>
    );
  }

  // 컴팩트 버전 (아이콘만)
  if (variant === 'compact') {
    return (
      <div ref={dropdownRef} className={`relative ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
          title={t('settings.language')}
        >
          <span className="text-lg">{currentLang.flag}</span>
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 py-1 w-40 bg-slate-800 rounded-lg shadow-lg border border-slate-700 z-50">
            {(Object.keys(SUPPORTED_LANGUAGES) as Language[]).map((lang) => {
              const langInfo = SUPPORTED_LANGUAGES[lang];
              const isActive = language === lang;

              return (
                <button
                  key={lang}
                  onClick={() => {
                    setLanguage(lang);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-700 transition-colors ${
                    isActive ? 'text-blue-400' : 'text-slate-300'
                  }`}
                >
                  <span className="text-lg">{langInfo.flag}</span>
                  <span className="text-sm">{langInfo.nativeName}</span>
                  {isActive && (
                    <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 드롭다운 버전 (기본)
  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors w-full"
      >
        {showFlags && <span className="text-lg">{currentLang.flag}</span>}
        <span className="flex-1 text-left text-sm text-slate-200">
          {showNativeNames ? currentLang.nativeName : currentLang.name}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 py-1 bg-slate-800 rounded-lg shadow-lg border border-slate-700 z-50">
          {(Object.keys(SUPPORTED_LANGUAGES) as Language[]).map((lang) => {
            const langInfo = SUPPORTED_LANGUAGES[lang];
            const isActive = language === lang;

            return (
              <button
                key={lang}
                onClick={() => {
                  setLanguage(lang);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-700 transition-colors ${
                  isActive ? 'bg-slate-700/50 text-blue-400' : 'text-slate-300'
                }`}
              >
                {showFlags && <span className="text-lg">{langInfo.flag}</span>}
                <span className="flex-1 text-sm">
                  {showNativeNames ? langInfo.nativeName : langInfo.name}
                </span>
                {isActive && (
                  <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 언어 설정 카드 (설정 페이지용)
 */
export function LanguageSettingsCard() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
        </svg>
        {t('settings.language')}
      </h3>

      <div className="space-y-3">
        {(Object.keys(SUPPORTED_LANGUAGES) as Language[]).map((lang) => {
          const langInfo = SUPPORTED_LANGUAGES[lang];
          const isActive = language === lang;

          return (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`w-full p-3 rounded-lg flex items-center gap-3 transition-colors ${
                isActive
                  ? 'bg-blue-500/20 border border-blue-500/50'
                  : 'bg-slate-700/50 hover:bg-slate-700 border border-transparent'
              }`}
            >
              <span className="text-2xl">{langInfo.flag}</span>
              <div className="flex-1 text-left">
                <div className={`font-medium ${isActive ? 'text-blue-400' : 'text-white'}`}>
                  {langInfo.nativeName}
                </div>
                <div className="text-sm text-slate-400">{langInfo.name}</div>
              </div>
              {isActive && (
                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-slate-400">
        {language === 'ko' && '인터페이스 언어를 선택하세요. 변경 사항은 즉시 적용됩니다.'}
        {language === 'en' && 'Select your interface language. Changes will apply immediately.'}
        {language === 'ja' && 'インターフェース言語を選択してください。変更は即座に適用されます。'}
      </p>
    </div>
  );
}
