import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { attachVitalsSocket } from './src/server/vitals-socket.ts'

function vitalsSocket(): Plugin {
  return {
    name: 'calmo-vitals-socket',
    configureServer(server) {
      attachVitalsSocket(server.httpServer)
    },
    configurePreviewServer(server) {
      attachVitalsSocket(server.httpServer)
    },
  }
}

function applyProjectEnv(): void {
  if (!existsSync('.env')) return
  const env = parseEnv(readFileSync('.env', 'utf8'))
  for (const key of ['SMARTSPECTRA_API_KEY', 'SERV_API_KEY', 'SERV_MODEL']) {
    const value = env[key]
    if (value) process.env[key] = value
  }
}

export default defineConfig(() => {
  applyProjectEnv()
  return {
    server: { host: '127.0.0.1', port: 5173 },
    preview: { host: '127.0.0.1', port: 5173 },
    ssr: { external: ['@smartspectra/node-sdk', 'ws'] },
    plugins: [tanstackStart(), viteReact(), tailwindcss(), vitalsSocket()],
  }
})
