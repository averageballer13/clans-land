import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import capture from './tools/capture-plugin.mjs'

export default defineConfig({
  plugins: [react(), capture()],
  server: { port: 5183, host: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], react: ['react', 'react-dom'] }
      }
    }
  }
})
