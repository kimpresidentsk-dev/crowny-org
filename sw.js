// SW 자폭 — 모든 캐시 삭제 후 자기 자신 해제
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
    .then(() => self.clients.claim())
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll())
    .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
});
