import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { isDesktop } from '../lib/vitals-source'
import { Brand } from '../components/BrandMark'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (!isDesktop()) return
    let onboarded = false
    try {
      onboarded = localStorage.getItem('calmo.onboarded') === '1'
    } catch {
      onboarded = false
    }
    throw redirect({ to: onboarded ? '/session' : '/welcome' })
  },
  component: Landing,
})

const STEPS = [
  {
    title: 'Look into your camera',
    body: 'Calmo reads your breathing, pulse, heart rate variability and expression from the video on your own computer.',
  },
  {
    title: 'Follow the ring',
    body: 'Breathe with the ring around your face. The colour shows your state and turns green as you settle.',
  },
  {
    title: 'Talk to your coach',
    body: 'Tell the coach how you feel. It reads your live numbers and tells you what to do next, then checks in when you finish.',
  },
]

const MOMENTS = [
  { name: 'Exams', line: 'For the minutes before you sit down and your mind goes blank.', dot: 'bg-brand' },
  { name: 'Interviews', line: 'For the waiting room, when your heart is racing and your words rush.', dot: 'bg-green' },
  { name: 'Talks', line: 'For the moment before you walk on stage and your voice tightens.', dot: 'bg-amber' },
]

const FAQ = [
  {
    q: 'Does my video leave my computer?',
    a: 'No. Measurement runs on your computer. The coach receives only numbers such as breathing rate and pulse, plus what you type.',
  },
  {
    q: 'Do I need a wearable?',
    a: 'No. A normal webcam in decent light is enough. Sit facing a window or lamp with your face and upper chest in view.',
  },
  {
    q: 'How long does a session take?',
    a: 'Pulse shows after about 12 seconds and breathing after about 30. Three to five minutes is enough to feel the shift.',
  },
  {
    q: 'Is this medical advice?',
    a: 'No. Calmo gives general wellness feedback. It does not diagnose or treat anything.',
  },
]

function Landing() {
  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <Link
          to="/session"
          className="rounded-xl border border-line px-4 py-2.5 text-[15px] font-semibold text-ink transition hover:border-ink"
        >
          Start a session
        </Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-10 sm:px-8 md:grid-cols-[1.15fr_1fr] md:pt-20">
          <div>
            <h1 className="font-display text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[58px]">
              Fix your emotional stress before it ruins your day.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[18px] leading-relaxed text-muted">
              Calmo watches your breathing, pulse and expression through your camera, shows you when you are anxious or tense, and walks you back to calm one slow breath at a time.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/session"
                className="rounded-xl bg-brand px-6 py-3.5 text-[16px] font-semibold text-white transition hover:bg-brand-dark"
              >
                Start a session
              </Link>
              <a href="#how" className="rounded-xl px-4 py-3.5 text-[16px] font-semibold text-ink hover:bg-surface">
                How it works
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="relative grid aspect-square w-full max-w-[380px] place-items-center">
              <div className="calmo-breathe absolute inset-0 rounded-full bg-green-tint" />
              <div className="relative grid aspect-square w-[44%] place-items-center rounded-full bg-green">
                <span className="px-4 text-center font-display text-[16px] font-semibold text-white">Breathe with me</span>
              </div>
            </div>
            <p className="mt-6 max-w-[30ch] text-center text-[15px] text-muted">
              Breathe in while the circle grows and out while it shrinks. Five seconds each way.
            </p>
          </div>
        </section>

        <section id="how" className="border-t border-line bg-white">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="font-display text-[32px] font-semibold tracking-tight text-ink">How it works</h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-3xl border border-line p-6">
                  <span className="grid size-9 place-items-center rounded-full bg-brand-tint font-display text-[15px] font-semibold text-brand">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 font-display text-[19px] font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="font-display text-[32px] font-semibold tracking-tight text-ink">Made for the minutes that matter</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {MOMENTS.map((m) => (
                <div key={m.name} className="rounded-3xl bg-surface p-6">
                  <div className="flex items-center gap-2.5">
                    <span className={`size-2.5 rounded-full ${m.dot}`} />
                    <h3 className="font-display text-[19px] font-semibold text-ink">{m.name}</h3>
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{m.line}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
            <h2 className="font-display text-[32px] font-semibold tracking-tight text-ink">Questions</h2>
            <div className="mt-8 divide-y divide-line border-y border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display text-[17px] font-semibold text-ink">
                    {f.q}
                    <span className="text-[22px] font-normal text-muted transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
            <div className="mt-14 flex flex-col items-start gap-4 rounded-3xl bg-brand-tint p-8">
              <h3 className="font-display text-[22px] font-semibold text-ink">Got something coming up?</h3>
              <p className="text-[15px] text-muted">Three minutes with Calmo before you walk in.</p>
              <Link to="/session" className="rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white hover:bg-brand-dark">
                Start a session
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-[13px] text-muted sm:flex-row sm:justify-between sm:px-8">
          <span>General wellness feedback only. Calmo is not a medical device.</span>
          <span>Vitals by SmartSpectra. Coach by OpenServ.</span>
        </div>
      </footer>
    </div>
  )
}
