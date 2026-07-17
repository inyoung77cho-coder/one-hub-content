// public/sw.js — ONE-HUB PWA Service Worker

// [V1] 배포마다 갱신 → 구 SW 강제 교체 트리거. 설정 화면에도 표기(사용자가 최신 여부 확인).
const SW_VERSION = 'v10.1-20260717';
const CACHE_VERSION = 'onehub-v27';

// [N3] 알림 종류별 착지점 — 백엔드는 kind만 실어 보내면 된다.
//   ★sample_30(정식 통계 열림)이 재방문 루프의 핵심: 오늘 탭 ⑤ 진행바 → 30건 도달 알림 → 열람.
const LANDING = {
  stop_loss: '/pwa/today',                  // 손절 임박 → 오늘 ① 결정 대기
  approve: '/pwa/today',                    // 승인 대기 → 오늘 ① 결정 대기
  judged: '/pwa?tab=report&sec=vs',         // 채점 완료 → 나 vs AI
  daily: '/pwa?tab=report&sec=archive',     // 일일 리포트 → 아카이브
  weekly: '/pwa?tab=report&sec=archive',    // 주간 리포트
  realestate: '/pwa/realestate',            // 부동산 신고가
  sample_30: '/pwa?tab=report&sec=verify',  // 30건 도달 = 정식 통계 열림
};
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
    // [H3/N3] 딥링크 — kind(알림 종류) → LANDING 매핑이 1순위. code/name·tab·url도 계속 지원.
    data: {
      url: payload.url || '/pwa', tab: payload.tab || null,
      kind: payload.kind || null, complex: payload.complex || null,
      code: payload.code || null, name: payload.name || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = '/pwa';
  if (data.kind && LANDING[data.kind]) {
    // [N3] 종류별 착지 — 부동산 신고가는 단지까지 지정
    targetUrl = LANDING[data.kind];
    if (data.kind === 'realestate' && data.complex) {
      targetUrl += `?complex=${encodeURIComponent(data.complex)}`;
    }
  } else if (data.code && data.name) {
    const params = new URLSearchParams({ tab: 'analyze', code: data.code, name: data.name });
    targetUrl = '/pwa?' + params.toString();
  } else if (data.tab) {
    // [H3] 임의 탭 딥링크(예: report=AI 신뢰도, dashboard=종합자산)
    targetUrl = '/pwa?tab=' + encodeURIComponent(data.tab);
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
