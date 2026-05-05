import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { execSync } from 'node:child_process';

function gitShortSha(): string {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(gitShortSha()),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      // Use the static manifest at apps/web/public/manifest.webmanifest as
      // the source of truth (Phase 6.2 already authored it).
      manifestFilename: 'manifest.webmanifest',
      injectRegister: false, // we register manually in main.tsx for visibility
      manifest: false,
      includeAssets: ['favicon.ico', 'peaty/peat-start.jpg'],
      devOptions: {
        // Disabled in dev so HMR + Vite middleware aren't fighting the SW.
        // Manual smoke testing: `pnpm --filter @repeaty/web build && pnpm
        // --filter @repeaty/web preview`.
        enabled: false,
        type: 'module',
      },
      workbox: {
        // Precache hashed JS/CSS/HTML at install time.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Workbox's default file-size cap is 2 MB, which is too tight once
        // Peaty illustrations + future bundled deck JSON (e.g. Phase 7+ ja/zh
        // expansion sets) join the precache list — a single oversized asset
        // would silently drop from the SW manifest and the page would 404 on
        // first offline load. 5 MB is the headroom we're willing to own per
        // file; anything larger should be lazy-loaded or runtime-cached, not
        // precached. See `references/deployment-landmines.md` § Bundle size.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Peaty illustrations.
            urlPattern: /\/peaty\/.*\.(?:jpg|jpeg|png|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'peaty-assets',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Supabase REST + Storage + Functions + Auth: NetworkOnly. The
            // offline queue (6.4) wraps these on the client side; the SW
            // shouldn't cache stale auth/RLS responses.
            urlPattern: /\.supabase\.co\/(rest|storage|functions|auth)\//,
            handler: 'NetworkOnly',
          },
        ],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@repeaty/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
