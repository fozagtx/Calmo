import type { ModeId, PaceId } from './protocol'

export type PhaseKind = 'in' | 'hold' | 'out'

export interface Pace {
  id: PaceId
  name: string
  detail: string
  perMin: number
  phases: Array<[PhaseKind, number]>
  coachLabel: string
}

export const PACES: Record<PaceId, Pace> = {
  steady: {
    id: 'steady',
    name: 'Steady',
    detail: '5 in, 5 out',
    perMin: 6,
    phases: [['in', 5], ['out', 5]],
    coachLabel: 'steady breathing, 5 seconds in and 5 seconds out',
  },
  exhale: {
    id: 'exhale',
    name: 'Long exhale',
    detail: '4 in, 6 out',
    perMin: 6,
    phases: [['in', 4], ['out', 6]],
    coachLabel: 'long exhale breathing, 4 seconds in and 6 seconds out',
  },
  box: {
    id: 'box',
    name: 'Box',
    detail: '4 in, 4 hold, 4 out, 4 hold',
    perMin: 3.75,
    phases: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]],
    coachLabel: 'box breathing, 4 in, 4 hold, 4 out, 4 hold',
  },
}

export interface Mode {
  id: ModeId
  name: string
  forText: string
  prompts: string[]
}

export const MODES: Record<ModeId, Mode> = {
  exam: {
    id: 'exam',
    name: 'Exam',
    forText: 'an exam',
    prompts: ['How am I doing?', 'My mind keeps going blank', 'I feel shaky', 'It starts in 10 minutes'],
  },
  interview: {
    id: 'interview',
    name: 'Interview',
    forText: 'a job interview',
    prompts: ['How am I doing?', 'I am about to walk in', 'My heart is racing', 'I keep rushing my words'],
  },
  speech: {
    id: 'speech',
    name: 'Speech',
    forText: 'a public talk',
    prompts: ['How am I doing?', 'I am next on stage', 'My voice feels tight', 'My hands are shaking'],
  },
}

export const PHASE_TEXT: Record<PhaseKind, string> = {
  in: 'Breathe in',
  hold: 'Hold',
  out: 'Breathe out',
}
