import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    publicDir: resolve(__dirname, 'public'),
    resolve: {
      alias: {
        '@': resolve('src/renderer')
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5000,
      strictPort: true
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
