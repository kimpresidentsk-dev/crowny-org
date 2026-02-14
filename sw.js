// ===== CROWNY Service Worker v2.0 =====
const CACHE_VERSION = 'crowny-v20260215-006';
const FALLBACK_CACHE = 'crowny-fallback-v1';
const NETWORK_TIMEOUT = 5000; // 5초 네트워크 타임아웃

const APP_SHELL = [
  '/',
  '/index.html',
  '/css/base.css?v=20260215-006',
  '/css/home.css?v=20260215-006',
  '/css/wallet.css?v=20260215-006',
  '/css/social.css?v=20260215-006',
  '/css/messenger.css?v=20260215-006',
  '/css/trading.css?v=20260215-006',
  '/css/ai.css?v=20260215-006',
  '/css/care.css?v=20260215-006',
  '/css/components.css?v=20260215-006',
  '/css/settings.css?v=20260215-006',
  '/css/dark.css?v=20260215-006',
  '/css/mobile.css?v=20260215-006',
  '/js/config.js?v=20260215-006',
  '/js/ui.js?v=20260215-006',
  '/js/auth.js?v=20260215-006',
  '/js/wallet.js?v=20260215-006',
  '/js/offchain.js?v=20260215-006',
  '/js/social.js?v=20260215-006',
  '/js/friends.js?v=20260215-006',
  '/js/group-chat.js?v=20260215-006',
  '/js/send.js?v=20260215-006',
  '/js/admin.js?v=20260215-006',
  '/js/marketplace.js?v=20260215-006',
  '/js/books.js?v=20260215-006',
  '/js/trading.js?v=20260215-006',
  '/js/mentor-learning.js?v=20260215-006',
  '/js/mentors.js?v=20260215-006',
  '/js/notifications.js?v=20260215-006',
  '/js/app-art.js?v=20260215-006',
  '/js/dashboard.js?v=20260215-006',
  '/js/search.js?v=20260215-006',
  '/js/settings.js?v=20260215-006',
  '/js/slogans.js?v=20260215-006',
  '/js/i18n.js?v=20260215-006',
  '/js/ai-assistant.js?v=20260215-006',
  '/js/ai-social.js?v=20260215-006',
  '/js/translate.js?v=20260215-006',
  '/js/beauty-manager.js?v=20260215-006',
  '/js/brain.js?v=20260215-006',
  '/js/movement.js?v=20260215-006',
  '/js/care.js?v=20260215-006',
  '/js/e2e-crypto.js?v=20260215-006',
  '/js/explore.js?v=20260215-006',
  '/js/invite.js?v=20260215-006',
  '/js/landing.js?v=20260215-006',
  '/js/pwa.js?v=20260215-006',
  '/js/shortform.js?v=20260215-006',
  '/js/stories.js?v=20260215-006',
  '/img/icons/icon-192x192.png',
  '/img/icons/icon-512x512.png',
  '/manifest.json'
];

// Install — cache app shell with error handling
self.addEventListener('install', event => {
  console.log('[SW] Installing version:', CACHE_VERSION);
  
  event.waitUntil(
    (async () => {
      try {
        // 기존 캐시 모두 삭제 (강제 업데이트)
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_VERSION && cacheName !== FALLBACK_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );

        // 새 캐시 생성
        const cache = await caches.open(CACHE_VERSION);
        console.log('[SW] Caching app shell...');
        
        // 리소스별로 개별 캐싱 (에러 발생 시 계속 진행)
        for (const url of APP_SHELL) {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn('[SW] Failed to cache:', url, error);
          }
        }
        
        // 즉시 활성화
        await self.skipWaiting();
        console.log('[SW] Installation complete');
      } catch (error) {
        console.error('[SW] Installation failed:', error);
        throw error;
      }
    })()
  );
});

// Activate — 캐시 클리어 및 클라이언트 제어
self.addEventListener('activate', event => {
  console.log('[SW] Activating version:', CACHE_VERSION);
  
  event.waitUntil(
    (async () => {
      try {
        // 오래된 캐시 정리
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_VERSION && cacheName !== FALLBACK_CACHE) {
              console.log('[SW] Deleting old cache during activation:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );

        // 모든 클라이언트 제어
        await self.clients.claim();
        
        // 모든 클라이언트에게 새로고침 메시지 전송
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'CACHE_UPDATED',
            version: CACHE_VERSION,
            timestamp: Date.now()
          });
        });
        
        console.log('[SW] Activation complete');
      } catch (error) {
        console.error('[SW] Activation failed:', error);
      }
    })()
  );
});

// 네트워크 요청 타임아웃 함수
function fetchWithTimeout(request, timeout = NETWORK_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Network timeout'));
    }, timeout);

    fetch(request).then(
      response => {
        clearTimeout(timeoutId);
        resolve(response);
      },
      err => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}

// Fetch — 개선된 네트워크 전략
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests (Firebase, CDN 등)
  if (!event.request.url.startsWith(self.location.origin)) {
    // Firebase 요청은 특별 처리
    if (event.request.url.includes('firebaseapp.com') || 
        event.request.url.includes('googleapis.com') ||
        event.request.url.includes('gstatic.com')) {
      event.respondWith(
        fetchWithTimeout(event.request, 10000) // Firebase는 더 긴 타임아웃
          .catch(() => new Response('Firebase service unavailable', { 
            status: 503, 
            statusText: 'Service Unavailable' 
          }))
      );
    }
    return;
  }

  const url = new URL(event.request.url);
  
  // API 요청 처리
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetchWithTimeout(event.request)
        .catch(async () => {
          // API 실패 시 fallback 응답
          return new Response(JSON.stringify({
            error: 'Network unavailable',
            offline: true,
            timestamp: Date.now()
          }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
          });
        })
    );
    return;
  }

  // 정적 리소스 처리 (Cache First with Network Fallback)
  event.respondWith(
    (async () => {
      try {
        // 1. 캐시에서 먼저 확인
        const cached = await caches.match(event.request);
        
        // 2. 네트워크 요청 (타임아웃 포함)
        const networkPromise = fetchWithTimeout(event.request).then(response => {
          // 성공한 응답만 캐시
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });

        // 3. 캐시가 있으면 즉시 반환, 백그라운드에서 업데이트
        if (cached) {
          // 백그라운드에서 네트워크 업데이트
          networkPromise.catch(() => {
            // 네트워크 실패해도 로그만 남기고 무시
            console.log('[SW] Background update failed for:', event.request.url);
          });
          return cached;
        }

        // 4. 캐시가 없으면 네트워크 우선
        return await networkPromise;
        
      } catch (error) {
        console.error('[SW] Fetch error:', error);
        
        // 5. 모든 것이 실패하면 fallback
        const cached = await caches.match(event.request);
        if (cached) return cached;
        
        // 6. HTML 요청이면 index.html로 fallback (SPA)
        if (event.request.headers.get('accept')?.includes('text/html')) {
          const indexFallback = await caches.match('/index.html');
          if (indexFallback) return indexFallback;
        }
        
        // 7. 최종 fallback
        return new Response('Resource unavailable offline', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      }
    })()
  );
});

// 클라이언트 메시지 처리
self.addEventListener('message', event => {
  if (event.data?.type === 'FORCE_CACHE_CLEAR') {
    console.log('[SW] Force clearing all caches...');
    
    event.waitUntil(
      (async () => {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          
          // 클라이언트에게 완료 알림
          event.ports[0]?.postMessage({ success: true });
        } catch (error) {
          console.error('[SW] Force cache clear failed:', error);
          event.ports[0]?.postMessage({ success: false, error: error.message });
        }
      })()
    );
  }
});

console.log('[SW] Service Worker loaded successfully');