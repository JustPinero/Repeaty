import { useEffect, useState } from 'react';

const DISMISS_KEY = 'repeaty:install-hint-dismissed';

/**
 * iOS Safari has no `beforeinstallprompt` event — the user has to install
 * the PWA via Share → Add to Home Screen. This pill appears on iOS Safari
 * (only when not already installed in standalone mode) to nudge them
 * through the flow. Dismiss is sticky via localStorage.
 *
 * Other browsers (Chrome, Edge, Samsung Internet) get the standard install
 * UI from the manifest + service worker — no extra hint needed.
 */
export function InstallHint() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent ?? '';
    const isIos = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    const standalone =
      'standalone' in window.navigator &&
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const dismissed = window.localStorage.getItem(DISMISS_KEY) === 'true';
    setShouldShow(isIos && !standalone && !dismissed);
  }, []);

  if (!shouldShow) return null;

  function handleDismiss() {
    window.localStorage.setItem(DISMISS_KEY, 'true');
    setShouldShow(false);
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-peaty-green/30 bg-peaty-green/5 p-3 text-sm text-stone-700"
    >
      <p className="font-medium">Install Repeaty on your home screen</p>
      <p className="mt-1 text-xs">
        Tap the Share icon in Safari, then &ldquo;Add to Home Screen&rdquo;.
        Repeaty will run full-screen with offline support.
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="mt-2 text-xs underline text-stone-500"
      >
        Dismiss
      </button>
    </div>
  );
}
