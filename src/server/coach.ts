import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const SERV_URL = 'https://inference-api.openserv.ai/v1/chat/completions'
const HISTORY_LIMIT = 12

const STATUS_HINTS: Record<number, string> = {
  400: 'OpenServ rejected the request. Check SERV_MODEL in .env.',
  401: 'OpenServ rejected the API key. Check SERV_API_KEY in .env.',
  402: 'Your OpenServ balance is too low. Add credits at console.openserv.ai.',
}

const ReadingsSchema = z.object({
  modeText: z.string().max(60),
  paceLabel: z.string().max(120),
  target: z.number(),
  breathing: z.number().nullable(),
  pulse: z.number().nullable(),
  hrv: z.number().nullable(),
  expression: z.string().max(20).nullable(),
  blinks: z.number().nullable(),
  moodNow: z.string().max(20).nullable(),
  moodFirst: z.string().max(20).nullable(),
  minutes: z.number(),
})

const AskSchema = z.object({
  readings: ReadingsSchema,
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(40),
  message: z.string().min(1).max(2000),
})

export type CoachReadings = z.infer<typeof ReadingsSchema>
export type CoachTurn = z.infer<typeof AskSchema>['history'][number]

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

export const getCoachConfig = createServerFn({ method: 'GET' }).handler(async () => ({
  vitalsReady: Boolean((process.env.SMARTSPECTRA_API_KEY ?? '').trim()),
  coachReady: Boolean((process.env.SERV_API_KEY ?? '').trim()),
  model: (process.env.SERV_MODEL ?? 'gpt-5.4-mini').trim(),
}))

export const askCoach = createServerFn({ method: 'POST' })
  .validator(AskSchema)
  .handler(async ({ data }) => {
    const key = (process.env.SERV_API_KEY ?? '').trim()
    if (!key) throw new Error('Add SERV_API_KEY to the .env file and restart to turn on the coach.')
    const model = (process.env.SERV_MODEL ?? 'gpt-5.4-mini').trim()
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
        reasoning_effort: 'low',
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
    return { text: text.trim() }
  })
