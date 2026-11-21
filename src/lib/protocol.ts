export type ModeId = 'exam' | 'interview' | 'speech'
export type PaceId = 'steady' | 'exhale' | 'box'

export interface Reading {
  v: number
  c: number
  s: boolean
}

export interface FaceBox {
  x0: number
  y0: number
  x1: number
  y1: number
  stable: boolean
}

export interface ExpressionReading {
  label: string
  conf: number
  s: boolean
}

export interface Span {
  start: number
  end: number
}

export interface SessionSummary {
  durationSec: number
  target: number
  onPace: number | null
  breathing: Span | null
  pulse: Span | null
  hrv: Span | null
}

export type ServerMessage =
  | { type: 'started'; mode: ModeId; pace: PaceId }
  | { type: 'status'; status: string }
  | { type: 'validation'; code: string; ok: boolean; tuning: boolean; hint: string }
  | {
      type: 'metrics'
      br: Reading | null
      pulse: Reading | null
      hrv: Reading | null
      expression: ExpressionReading | null
      talking: boolean
      blinksPerMin: number | null
      face: FaceBox | null
      trace: Array<[number, number]>
    }
  | { type: 'error'; code: string; message: string; retryable: boolean }
  | { type: 'ended' }
  | ({ type: 'summary' } & SessionSummary)

export type ClientMessage =
  | { type: 'start'; mode: ModeId; pace: PaceId }
  | { type: 'stop' }

export const FRAME_HEADER_BYTES = 16
