import { createRequire } from 'node:module'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import { FRAME_HEADER_BYTES, type RelayClientMessage, type RelayServerMessage } from '../src/lib/relay-protocol.ts'

type SdkModule = typeof import('@smartspectra/node-sdk')
type Sdk = InstanceType<SdkModule['SmartSpectraSDK']>

const require = createRequire(import.meta.url)
let sdkModule: SdkModule | null = null
const loadSdk = (): SdkModule => {
  if (!sdkModule) sdkModule = require('@smartspectra/node-sdk') as SdkModule
  return sdkModule
}

let active: Relay | null = null
let teardown: Promise<void> = Promise.resolve()

class Relay {
  private sdk: Sdk | null = null
  private lastFrameTs = 0

  constructor(private readonly ws: WebSocket) {}

  private send(message: RelayServerMessage): void {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(message))
  }

  private wire(sdk: Sdk): void {
    sdk.on('processingStatus', (code) => this.send({ type: 'status', code }))
    sdk.on('validationStatus', (code, _ts, hint) => this.send({ type: 'validation', code, hint: hint || '' }))
    sdk.on('metrics', (buf) => {
      if (this.ws.readyState === 1) this.ws.send(buf, { binary: true })
    })
    sdk.on('error', (code, message, retryable) => this.send({ type: 'error', code, message, retryable }))
  }

  private ackError(op: 'start' | 'reset', err: unknown): void {
    const e = err as { code?: number; message?: string; retryable?: boolean }
    this.send({ type: 'ack', op, ok: false, code: e.code ?? -1, message: e.message ?? 'SmartSpectra could not start.', retryable: !!e.retryable })
  }

  async start(): Promise<void> {
    const apiKey = (process.env.SMARTSPECTRA_API_KEY ?? '').trim()
    if (!apiKey) {
      this.send({ type: 'ack', op: 'start', ok: false, code: -1, message: 'Add SMARTSPECTRA_API_KEY to the .env file and restart.', retryable: false })
      return
    }
    if (active && active !== this) {
      this.send({ type: 'ack', op: 'start', ok: false, code: -1, message: 'Calmo is already running a session in another tab.', retryable: true })
      return
    }
    active = this
    await teardown
    const ss = loadSdk()
    if (!this.sdk) {
      this.sdk = new ss.SmartSpectraSDK({
        apiKey,
        requestedMetrics: [...ss.breathingMetrics, ...ss.cardioMetrics, ...ss.faceMetrics],
        enableTelemetry: false,
      })
      this.wire(this.sdk)
    }
    try {
      this.lastFrameTs = 0
      this.sdk.useCustomInput(ss.FrameTransform.kNone)
      this.sdk.start()
      this.send({ type: 'ack', op: 'start', ok: true })
    } catch (err) {
      this.ackError('start', err)
    }
  }

  async reset(): Promise<void> {
    if (!this.sdk) return
    try {
      await this.sdk.stopAsync()
    } catch {
      this.lastFrameTs = 0
    }
    try {
      this.sdk.reset()
      this.send({ type: 'ack', op: 'reset', ok: true })
    } catch (err) {
      this.ackError('reset', err)
    }
  }

  frame(buf: Buffer): void {
    if (!this.sdk || buf.length < FRAME_HEADER_BYTES) return
    const ts = Math.round(buf.readDoubleLE(0))
    const width = buf.readUInt32LE(8)
    const height = buf.readUInt32LE(12)
    if (ts <= this.lastFrameTs || buf.length !== FRAME_HEADER_BYTES + width * height * 4) return
    this.lastFrameTs = ts
    try {
      this.sdk.sendFrame(buf.subarray(FRAME_HEADER_BYTES), width, height, width * 4, loadSdk().PixelFormat.kRGBA, ts)
    } catch {
      this.lastFrameTs = ts
    }
  }

  async stop(): Promise<void> {
    const sdk = this.sdk
    this.sdk = null
    if (active === this) active = null
    if (sdk) {
      teardown = (async () => {
        try { await sdk.stopAsync() } catch { }
        try { await sdk.destroy() } catch { }
      })()
      await teardown
    }
    this.send({ type: 'ack', op: 'stop', ok: true })
  }
}

export function createVitalsUpgrade(): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 16 * 1024 * 1024 })
  wss.on('connection', (ws: WebSocket) => {
    const relay = new Relay(ws)
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)
        relay.frame(buf)
        return
      }
      let msg: RelayClientMessage
      try {
        msg = JSON.parse(data.toString()) as RelayClientMessage
      } catch {
        return
      }
      if (msg.type === 'start') void relay.start()
      else if (msg.type === 'reset') void relay.reset()
      else if (msg.type === 'stop') void relay.stop()
    })
    ws.on('close', () => void relay.stop())
  })
  return (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/vitals') return
    const origin = req.headers.origin ?? ''
    const host = req.headers.host ?? ''
    if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  }
}
