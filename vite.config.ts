import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 開発時: API リクエストは wrangler pages dev (D1 ローカルエミュレータ) に流す
      '/api': 'http://localhost:8788',
    },
  },
})
