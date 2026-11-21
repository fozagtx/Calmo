import { useEffect, useRef, type RefObject } from 'react'
import type { Reading } from '../lib/protocol'
import type { LiveMetrics } from '../hooks/useVitalsSession'

const TRACE_WINDOW_MS = 20000

function Tile({ label, value, unit, note, soft }: { label: string; value: string; unit?: string; note: string; soft: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3.5">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className={`mt-1 font-display text-[28px] font-semibold capitalize leading-none tabular-nums ${soft ? 'text-faint' : 'text-ink'}`}>
        {value}
        {unit && <span className="ml-1 font-sans text-[13px] font-medium normal-case text-muted">{unit}</span>}
      </div>
      <div className="mt-1.5 text-[12px] text-muted">{note}</div>
    </div>
  )
}

function warmup(startedAt: number, seconds: number) {
  const left = Math.max(0, Math.ceil(seconds - (Date.now() - startedAt) / 1000))
  return left > 0 ? `Warming up, about ${left}s` : 'Hold still, almost there'
}

function reading(r: Reading | null, digits: number, startedAt: number, seconds: number) {
  if (!r || !(r.c > 0)) return { value: '--', note: warmup(startedAt, seconds), soft: true }
  return {
    value: r.v.toFixed(digits),
    note: r.s ? `Steady, ${Math.round(r.c)}% confidence` : warmup(startedAt, seconds),
    soft: !r.s,
  }
}

export function MetricTiles({ metrics, startedAt }: { metrics: LiveMetrics | null; startedAt: number }) {
  const br = reading(metrics?.br ?? null, 1, startedAt, 30)
  const pulse = reading(metrics?.pulse ?? null, 0, startedAt, 12)
  const hrv = reading(metrics?.hrv ?? null, 0, startedAt, 60)
  const expr = metrics?.expression
  const showExpr = expr && expr.label !== 'unspecified'
  const blinks = metrics?.blinksPerMin
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Breathing" value={br.value} unit="/min" note={br.note} soft={br.soft} />
      <Tile label="Pulse" value={pulse.value} unit="bpm" note={pulse.note} soft={pulse.soft} />
      <Tile label="HRV" value={hrv.value} unit="ms" note={hrv.note} soft={hrv.soft} />
      <Tile
        label="Expression"
        value={showExpr ? expr.label : '--'}
        note={`Blinks ${blinks == null ? 'counting' : `${blinks}/min`}${metrics?.talking ? ', talking' : ''}`}
        soft={!showExpr || !expr.s}
      />
    </div>
  )
}

export function BreathTrace({ traceRef, live }: { traceRef: RefObject<Array<[number, number]>>; live: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!live) return
    let frame = 0
    const draw = () => {
      const canvas = canvasRef.current
      if (canvas) {
        const dpr = window.devicePixelRatio || 1
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
        if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.clearRect(0, 0, w, h)
          const pts = traceRef.current ?? []
          if (pts.length < 2) {
            ctx.fillStyle = '#98A2B3'
            ctx.font = '500 13px "Plus Jakarta Sans Variable", system-ui, sans-serif'
            ctx.fillText('Waiting for your breathing signal', 0, h / 2 + 4)
          } else {
            let lo = Infinity
            let hi = -Infinity
            for (const [, v] of pts) {
              lo = Math.min(lo, v)
              hi = Math.max(hi, v)
            }
            const range = hi - lo || 1
            const t0 = pts[pts.length - 1][0] - TRACE_WINDOW_MS
            ctx.strokeStyle = '#1570EF'
            ctx.lineWidth = 2.5
            ctx.lineJoin = 'round'
            ctx.beginPath()
            pts.forEach(([t, v], i) => {
              const x = ((t - t0) / TRACE_WINDOW_MS) * w
              const y = h - 4 - ((v - lo) / range) * (h - 8)
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.stroke()
          }
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [live, traceRef])

  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3.5">
      <div className="text-[13px] font-medium text-muted">Your chest movement, last 20 seconds</div>
      <canvas ref={canvasRef} className="mt-2 block h-16 w-full" />
    </div>
  )
}
