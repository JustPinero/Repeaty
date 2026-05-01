import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
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
