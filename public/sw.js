// public/sw.js — ONE-HUB v9.0 PWA Service Worker

const CACHE_VERSION = 'onehub-v9';
const CACHE_NAME = CACHE_VERSION;
const STATIC_ASSETS = ['/pwa', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('onehub-') && key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] 이전 캐시 삭제:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // API 요청 → 항상 네트워크
  if (url.includes('/api/')) return;

  // HTML 페이지(navigation) → network-first: 항상 최신 HTML 서빙, 실패 시만 캐시
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // _next/static(JS/CSS/이미지) → cache-first (해시 변경 시 자동 갱신)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'ONE-HUB', body: '새 알림이 도착했습니다.' };
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    try { payload.body = event.data.text(); } catch (e2) { /* 무시 */ }
  }

  const title = payload.title || 'ONE-HUB';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/pwa', code: payload.code || null, name: payload.name || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = '/pwa';
  if (data.code && data.name) {
    const params = new URLSearchParams({ tab: 'analyze', code: data.code, name: data.name });
    targetUrl = '/pwa?' + params.toString();
  } else if (data.url) {
    targetUrl = data.url;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/pwa') && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
