import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// MPP_NO_SW=1 builds without the service worker — used for the hosted demo bundle, where the
// app is served from a sub-path and a root-scoped worker has nothing to register against.
const withServiceWorker = process.env.MPP_NO_SW !== '1';

export default defineConfig({
  // Without the PWA plugin there is no virtual:pwa-register module to resolve, so point the
  // import at a no-op instead of making main.tsx aware of which build it is in.
  resolve: withServiceWorker
    ? {}
    : { alias: { 'virtual:pwa-register': new URL('./src/pwaRegisterStub.ts', import.meta.url).pathname } },
  plugins: [
    react(),
    tailwindcss(),
    ...(withServiceWorker ? [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MPP — Momentum Project Platform',
        short_name: 'MPP',
        description: 'Kanban with a Stagnation Radar, Micro-Task Catalyst and Deep Work blocks.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    })] : []),
  ],
});
