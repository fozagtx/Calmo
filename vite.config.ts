import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { calmoWeb } from './server/web-plugin.ts'

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 5173 },
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), viteReact(), tailwindcss(), calmoWeb()],
})
