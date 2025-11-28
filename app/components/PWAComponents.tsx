'use client';

import React, { useEffect, useState } from 'react';
import { usePWA } from '../contexts/PWAContext';

/**
 * 오프라인 상태 배너
 */
export function OfflineBanner() {
  const { isOnline } = usePWA();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShow(true);
    } else {
      // 온라인 복구 시 잠시 후 숨김
      const timer = setTimeout(() => setShow(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!show) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium transition-all duration-300 ${
        isOnline
          ? 'bg-green-500 text-white'
          : 'bg-yellow-500 text-yellow-900'
      }`}
    >
      {isOnline ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          온라인 연결됨
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          오프라인 모드 - 일부 기능이 제한됩니다
        </span>
      )}
    </div>
  );
}

/**
 * 앱 설치 프롬프트
 */
export function InstallPrompt() {
  const { isInstallable, isInstalled, installPrompt } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 이전에 닫은 경우 다시 표시하지 않음
    const wasDismissed = localStorage.getItem('pwa-install-dismissed');
    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  if (!isInstallable || isInstalled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  const handleInstall = async () => {
    const accepted = await installPrompt();
    if (accepted) {
      setDismissed(true);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-4">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-200"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-white">앱 설치</h3>
          <p className="text-sm text-slate-300 mt-1">
            Athena를 앱으로 설치하면 더 빠르게 접근하고 오프라인에서도 사용할 수 있습니다.
          </p>
          <button
            onClick={handleInstall}
            className="mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            설치하기
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 앱 업데이트 알림
 */
export function UpdateNotification() {
  const { isUpdateAvailable, updateApp } = usePWA();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isUpdateAvailable) {
      setShow(true);
    }
  }, [isUpdateAvailable]);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[9999] bg-blue-600 rounded-lg shadow-lg p-4 pointer-events-auto">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-white">새 버전 사용 가능</h3>
          <p className="text-sm text-blue-100 mt-1">
            새로운 버전이 있습니다. 업데이트하여 최신 기능을 사용하세요.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setShow(false)}
              className="px-3 py-1.5 text-blue-100 hover:text-white text-sm font-medium transition-colors"
            >
              나중에
            </button>
            <button
              onClick={updateApp}
              className="px-4 py-1.5 bg-white text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
            >
              업데이트
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 오프라인 인디케이터 (작은 아이콘)
 */
export function OfflineIndicator() {
  const { isOnline } = usePWA();

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        isOnline
          ? 'bg-green-500/10 text-green-500'
          : 'bg-yellow-500/10 text-yellow-500'
      }`}
      title={isOnline ? '온라인' : '오프라인'}
    >
      <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
      {isOnline ? '온라인' : '오프라인'}
    </div>
  );
}

/**
 * PWA 설정 패널
 */
export function PWASettings() {
  const { isOnline, isInstalled, clearCache, getCacheSize } = usePWA();
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const loadCacheSize = async () => {
      const size = await getCacheSize();
      setCacheSize(size);
    };
    loadCacheSize();
  }, [getCacheSize]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      await clearCache();
      setCacheSize(0);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
    setClearing(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">PWA 설정</h3>

      <div className="space-y-3">
        {/* 연결 상태 */}
        <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
          <span className="text-slate-300">네트워크 상태</span>
          <span className={`flex items-center gap-2 ${isOnline ? 'text-green-500' : 'text-yellow-500'}`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-yellow-500'}`} />
            {isOnline ? '온라인' : '오프라인'}
          </span>
        </div>

        {/* 설치 상태 */}
        <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
          <span className="text-slate-300">앱 설치</span>
          <span className={isInstalled ? 'text-green-500' : 'text-slate-400'}>
            {isInstalled ? '설치됨' : '미설치'}
          </span>
        </div>

        {/* 캐시 크기 */}
        <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
          <span className="text-slate-300">캐시 크기</span>
          <span className="text-slate-400">{formatBytes(cacheSize)}</span>
        </div>

        {/* 캐시 삭제 */}
        <button
          onClick={handleClearCache}
          disabled={clearing}
          className="w-full py-2 px-4 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          {clearing ? '삭제 중...' : '캐시 삭제'}
        </button>
      </div>
    </div>
  );
}
