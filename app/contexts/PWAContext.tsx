'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface PWAContextType {
  isOnline: boolean;
  isInstalled: boolean;
  isInstallable: boolean;
  isUpdateAvailable: boolean;
  swRegistration: ServiceWorkerRegistration | null;
  installPrompt: () => Promise<boolean>;
  updateApp: () => Promise<void>;
  queueOfflineRequest: (request: OfflineRequest) => Promise<void>;
  queueOfflineMessage: (message: unknown) => Promise<void>;
  clearCache: () => Promise<void>;
  getCacheSize: () => Promise<number>;
}

interface OfflineRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

const PWAContext = createContext<PWAContextType | null>(null);

export function usePWA() {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWA must be used within a PWAProvider');
  }
  return context;
}

interface PWAProviderProps {
  children: ReactNode;
}

export function PWAProvider({ children }: PWAProviderProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // 온라인/오프라인 상태 감지
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // 온라인 복구 시 동기화 트리거
      if (swRegistration?.sync) {
        swRegistration.sync.register('sync-pending-requests');
        swRegistration.sync.register('sync-chat-messages');
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [swRegistration]);

  // PWA 설치 상태 확인
  useEffect(() => {
    // standalone 모드 확인
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;

    setIsInstalled(isStandalone);

    // 설치 프롬프트 이벤트 캡처
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    // 설치 완료 이벤트
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 서비스 워커 등록 및 업데이트 감지
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    // 개발 환경에서는 서비스 워커 비활성화
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return;
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        setSwRegistration(registration);

        // 업데이트 체크
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setIsUpdateAvailable(true);
              }
            });
          }
        });

        // 서비스 워커 메시지 수신
        navigator.serviceWorker.addEventListener('message', handleSWMessage);

        // 주기적 업데이트 체크 (1시간마다)
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    };

    registerSW();

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, []);

  // 서비스 워커 메시지 핸들러
  const handleSWMessage = useCallback((event: MessageEvent) => {
    const { type, version, messageId } = event.data;

    switch (type) {
      case 'SW_UPDATED':
        console.log('[PWA] Service Worker updated to version:', version);
        setIsUpdateAvailable(true);
        break;

      case 'MESSAGE_SYNCED':
        console.log('[PWA] Message synced:', messageId);
        // 필요시 UI 업데이트 트리거
        window.dispatchEvent(new CustomEvent('pwa-message-synced', { detail: { messageId } }));
        break;
    }
  }, []);

  // 앱 설치 프롬프트
  const installPrompt = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    setDeferredPrompt(null);
    setIsInstallable(false);

    return outcome === 'accepted';
  }, [deferredPrompt]);

  // 앱 업데이트
  const updateApp = useCallback(async (): Promise<void> => {
    if (!swRegistration?.waiting) {
      return;
    }

    // 새 서비스 워커에 skipWaiting 메시지 전송
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // 페이지 새로고침
    window.location.reload();
  }, [swRegistration]);

  // 오프라인 요청 큐잉
  const queueOfflineRequest = useCallback(async (request: OfflineRequest): Promise<void> => {
    if (!navigator.serviceWorker.controller) {
      throw new Error('Service Worker not available');
    }

    navigator.serviceWorker.controller.postMessage({
      type: 'QUEUE_REQUEST',
      payload: request
    });
  }, []);

  // 오프라인 메시지 큐잉
  const queueOfflineMessage = useCallback(async (message: unknown): Promise<void> => {
    if (!navigator.serviceWorker.controller) {
      throw new Error('Service Worker not available');
    }

    navigator.serviceWorker.controller.postMessage({
      type: 'QUEUE_MESSAGE',
      payload: message
    });
  }, []);

  // 캐시 삭제
  const clearCache = useCallback(async (): Promise<void> => {
    if (!navigator.serviceWorker.controller) {
      // 서비스 워커 없이도 캐시 삭제 가능
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      return;
    }

    navigator.serviceWorker.controller.postMessage({
      type: 'CLEAR_CACHE'
    });
  }, []);

  // 캐시 크기 계산
  const getCacheSize = useCallback(async (): Promise<number> => {
    if (!('storage' in navigator && 'estimate' in navigator.storage)) {
      return 0;
    }

    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }, []);

  const value: PWAContextType = {
    isOnline,
    isInstalled,
    isInstallable,
    isUpdateAvailable,
    swRegistration,
    installPrompt,
    updateApp,
    queueOfflineRequest,
    queueOfflineMessage,
    clearCache,
    getCacheSize,
  };

  return (
    <PWAContext.Provider value={value}>
      {children}
    </PWAContext.Provider>
  );
}

// BeforeInstallPromptEvent 타입 정의
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// 타입 확장
declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }

  interface ServiceWorkerRegistration {
    sync?: {
      register: (tag: string) => Promise<void>;
    };
  }
}
