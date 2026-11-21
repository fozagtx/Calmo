import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseEnv } from 'node:util'
import type { Connect, Plugin } from 'vite'
import { AskSchema, keyHint, type AppConfig } from '../src/lib/coach-types.ts'
import { askCoach, listModels } from './coach.ts'
import { createVitalsUpgrade } from './vitals-relay.ts'

const DEFAULT_MODEL = 'gpt-5.4-mini'

function applyProjectEnv(): void {
  if (!existsSync('.env')) return
  const env = parseEnv(readFileSync('.env', 'utf8'))
  for (const key of ['SMARTSPECTRA_API_KEY', 'SERV_API_KEY', 'SERV_MODEL']) {
    const value = env[key]
    if (value) process.env[key] = value
  }
}

function config(): AppConfig {
  return {
    vitalsReady: !!(process.env.SMARTSPECTRA_API_KEY ?? '').trim(),
    coachReady: !!(process.env.SERV_API_KEY ?? '').trim(),
    smartspectraHint: keyHint((process.env.SMARTSPECTRA_API_KEY ?? '').trim()),
    servHint: keyHint((process.env.SERV_API_KEY ?? '').trim()),
    model: (process.env.SERV_MODEL ?? '').trim() || DEFAULT_MODEL,
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 256 * 1024) {
        reject(new Error('Request too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const api: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/api/config' && req.method === 'GET') {
    json(res, 200, config())
    return
  }
  if (url.pathname === '/api/models' && req.method === 'GET') {
    listModels((process.env.SERV_API_KEY ?? '').trim())
      .then((models) => json(res, 200, { ok: true, models }))
      .catch((err: Error) => json(res, 200, { ok: false, error: err.message }))
    return
  }
  if (url.pathname === '/api/coach' && req.method === 'POST') {
    readBody(req)
      .then(async (raw) => {
        const parsed = AskSchema.safeParse(JSON.parse(raw))
        if (!parsed.success) {
          json(res, 400, { ok: false, error: 'The coach request was not valid.' })
          return
        }
        const cfg = config()
        try {
          const text = await askCoach((process.env.SERV_API_KEY ?? '').trim(), parsed.data.model || cfg.model, parsed.data)
          json(res, 200, { ok: true, text })
        } catch (err) {
          json(res, 200, { ok: false, error: (err as Error).message })
        }
      })
      .catch(() => json(res, 400, { ok: false, error: 'The coach request was not valid.' }))
    return
  }
  next()
}

export function calmoWeb(): Plugin {
  applyProjectEnv()
  const upgrade = createVitalsUpgrade()
  return {
    name: 'calmo-web',
    configureServer(server) {
      server.middlewares.use(api)
      server.httpServer?.on('upgrade', upgrade)
    },
    configurePreviewServer(server) {
      server.middlewares.use(api)
      server.httpServer?.on('upgrade', upgrade)
    },
  }
}
