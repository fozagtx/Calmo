import { useEffect, useRef, useState } from 'react'
import type { Pace, PhaseKind } from '../lib/paces'

export const LEAD_IN = 3

export interface PacerState {
  ready: boolean
  kind: PhaseKind
  lead: number
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

const leadFor = (remaining: number) => (remaining <= LEAD_IN ? Math.min(LEAD_IN, LEAD_IN + 1 - Math.ceil(remaining)) : 0)

export function usePacer(pace: Pace, active: boolean, onFrame: (level: number) => void): PacerState {
  const [state, setState] = useState<PacerState>({ ready: true, kind: pace.phases[0][0], lead: 1 })
  const frameRef = useRef(onFrame)
  frameRef.current = onFrame

  useEffect(() => {
    if (!active) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const phases = pace.phases
    const cycle = phases.reduce((sum, [, d]) => sum + d, 0)
    const origin = performance.now()
    let frame = 0
    let last = ''
    const publish = (next: PacerState) => {
      const key = `${next.ready}|${next.kind}|${next.lead}`
      if (key !== last) {
        last = key
        setState(next)
      }
    }
    const loop = (now: number) => {
      const elapsed = (now - origin) / 1000
      let level = 0
      if (elapsed < LEAD_IN) {
        publish({ ready: true, kind: phases[0][0], lead: leadFor(LEAD_IN - elapsed) })
      } else {
        let t = (elapsed - LEAD_IN) % cycle
        for (const [kind, dur] of phases) {
          if (t < dur) {
            const p = ease(t / dur)
            if (kind === 'in') level = p
            else if (kind === 'out') level = 1 - p
            publish({ ready: false, kind, lead: leadFor(dur - t) })
            break
          }
          t -= dur
          level = kind === 'in' ? 1 : kind === 'out' ? 0 : level
        }
      }
      frameRef.current(reduced ? 0.5 : level)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [pace, active])

  return state
}
