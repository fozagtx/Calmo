import type { ExpressionReading, FaceBox, LiveMetrics, Reading, SessionSummary, Span } from './protocol'

const EXPRESSIONS = ['unspecified', 'angry', 'contempt', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise']

type Numeric = number | bigint | { toNumber(): number } | null | undefined

interface Sample {
  t: number
  v: number
}

interface DecodedMeasurement {
  value: number
  confidence: number
  stable: boolean
  timestamp: Numeric
}

export interface DecodedMetrics {
  breathing?: { rate?: DecodedMeasurement[]; upperTrace?: DecodedMeasurement[] }
  cardio?: {
    pulseRate?: DecodedMeasurement[]
    hrv?: Array<{ rmssd: number; confidence: number; stable: boolean; timestamp: Numeric }>
  }
  face?: {
    blinking?: Array<{ detected: boolean; timestamp: Numeric }>
    talking?: Array<{ detected: boolean }>
    landmarks?: Array<{ value?: Array<{ x: number; y: number }>; stable: boolean }>
    expression?: Array<{ stable: boolean; scores?: Array<{ type: number | string; confidence: number }> }>
  }
}

const toNumber = (v: Numeric): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  return v.toNumber()
}

const last = <T>(arr: T[] | null | undefined): T | null => (arr && arr.length ? arr[arr.length - 1] : null)

const average = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length

function span(samples: Sample[]): Span | null {
  if (samples.length < 2) return null
  const t0 = samples[0].t
  const t1 = samples[samples.length - 1].t
  if (t1 - t0 < 20000) return null
  return {
    start: average(samples.filter((s) => s.t - t0 <= 30000).map((s) => s.v)),
    end: average(samples.filter((s) => t1 - s.t <= 30000).map((s) => s.v)),
  }
}

export class VitalsTracker {
  private startedAt = Date.now()
  private blinkOn = false
  private blinkTimes: number[] = []
  private faceSince = 0
  private history: { br: Sample[]; pulse: Sample[]; hrv: Sample[] } = { br: [], pulse: [], hrv: [] }
  private latest: {
    br: Reading | null
    pulse: Reading | null
    hrv: Reading | null
    expression: ExpressionReading | null
    talking: boolean
    face: FaceBox | null
  } = { br: null, pulse: null, hrv: null, expression: null, talking: false, face: null }

  constructor(private readonly target: number) {}

  ingest(m: DecodedMetrics, frameW: number, frameH: number): LiveMetrics {
    const toReading = (s: DecodedMeasurement | null): Reading | null =>
      s ? { v: s.value, c: s.confidence, s: !!s.stable } : null

    for (const s of m.breathing?.rate ?? []) if (s.stable) this.history.br.push({ t: toNumber(s.timestamp) / 1000, v: s.value })
    for (const s of m.cardio?.pulseRate ?? []) if (s.stable) this.history.pulse.push({ t: toNumber(s.timestamp) / 1000, v: s.value })
    for (const s of m.cardio?.hrv ?? []) if (s.stable) this.history.hrv.push({ t: toNumber(s.timestamp) / 1000, v: s.rmssd })

    const br = toReading(last(m.breathing?.rate))
    if (br) this.latest.br = br
    const pulse = toReading(last(m.cardio?.pulseRate))
    if (pulse) this.latest.pulse = pulse
    const hrv = last(m.cardio?.hrv)
    if (hrv) this.latest.hrv = { v: hrv.rmssd, c: hrv.confidence, s: !!hrv.stable }
    const exprRaw = last(m.face?.expression)
    if (exprRaw?.scores?.length) {
      const top = [...exprRaw.scores].sort((a, b) => b.confidence - a.confidence)[0]
      const label = typeof top.type === 'string' ? top.type.toLowerCase() : EXPRESSIONS[top.type] ?? 'unspecified'
      this.latest.expression = { label, conf: top.confidence, s: !!exprRaw.stable }
    }
    const talking = last(m.face?.talking)
    if (talking) this.latest.talking = !!talking.detected
    const face = faceBox(last(m.face?.landmarks), frameW, frameH)
    if (face) this.latest.face = face

    const blinking = m.face?.blinking ?? []
    if (blinking.length && !this.faceSince) this.faceSince = Date.now()
    for (const s of blinking) {
      if (s.detected && !this.blinkOn) this.blinkTimes.push(toNumber(s.timestamp) / 1000)
      this.blinkOn = !!s.detected
    }

    return {
      br: this.latest.br,
      pulse: this.latest.pulse,
      hrv: this.latest.hrv,
      expression: this.latest.expression,
      talking: this.latest.talking,
      blinksPerMin: this.blinksPerMin(),
      face,
      trace: (m.breathing?.upperTrace ?? []).map((s) => [toNumber(s.timestamp) / 1000, s.value] as [number, number]),
    }
  }

  private blinksPerMin(): number | null {
    if (!this.faceSince) return null
    const watched = (Date.now() - this.faceSince) / 1000
    if (watched < 20) return null
    const newest = last(this.blinkTimes)
    if (newest == null) return 0
    const windowMs = Math.min(60, watched) * 1000
    this.blinkTimes = this.blinkTimes.filter((t) => newest - t <= 60000)
    const recent = this.blinkTimes.filter((t) => newest - t <= windowMs).length
    return Math.round(recent * (60000 / windowMs))
  }

  summary(): SessionSummary {
    const br = this.history.br
    return {
      durationSec: Math.round((Date.now() - this.startedAt) / 1000),
      target: this.target,
      onPace: br.length ? br.filter((s) => Math.abs(s.v - this.target) <= 1.5).length / br.length : null,
      breathing: span(br),
      pulse: span(this.history.pulse),
      hrv: span(this.history.hrv),
    }
  }
}

function faceBox(landmarks: { value?: Array<{ x: number; y: number }>; stable: boolean } | null, frameW: number, frameH: number): FaceBox | null {
  const points = landmarks?.value
  if (!points || points.length < 3 || !frameW || !frameH) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  if (!(x1 > x0 && y1 > y0)) return null
  const normalized = x1 <= 1.5 && y1 <= 1.5
  const sx = normalized ? 1 : 1 / frameW
  const sy = normalized ? 1 : 1 / frameH
  return { x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy, stable: !!landmarks?.stable }
}
