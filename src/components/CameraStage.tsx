import { useEffect, useRef, type RefObject } from 'react'
import type { FaceBox } from '../lib/protocol'
import { MOODS, type MoodId } from '../lib/mood'
import { PHASE_TEXT, type Pace } from '../lib/paces'
import { usePacer } from '../hooks/usePacer'

const FACE_TIMEOUT_MS = 1500
const PHASE_TINT = { in: '#D1E9FF', hold: '#FEF0C7', out: '#D1FADF' } as const

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  faceRef: RefObject<{ box: FaceBox; at: number } | null>
  pace: Pace
  live: boolean
  mood: MoodId
  hint: string | null
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export function CameraStage({ videoRef, faceRef, pace, live, mood, hint }: Props) {
  const ringRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const moodRef = useRef(mood)
  moodRef.current = mood

  const pacer = usePacer(pace, live, (level) => {
    if (ringRef.current) ringRef.current.style.transform = `scale(${(0.84 + level * 0.16).toFixed(4)})`
  })

  useEffect(() => {
    if (!live) return
    let frame = 0
    const draw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (canvas && video) {
        const dpr = window.devicePixelRatio || 1
        const W = canvas.clientWidth
        const H = canvas.clientHeight
        if (canvas.width !== Math.round(W * dpr)) canvas.width = Math.round(W * dpr)
        if (canvas.height !== Math.round(H * dpr)) canvas.height = Math.round(H * dpr)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.clearRect(0, 0, W, H)
          const face = faceRef.current
          if (face && video.videoWidth && performance.now() - face.at < FACE_TIMEOUT_MS) {
            const scale = Math.max(W / video.videoWidth, H / video.videoHeight)
            const dw = video.videoWidth * scale
            const dh = video.videoHeight * scale
            const ox = (W - dw) / 2
            const oy = (H - dh) / 2
            const { x0, x1, y0, y1 } = face.box
            const fw = x1 - x0
            const fh = y1 - y0
            const nx0 = x0 - fw * 0.16
            const nx1 = x1 + fw * 0.16
            const ny0 = y0 - fh * 0.3
            const ny1 = y1 + fh * 0.08
            const target = { x: W - (ox + nx1 * dw), y: oy + ny0 * dh, w: (nx1 - nx0) * dw, h: (ny1 - ny0) * dh }
            const box = boxRef.current ?? { ...target }
            box.x += (target.x - box.x) * 0.25
            box.y += (target.y - box.y) * 0.25
            box.w += (target.w - box.w) * 0.25
            box.h += (target.h - box.h) * 0.25
            boxRef.current = box
            ctx.lineWidth = 3
            ctx.strokeStyle = MOODS[moodRef.current].color
            roundRect(ctx, box.x, box.y, box.w, box.h, Math.min(32, box.w * 0.22))
            ctx.stroke()
          } else {
            boxRef.current = null
          }
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [live, videoRef, faceRef])

  const moodInfo = MOODS[mood]

  return (
    <div className="flex flex-col items-center">
      <div className="relative aspect-square w-full max-w-[460px]">
        <div
          ref={ringRef}
          className="absolute inset-0 rounded-full transition-colors duration-700"
          style={{ background: live ? PHASE_TINT[pacer.kind] : '#F2F4F7', transform: 'scale(0.92)' }}
        />
        <div
          className="absolute inset-[9%] overflow-hidden rounded-full bg-surface transition-colors duration-700"
          style={{ boxShadow: `0 0 0 6px ${live ? moodInfo.color : '#EAECF0'}` }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full -scale-x-100 rounded-full object-cover"
          />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full rounded-full" />
          {!live && (
            <div className="absolute inset-0 grid place-items-center px-10 text-center text-[15px] text-muted">
              Your camera shows up here when you start.
            </div>
          )}
        </div>
        {live && (
          <div
            className="absolute left-1/2 top-[5%] -translate-x-1/2 rounded-full px-4 py-1.5 font-display text-[15px] font-semibold text-white transition-colors duration-700"
            style={{ background: moodInfo.color }}
          >
            {moodInfo.label}
          </div>
        )}
      </div>

      {live && (
        <div className="mt-5 flex items-baseline gap-3">
          <span className="font-display text-[26px] font-semibold text-ink">{PHASE_TEXT[pacer.kind]}</span>
          <span className="font-display text-[26px] font-semibold tabular-nums text-muted">{pacer.count}</span>
        </div>
      )}
      {live && hint && (
        <p className="mt-2 rounded-full bg-surface px-4 py-2 text-center text-sm font-medium text-ink">{hint}</p>
      )}
    </div>
  )
}
