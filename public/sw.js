/**
 * Athena PWA Service Worker
 * 오프라인 모드, 캐싱, 백그라운드 동기화 지원
 */

const APP_VERSION = '2.0.0';
const CACHE_PREFIX = 'athena-';
const STATIC_CACHE = `${CACHE_PREFIX}static-v${APP_VERSION}`;
const DYNAMIC_CACHE = `${CACHE_PREFIX}dynamic-v${APP_VERSION}`;
const OFFLINE_CACHE = `${CACHE_PREFIX}offline-v${APP_VERSION}`;
const API_CACHE = `${CACHE_PREFIX}api-v${APP_VERSION}`;

// 정적 자원 (프리캐시)
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
];

// API 엔드포인트 패턴
const API_PATTERNS = [
  '/api/athena',
  '/api/transcribe',
  '/api/auth',
];

// 캐시하지 않을 패턴
const NO_CACHE_PATTERNS = [
  '/_next/webpack-hmr',
  '/api/athena/chat/stream',
  'chrome-extension://',
  'extension://',
];

/**
 * Install 이벤트 - 정적 자원 프리캐시
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v' + APP_VERSION);

  event.waitUntil(
    Promise.all([
      // 정적 캐시
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(STATIC_ASSETS).catch((error) => {
          console.warn('[SW] Failed to cache some static assets:', error);
        });
      }),
      // 오프라인 캐시 초기화
      caches.open(OFFLINE_CACHE),
    ]).then(() => {
      console.log('[SW] Installation complete');
      return self.skipWaiting();
    })
  );
});

/**
 * Activate 이벤트 - 이전 캐시 정리
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v' + APP_VERSION);

  event.waitUntil(
    Promise.all([
      // 이전 버전 캐시 삭제
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith(CACHE_PREFIX))
            .filter((name) => ![STATIC_CACHE, DYNAMIC_CACHE, OFFLINE_CACHE, API_CACHE].includes(name))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
      // 모든 클라이언트 제어
      self.clients.claim(),
    ]).then(() => {
      console.log('[SW] Activation complete');
      // 업데이트 알림
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: APP_VERSION
          });
        });
      });
    })
  );
});

/**
 * Fetch 이벤트 - 캐싱 전략
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 캐시하지 않을 요청 체크
  if (shouldSkipCache(request)) {
    return;
  }

  // Same-origin 요청만 처리
  if (url.origin !== self.location.origin) {
    return;
  }

  // API 요청
  if (isApiRequest(url.pathname)) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
    return;
  }

  // 정적 자원
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // 페이지 네비게이션
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // 기타 요청 - Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

/**
 * 캐시 스킵 체크
 */
function shouldSkipCache(request) {
  // POST, PUT, DELETE 등은 캐시하지 않음
  if (request.method !== 'GET') {
    return true;
  }

  // 특정 패턴 제외
  return NO_CACHE_PATTERNS.some((pattern) => request.url.includes(pattern));
}

/**
 * API 요청 체크
 */
function isApiRequest(pathname) {
  return API_PATTERNS.some((pattern) => pathname.startsWith(pattern));
}

/**
 * 정적 자원 체크
 */
function isStaticAsset(pathname) {
  return pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/) ||
         pathname.startsWith('/_next/static/');
}

/**
 * Network First 전략 (API 요청용)
 */
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // 오프라인 JSON 응답
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: '오프라인 상태입니다. 네트워크 연결을 확인해주세요.',
        cached: false
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Cache First 전략 (정적 자원용)
 */
async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    return new Response('Resource not available offline', { status: 503 });
  }
}

/**
 * Stale While Revalidate 전략
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

/**
 * Network First with Offline Fallback (페이지 네비게이션용)
 */
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // 캐시된 페이지 확인
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // 오프라인 페이지로 폴백
    const offlineResponse = await caches.match('/offline');

    if (offlineResponse) {
      return offlineResponse;
    }

    // 기본 오프라인 HTML
    return new Response(
      `<!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>오프라인 - Athena</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: white;
            text-align: center;
            padding: 20px;
          }
          .icon { font-size: 64px; margin-bottom: 20px; }
          h1 { font-size: 24px; margin-bottom: 10px; }
          p { color: #94a3b8; margin-bottom: 20px; }
          button {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
          }
          button:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="icon">📡</div>
        <h1>오프라인 상태입니다</h1>
        <p>인터넷 연결이 없습니다. 연결을 확인한 후 다시 시도해주세요.</p>
        <button onclick="location.reload()">다시 시도</button>
      </body>
      </html>`,
      {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}

/**
 * 백그라운드 동기화
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background Sync:', event.tag);

  if (event.tag === 'sync-pending-requests') {
    event.waitUntil(syncPendingRequests());
  }

  if (event.tag === 'sync-chat-messages') {
    event.waitUntil(syncChatMessages());
  }
});

/**
 * 대기중인 요청 동기화
 */
async function syncPendingRequests() {
  try {
    // IndexedDB에서 대기중인 요청 가져오기
    const db = await openDatabase();
    const requests = await getAllPendingRequests(db);

    for (const req of requests) {
      try {
        await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body
        });

        // 성공하면 삭제
        await deletePendingRequest(db, req.id);
      } catch (error) {
        console.warn('[SW] Failed to sync request:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

/**
 * 채팅 메시지 동기화
 */
async function syncChatMessages() {
  try {
    const db = await openDatabase();
    const messages = await getPendingMessages(db);

    for (const msg of messages) {
      try {
        const response = await fetch('/api/athena/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg.data)
        });

        if (response.ok) {
          await deletePendingMessage(db, msg.id);

          // 클라이언트에 알림
          const clients = await self.clients.matchAll();
          clients.forEach((client) => {
            client.postMessage({
              type: 'MESSAGE_SYNCED',
              messageId: msg.id
            });
          });
        }
      } catch (error) {
        console.warn('[SW] Failed to sync message:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Chat sync failed:', error);
  }
}

/**
 * IndexedDB 헬퍼 함수들
 */
const DB_NAME = 'athena-offline';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('pending-requests')) {
        db.createObjectStore('pending-requests', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('pending-messages')) {
        db.createObjectStore('pending-messages', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('cached-conversations')) {
        db.createObjectStore('cached-conversations', { keyPath: 'id' });
      }
    };
  });
}

function getAllPendingRequests(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pending-requests', 'readonly');
    const store = transaction.objectStore('pending-requests');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deletePendingRequest(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pending-requests', 'readwrite');
    const store = transaction.objectStore('pending-requests');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function getPendingMessages(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pending-messages', 'readonly');
    const store = transaction.objectStore('pending-messages');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deletePendingMessage(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pending-messages', 'readwrite');
    const store = transaction.objectStore('pending-messages');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * 푸시 알림
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {
    title: 'Athena',
    body: '새로운 알림이 있습니다.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'athena-notification'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (error) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      actions: data.actions || [
        { action: 'open', title: '열기' },
        { action: 'dismiss', title: '닫기' }
      ]
    })
  );
});

/**
 * 알림 클릭 처리
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // 이미 열린 창이 있으면 포커스
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          return client.focus();
        }
      }

      // 없으면 새 창 열기
      return self.clients.openWindow(event.notification.data?.url || '/');
    })
  );
});

/**
 * 메시지 핸들러 (클라이언트와 통신)
 */
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  const { type, payload } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      event.ports[0].postMessage({ version: APP_VERSION });
      break;

    case 'CACHE_URLS':
      cacheUrls(payload.urls);
      break;

    case 'CLEAR_CACHE':
      clearCache(payload?.cacheName);
      break;

    case 'QUEUE_REQUEST':
      queueRequest(payload);
      break;

    case 'QUEUE_MESSAGE':
      queueMessage(payload);
      break;
  }
});

/**
 * URL 캐싱
 */
async function cacheUrls(urls) {
  const cache = await caches.open(DYNAMIC_CACHE);

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch (error) {
      console.warn('[SW] Failed to cache URL:', url, error);
    }
  }
}

/**
 * 캐시 삭제
 */
async function clearCache(cacheName) {
  if (cacheName) {
    await caches.delete(cacheName);
  } else {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX))
        .map((name) => caches.delete(name))
    );
  }
}

/**
 * 요청 큐잉 (오프라인 시)
 */
async function queueRequest(request) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pending-requests', 'readwrite');
    const store = transaction.objectStore('pending-requests');
    const req = store.add({
      ...request,
      timestamp: Date.now()
    });

    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      resolve(req.result);
      // 백그라운드 동기화 등록
      if ('sync' in self.registration) {
        self.registration.sync.register('sync-pending-requests');
      }
    };
  });
}

/**
 * 메시지 큐잉 (오프라인 시)
 */
async function queueMessage(message) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pending-messages', 'readwrite');
    const store = transaction.objectStore('pending-messages');
    const req = store.add({
      data: message,
      timestamp: Date.now()
    });

    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      resolve(req.result);
      // 백그라운드 동기화 등록
      if ('sync' in self.registration) {
        self.registration.sync.register('sync-chat-messages');
      }
    };
  });
}

console.log('[SW] Service Worker loaded - v' + APP_VERSION);
