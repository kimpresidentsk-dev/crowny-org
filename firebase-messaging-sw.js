// ===== Firebase Messaging Service Worker =====
importScripts('https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-app-compat.min.js');
importScripts('https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-messaging-compat.min.js');

firebase.initializeApp({
  apiKey: "AIzaSyAqrMOtOCVTMqzsVEJgAMq5SBrpUzgABS8",
  authDomain: "crowny-84b84.firebaseapp.com",
  projectId: "crowny-84b84",
  storageBucket: "crowny-84b84.firebasestorage.app",
  messagingSenderId: "482020243607",
  appId: "1:482020243607:web:8b60558c7af507f4bed1d2"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || 'CROWNY', {
    body: body || '새 알림이 있습니다',
    icon: icon || '/img/icons/icon-192x192.png',
    badge: '/img/icons/icon-192x192.png',
    data: data,
    tag: data.type || 'crowny-notification',
    renotify: true
  });
});

// Notification click handler
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', data: e.notification.data });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
