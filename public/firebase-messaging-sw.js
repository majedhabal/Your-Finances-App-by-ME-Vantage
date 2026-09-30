importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

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
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title || 'Your Finances';
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'https://ais-dev-7emlxcghq7n5uxe2h4bcwc-160499208983.europe-west1.run.app/icons/Your_Finances_Logo_No_BG.png',
    badge: 'https://ais-dev-7emlxcghq7n5uxe2h4bcwc-160499208983.europe-west1.run.app/icons/Your_Finances_Logo_No_BG.png',
    tag: 'vantage-financial-reminder',
    renotify: true,
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
