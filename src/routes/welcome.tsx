import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { BrandMark } from '../components/BrandMark'
import { usePacer } from '../hooks/usePacer'
import { PACES, PHASE_TEXT } from '../lib/paces'

export const ONBOARDED_KEY = 'calmo.onboarded'

export const Route = createFileRoute('/welcome')({
  component: Welcome,
})

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    return
  }
}

const COSTS = ['Your heart starts racing', 'Your breath gets short and shallow', 'Your mind goes blank', 'The exam, the interview, the whole day slips away']

function StressArt() {
  return (
    <div className="relative grid aspect-square w-full max-w-[340px] place-items-center">
      <div className="calmo-ripple absolute inset-[12%] rounded-full border-4 border-red" />
      <div className="calmo-ripple calmo-ripple-late absolute inset-[12%] rounded-full border-4 border-red" />
      <div className="calmo-heartbeat grid aspect-square w-[46%] place-items-center rounded-full bg-red">
        <svg viewBox="0 0 120 40" className="w-[70%]" aria-hidden="true">
          <polyline
            className="calmo-trace"
            points="0,20 22,20 30,6 38,34 46,20 60,20 68,4 76,36 84,20 120,20"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  )
}

function ReadArt() {
  return (
    <div className="relative grid aspect-square w-full max-w-[340px] place-items-center">
      <div className="calmo-ring-cycle absolute inset-[6%] rounded-full border-[10px]" />
      <div className="absolute inset-[14%] overflow-hidden rounded-full bg-surface">
        <div className="absolute left-1/2 top-[24%] h-[46%] w-[36%] -translate-x-1/2 rounded-[40%] bg-line" />
        <div className="absolute bottom-[-10%] left-1/2 h-[34%] w-[70%] -translate-x-1/2 rounded-t-[50%] bg-line" />
        <div className="calmo-box-cycle absolute left-1/2 top-[18%] h-[56%] w-[46%] -translate-x-1/2 rounded-[28%] border-[3px]" />
        <div className="calmo-scan absolute inset-x-0 h-[3px] bg-brand" />
      </div>
      <div className="calmo-label-cycle absolute top-0 rounded-full px-4 py-1.5 font-display text-[15px] font-semibold text-white" />
    </div>
  )
}

function CalmArt() {
  const ringRef = useRef<HTMLDivElement | null>(null)
  const pacer = usePacer(PACES.steady, true, (level) => {
    if (ringRef.current) ringRef.current.style.transform = `scale(${(0.5 + level * 0.5).toFixed(4)})`
  })
  return (
    <div className="relative grid aspect-square w-full max-w-[340px] place-items-center">
      <div ref={ringRef} className="absolute inset-0 rounded-full bg-green-tint" style={{ transform: 'scale(0.5)' }} />
      <div className="relative grid aspect-square w-[46%] place-items-center rounded-full bg-green">
        <span className="text-center font-display text-white">
          <span className="block text-[18px] font-semibold">{pacer.ready ? 'Get ready' : PHASE_TEXT[pacer.kind]}</span>
          <span className="mt-1 block h-8 text-[26px] font-semibold tabular-nums">{pacer.lead || ''}</span>
        </span>
      </div>
    </div>
  )
}

interface Step {
  eyebrow: string
  title: string
  body: ReactNode
  art: ReactNode
  accent: string
}

const STEPS: Step[] = [
  {
    eyebrow: 'When stress takes over',
    title: 'It ruins a whole day.',
    accent: 'text-red',
    art: <StressArt />,
    body: (
      <ul className="mt-6 flex flex-col gap-3">
        {COSTS.map((c, i) => (
          <li
            key={c}
            className="calmo-rise flex items-center gap-3 text-[17px] text-ink"
            style={{ animationDelay: `${200 + i * 260}ms` }}
          >
            <span className="size-2.5 shrink-0 rounded-full bg-red" />
            {c}
          </li>
        ))}
      </ul>
    ),
  },
  {
    eyebrow: 'Calmo reads you',
    title: 'See your stress the moment it starts.',
    accent: 'text-brand',
    art: <ReadArt />,
    body: (
      <p className="calmo-rise mt-6 max-w-[42ch] text-[17px] leading-relaxed text-muted" style={{ animationDelay: '200ms' }}>
        Your camera reads your breathing, pulse and expression on this Mac. The ring around your face turns red when you are anxious and green when you are calm. Video never leaves your computer.
      </p>
    ),
  },
  {
    eyebrow: 'Back to calm',
    title: 'Breathe with the ring. Walk in steady.',
    accent: 'text-green',
    art: <CalmArt />,
    body: (
      <p className="calmo-rise mt-6 max-w-[42ch] text-[17px] leading-relaxed text-muted" style={{ animationDelay: '200ms' }}>
        Follow the ring for three to five minutes. A coach reads your live numbers and tells you what to do next, then checks in when you finish.
      </p>
    ),
  },
]

function Welcome() {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const finish = () => {
    markOnboarded()
    void navigate({ to: '/session' })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(STEPS.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-[19px] font-semibold tracking-tight text-ink">Calmo</span>
        </div>
        <button
          type="button"
          onClick={finish}
          aria-hidden={last}
          tabIndex={last ? -1 : 0}
          className={`rounded-xl px-3.5 py-2 text-[14px] font-semibold text-muted hover:bg-surface hover:text-ink ${last ? 'invisible' : ''}`}
        >
          Skip
        </button>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pb-6 sm:px-10 md:grid-cols-2">
        <div key={`art-${index}`} className="calmo-scene flex justify-center">
          {step.art}
        </div>
        <div key={`text-${index}`} className="calmo-scene">
          <div className={`text-[13px] font-semibold uppercase tracking-[0.14em] ${step.accent}`}>{step.eyebrow}</div>
          <h1 className="mt-3 font-display text-[38px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[46px]">{step.title}</h1>
          {step.body}
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pb-10 sm:px-10">
        <div className="flex items-center gap-2" role="tablist" aria-label="Onboarding steps">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Step ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-2.5 rounded-full transition-all duration-500 ${i === index ? 'w-8 bg-ink' : 'w-2.5 bg-line hover:bg-faint'}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="rounded-xl border border-line px-5 py-3 text-[15px] font-semibold text-ink transition hover:border-ink"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : setIndex(index + 1))}
            className={`rounded-xl px-6 py-3 text-[15px] font-semibold text-white transition active:scale-[0.98] ${last ? 'bg-green hover:bg-green-ink' : 'bg-brand hover:bg-brand-dark'}`}
          >
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </footer>
    </div>
  )
}
