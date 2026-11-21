import { SmartSpectraSDK } from '@smartspectra/node-sdk/renderer'
import { FRAME_HEADER_BYTES, type RelayServerMessage } from './relay-protocol'

const FRAME_WIDTH = 960
const MAX_BUFFERED = 6 * 1024 * 1024
const ACK_TIMEOUT_MS = 30000

export interface VitalsSourceEvents {
  streamAvailable: (stream: MediaStream) => void
  processingStatus: (code: number) => void
  validationStatus: (code: number, timestampUs: number, hint: string) => void
  metrics: (buf: Uint8Array, timestampUs: number) => void
  error: (code: number, message: string, retryable: boolean) => void
}

export interface VitalsSource {
  on<E extends keyof VitalsSourceEvents>(event: E, callback: VitalsSourceEvents[E]): unknown
  start(): Promise<void>
  stop(): Promise<void>
  reset(): Promise<void>
  destroy(): void
}

class SourceError extends Error {
  constructor(message: string, readonly code: number, readonly retryable: boolean) {
    super(message)
  }
}

export class WebRelaySource implements VitalsSource {
  private handlers: Partial<VitalsSourceEvents> = {}
  private ws: WebSocket | null = null
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private frameHandle = 0
  private pumping = false
  private pending = new Map<string, { resolve: () => void; reject: (err: Error) => void; timer: number }>()

  on<E extends keyof VitalsSourceEvents>(event: E, callback: VitalsSourceEvents[E]): this {
    this.handlers[event] = callback
    return this
  }

  private connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve(this.ws)
        return
      }
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${scheme}://${location.host}/vitals`)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => resolve(ws)
      ws.onerror = () => reject(new SourceError('Could not reach the local Calmo vitals relay. Run npm run dev.', -1, true))
      ws.onmessage = (event) => this.onMessage(event.data)
      ws.onclose = () => {
        this.ws = null
        if (this.pumping) {
          this.stopPump()
          this.handlers.error?.(-1, 'The connection to the local Calmo relay closed.', false)
          this.handlers.processingStatus?.(5)
        }
      }
      this.ws = ws
    })
  }

  private onMessage(data: unknown): void {
    if (data instanceof ArrayBuffer) {
      this.handlers.metrics?.(new Uint8Array(data), Date.now() * 1000)
      return
    }
    if (typeof data !== 'string') return
    let msg: RelayServerMessage
    try {
      msg = JSON.parse(data) as RelayServerMessage
    } catch {
      return
    }
    if (msg.type === 'ack') {
      const wait = this.pending.get(msg.op)
      if (!wait) return
      this.pending.delete(msg.op)
      window.clearTimeout(wait.timer)
      if (msg.ok) wait.resolve()
      else wait.reject(new SourceError(msg.message, msg.code, msg.retryable))
    } else if (msg.type === 'status') {
      this.handlers.processingStatus?.(msg.code)
    } else if (msg.type === 'validation') {
      this.handlers.validationStatus?.(msg.code, Date.now() * 1000, msg.hint)
    } else if (msg.type === 'error') {
      this.handlers.error?.(msg.code, msg.message, msg.retryable)
    }
  }

  private request(op: 'start' | 'stop' | 'reset'): Promise<void> {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(op)
        reject(new SourceError('The local Calmo relay did not answer.', -1, true))
      }, ACK_TIMEOUT_MS)
      this.pending.set(op, { resolve, reject, timer })
      ws.send(JSON.stringify({ type: op }))
    })
  }

  private async ensureCamera(): Promise<HTMLVideoElement> {
    if (this.stream && this.video) return this.video
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, min: 24 } },
      })
    } catch {
      throw new SourceError('Calmo needs camera access. Allow it in your browser and try again.', -1, false)
    }
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = this.stream
    await video.play()
    if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }))
    this.video = video
    this.handlers.streamAvailable?.(this.stream)
    return video
  }

  private startPump(video: HTMLVideoElement): void {
    this.stopPump()
    this.pumping = true
    const width = Math.min(FRAME_WIDTH, video.videoWidth)
    const height = Math.round((width * video.videoHeight) / video.videoWidth / 2) * 2
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    let lastTs = 0
    const tick = (now: number) => {
      if (!this.pumping) return
      const ws = this.ws
      if (ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < MAX_BUFFERED) {
        const ts = Math.round((performance.timeOrigin + now) * 1000)
        if (ts > lastTs) {
          lastTs = ts
          ctx.drawImage(video, 0, 0, width, height)
          const pixels = ctx.getImageData(0, 0, width, height).data
          const packet = new Uint8Array(FRAME_HEADER_BYTES + pixels.length)
          const view = new DataView(packet.buffer)
          view.setFloat64(0, ts, true)
          view.setUint32(8, width, true)
          view.setUint32(12, height, true)
          packet.set(pixels, FRAME_HEADER_BYTES)
          ws.send(packet.buffer)
        }
      }
      this.frameHandle = video.requestVideoFrameCallback(tick)
    }
    this.frameHandle = video.requestVideoFrameCallback(tick)
  }

  private stopPump(): void {
    this.pumping = false
    if (this.video && this.frameHandle) this.video.cancelVideoFrameCallback(this.frameHandle)
    this.frameHandle = 0
  }

  private releaseCamera(): void {
    this.stopPump()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.video) this.video.srcObject = null
    this.video = null
  }

  async start(): Promise<void> {
    const video = await this.ensureCamera()
    try {
      await this.connect()
      await this.request('start')
    } catch (err) {
      this.releaseCamera()
      throw err
    }
    this.startPump(video)
  }

  async reset(): Promise<void> {
    this.stopPump()
    await this.request('reset')
  }

  async stop(): Promise<void> {
    this.stopPump()
    try {
      await this.request('stop')
    } finally {
      this.releaseCamera()
    }
  }

  destroy(): void {
    this.releaseCamera()
    for (const wait of this.pending.values()) window.clearTimeout(wait.timer)
    this.pending.clear()
    this.ws?.close()
    this.ws = null
  }
}

export const isDesktop = (): boolean => typeof window !== 'undefined' && !!window.calmo

export function createVitalsSource(options: { apiKey: string; requestedMetrics: number[] }): VitalsSource {
  if (isDesktop()) {
    return new SmartSpectraSDK({ ...options, enableTelemetry: false }) as unknown as VitalsSource
  }
  return new WebRelaySource()
}
