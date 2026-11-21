import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { calmo } from '../lib/bridge'
import { isDesktop } from '../lib/vitals-source'
import type { CoachReadings, CoachTurn } from '../lib/coach-types'

export interface ChatEntry {
  id: number
  kind: 'me' | 'coach' | 'note' | 'error'
  text: string
  tag?: string
}

interface Props {
  title: string
  subtitle: string
  prompts: string[]
  readings: () => CoachReadings
  entries: ChatEntry[]
  onEntries: (update: (prev: ChatEntry[]) => ChatEntry[]) => void
  autoAsk?: string | null
  placeholder?: string
  compact?: boolean
}

let nextId = 1
export const chatEntry = (kind: ChatEntry['kind'], text: string, tag?: string): ChatEntry => ({ id: nextId++, kind, text, tag })

export const configQuery = { queryKey: ['calmo-config'], queryFn: () => calmo.config(), staleTime: 5_000 } as const

export function CoachPanel({ title, subtitle, prompts, readings, entries, onEntries, autoAsk, placeholder, compact }: Props) {
  const config = useQuery(configQuery)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const autoAskedRef = useRef<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const history: CoachTurn[] = entries
        .filter((e) => e.kind === 'me' || (e.kind === 'coach' && !e.tag))
        .map((e) => ({ role: e.kind === 'me' ? 'user' : 'assistant', content: e.text }))
      const res = await calmo.askCoach({ readings: readings(), history, message, model: config.data?.model })
      if (!res.ok) throw new Error(res.error)
      return res
    },
    onSuccess: (res) => onEntries((prev) => [...prev, chatEntry('coach', res.text)]),
    onError: (err) => onEntries((prev) => [...prev, chatEntry('error', (err as Error).message)]),
  })

  const send = (text: string, silent = false) => {
    const message = text.trim()
    if (!message || mutation.isPending) return
    if (!silent) onEntries((prev) => [...prev, chatEntry('me', message)])
    mutation.mutate(message)
  }

  useEffect(() => {
    if (autoAsk && autoAskedRef.current !== autoAsk && config.data?.coachReady) {
      autoAskedRef.current = autoAsk
      send(autoAsk, true)
    }
  })

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [entries.length, mutation.isPending])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send(draft)
    setDraft('')
  }

  const coachOff = config.data && !config.data.coachReady

  return (
    <section className={`flex flex-col rounded-3xl border border-line bg-white ${compact ? '' : 'h-full min-h-[560px]'}`}>
      <header className="border-b border-line px-5 py-4">
        <h2 className="font-display text-[17px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
      </header>

      <div ref={listRef} className={`flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4 ${compact ? 'max-h-[360px] min-h-[140px]' : ''}`}>
        {coachOff && (
          <p className="rounded-2xl bg-amber-tint px-4 py-3 text-sm text-ink">
            The coach is off.{' '}
            {isDesktop() ? (
              <>
                Add your OpenServ key in{' '}
                <Link to="/settings" className="font-semibold underline">
                  Settings
                </Link>
                .
              </>
            ) : (
              'Add SERV_API_KEY from console.openserv.ai to the .env file and restart npm run dev.'
            )}
          </p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className={
              e.kind === 'me'
                ? 'max-w-[88%] self-end rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[15px] leading-relaxed text-white'
                : e.kind === 'error'
                  ? 'max-w-[88%] self-start rounded-2xl bg-red-tint px-4 py-2.5 text-[14px] leading-relaxed text-red-ink'
                  : e.kind === 'note'
                    ? 'max-w-[88%] self-start rounded-2xl bg-green-tint px-4 py-2.5 text-[15px] leading-relaxed text-ink'
                    : 'max-w-[88%] self-start rounded-2xl rounded-bl-md bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-ink'
            }
          >
            {e.tag && <span className="mb-0.5 block text-[12px] font-semibold text-green-ink">{e.tag}</span>}
            {e.text}
          </div>
        ))}
        {mutation.isPending && <div className="self-start px-1 text-sm text-muted">Coach is reading your vitals...</div>}
      </div>

      <div className="flex flex-wrap gap-2 px-5 pb-3">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            disabled={mutation.isPending || !!coachOff}
            onClick={() => send(p)}
            className="rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-ink transition hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-line p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={600}
          placeholder={placeholder ?? 'Tell the coach how you feel'}
          className="min-w-0 flex-1 rounded-xl border border-line px-3.5 py-2.5 text-[15px] outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={mutation.isPending || !draft.trim() || !!coachOff}
          className="rounded-xl bg-brand px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  )
}
