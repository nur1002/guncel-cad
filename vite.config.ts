import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/tkgm-api': {
        target: 'https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/tkgm-api/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://parselsorgu.tkgm.gov.tr/',
        },
      },
    },
  },
})
