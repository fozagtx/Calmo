import { useState, type FormEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Brand } from '../components/BrandMark'
import { configQuery } from '../components/CoachPanel'
import { calmo } from '../lib/bridge'
import { isDesktop } from '../lib/vitals-source'

export const Route = createFileRoute('/settings')({
  component: Settings,
})

function savedPlaceholder(hint: string | null | undefined): string {
  return hint ? `Saved, ends in ...${hint}. Paste a new key to replace it.` : 'Paste your key'
}

function Status({ ready, label, hint }: { ready: boolean | undefined; label: string; hint: string | null | undefined }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
        ready ? 'bg-green-tint text-green-ink' : 'bg-surface text-muted'
      }`}
    >
      {ready ? `${label} saved${hint ? ` (...${hint})` : ''}` : `${label} missing`}
    </span>
  )
}

function ModelPicker() {
  const queryClient = useQueryClient()
  const config = useQuery(configQuery)
  const models = useQuery({
    queryKey: ['calmo-models', config.data?.coachReady],
    queryFn: () => calmo.models(),
    enabled: !!config.data?.coachReady,
    staleTime: 60_000,
  })
  const choose = useMutation({
    mutationFn: (model: string) => calmo.saveKeys({ model }),
    onSuccess: (next) => queryClient.setQueryData(configQuery.queryKey, next),
  })
  const current = config.data?.model ?? 'gpt-5.4-mini'
  const list = models.data?.ok ? models.data.models : []
  const options = list.some((m) => m.id === current) ? list : [{ id: current, name: current }, ...list]
  const problem = !config.data?.coachReady
    ? 'Add an OpenServ key to load the model list.'
    : models.data && !models.data.ok
      ? models.data.error
      : models.isError
        ? (models.error as Error).message
        : null

  return (
    <div className="rounded-3xl border border-line p-6">
      <label className="block">
        <span className="font-semibold text-ink">Coach model</span>
        <span className="block text-[13px] text-muted">Models available on your OpenServ account.</span>
        <select
          value={current}
          disabled={choose.isPending || models.isFetching}
          onChange={(e) => choose.mutate(e.target.value)}
          className="mt-2 w-full cursor-pointer appearance-none rounded-xl border border-line bg-white px-3.5 py-3 text-[15px] text-ink outline-none focus:border-brand disabled:cursor-default disabled:bg-surface"
        >
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name === m.id ? m.id : `${m.name} (${m.id})`}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
        {models.isFetching && <span className="text-muted">Loading models...</span>}
        {models.data?.ok && <span className="text-muted">{list.length} models</span>}
        {problem && <span className="text-red-ink">{problem}</span>}
        {config.data?.coachReady && (
          <button type="button" onClick={() => void models.refetch()} className="font-semibold text-brand">
            Refresh list
          </button>
        )}
        {choose.isSuccess && <span className="text-green-ink">Saved.</span>}
        {choose.isError && <span className="text-red-ink">{(choose.error as Error).message}</span>}
      </div>
    </div>
  )
}

function Settings() {
  const queryClient = useQueryClient()
  const config = useQuery(configQuery)
  const [smartspectra, setSmartspectra] = useState('')
  const [serv, setServ] = useState('')
  const desktop = isDesktop()

  const [savedNote, setSavedNote] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () =>
      calmo.saveKeys({
        ...(smartspectra.trim() ? { smartspectra } : {}),
        ...(serv.trim() ? { serv } : {}),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(configQuery.queryKey, next)
      const parts = [
        smartspectra.trim() && next.smartspectraHint ? `SmartSpectra key saved, ends in ...${next.smartspectraHint}` : '',
        serv.trim() && next.servHint ? `OpenServ key saved, ends in ...${next.servHint}` : '',
      ].filter(Boolean)
      setSavedNote(parts.join('. ') + '.')
      setSmartspectra('')
      setServ('')
      void queryClient.invalidateQueries({ queryKey: ['calmo-models'] })
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  const field =
    'mt-2 w-full rounded-xl border border-line px-3.5 py-3 text-[15px] outline-none focus:border-brand disabled:bg-surface'

  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <Link
          to="/session"
          className="rounded-xl border border-line px-3.5 py-2 text-[14px] font-semibold text-ink transition hover:border-ink"
        >
          Back to session
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-ink">Settings</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <Status ready={config.data?.vitalsReady} label="SmartSpectra key" hint={config.data?.smartspectraHint} />
          <Status ready={config.data?.coachReady} label="OpenServ key" hint={config.data?.servHint} />
        </div>

        {desktop ? (
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6 rounded-3xl border border-line p-6">
            <p className="text-[14px] leading-relaxed text-muted">
              Keys are saved only on this Mac, in Calmo's app data folder, readable only by your user account. Leave a field empty to keep the saved value.
            </p>
            <label className="block">
              <span className="font-semibold text-ink">SmartSpectra API key</span>
              <span className="block text-[13px] text-muted">Required. From physiology.presagetech.com</span>
              <input
                type="password"
                autoComplete="off"
                value={smartspectra}
                placeholder={savedPlaceholder(config.data?.smartspectraHint)}
                onChange={(e) => {
                  setSmartspectra(e.target.value)
                  setSavedNote(null)
                }}
                className={field}
              />
            </label>
            <label className="block">
              <span className="font-semibold text-ink">OpenServ API key</span>
              <span className="block text-[13px] text-muted">Optional, turns on the coach. From console.openserv.ai/settings/keys</span>
              <input
                type="password"
                autoComplete="off"
                value={serv}
                placeholder={savedPlaceholder(config.data?.servHint)}
                onChange={(e) => {
                  setServ(e.target.value)
                  setSavedNote(null)
                }}
                className={field}
              />
            </label>
            {save.isError && <p className="rounded-xl bg-red-tint px-4 py-3 text-[14px] text-red-ink">{(save.error as Error).message}</p>}
            {savedNote && <p className="rounded-xl bg-green-tint px-4 py-3 text-[14px] text-green-ink">{savedNote}</p>}
            <button
              type="submit"
              disabled={save.isPending || (!smartspectra.trim() && !serv.trim())}
              className="self-start rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              Save keys
            </button>
          </form>
        ) : (
          <div className="mt-8 rounded-3xl border border-line p-6 text-[15px] leading-relaxed text-muted">
            <p>
              In the web version, keys live in the <code className="rounded bg-surface px-1.5 py-0.5 text-ink">.env</code> file next to the project:
            </p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-surface p-4 text-[13px] text-ink">
{`SMARTSPECTRA_API_KEY=...
SERV_API_KEY=...
SERV_MODEL=gpt-5.4-mini`}
            </pre>
            <p className="mt-4">Restart npm run dev after editing it.</p>
          </div>
        )}

        <div className="mt-6">
          <ModelPicker />
        </div>
      </main>
    </div>
  )
}
