// public/sw.js — ONE-HUB v9.0 PWA Web Push Service Worker

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'ONE-HUB', body: '새 알림이 도착했습니다.' };
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (e) {
    try {
      payload.body = event.data.text();
    } catch (e2) { /* 무시 */ }
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
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
