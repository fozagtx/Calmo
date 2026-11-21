import { spawn } from 'node:child_process'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5175, strictPort: true } })
await server.listen()
const url = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5175/'

const electronBin = (await import('electron')).default as unknown as string
const child = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, CALMO_DEV_URL: url },
})

const shutdown = async () => {
  child.kill()
  await server.close()
  process.exit(0)
}
child.on('exit', () => void shutdown())
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
