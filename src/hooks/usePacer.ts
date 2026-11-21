import { useEffect, useRef, useState } from 'react'
import type { Pace, PhaseKind } from '../lib/paces'

export interface PacerState {
  kind: PhaseKind
  count: number
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export function usePacer(pace: Pace, active: boolean, onLevel: (level: number) => void): PacerState {
  const [state, setState] = useState<PacerState>({ kind: pace.phases[0][0], count: pace.phases[0][1] })
  const levelRef = useRef(onLevel)
  levelRef.current = onLevel

  useEffect(() => {
    if (!active) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cycle = pace.phases.reduce((sum, [, d]) => sum + d, 0)
    const origin = performance.now()
    let frame = 0
    let lastKind: PhaseKind | null = null
    let lastCount = -1
    const loop = (now: number) => {
      let t = ((now - origin) / 1000) % cycle
      let level = 0
      for (const [kind, dur] of pace.phases) {
        if (t < dur) {
          const p = ease(t / dur)
          if (kind === 'in') level = p
          else if (kind === 'out') level = 1 - p
          const count = Math.ceil(dur - t)
          if (kind !== lastKind || count !== lastCount) {
            lastKind = kind
            lastCount = count
            setState({ kind, count })
          }
          break
        }
        t -= dur
        level = kind === 'in' ? 1 : kind === 'out' ? 0 : level
      }
      levelRef.current(reduced ? 0.5 : level)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [pace, active])

  return state
}
