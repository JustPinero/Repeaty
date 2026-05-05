import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalErrorListenerMount } from './lib/GlobalErrorListenerMount';
import { loadEnv } from './env';
import './index.css';

// Validate env at startup; crash loud if anything's missing.
loadEnv(import.meta.env as unknown as Record<string, unknown>);

// PWA service-worker registration. `vite-plugin-pwa` exposes
// `virtual:pwa-register` only at build time. Dev server doesn't expose
// it (devOptions.enabled = false in vite.config.ts), so the dynamic
// import is gated on `import.meta.env.PROD`.
if (import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then((mod) => {
      mod.registerSW({
        onOfflineReady() {
          // eslint-disable-next-line no-console
          console.info('[pwa] offline-ready: precached assets are available without network');
        },
      });
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[pwa] service-worker registration skipped', err);
    });
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GlobalErrorListenerMount />
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
