import { z } from 'zod'

export const ReadingsSchema = z.object({
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

export const AskSchema = z.object({
  readings: ReadingsSchema,
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(40),
  message: z.string().min(1).max(2000),
  model: z.string().max(80).optional(),
})

export type CoachReadings = z.infer<typeof ReadingsSchema>
export type AskRequest = z.infer<typeof AskSchema>
export type CoachTurn = AskRequest['history'][number]

export interface AppConfig {
  vitalsReady: boolean
  coachReady: boolean
  smartspectraHint: string | null
  servHint: string | null
  model: string
}

export const keyHint = (key: string): string | null => (key.length >= 8 ? key.slice(-4) : key ? '****' : null)

export interface KeyUpdate {
  smartspectra?: string
  serv?: string
  model?: string
}

export interface CalmoBridge {
  config(): Promise<AppConfig>
  smartspectraKey(): Promise<string>
  saveKeys(update: KeyUpdate): Promise<AppConfig>
  askCoach(request: AskRequest): Promise<{ ok: true; text: string } | { ok: false; error: string }>
  models(): Promise<ModelList>
}

export type ModelList = { ok: true; models: string[] } | { ok: false; error: string }
