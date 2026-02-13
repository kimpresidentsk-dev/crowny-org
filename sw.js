// ===== CROWNY Service Worker v1.0 =====
const CACHE_VERSION = 'crowny-v2.1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/js/config.js',
  '/js/ui.js',
  '/js/auth.js',
  '/js/wallet.js',
  '/js/offchain.js',
  '/js/social.js',
  '/js/friends.js',
  '/js/group-chat.js',
  '/js/send.js',
  '/js/admin.js',
  '/js/marketplace.js',
  '/js/books.js',
  '/js/trading.js',
  '/js/mentor-learning.js',
  '/js/mentors.js',
  '/js/notifications.js',
  '/js/app-art.js',
  '/js/dashboard.js',
  '/js/search.js',
  '/js/settings.js',
  '/js/slogans.js',
  '/js/i18n.js',
  '/js/ai-assistant.js',
  '/js/ai-social.js',
  '/js/beauty-manager.js',
  '/js/care.js',
  '/js/e2e-crypto.js',
  '/js/explore.js',
  '/js/invite.js',
  '/js/landing.js',
  '/js/pwa.js',
  '/js/shortform.js',
  '/js/stories.js',
  '/img/icons/icon-192x192.png',
  '/img/icons/icon-512x512.png',
  '/manifest.json'
];

// Install — cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', e => {
  // Skip non-GET and cross-origin requests
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('/index.html')))
  );
});
