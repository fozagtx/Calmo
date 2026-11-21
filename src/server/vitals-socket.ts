import { createRequire } from 'node:module'
import type { Server as HttpServer } from 'node:http'
import type { Http2SecureServer } from 'node:http2'
import { WebSocketServer, type WebSocket } from 'ws'
import type {
  ClientMessage,
  ExpressionReading,
  FaceBox,
  ModeId,
  PaceId,
  Reading,
  ServerMessage,
  SessionSummary,
  Span,
} from '../lib/protocol.ts'
import { FRAME_HEADER_BYTES } from '../lib/protocol.ts'
import { PACES, MODES } from '../lib/paces.ts'

type SdkModule = typeof import('@smartspectra/node-sdk')
type Sdk = InstanceType<SdkModule['SmartSpectraSDK']>

const require = createRequire(import.meta.url)
let sdkModule: SdkModule | null = null
const loadSdk = (): SdkModule => {
  if (!sdkModule) sdkModule = require('@smartspectra/node-sdk') as SdkModule
  return sdkModule
}

const MAX_RECONNECTS = 3

const EXPRESSIONS = ['unspecified', 'angry', 'contempt', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise']

interface Sample {
  t: number
  v: number
}

type Numeric = number | bigint | { toNumber(): number } | null | undefined

const toNumber = (v: Numeric): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  return v.toNumber()
}

const last = <T>(arr: T[] | null | undefined): T | null => (arr && arr.length ? arr[arr.length - 1] : null)

const average = (list: number[]): number => list.reduce((a, b) => a + b, 0) / list.length

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

function invert(obj: Record<string, number>): Record<number, string> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k.replace(/^k/, '')]))
}

interface DecodedMeasurement {
  value: number
  confidence: number
  stable: boolean
  timestamp: Numeric
}

interface DecodedMetrics {
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

let activeSession: Session | null = null
let teardown: Promise<void> = Promise.resolve()

class Session {
  private sdk: Sdk | null = null
  private mode: ModeId = 'exam'
  private pace: PaceId = 'steady'
  private startedAt = 0
  private lastFrameTs = 0
  private frameW = 0
  private frameH = 0
  private frameErrors = 0
  private blinkOn = false
  private blinkTimes: number[] = []
  private faceSince = 0
  private history: { br: Sample[]; pulse: Sample[]; hrv: Sample[] } = { br: [], pulse: [], hrv: [] }
  private reconnects = 0
  private lastRetryable = false

  constructor(private readonly ws: WebSocket, private readonly apiKey: string) {}

  private send(message: ServerMessage): void {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(message))
  }

  private fail(code: number | string | undefined, message: string, retryable = false): void {
    const names = invert(loadSdk().SmartSpectraErrorCode as unknown as Record<string, number>)
    const name = typeof code === 'number' ? names[code] ?? String(code) : code ?? 'Unknown'
    this.send({ type: 'error', code: name, message, retryable })
  }

  private resetState(): void {
    this.startedAt = 0
    this.lastFrameTs = 0
    this.frameW = 0
    this.frameH = 0
    this.frameErrors = 0
    this.blinkOn = false
    this.blinkTimes = []
    this.faceSince = 0
    this.history = { br: [], pulse: [], hrv: [] }
    this.reconnects = 0
    this.lastRetryable = false
  }

  async start(mode: ModeId, pace: PaceId): Promise<void> {
    if (!this.apiKey) {
      this.send({ type: 'error', code: 'NoApiKey', message: 'Add SMARTSPECTRA_API_KEY to the .env file and restart.', retryable: false })
      return
    }
    if (activeSession && activeSession !== this) {
      this.send({ type: 'error', code: 'Busy', message: 'Calmo is already running a session in another tab.', retryable: true })
      return
    }
    if (this.sdk) return
    activeSession = this
    await teardown
    this.resetState()
    this.mode = MODES[mode] ? mode : 'exam'
    this.pace = PACES[pace] ? pace : 'steady'
    const ok = this.launch()
    if (ok) {
      this.startedAt = Date.now()
      this.send({ type: 'started', mode: this.mode, pace: this.pace })
    } else {
      await this.stop(true)
    }
  }

  private async reconnect(): Promise<void> {
    const old = this.sdk
    this.sdk = null
    this.reconnects += 1
    this.send({ type: 'status', status: 'Reconnecting' })
    teardown = (async () => {
      try { await old?.stopAsync() } catch { }
      try { await old?.destroy() } catch { }
    })()
    await teardown
    if (activeSession !== this) return
    await new Promise((r) => setTimeout(r, 1500 * this.reconnects))
    if (activeSession !== this) return
    this.lastFrameTs = 0
    if (!this.launch()) {
      await this.stop(true)
      this.send({ type: 'ended' })
    }
  }

  private launch(): boolean {
    const ss = loadSdk()
    const statusNames = invert(ss.ProcessingStatus as unknown as Record<string, number>)
    const validationNames = invert(ss.ValidationCode as unknown as Record<string, number>)
    const sdk = new ss.SmartSpectraSDK({
      apiKey: this.apiKey,
      requestedMetrics: [...ss.breathingMetrics, ...ss.cardioMetrics, ...ss.faceMetrics],
    })
    this.sdk = sdk

    sdk.on('processingStatus', (status) => {
      this.send({ type: 'status', status: statusNames[status] ?? String(status) })
      if (status === ss.ProcessingStatus.kError && this.sdk === sdk) {
        setImmediate(async () => {
          if (this.lastRetryable && this.reconnects < MAX_RECONNECTS) {
            this.lastRetryable = false
            await this.reconnect()
            return
          }
          await this.stop(true)
          this.send({ type: 'ended' })
        })
      }
      if (status === ss.ProcessingStatus.kRunning && this.sdk === sdk) this.lastRetryable = false
    })
    sdk.on('validationStatus', (code, _ts, hint) => {
      this.send({
        type: 'validation',
        code: validationNames[code] ?? String(code),
        ok: code === ss.ValidationCode.kOk,
        tuning: code === ss.ValidationCode.kCameraTuning,
        hint: hint || '',
      })
    })
    sdk.on('metrics', (buf) => {
      let metrics: unknown
      try {
        metrics = ss.decodeMetrics(buf)
      } catch {
        return
      }
      if (!metrics || Buffer.isBuffer(metrics)) return
      this.onMetrics(metrics as DecodedMetrics)
    })
    sdk.on('error', (code, message, retryable) => {
      if (this.sdk !== sdk) return
      if (retryable && this.reconnects < MAX_RECONNECTS) {
        this.lastRetryable = true
        return
      }
      if (code === ss.SmartSpectraErrorCode.kInvalidState && this.lastRetryable) return
      this.fail(code, message, retryable)
    })

    try {
      sdk.useCustomInput(ss.FrameTransform.kNone)
      sdk.start()
      return true
    } catch (err) {
      const e = err as { code?: number; message?: string; retryable?: boolean }
      this.fail(e.code, e.message || 'SmartSpectra could not start.', !!e.retryable)
      return false
    }
  }

  private onMetrics(m: DecodedMetrics): void {
    const toReading = (s: DecodedMeasurement | null): Reading | null =>
      s ? { v: s.value, c: s.confidence, s: !!s.stable } : null

    for (const s of m.breathing?.rate ?? []) if (s.stable) this.history.br.push({ t: toNumber(s.timestamp) / 1000, v: s.value })
    for (const s of m.cardio?.pulseRate ?? []) if (s.stable) this.history.pulse.push({ t: toNumber(s.timestamp) / 1000, v: s.value })
    for (const s of m.cardio?.hrv ?? []) if (s.stable) this.history.hrv.push({ t: toNumber(s.timestamp) / 1000, v: s.rmssd })

    const hrv = last(m.cardio?.hrv)
    const exprRaw = last(m.face?.expression)
    let expression: ExpressionReading | null = null
    if (exprRaw?.scores?.length) {
      const top = [...exprRaw.scores].sort((a, b) => b.confidence - a.confidence)[0]
      const label = typeof top.type === 'string' ? top.type.toLowerCase() : EXPRESSIONS[top.type] ?? 'unspecified'
      expression = { label, conf: top.confidence, s: !!exprRaw.stable }
    }

    const blinking = m.face?.blinking ?? []
    if (blinking.length && !this.faceSince) this.faceSince = Date.now()
    for (const s of blinking) {
      if (s.detected && !this.blinkOn) this.blinkTimes.push(toNumber(s.timestamp) / 1000)
      this.blinkOn = !!s.detected
    }

    this.send({
      type: 'metrics',
      br: toReading(last(m.breathing?.rate)),
      pulse: toReading(last(m.cardio?.pulseRate)),
      hrv: hrv ? { v: hrv.rmssd, c: hrv.confidence, s: !!hrv.stable } : null,
      expression,
      talking: !!last(m.face?.talking)?.detected,
      blinksPerMin: this.blinksPerMin(),
      face: this.faceBox(last(m.face?.landmarks)),
      trace: (m.breathing?.upperTrace ?? []).map((s) => [toNumber(s.timestamp) / 1000, s.value] as [number, number]),
    })
  }

  private faceBox(landmarks: { value?: Array<{ x: number; y: number }>; stable: boolean } | null): FaceBox | null {
    const points = landmarks?.value
    if (!points || points.length < 3 || !this.frameW || !this.frameH) return null
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
    const sx = normalized ? 1 : 1 / this.frameW
    const sy = normalized ? 1 : 1 / this.frameH
    return { x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy, stable: !!landmarks?.stable }
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

  frame(buf: Buffer): void {
    if (!this.sdk || buf.length < FRAME_HEADER_BYTES) return
    const ts = Math.round(buf.readDoubleLE(0))
    const width = buf.readUInt32LE(8)
    const height = buf.readUInt32LE(12)
    if (ts <= this.lastFrameTs) return
    if (buf.length !== FRAME_HEADER_BYTES + width * height * 4) return
    this.lastFrameTs = ts
    this.frameW = width
    this.frameH = height
    try {
      this.sdk.sendFrame(buf.subarray(FRAME_HEADER_BYTES), width, height, width * 4, loadSdk().PixelFormat.kRGBA, ts)
    } catch (err) {
      this.frameErrors += 1
      if (this.frameErrors === 1 || this.frameErrors % 300 === 0) {
        const e = err as { code?: number; message?: string }
        this.fail(e.code, e.message || 'A camera frame was rejected.', true)
      }
    }
  }

  private summary(): SessionSummary {
    const target = PACES[this.pace].perMin
    const br = this.history.br
    return {
      durationSec: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
      target,
      onPace: br.length ? br.filter((s) => Math.abs(s.v - target) <= 1.5).length / br.length : null,
      breathing: span(br),
      pulse: span(this.history.pulse),
      hrv: span(this.history.hrv),
    }
  }

  async stop(quiet = false): Promise<void> {
    const sdk = this.sdk
    if (!sdk && activeSession !== this) return
    this.sdk = null
    const summary = this.summary()
    if (activeSession === this) activeSession = null
    teardown = (async () => {
      try { await sdk?.stopAsync() } catch { }
      try { await sdk?.destroy() } catch { }
    })()
    await teardown
    if (!quiet) this.send({ type: 'summary', ...summary })
  }
}

export function attachVitalsSocket(server: HttpServer | Http2SecureServer | null | undefined): void {
  if (!server) return
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 16 * 1024 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/vitals') return
    const origin = req.headers.origin ?? ''
    const host = req.headers.host ?? ''
    if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })
  wss.on('connection', (ws: WebSocket) => {
    const session = new Session(ws, (process.env.SMARTSPECTRA_API_KEY ?? '').trim())
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)
        session.frame(buf)
        return
      }
      let msg: ClientMessage
      try {
        msg = JSON.parse(data.toString()) as ClientMessage
      } catch {
        return
      }
      if (msg.type === 'start') void session.start(msg.mode, msg.pace)
      else if (msg.type === 'stop') void session.stop()
    })
    ws.on('close', () => void session.stop(true))
  })
}
