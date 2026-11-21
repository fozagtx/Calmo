import type { AskRequest, CoachReadings } from '../src/lib/coach-types.ts'

const SERV_URL = 'https://inference-api.openserv.ai/v1/chat/completions'
const HISTORY_LIMIT = 12

const STATUS_HINTS: Record<number, string> = {
  400: 'OpenServ rejected the request. Check the model name in Settings or SERV_MODEL in .env.',
  401: 'OpenServ rejected the API key. Update it in Settings (Mac) or SERV_API_KEY in .env (web).',
  402: 'Your OpenServ balance is too low. Add credits at console.openserv.ai.',
}

function systemPrompt(modeText: string): string {
  return [
    `You are Calmo, a warm and steady coach helping someone fix their emotional stress before ${modeText}.`,
    'You receive live readings from a camera wellness sensor: breathing rate, pulse, heart rate variability, facial expression, blink rate, and an estimated state such as Anxious, Angry, Tense, Settling or Calm.',
    'Use those readings to tell the person exactly what to do right now to stay calm.',
    'Reply in 2 to 4 short, plain sentences. Always include one concrete action: a breathing cue that matches their guide, a physical release, or a grounding line they can say to themselves.',
    'Be kind and direct. No lists, no emojis, no dashes as punctuation, no medical diagnosis or treatment advice. If they describe a medical emergency, tell them to contact local emergency services.',
  ].join(' ')
}

function readingsNote(r: CoachReadings): string {
  const parts = ['Live readings:']
  parts.push(`Breathing guide: ${r.paceLabel}, about ${r.target} breaths per minute.`)
  parts.push(r.breathing != null ? `Breathing rate ${r.breathing.toFixed(1)} per minute.` : 'Breathing rate not ready yet.')
  parts.push(r.pulse != null ? `Pulse ${Math.round(r.pulse)} bpm.` : 'Pulse not ready yet.')
  if (r.hrv != null) parts.push(`HRV RMSSD ${Math.round(r.hrv)} ms.`)
  if (r.expression) parts.push(`Facial expression reads mostly ${r.expression}.`)
  if (r.blinks != null) parts.push(`Blink rate ${r.blinks} per minute.`)
  if (r.moodNow) parts.push(`Estimated state now: ${r.moodNow}.`)
  if (r.moodFirst) parts.push(`Estimated state at the start: ${r.moodFirst}.`)
  parts.push(`Session time: ${r.minutes} minute(s).`)
  return parts.join(' ')
}

export interface ModelOption {
  id: string
  name: string
}

export async function listModels(key: string): Promise<ModelOption[]> {
  if (!key) throw new Error('Add an OpenServ key to load the model list.')
  const res = await fetch('https://inference-api.openserv.ai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(STATUS_HINTS[res.status] ?? `OpenServ returned ${res.status}.`)
  const body = (await res.json()) as {
    items?: Array<{ modelId?: unknown; displayName?: unknown; endpoints?: unknown }>
    data?: Array<{ id?: unknown; endpoints?: unknown }>
  }
  const raw = [
    ...(body.items ?? []).map((m) => ({ id: m.modelId, name: m.displayName, endpoints: m.endpoints })),
    ...(body.data ?? []).map((m) => ({ id: m.id, name: m.id, endpoints: m.endpoints })),
  ]
  const seen = new Set<string>()
  const models: ModelOption[] = []
  for (const m of raw) {
    if (typeof m.id !== 'string' || !m.id || seen.has(m.id)) continue
    const chat = !Array.isArray(m.endpoints) || m.endpoints.some((e) => /chat/i.test(String(e)))
    if (!chat) continue
    seen.add(m.id)
    models.push({ id: m.id, name: typeof m.name === 'string' && m.name ? m.name : m.id })
  }
  return models
}

export async function askCoach(key: string, model: string, data: AskRequest): Promise<string> {
  if (!key) throw new Error('Add your OpenServ key in Settings (Mac) or SERV_API_KEY in .env (web) to turn on the coach.')
  const res = await fetch(SERV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt(data.readings.modeText) },
        { role: 'system', content: readingsNote(data.readings) },
        ...data.history.slice(-HISTORY_LIMIT),
        { role: 'user', content: data.message },
      ],
      max_completion_tokens: 600,
    }),
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      detail = body.error?.message ?? ''
    } catch {
      detail = ''
    }
    const base = STATUS_HINTS[res.status] ?? `OpenServ returned ${res.status}.`
    throw new Error(detail ? `${base} (${detail})` : base)
  }
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
  const text = body.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('The coach sent an empty reply. Try again.')
  return text.trim()
}
