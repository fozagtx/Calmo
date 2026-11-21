import type { ExpressionReading, Reading } from './protocol'

export type MoodId = 'reading' | 'anxious' | 'angry' | 'stressed' | 'tense' | 'settling' | 'calm'

export const MOODS: Record<MoodId, { label: string; color: string; tint: string }> = {
  reading: { label: 'Reading', color: '#9AA1AF', tint: '#F2F4F7' },
  anxious: { label: 'Anxious', color: '#F04438', tint: '#FEE4E2' },
  angry: { label: 'Angry', color: '#F04438', tint: '#FEE4E2' },
  stressed: { label: 'Stressed', color: '#F04438', tint: '#FEE4E2' },
  tense: { label: 'Tense', color: '#F79009', tint: '#FEF0C7' },
  settling: { label: 'Settling', color: '#2E90FA', tint: '#D1E9FF' },
  calm: { label: 'Calm', color: '#12B76A', tint: '#D1FADF' },
}

export const UPSET: ReadonlySet<MoodId> = new Set(['anxious', 'angry', 'stressed', 'tense'])

export interface MoodInputs {
  expression: ExpressionReading | null
  br: Reading | null
  pulse: Reading | null
  target: number
  pulseBase: number | null
}

export function rawMood({ expression, br, pulse, target, pulseBase }: MoodInputs): MoodId {
  const expr = expression && expression.s ? expression.label : null
  const breathing = br && br.s ? br.v : null
  const heart = pulse && pulse.s ? pulse.v : null
  if (expr == null && breathing == null && heart == null) return 'reading'

  let score = 0
  let anxious = false
  let angry = false
  if (expr === 'fear' || expr === 'surprise') {
    score += 2
    anxious = true
  } else if (expr === 'angry' || expr === 'contempt' || expr === 'disgust') {
    score += 2
    angry = true
  } else if (expr === 'sad') {
    score += 1
  } else if (expr === 'happy') {
    score -= 1
  }

  if (breathing != null) {
    if (breathing >= 18) score += 2
    else if (breathing >= 13) score += 1
    else if (breathing <= target + 2) score -= 1
  }

  if (heart != null) {
    if (heart >= 100) score += 2
    else if (heart >= 88) score += 1
    if (pulseBase != null && heart <= pulseBase - 4) score -= 1
  }

  if (score >= 2) return angry ? 'angry' : anxious ? 'anxious' : 'stressed'
  if (score === 1) return angry ? 'angry' : anxious ? 'anxious' : 'tense'
  if (score === 0) return 'settling'
  return 'calm'
}
