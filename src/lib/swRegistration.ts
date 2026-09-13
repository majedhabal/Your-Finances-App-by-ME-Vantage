export function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    const doRegister = () => {
      try {
        navigator.serviceWorker
          .register('/service-worker.js')
          .then((registration) => {
            console.log(
              '[Vantage SW] Registration successful with scope: ',
              registration.scope
            );

            // Actively check for service worker updates safely
            registration.update().catch(() => {});

            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                      console.log('[Vantage SW] New worker installed in background');
                    }
                  }
                };
              }
            };
          })
          .catch((error) => {
            console.warn('[Vantage SW] Registration deferred or unsupported:', error);
          });
      } catch (err) {
        console.warn('[Vantage SW] Registration exception:', err);
      }
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      doRegister();
    } else {
      window.addEventListener('load', doRegister);
    }
  }
}
