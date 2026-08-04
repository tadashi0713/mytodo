import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MyTodo',
        short_name: 'MyTodo',
        description: '個人用のシンプルなTodoアプリ',
        lang: 'ja',
        start_url: '/',
        display: 'standalone',
        theme_color: '#d1453b',
        background_color: '#faf9f7',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // SPA フォールバックに API を巻き込まない
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // API の GET はネットワーク優先。オフライン時は最後に取得した内容を表示
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // 開発時: API リクエストは wrangler pages dev (D1 ローカルエミュレータ) に流す
      '/api': 'http://localhost:8788',
    },
  },
})
