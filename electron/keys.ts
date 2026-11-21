import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import type { KeyUpdate } from '../src/lib/coach-types'

interface StoredKeys {
  smartspectra: string
  serv: string
  model: string
}

const DEFAULT_MODEL = 'gpt-5.4-mini'

const keysFile = () => path.join(app.getPath('userData'), 'keys.json')

function devEnv(): Partial<StoredKeys> {
  if (app.isPackaged) return {}
  const file = path.join(app.getAppPath(), '.env')
  if (!existsSync(file)) return {}
  const env = parseEnv(readFileSync(file, 'utf8'))
  return {
    smartspectra: env.SMARTSPECTRA_API_KEY ?? '',
    serv: env.SERV_API_KEY ?? '',
    model: env.SERV_MODEL ?? '',
  }
}

function decrypt(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

function encrypt(value: string): string {
  return value ? safeStorage.encryptString(value).toString('base64') : ''
}

export function readKeys(): StoredKeys {
  let saved: Record<string, unknown> = {}
  if (existsSync(keysFile())) {
    try {
      saved = JSON.parse(readFileSync(keysFile(), 'utf8')) as Record<string, unknown>
    } catch {
      saved = {}
    }
  }
  const env = devEnv()
  return {
    smartspectra: decrypt(saved.smartspectra) || env.smartspectra || '',
    serv: decrypt(saved.serv) || env.serv || '',
    model: (typeof saved.model === 'string' && saved.model) || env.model || DEFAULT_MODEL,
  }
}

export function saveKeys(update: KeyUpdate): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this Mac.')
  let saved: Record<string, unknown> = {}
  if (existsSync(keysFile())) {
    try {
      saved = JSON.parse(readFileSync(keysFile(), 'utf8')) as Record<string, unknown>
    } catch {
      saved = {}
    }
  }
  if (update.smartspectra !== undefined) saved.smartspectra = encrypt(update.smartspectra.trim())
  if (update.serv !== undefined) saved.serv = encrypt(update.serv.trim())
  if (update.model !== undefined) saved.model = update.model.trim() || DEFAULT_MODEL
  writeFileSync(keysFile(), JSON.stringify(saved), { mode: 0o600 })
}
