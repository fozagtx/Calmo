import type { AppConfig, AskRequest, CalmoBridge, KeyUpdate, ModelList } from './coach-types'

const MODEL_KEY = 'calmo.model'

const storedModel = (): string | null => {
  try {
    return localStorage.getItem(MODEL_KEY)
  } catch {
    return null
  }
}

declare global {
  interface Window {
    calmo?: CalmoBridge
  }
}

const web: CalmoBridge = {
  async config(): Promise<AppConfig> {
    const res = await fetch('/api/config', { cache: 'no-store' })
    if (!res.ok) throw new Error('Could not reach the local Calmo server. Run npm run dev.')
    const cfg = (await res.json()) as AppConfig
    return { ...cfg, model: storedModel() || cfg.model }
  },
  async smartspectraKey(): Promise<string> {
    return ''
  },
  async saveKeys(update: KeyUpdate): Promise<AppConfig> {
    if (update.smartspectra || update.serv) throw new Error('In the web version, keys live in the .env file.')
    if (update.model) {
      try {
        localStorage.setItem(MODEL_KEY, update.model)
      } catch {
        throw new Error('Could not save the model choice in this browser.')
      }
    }
    return web.config()
  },
  async askCoach(request: AskRequest) {
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    return (await res.json()) as { ok: true; text: string } | { ok: false; error: string }
  },
  async models(): Promise<ModelList> {
    const res = await fetch('/api/models', { cache: 'no-store' })
    return (await res.json()) as ModelList
  },
}

export const calmo: CalmoBridge = {
  config: () => (window.calmo ?? web).config(),
  smartspectraKey: () => (window.calmo ?? web).smartspectraKey(),
  saveKeys: (update) => (window.calmo ?? web).saveKeys(update),
  askCoach: (request) => (window.calmo ?? web).askCoach(request),
  models: () => (window.calmo ?? web).models(),
}
