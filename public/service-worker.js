const CACHE_NAME = 'your-finances-mint-v1.0.2'; // Incremented version

// Listen for message from client to activate new service worker immediately
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Core static assets to pre-cache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Hosts to bypass caching entirely (e.g., Firebase Auth/Database servers)
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'googleapis.com',
  'googlesyndication.com',
  'googleads.g.doubleclick.net'
];

// Install Event: Cache critical shell resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Vantage SW] Pre-caching core shell assets');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[Vantage SW] Pre-cache warning: some files could not be pre-cached', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up legacy caches immediately & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => {
          console.log('[Vantage SW] Removing legacy cache:', name);
          return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER cache or intercept Firebase Auth, Firestore, or your backend API routes
  if (
    url.origin.includes('googleapis.com') ||
    url.origin.includes('firebaseio.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return; // Let the browser handle network requests directly without service worker interference
  }

  // 1. Only intercept and cache HTTP/HTTPS GET requests
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 2. Bypass caching for real-time Firebase Auth and Database endpoints
  if (BYPASS_HOSTS.some(host => url.hostname.includes(host))) {
    return;
  }

  // 3. Bypass caching for our dynamic /api/* endpoints
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 4. Navigation Requests: Network-First strategy with resilient fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          try {
            const cache = await caches.open(CACHE_NAME);
            const cachedReq = await cache.match(event.request);
            if (cachedReq) return cachedReq;
            const cachedIndex = await cache.match('/index.html');
            if (cachedIndex) return cachedIndex;
            const cachedRoot = await cache.match('/');
            if (cachedRoot) return cachedRoot;
          } catch (e) {
            console.warn('[Vantage SW] Cache match error:', e);
          }
          // If all cache lookups fail, attempt a fresh fetch
          return fetch(event.request);
        })
    );
    return;
  }

  // 5. Assets (JS, CSS, images): Stale-While-Revalidate strategy
  // Serves instant response from cache while fetching latest version from network in background
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      });
    })
  );
});

// Push Notification Event: Handle incoming push messages
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Your Finances', body: event.data.text() };
    }
  }

  const title = data.title || 'Your Finances';
  const options = {
    body: data.body || 'You have a new update.',
    icon: '/icons/Your_Finances_Logo_No_BG.png',
    badge: '/icons/Your_Finances_Logo_No_BG.png',
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Event: Handle user interaction
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// Background Sync Event: Handle deferred tasks
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(
      // Implement your logic to sync transactions when online
      console.log('[Vantage SW] Background sync triggered:', event.tag)
    );
  }
});
