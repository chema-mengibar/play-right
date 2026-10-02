import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Override with VITE_BASE_PATH when the deployed subdirectory is known.
  base: process.env.VITE_BASE_PATH || './',
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
