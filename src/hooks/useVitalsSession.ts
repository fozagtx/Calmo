import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ProcessingStatus,
  SmartSpectraErrorCode,
  ValidationCode,
  breathingMetrics,
  cardioMetrics,
  faceMetrics,
} from '@smartspectra/node-sdk/renderer'
import { decodeMetrics } from '@smartspectra/node-sdk/messages'
import type { FaceBox, LiveMetrics, ModeId, PaceId, SessionSummary } from '../lib/protocol'
import { UPSET, rawMood, type MoodId } from '../lib/mood'
import { PACES } from '../lib/paces'
import { VitalsTracker, type DecodedMetrics } from '../lib/vitals'
import { calmo } from '../lib/bridge'
import { createVitalsSource, isDesktop, type VitalsSource } from '../lib/vitals-source'

const TRACE_WINDOW_MS = 20000
const MOOD_HOLD_MS = 3000
const RENDER_EVERY_MS = 250
const MAX_RECONNECTS = 3

export type Phase = 'idle' | 'connecting' | 'live' | 'stopping' | 'summary'

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

const invert = (obj: Record<string, number>): Record<number, string> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k.replace(/^k/, '')]))

const STATUS_NAMES = invert(ProcessingStatus as unknown as Record<string, number>)
const ERROR_NAMES = invert(SmartSpectraErrorCode as unknown as Record<string, number>)

export function useVitalsSession() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sdkRef = useRef<VitalsSource | null>(null)
  const trackerRef = useRef<VitalsTracker | null>(null)
  const traceRef = useRef<Array<[number, number]>>([])
  const faceRef = useRef<{ box: FaceBox; at: number } | null>(null)
  const moodRef = useRef<{ first: MoodId | null; now: MoodId; candidate: MoodId; since: number }>({
    first: null,
    now: 'reading',
    candidate: 'reading',
    since: 0,
  })
  const pulseBaseRef = useRef<number | null>(null)
  const paceRef = useRef<PaceId>('steady')
  const lastRenderRef = useRef(0)
  const reconnectsRef = useRef(0)
  const retryableRef = useRef(false)
  const stoppingRef = useRef(false)

  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('Ready')
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null)
  const [validation, setValidation] = useState<Validation | null>(null)
  const [error, setError] = useState<SessionError | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [mood, setMood] = useState<MoodTrack>({ first: null, now: 'reading' })
  const [flipped, setFlipped] = useState<MoodId | null>(null)
  const [startedAt, setStartedAt] = useState(0)

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

  const teardown = useCallback(async () => {
    const sdk = sdkRef.current
    sdkRef.current = null
    if (!sdk) return
    try {
      await sdk.stop()
    } catch {
      return
    } finally {
      try {
        sdk.destroy()
      } catch {
        sdkRef.current = null
      }
      const video = videoRef.current
      if (video) video.srcObject = null
    }
  }, [])

  const endWithError = useCallback(async () => {
    await teardown()
    setPhase('idle')
    setStatus('Error')
  }, [teardown])

  const reconnect = useCallback(async (sdk: VitalsSource) => {
    reconnectsRef.current += 1
    retryableRef.current = false
    setStatus('Reconnecting')
    await new Promise((r) => setTimeout(r, 1500 * reconnectsRef.current))
    if (sdkRef.current !== sdk || stoppingRef.current) return
    try {
      await sdk.reset()
      await sdk.start()
    } catch (err) {
      const e = err as { code?: number; message?: string }
      setError({ code: ERROR_NAMES[e.code ?? -1] ?? 'Error', message: e.message ?? 'Calmo could not reconnect.' })
      await endWithError()
    }
  }, [endWithError])

  const start = useCallback(
    async (mode: ModeId, pace: PaceId) => {
      void mode
      setError(null)
      setSummary(null)
      setFlipped(null)
      setValidation(null)
      setMetrics(null)
      traceRef.current = []
      faceRef.current = null
      pulseBaseRef.current = null
      reconnectsRef.current = 0
      retryableRef.current = false
      stoppingRef.current = false
      moodRef.current = { first: null, now: 'reading', candidate: 'reading', since: 0 }
      setMood({ first: null, now: 'reading' })
      paceRef.current = pace
      trackerRef.current = new VitalsTracker(PACES[pace].perMin)
      setPhase('connecting')
      setStatus('Starting')

      let apiKey = ''
      try {
        if (isDesktop()) apiKey = await calmo.smartspectraKey()
        else if ((await calmo.config()).vitalsReady) apiKey = 'server'
      } catch (err) {
        setError({ code: 'Connection', message: (err as Error).message })
      }
      if (!apiKey) {
        setError((prev) =>
          prev ?? {
            code: 'No key',
            message: isDesktop() ? 'Add your SmartSpectra key in Settings first.' : 'Add SMARTSPECTRA_API_KEY to the .env file and restart npm run dev.',
          },
        )
        setPhase('idle')
        setStatus('Ready')
        return
      }

      const sdk = createVitalsSource({
        apiKey,
        requestedMetrics: [...breathingMetrics, ...cardioMetrics, ...faceMetrics],
      })
      sdkRef.current = sdk

      sdk.on('streamAvailable', (stream: MediaStream) => {
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        void video.play().catch(() => undefined)
      })
      sdk.on('processingStatus', (code: number) => {
        if (sdkRef.current !== sdk) return
        const name = STATUS_NAMES[code] ?? String(code)
        if (code === ProcessingStatus.kRunning) {
          retryableRef.current = false
          setPhase('live')
          setStatus('Running')
          setStartedAt((prev) => prev || Date.now())
          return
        }
        if (code === ProcessingStatus.kError) {
          if (retryableRef.current && reconnectsRef.current < MAX_RECONNECTS) void reconnect(sdk)
          else void endWithError()
          return
        }
        if (!stoppingRef.current) setStatus(name)
      })
      sdk.on('validationStatus', (code: number, _ts: number, hint: string) => {
        setValidation({ ok: code === ValidationCode.kOk, tuning: code === ValidationCode.kCameraTuning, hint: hint || '' })
      })
      sdk.on('metrics', (buf: Uint8Array) => {
        const tracker = trackerRef.current
        const video = videoRef.current
        if (!tracker) return
        let decoded: DecodedMetrics
        try {
          decoded = decodeMetrics(buf) as unknown as DecodedMetrics
        } catch {
          return
        }
        const live = tracker.ingest(decoded, video?.videoWidth ?? 0, video?.videoHeight ?? 0)
        if (live.face) faceRef.current = { box: live.face, at: performance.now() }
        const trace = traceRef.current
        for (const point of live.trace) trace.push(point)
        const newest = trace.length ? trace[trace.length - 1][0] : 0
        while (trace.length && newest - trace[0][0] > TRACE_WINDOW_MS) trace.shift()
        updateMood(live)
        const now = performance.now()
        if (now - lastRenderRef.current > RENDER_EVERY_MS) {
          lastRenderRef.current = now
          setMetrics(live)
        }
      })
      sdk.on('error', (code: number, message: string, retryable: boolean) => {
        if (sdkRef.current !== sdk) return
        if (retryable && reconnectsRef.current < MAX_RECONNECTS) {
          retryableRef.current = true
          return
        }
        if (code === SmartSpectraErrorCode.kInvalidState && retryableRef.current) return
        setError({ code: ERROR_NAMES[code] ?? String(code), message })
      })

      setStartedAt(0)
      try {
        await sdk.start()
      } catch (err) {
        const e = err as { code?: number | string; message?: string }
        const code = typeof e.code === 'number' ? ERROR_NAMES[e.code] ?? String(e.code) : e.code ?? 'Error'
        const message =
          (e.message ?? '').toLowerCase().includes('permission') || (e.message ?? '').toLowerCase().includes('notallowed')
            ? 'Calmo needs camera access. Allow it in System Settings, Privacy and Security, Camera.'
            : e.message ?? 'Calmo could not start.'
        setError({ code, message })
        await endWithError()
      }
    },
    [endWithError, reconnect, updateMood],
  )

  const stop = useCallback(async () => {
    stoppingRef.current = true
    const tracker = trackerRef.current
    setPhase('stopping')
    setStatus('Stopping')
    await teardown()
    if (tracker) {
      setSummary({
        ...tracker.summary(),
        moodFirst: moodRef.current.first,
        moodLast: moodRef.current.now === 'reading' ? null : moodRef.current.now,
      })
      setPhase('summary')
    } else {
      setPhase('idle')
    }
    setStatus('Ready')
  }, [teardown])

  const reset = useCallback(() => {
    setSummary(null)
    setPhase('idle')
  }, [])

  useEffect(() => () => void teardown(), [teardown])

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
  }
}
