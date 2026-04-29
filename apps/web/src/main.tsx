import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { loadEnv } from './env';
import './index.css';

// Validate env at startup; crash loud if anything's missing.
loadEnv(import.meta.env as unknown as Record<string, unknown>);

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
