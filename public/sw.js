// ONE-HUB minimal service worker
// Enables PWA installability. Network-first, no offline caching for now.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass-through: always fetch from network.
  event.respondWith(fetch(event.request).catch(() => {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }));
});
