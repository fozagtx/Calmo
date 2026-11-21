import { useCallback, useEffect, useRef, useState } from 'react'
import { FRAME_HEADER_BYTES } from '../lib/protocol'
import type { FaceBox, ModeId, PaceId, ServerMessage, SessionSummary } from '../lib/protocol'
import { MOODS, UPSET, rawMood, type MoodId } from '../lib/mood'
import { PACES } from '../lib/paces'

const FRAME_WIDTH = 960
const MAX_BUFFERED = 6 * 1024 * 1024
const TRACE_WINDOW_MS = 20000
const MOOD_HOLD_MS = 3000
const RENDER_EVERY_MS = 250

export type Phase = 'idle' | 'connecting' | 'live' | 'stopping' | 'summary'

export type LiveMetrics = Extract<ServerMessage, { type: 'metrics' }>

export interface Validation {
  ok: boolean
  tuning: boolean
  hint: string
}

export interface SessionError {
  code: string
  message: string
}

export interface MoodTrack {
  first: MoodId | null
  now: MoodId
}

export interface Summary extends SessionSummary {
  moodFirst: MoodId | null
  moodLast: MoodId | null
}

export function useVitalsSession() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runningRef = useRef(false)
  const frameHandleRef = useRef(0)
  const traceRef = useRef<Array<[number, number]>>([])
  const faceRef = useRef<{ box: FaceBox; at: number } | null>(null)
  const latestRef = useRef<LiveMetrics | null>(null)
  const moodRef = useRef<{ first: MoodId | null; now: MoodId; candidate: MoodId; since: number }>({
    first: null,
    now: 'reading',
    candidate: 'reading',
    since: 0,
  })
  const pulseBaseRef = useRef<number | null>(null)
  const paceRef = useRef<PaceId>('steady')
  const lastRenderRef = useRef(0)

  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('Ready')
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null)
  const [validation, setValidation] = useState<Validation | null>(null)
  const [error, setError] = useState<SessionError | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [mood, setMood] = useState<MoodTrack>({ first: null, now: 'reading' })
  const [flipped, setFlipped] = useState<MoodId | null>(null)
  const [startedAt, setStartedAt] = useState(0)

  const releaseCamera = useCallback(() => {
    runningRef.current = false
    const video = videoRef.current
    if (video && frameHandleRef.current) video.cancelVideoFrameCallback(frameHandleRef.current)
    frameHandleRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (video) video.srcObject = null
  }, [])

  const updateMood = useCallback((m: LiveMetrics) => {
    if (pulseBaseRef.current == null && m.pulse?.s) pulseBaseRef.current = m.pulse.v
    const next = rawMood({
      expression: m.expression,
      br: m.br,
      pulse: m.pulse,
      target: PACES[paceRef.current].perMin,
      pulseBase: pulseBaseRef.current,
    })
    const track = moodRef.current
    const now = performance.now()
    if (next !== track.candidate) {
      track.candidate = next
      track.since = now
    }
    if (next === track.now || next === 'reading' || now - track.since < MOOD_HOLD_MS) return
    const wasFirst = track.first
    track.now = next
    if (!track.first) track.first = next
    setMood({ first: track.first, now: next })
    if (next === 'calm' && wasFirst && UPSET.has(wasFirst)) setFlipped(wasFirst)
  }, [])

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'started':
          setPhase('live')
          setStartedAt(Date.now())
          pumpFrames()
          break
        case 'status':
          setStatus(msg.status)
          break
        case 'validation':
          setValidation({ ok: msg.ok, tuning: msg.tuning, hint: msg.hint })
          break
        case 'metrics': {
          latestRef.current = msg
          if (msg.face) faceRef.current = { box: msg.face, at: performance.now() }
          const trace = traceRef.current
          for (const point of msg.trace) trace.push(point)
          const newest = trace.length ? trace[trace.length - 1][0] : 0
          while (trace.length && newest - trace[0][0] > TRACE_WINDOW_MS) trace.shift()
          updateMood(msg)
          const now = performance.now()
          if (now - lastRenderRef.current > RENDER_EVERY_MS) {
            lastRenderRef.current = now
            setMetrics(msg)
          }
          break
        }
        case 'error':
          setError({ code: msg.code, message: msg.message })
          break
        case 'ended':
          releaseCamera()
          setPhase('idle')
          setStatus('Error')
          break
        case 'summary': {
          const { type: _type, ...rest } = msg
          setSummary({ ...rest, moodFirst: moodRef.current.first, moodLast: moodRef.current.now === 'reading' ? null : moodRef.current.now })
          setPhase('summary')
          setStatus('Ready')
          break
        }
      }
    },
    [releaseCamera, updateMood],
  )

  function pumpFrames() {
    const video = videoRef.current
    const ws = wsRef.current
    if (!video || !ws) return
    runningRef.current = true
    const width = Math.min(FRAME_WIDTH, video.videoWidth)
    const height = Math.round((width * video.videoHeight) / video.videoWidth / 2) * 2
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    let lastTs = 0
    const tick = (now: number) => {
      if (!runningRef.current) return
      const socket = wsRef.current
      if (socket && socket.readyState === WebSocket.OPEN && socket.bufferedAmount < MAX_BUFFERED) {
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
          socket.send(packet.buffer)
        }
      }
      frameHandleRef.current = video.requestVideoFrameCallback(tick)
    }
    frameHandleRef.current = video.requestVideoFrameCallback(tick)
  }

  const connect = useCallback(
    () =>
      new Promise<WebSocket>((resolve, reject) => {
        const existing = wsRef.current
        if (existing && existing.readyState === WebSocket.OPEN) {
          resolve(existing)
          return
        }
        const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
        const ws = new WebSocket(`${scheme}://${location.host}/vitals`)
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => resolve(ws)
        ws.onerror = () => reject(new Error('Could not reach the Calmo vitals stream. Is the app running?'))
        ws.onmessage = (event) => {
          if (typeof event.data !== 'string') return
          try {
            handleMessage(JSON.parse(event.data) as ServerMessage)
          } catch {
            return
          }
        }
        ws.onclose = () => {
          wsRef.current = null
          if (runningRef.current) {
            releaseCamera()
            setError({ code: 'Disconnected', message: 'The connection to Calmo closed.' })
            setPhase('idle')
          }
        }
        wsRef.current = ws
      }),
    [handleMessage, releaseCamera],
  )

  const start = useCallback(
    async (mode: ModeId, pace: PaceId) => {
      setError(null)
      setSummary(null)
      setFlipped(null)
      setValidation(null)
      setMetrics(null)
      traceRef.current = []
      faceRef.current = null
      latestRef.current = null
      pulseBaseRef.current = null
      moodRef.current = { first: null, now: 'reading', candidate: 'reading', since: 0 }
      setMood({ first: null, now: 'reading' })
      paceRef.current = pace
      setPhase('connecting')
      setStatus('Connecting')
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, min: 24 } },
        })
      } catch {
        setError({ code: 'Camera', message: 'Calmo needs camera access to read your breathing. Allow it in your browser settings and try again.' })
        setPhase('idle')
        setStatus('Ready')
        return
      }
      const video = videoRef.current
      if (!video) return
      video.srcObject = streamRef.current
      try {
        await video.play()
      } catch {
        return
      }
      if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }))
      try {
        const ws = await connect()
        ws.send(JSON.stringify({ type: 'start', mode, pace }))
        setStatus('Starting')
      } catch (err) {
        releaseCamera()
        setError({ code: 'Connection', message: (err as Error).message })
        setPhase('idle')
        setStatus('Ready')
      }
    },
    [connect, releaseCamera],
  )

  const stop = useCallback(() => {
    const ws = wsRef.current
    const wasRunning = runningRef.current
    releaseCamera()
    if (ws && ws.readyState === WebSocket.OPEN && wasRunning) {
      setPhase('stopping')
      setStatus('Stopping')
      ws.send(JSON.stringify({ type: 'stop' }))
    } else {
      setPhase('idle')
      setStatus('Ready')
    }
  }, [releaseCamera])

  const reset = useCallback(() => {
    setSummary(null)
    setPhase('idle')
  }, [])

  useEffect(() => {
    const onHidden = () => {
      if (document.hidden && runningRef.current) {
        stop()
        setError({ code: 'Paused', message: 'Calmo ended the session because the tab was hidden. The camera stops sending frames in the background.' })
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      releaseCamera()
      wsRef.current?.close()
    }
  }, [stop, releaseCamera])

  return {
    videoRef,
    traceRef,
    faceRef,
    phase,
    status,
    metrics,
    validation,
    error,
    summary,
    mood,
    flipped,
    startedAt,
    start,
    stop,
    reset,
    clearError: () => setError(null),
    moodLabel: (id: MoodId | null) => (id ? MOODS[id].label : null),
  }
}
