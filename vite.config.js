import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/cw-cycle-count-v2/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
