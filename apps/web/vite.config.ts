import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative URLs: the same build works at the root, under /Evo/ on GitHub Pages, and from
  // file:// inside the desktop shell (docs/decisions/0011).
  base: './',
  plugins: [react()]
})
