// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDfxfB2oa1U3KsEY2WwcSWY8sX6r0VEnX8",
  authDomain: "gen-lang-client-0564104277.firebaseapp.com",
  projectId: "gen-lang-client-0564104277",
  storageBucket: "gen-lang-client-0564104277.firebasestorage.app",
  messagingSenderId: "677079437017",
  appId: "1:677079437017:web:b229f081d96d1aee3338c8"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || 'YOUR FINANCES';
  let actions = [];
  if (payload.data?.actions) {
    try {
      actions = typeof payload.data.actions === 'string' ? JSON.parse(payload.data.actions) : payload.data.actions;
    } catch (e) {
      actions = [];
    }
  }

  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png', // Monochrome icon for Android Status Bar
    tag: payload.data?.tag || 'default-tag',
    data: payload.data || {},
    vibrate: [100, 50, 100],
    actions: actions
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
