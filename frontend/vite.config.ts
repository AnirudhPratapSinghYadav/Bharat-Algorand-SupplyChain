import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the app calls same-origin `/api/*` and Vite proxies to VITE_API_URL (avoids CORS + wrong host/port in Chrome).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = (env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            algorand: ['algosdk', '@algorandfoundation/algokit-utils'],
            charts: ['recharts'],
            wallet: ['@perawallet/connect'],
          },
        },
      },
    },
    define: {
      global: 'window',
    },
    resolve: {
      alias: {
        buffer: 'buffer',
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      fs: {
        allow: ['.', '..'],
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => {
            const stripped = path.replace(/^\/api/, '')
            return stripped.length > 0 ? stripped : '/'
          },
        },
      },
    },
  }
})
