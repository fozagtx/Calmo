import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Brand } from '../components/BrandMark'
import { CameraStage } from '../components/CameraStage'
import { BreathTrace, MetricTiles } from '../components/Readouts'
import { CoachPanel, chatEntry, configQuery, type ChatEntry } from '../components/CoachPanel'
import { useVitalsSession, type Summary } from '../hooks/useVitalsSession'
import { MODES, PACES } from '../lib/paces'
import { MOODS } from '../lib/mood'
import type { ModeId, PaceId } from '../lib/protocol'
import type { CoachReadings } from '../lib/coach-types'
import { isDesktop } from '../lib/vitals-source'

export const Route = createFileRoute('/session')({
  component: SessionPage,
})

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-2xl border-2 px-4 py-3 text-left transition ${on ? 'border-brand bg-brand-tint' : 'border-line hover:border-faint'}`}
    >
      {children}
    </button>
  )
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m ? `${m}m ${s}s` : `${s}s`
}

function fmtSpan(span: Summary['pulse'], unit: string, digits: number) {
  return span ? `${span.start.toFixed(digits)} to ${span.end.toFixed(digits)} ${unit}` : 'Not enough data'
}

function SessionPage() {
  const session = useVitalsSession()
  const config = useQuery(configQuery)
  const [mode, setMode] = useState<ModeId>('exam')
  const [paceId, setPaceId] = useState<PaceId>('steady')
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [checkin, setCheckin] = useState<ChatEntry[]>([])

  const pace = PACES[paceId]
  const live = session.phase === 'live' || session.phase === 'connecting'
  const { metrics, mood } = session

  useEffect(() => {
    if (session.flipped) {
      setChat((prev) => [
        ...prev,
        chatEntry('note', `You went from ${MOODS[session.flipped!].label} to Calm. Stay with this pace for a few more breaths so it sticks.`, 'You flipped it'),
      ])
    }
  }, [session.flipped])

  const readings = useCallback((): CoachReadings => {
    const m = metrics
    const expr = m?.expression
    return {
      modeText: MODES[mode].forText,
      paceLabel: pace.coachLabel,
      target: pace.perMin,
      breathing: m?.br?.s ? m.br.v : null,
      pulse: m?.pulse?.s ? m.pulse.v : null,
      hrv: m?.hrv?.s ? m.hrv.v : null,
      expression: expr && expr.s && expr.label !== 'unspecified' ? expr.label : null,
      blinks: m?.blinksPerMin ?? null,
      moodNow: mood.now !== 'reading' ? MOODS[mood.now].label : null,
      moodFirst: mood.first ? MOODS[mood.first].label : null,
      minutes: session.startedAt ? Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)) : 0,
    }
  }, [metrics, mood, mode, pace, session.startedAt])

  const debrief = useMemo(() => {
    const s = session.summary
    if (!s) return null
    return [
      'The breathing session just ended. Give me a short after-session check.',
      `Duration ${s.durationSec} seconds.`,
      s.onPace == null ? 'Time on pace unknown.' : `On pace ${Math.round(s.onPace * 100)} percent of the time.`,
      s.breathing ? `Breathing went from ${s.breathing.start.toFixed(1)} to ${s.breathing.end.toFixed(1)} per minute.` : 'Not enough stable breathing data.',
      s.pulse ? `Pulse went from ${Math.round(s.pulse.start)} to ${Math.round(s.pulse.end)} bpm.` : 'Not enough stable pulse data.',
      s.hrv ? `HRV went from ${Math.round(s.hrv.start)} to ${Math.round(s.hrv.end)} ms.` : '',
      s.moodFirst ? `My estimated state started as ${MOODS[s.moodFirst].label} and ended as ${s.moodLast ? MOODS[s.moodLast].label : 'unknown'}.` : '',
      `Say what changed, give one thing to do right before ${MODES[mode].forText}, then ask how I feel now.`,
    ]
      .filter(Boolean)
      .join(' ')
  }, [session.summary, mode])

  const begin = () => {
    setChat([chatEntry('coach', `Let's get you steady for ${MODES[mode].forText}. Follow the ring while I read you, then tell me how you feel.`)])
    setCheckin([])
    void session.start(mode, paceId)
  }

  const vitalsMissing = config.data && !config.data.vitalsReady
  const hint = session.validation && !session.validation.ok ? session.validation.hint || 'Adjusting camera' : null

  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <div className="flex items-center gap-3">
        <Link
          to="/settings"
          className="rounded-xl border border-line px-3.5 py-2 text-[14px] font-semibold text-ink transition hover:border-ink"
        >
          Settings
        </Link>
        <span
          className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
            session.status === 'Running'
              ? 'bg-green-tint text-green-ink'
              : session.status === 'Error'
                ? 'bg-red-tint text-red-ink'
                : session.status === 'Reconnecting'
                  ? 'bg-amber-tint text-ink'
                  : 'bg-surface text-muted'
          }`}
        >
          {session.status === 'Running' ? 'Live' : session.status}
        </span>
        </div>
      </header>

      {session.error && (
        <div className="mx-auto mb-4 flex max-w-7xl items-start gap-3 px-5 sm:px-8">
          <div className="flex w-full items-start gap-3 rounded-2xl bg-red-tint px-4 py-3 text-[14px] text-red-ink">
            <strong className="font-semibold">{session.error.code}</strong>
            <span className="flex-1">{session.error.message}</span>
            <button type="button" onClick={session.clearError} className="font-semibold">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-7xl gap-8 px-5 pb-12 sm:px-8 lg:grid-cols-[1.25fr_1fr]">
        <div className={session.phase === 'summary' ? 'hidden' : 'flex flex-col gap-6'}>
          <CameraStage videoRef={session.videoRef} faceRef={session.faceRef} pace={pace} live={live} mood={mood.now} hint={hint} />

          {live && (
            <>
              <div className="flex items-center justify-center gap-4 rounded-2xl border border-line px-5 py-3.5">
                <div className="text-center">
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">You started</div>
                  <div className="font-display text-[20px] font-semibold" style={{ color: MOODS[mood.first ?? 'reading'].color }}>
                    {mood.first ? MOODS[mood.first].label : 'Reading'}
                  </div>
                </div>
                <span className="h-0.5 w-10 rounded bg-line" />
                <div className="text-center">
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">Right now</div>
                  <div className="font-display text-[20px] font-semibold" style={{ color: MOODS[mood.now].color }}>
                    {MOODS[mood.now].label}
                  </div>
                </div>
              </div>
              <MetricTiles metrics={metrics} startedAt={session.startedAt || Date.now()} />
              <BreathTrace traceRef={session.traceRef} live={live} />
              <button
                type="button"
                onClick={session.stop}
                className="rounded-xl bg-ink px-5 py-3.5 text-[16px] font-semibold text-white transition hover:bg-black"
              >
                End session
              </button>
            </>
          )}
        </div>

        {session.phase === 'summary' && session.summary && (
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-[34px] font-semibold tracking-tight text-ink">Session done</h1>
            {session.summary.moodFirst && (
              <p
                className={`rounded-2xl px-5 py-4 font-display text-[19px] font-semibold ${
                  session.summary.moodLast === 'calm' && session.summary.moodFirst !== 'calm' ? 'bg-green-tint text-green-ink' : 'bg-surface text-ink'
                }`}
              >
                {session.summary.moodLast === 'calm' && session.summary.moodFirst !== 'calm'
                  ? `You went from ${MOODS[session.summary.moodFirst].label} to Calm.`
                  : `You started ${MOODS[session.summary.moodFirst].label} and ended ${session.summary.moodLast ? MOODS[session.summary.moodLast].label : 'still reading'}.`}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ['Time', fmtTime(session.summary.durationSec)],
                ['On pace', session.summary.onPace == null ? 'Not enough data' : `${Math.round(session.summary.onPace * 100)}%`],
                ['Breathing', fmtSpan(session.summary.breathing, '/min', 1)],
                ['Pulse', fmtSpan(session.summary.pulse, 'bpm', 0)],
                ['HRV', fmtSpan(session.summary.hrv, 'ms', 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-surface px-4 py-3.5">
                  <div className="text-[13px] font-medium text-muted">{label}</div>
                  <div className="mt-1 font-display text-[18px] font-semibold text-ink">{value}</div>
                </div>
              ))}
            </div>
            <p className="text-[13px] text-muted">Start and end values average the first and last 30 seconds of steady readings.</p>
            <button
              type="button"
              onClick={session.reset}
              className="self-start rounded-xl border border-line px-5 py-3 text-[15px] font-semibold text-ink hover:border-ink"
            >
              New session
            </button>
          </div>
        )}

        <aside className="lg:sticky lg:top-6 lg:self-start">
          {session.phase === 'idle' && (
            <section className="rounded-3xl border border-line p-6">
              <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink">Set up your session</h1>
              <div className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-muted">Getting ready for</div>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {Object.values(MODES).map((m) => (
                  <Choice key={m.id} on={mode === m.id} onClick={() => setMode(m.id)}>
                    <span className="font-semibold text-ink">{m.name}</span>
                  </Choice>
                ))}
              </div>
              <div className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-muted">Breathing guide</div>
              <div className="mt-3 flex flex-col gap-2.5">
                {Object.values(PACES).map((p) => (
                  <Choice key={p.id} on={paceId === p.id} onClick={() => setPaceId(p.id)}>
                    <span className="block font-semibold text-ink">{p.name}</span>
                    <span className="block text-[14px] text-muted">{p.detail}</span>
                  </Choice>
                ))}
              </div>
              <ul className="mt-6 list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-muted">
                <li>Face a window or lamp so your face is evenly lit.</li>
                <li>Keep your face and upper chest in view.</li>
                <li>Stay fairly still for the first 30 seconds.</li>
              </ul>
              <button
                type="button"
                onClick={begin}
                disabled={!!vitalsMissing}
                className="mt-6 w-full rounded-xl bg-brand px-5 py-4 text-[17px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                Start session
              </button>
              {vitalsMissing && (
                <p className="mt-3 text-[13px] text-red-ink">
                  {isDesktop() ? (
                    <>
                      Add your SmartSpectra key in{' '}
                      <Link to="/settings" className="font-semibold underline">
                        Settings
                      </Link>{' '}
                      to start.
                    </>
                  ) : (
                    'Add SMARTSPECTRA_API_KEY to the .env file and restart npm run dev.'
                  )}
                </p>
              )}
            </section>
          )}

          {(live || session.phase === 'stopping') && (
            <CoachPanel
              title="Coach"
              subtitle="Tells you what to do to stay calm, using your live readings."
              prompts={MODES[mode].prompts}
              readings={readings}
              entries={chat}
              onEntries={setChat}
            />
          )}

          {session.phase === 'summary' && (
            <CoachPanel
              title="Coach check-in"
              subtitle="A quick look back and one thing to do before you go in."
              prompts={['I feel calmer', 'Still a bit nervous', 'What should I do right before?']}
              readings={readings}
              entries={checkin}
              onEntries={setCheckin}
              autoAsk={debrief}
              placeholder="How do you feel now?"
            />
          )}
        </aside>
      </main>

      <footer className="mx-auto max-w-7xl px-5 pb-8 text-[12px] text-muted sm:px-8">
        General wellness feedback only. Calmo is not a medical device.
      </footer>
    </div>
  )
}
