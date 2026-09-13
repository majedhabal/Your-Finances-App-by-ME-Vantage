import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './lib/i18n';
import { APP_VERSION } from './lib/constants.ts';
import { showAlert } from './lib/alerts.ts';

// Prevent crash when global interceptor tries to serialize console arguments containing circular structures (e.g., from raw Firebase/React errors)
const makeSafeConsoleArg = (arg: any, seen = new WeakSet()): any => {
  if (arg === null || typeof arg !== 'object') {
    return arg;
  }
  if (seen.has(arg)) {
    return '[Circular Ref]';
  }
  seen.add(arg);

  try {
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: arg.message,
        stack: arg.stack,
      };
    }

    if (typeof window !== 'undefined') {
      if (arg instanceof Node) {
        return `[DOM Node: ${arg.nodeName}]`;
      }
      if (arg instanceof Window) {
        return '[Window Object]';
      }
    }

    if (arg.constructor && typeof arg.constructor.name === 'string') {
      const cName = arg.constructor.name;
      if (cName.length <= 3 && !['Map', 'Set', 'Date'].includes(cName)) {
        return `[Internal Object: ${cName}]`;
      }
    }

    if (Array.isArray(arg)) {
      return arg.map(item => makeSafeConsoleArg(item, seen));
    }

    const safeObj: any = {};
    for (const key of Object.keys(arg)) {
      safeObj[key] = makeSafeConsoleArg(arg[key], seen);
    }
    return safeObj;
  } catch (e) {
    return '[Unserializable Object]';
  }
};

const patchConsole = (method: 'error' | 'warn' | 'log') => {
  const original = console[method];
  console[method] = function (...args: any[]) {
    const safeArgs = args.map(arg => makeSafeConsoleArg(arg));
    original.apply(console, safeArgs);
  };
};

patchConsole('error');
patchConsole('warn');

// Override window.alert to use our custom modal
window.alert = function(message) {
  showAlert(message ? message.toString() : '');
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Bulletproof Splash Screen Dismissal
const dismissSplashScreen = () => {
  const splash = document.getElementById('splash-screen');
  if (splash && !splash.classList.contains('fade-out')) {
    splash.classList.add('fade-out');
    setTimeout(() => {
      try {
        if (splash.parentNode) {
          splash.parentNode.removeChild(splash);
        }
      } catch (e) {
        // Safe DOM cleanup
      }
    }, 400);
  }
};

// Immediate dismissal attempt on React mount
dismissSplashScreen();

// Register service worker
import { registerServiceWorker } from './lib/swRegistration';

registerServiceWorker();

// Dismiss splash screen quickly when ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(dismissSplashScreen, 200);
} else {
  window.addEventListener('DOMContentLoaded', () => setTimeout(dismissSplashScreen, 200));
  window.addEventListener('load', () => setTimeout(dismissSplashScreen, 200));
}

// Failsafe timer: Remove splash screen after max 800ms regardless of events or errors
setTimeout(dismissSplashScreen, 800);

// Handle Firestore quota exhaustion gracefully
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason && (
    (reason.code && String(reason.code).includes('resource-exhausted')) ||
    (reason.message && String(reason.message).includes('resource-exhausted')) ||
    (reason.message && String(reason.message).includes('Quota limit exceeded'))
  )) {
    event.preventDefault();
    console.warn('[Vantage] Firestore quota limit reached. Application operating in resilient offline/cached mode.');
    window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
  }
});

// Non-blocking async version check
const checkVersionAsync = async () => {
  if (!window.location.protocol.startsWith('http')) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('/api/version', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const { version } = await response.json();
      console.log(`[Vantage] Server version: ${version}, Client version: ${APP_VERSION}`);
    }
  } catch (e) {
    // Non-blocking version check
  }
};

checkVersionAsync();
