import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      // 'prompt' leaves the new worker waiting; main.ts asks before swapping it in.
      registerType: 'prompt',
      // main.ts imports virtual:pwa-register itself, so the auto-injected
      // registerSW.js script would register a second time.
      injectRegister: null,
      includeAssets: ['core.svg', 'favicon-48.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Coretura Clicker',
        short_name: 'Clicker',
        description:
          'An incremental game about shipping code: click the Core, turn lines into funding, and scale from one intern to a self-improving vehicle platform.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#001220',
        theme_color: '#001220',
        lang: 'en',
        categories: ['games', 'entertainment'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/core.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // jpg is deliberately absent: the only JPEGs are the two background
        // fallbacks (AVIF is precached instead) and og.jpg, which exists for
        // social crawlers and is never fetched by the app.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2,avif}'],
      },
    }),
  ],
});
