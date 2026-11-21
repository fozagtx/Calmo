import { app, safeStorage } from 'electron'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import type { KeyUpdate } from '../src/lib/coach-types'

interface StoredKeys {
  smartspectra: string
  serv: string
  model: string
}

interface KeyFile {
  v?: number
  smartspectra?: string
  serv?: string
  model?: string
}

const DEFAULT_MODEL = 'gpt-5.4-mini'
const FORMAT = 2

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

function legacyDecrypt(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

function writeFile(data: KeyFile): void {
  writeFileSync(keysFile(), JSON.stringify({ ...data, v: FORMAT }), { mode: 0o600 })
  chmodSync(keysFile(), 0o600)
}

function loadFile(): KeyFile {
  if (!existsSync(keysFile())) return {}
  let raw: KeyFile
  try {
    raw = JSON.parse(readFileSync(keysFile(), 'utf8')) as KeyFile
  } catch {
    return {}
  }
  if (raw.v === FORMAT) return raw
  const migrated: KeyFile = {
    smartspectra: legacyDecrypt(raw.smartspectra),
    serv: legacyDecrypt(raw.serv),
    model: typeof raw.model === 'string' ? raw.model : undefined,
  }
  if (migrated.smartspectra || migrated.serv) writeFile(migrated)
  return migrated
}

export function readKeys(): StoredKeys {
  const saved = loadFile()
  const env = devEnv()
  return {
    smartspectra: saved.smartspectra || env.smartspectra || '',
    serv: saved.serv || env.serv || '',
    model: saved.model || env.model || DEFAULT_MODEL,
  }
}

export function saveKeys(update: KeyUpdate): void {
  const saved = loadFile()
  if (update.smartspectra !== undefined) saved.smartspectra = update.smartspectra.trim()
  if (update.serv !== undefined) saved.serv = update.serv.trim()
  if (update.model !== undefined) saved.model = update.model.trim() || DEFAULT_MODEL
  writeFile(saved)
}
