import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html')
    }
  }
})
