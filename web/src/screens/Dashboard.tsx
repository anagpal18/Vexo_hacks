import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Alert, Concern, Task } from '@shared/types'
import { api, connectFamily } from '../api/client'
import { useFamily } from '../store/family'
import { ago, fmtDate, fmtTime } from '../lib/time'
import { sampleNote } from '../lib/sampleNote'

// 3D living-room hero only on wide screens; phones never download three.js
const RoomHero = lazy(() => import('../three/RoomHero'))
const useWide = () => {
  const [w, setW] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    const f = () => setW(m.matches)
    m.addEventListener('change', f)
    return () => {
      m.removeEventListener('change', f)
    }
  }, [])
  return w
}

const STATUS = {
  good: { bg: 'from-emerald-600 to-teal-700', dot: 'bg-emerald-300', title: (r: string) => `${r} is doing well` },
  check: { bg: 'from-amber-500 to-orange-600', dot: 'bg-amber-200', title: () => 'Needs a check' },
  urgent: { bg: 'from-rose-600 to-red-700', dot: 'bg-white', title: () => 'Urgent' },
} as const

// ---------------------------------------------------------------- small icons
const Icon = ({ kind }: { kind: Task['kind'] }) => {
  const p = {
    med: 'M10.5 20.5 3.5 13.5a4.95 4.95 0 1 1 7-7l7 7a4.95 4.95 0 1 1-7 7ZM8.5 8.5l7 7',
    appointment: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
    call: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z',
    chore: 'M13 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 22l3-8 3 3v5M10 14l1-5 4 3 3 1M7 12l2-3',
  }[kind]
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={p} />
    </svg>
  )
}

const CHIP: Record<Task['status'], { label: (t: Task) => string; cls: string }> = {
  confirmed: { label: () => '✓ Confirmed', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  likely: { label: () => '~ Likely', cls: 'bg-amber-100 text-amber-800 ring-amber-300' },
  pending: { label: () => '⏳ Pending', cls: 'bg-stone-100 text-stone-600 ring-stone-200' },
  reminded: { label: (t) => `🔔 Reminded${t.attempts > 1 ? ` · attempt ${t.attempts}` : ''}`, cls: 'bg-sky-100 text-sky-800 ring-sky-300' },
  missed: { label: () => '✗ Missed', cls: 'bg-rose-100 text-rose-800 ring-rose-300' },
  needs_review: { label: () => '⚠ Needs review', cls: 'bg-amber-100 text-amber-900 ring-amber-300' },
}
const SOURCE: Record<Task['source'], string> = { voice: '🎙 from Mom’s words', document: '📄 from Dr.’s note', family: '✍️ added by you' }

function TaskRow({ t, now, fresh, highlight }: { t: Task; now: number; fresh: boolean; highlight: boolean }) {
  const chip = CHIP[t.status]
  const past = t.dueAt <= now
  const quote = t.confirmQuote ?? t.sourceQuote
  const isConfirm = !!t.confirmQuote
  return (
    <li id={`ev-${t.id}`} className={`relative flex gap-4 pb-6 ${fresh ? 'slide-in' : ''}`}>
      <div className="flex w-[72px] shrink-0 flex-col items-end pt-3">
        <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${past ? 'text-stone-800' : 'text-stone-400'}`}>{fmtTime(t.dueAt)}</span>
      </div>
      <div className="relative flex flex-col items-center">
        <span className={`z-10 mt-2.5 grid h-9 w-9 place-items-center rounded-full ring-4 ring-[var(--color-cream)] ${t.status === 'confirmed' ? 'bg-emerald-600 text-white' : t.status === 'missed' ? 'bg-rose-600 text-white' : t.status === 'reminded' ? 'bg-sky-600 text-white' : 'bg-white text-stone-500 shadow'}`}>
          <Icon kind={t.kind} />
        </span>
      </div>
      <div className={`min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 transition-all duration-500 ${highlight ? 'ring-2 ring-sky-400' : 'ring-stone-200/80'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[17px] font-semibold leading-tight">{t.title}</span>
          <span key={t.status + t.attempts} className={`pop rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${chip.cls}`}>{chip.label(t)}</span>
        </div>
        {quote && (
          <div className={`mt-2 rounded-xl px-3 py-2 font-[family-name:var(--font-serif)] text-[15px] italic leading-snug ${isConfirm ? 'bg-emerald-50 text-emerald-900' : 'bg-stone-50 text-stone-700'}`}>
            “{quote.replace(/^"|"$/g, '')}”
          </div>
        )}
        <div className="mt-2 text-xs font-medium text-stone-500">{isConfirm && t.confirmQuote !== '(double-tap)' ? '🎙 Mom’s answer · ' : ''}{SOURCE[t.source]}</div>
      </div>
    </li>
  )
}

function AlertCard({ a, fresh }: { a: Alert; fresh: boolean }) {
  const urgent = a.severity === 'urgent'
  return (
    <div id={`ev-${a.id}`} className={`rounded-2xl p-4 ${fresh ? 'slide-in' : ''} ${urgent ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30' : 'bg-amber-50 text-amber-950 ring-1 ring-amber-300'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`font-bold leading-snug ${urgent ? 'text-lg' : ''}`}>{a.title}</div>
        <span className="shrink-0 text-xs opacity-80">{fmtTime(a.t)}</span>
      </div>
      <div className={`mt-1 text-sm ${urgent ? 'text-white/90' : 'text-amber-900/80'}`}>{a.body}</div>
      <div className={`mt-2 flex gap-3 text-xs font-semibold ${urgent ? 'text-white' : 'text-amber-900'}`}>
        {a.channels.map((c) => (
          <span key={c}>sent to {c === 'imessage' ? 'iMessage' : 'email'} {a.sentAt ? '✓' : '…'}</span>
        ))}
      </div>
    </div>
  )
}

function ConcernRow({ c, fresh }: { c: Concern; fresh: boolean }) {
  const tone = c.severity === 'urgent' ? 'border-rose-400 bg-rose-50' : c.severity === 'warn' ? 'border-amber-400 bg-amber-50' : 'border-stone-200 bg-white'
  return (
    <div id={`ev-${c.id}`} className={`rounded-xl border-l-4 px-3 py-2 ${tone} ${fresh ? 'slide-in' : ''}`}>
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-semibold">{c.summary}</span>
        <span className="shrink-0 text-xs text-stone-500">{fmtTime(c.t)}</span>
      </div>
      {c.quote && <div className="mt-0.5 font-[family-name:var(--font-serif)] text-sm italic text-stone-600">“{c.quote}”</div>}
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{c.category}</div>
    </div>
  )
}

function Sparkline({ series }: { series: [number, number][] }) {
  if (series.length < 2) return null
  const xs = series.map((s) => s[0])
  const ys = series.map((s) => s[1])
  const [x0, x1, y1] = [Math.min(...xs), Math.max(...xs), Math.max(...ys) || 1]
  const pts = series.map(([x, y]) => `${((x - x0) / (x1 - x0 || 1)) * 200},${56 - (y / y1) * 50}`).join(' ')
  return (
    <svg viewBox="0 0 200 60" className="h-14 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1f9d6b" stopOpacity=".35" />
          <stop offset="1" stopColor="#1f9d6b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,60 ${pts} 200,60`} fill="url(#sg)" />
      <polyline points={pts} fill="none" stroke="#1f9d6b" strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const wide = useWide()
  const { snap, fresh, lines, digest, apply, conn } = useFamily()
  const [ask, setAsk] = useState('')
  const [answer, setAnswer] = useState<{ q: string; a: string; cites: string[] } | null>(null)
  const [asking, setAsking] = useState(false)
  const [digesting, setDigesting] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [hl, setHl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let c: { close: () => void } | null = null
    connectFamily(apply, (s) => useFamily.setState({ conn: s })).then((x) => {
      c = x
    })
    return () => {
      c?.close()
    }
  }, [apply])

  const tasks = useMemo(() => {
    if (!snap) return []
    const end = new Date(snap.now)
    end.setHours(23, 59, 59, 999)
    return [...snap.tasks].sort((a, b) => a.dueAt - b.dueAt).filter((t) => t.dueAt <= end.getTime() || t.source !== 'family')
  }, [snap])

  if (!snap) return <div className="grid min-h-screen place-items-center text-stone-400">Connecting to CareLoop…</div>
  const st = STATUS[snap.status]
  const rel = snap.person.relation
  const isFresh = (id: string) => !!fresh[id] && performance.now() - fresh[id] < 4000

  const doAsk = async (q = ask) => {
    if (!q.trim()) return
    setAsking(true)
    try {
      const r = await api.ask(q)
      setAnswer({ q, a: r.answer, cites: r.citations })
    } finally {
      setAsking(false)
    }
  }
  const jump = (id: string) => {
    document.getElementById(`ev-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHl(id)
    setTimeout(() => setHl(null), 2200)
  }
  const onFile = async (f?: File | null) => {
    if (!f) return
    setUploading(true)
    try {
      const d = await api.uploadDoc(f)
      nav(`/doc/${d.id}`)
    } finally {
      setUploading(false)
    }
  }
  const citeLabel = (id: string) => snap.tasks.find((t) => t.id === id)?.title ?? snap.alerts.find((a) => a.id === id)?.title ?? snap.concerns.find((c) => c.id === id)?.summary ?? 'event'

  return (
    <div className="mx-auto min-h-screen max-w-[1280px] px-4 pb-24 pt-4 sm:px-6 lg:px-8">
      {/* top bar */}
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--color-ink)] text-sm font-black text-[var(--color-cream)]">C</span>
          <span className="text-lg font-bold tracking-tight">CareLoop</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <span className="hidden sm:inline">{fmtDate(snap.now)}</span>
          <span className="rounded-full bg-white px-3 py-1 font-semibold tabular-nums text-stone-700 shadow-sm ring-1 ring-stone-200">{fmtTime(snap.now)}</span>
        </div>
      </header>

      {/* 1. status hero */}
      <section className={`relative overflow-hidden rounded-[28px] bg-gradient-to-br ${st.bg} text-white shadow-xl transition-all duration-700 ${snap.status === 'urgent' ? 'ring-pulse' : ''}`}>
        {wide && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[52%] opacity-95 [mask-image:linear-gradient(90deg,transparent,black_30%)]">
            <Suspense fallback={null}>
              <RoomHero status={snap.status} />
            </Suspense>
          </div>
        )}
        <div className="relative p-6 sm:p-8 lg:max-w-[52%]">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <span className="relative flex h-2.5 w-2.5">
              {snap.band === 'connected' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${st.dot} opacity-75`} />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${snap.band === 'connected' ? st.dot : 'bg-white/40'}`} />
            </span>
            {snap.person.name}’s band · {snap.band}
            {conn === 'closed' && <span className="ml-2 rounded bg-black/20 px-2 py-0.5 text-xs">reconnecting…</span>}
          </div>
          <h1 key={snap.status} className="pop mt-3 font-[family-name:var(--font-serif)] text-4xl leading-[1.05] sm:text-5xl">{st.title(rel)}</h1>
          <p className="mt-2 text-lg text-white/90">{snap.statusLine}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">Last heard {ago(snap.now, snap.lastHeardAt)}</span>
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">
              {snap.tasks.filter((t) => t.status === 'confirmed').length}/{snap.tasks.length} done today
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">{snap.activity.steps.toLocaleString()} steps</span>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* 2. today timeline */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-xl font-bold">Today</h2>
            <span className="text-sm text-stone-500">{rel}’s reminders & answers</span>
          </div>
          <ol className="relative before:absolute before:bottom-6 before:left-[106px] before:top-4 before:w-0.5 before:bg-stone-200">
            {tasks.map((t) => (
              <TaskRow key={t.id} t={t} now={snap.now} fresh={isFresh(t.id)} highlight={hl === t.id} />
            ))}
          </ol>
        </section>

        {/* right column */}
        <aside className="space-y-5">
          {/* 3. alerts + concerns */}
          {(snap.alerts.length > 0 || snap.concerns.length > 0) && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">Alerts</h2>
              {snap.alerts.map((a) => (
                <div key={a.id} className={hl === a.id ? 'rounded-2xl ring-2 ring-sky-400' : ''}>
                  <AlertCard a={a} fresh={isFresh(a.id)} />
                </div>
              ))}
              {snap.concerns.slice(0, 5).map((c) => (
                <ConcernRow key={c.id} c={c} fresh={isFresh(c.id)} />
              ))}
            </section>
          )}

          {/* 4. activity */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/80">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">Activity</h2>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-stone-600">{snap.activity.state}</span>
            </div>
            <div className="mt-1 text-4xl font-black tabular-nums">{snap.activity.steps.toLocaleString()}</div>
            <div className="text-sm text-stone-500">steps today</div>
            <Sparkline series={snap.activity.series} />
          </section>

          {/* 5. ask about mom */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/80">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">Ask about {rel}</h2>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                doAsk()
              }}
            >
              <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={`How was ${rel}'s day?`} className="min-w-0 flex-1 rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none ring-sky-400 focus:ring-2" />
              <button disabled={asking} className="rounded-xl bg-[var(--color-ink)] px-4 font-semibold text-white disabled:opacity-50">
                {asking ? '…' : 'Ask'}
              </button>
            </form>
            {!answer && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[`How was ${rel}'s day?`, 'Did she take her pills?'].map((s) => (
                  <button key={s} onClick={() => (setAsk(s), doAsk(s))} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {answer && (
              <div className="pop mt-3">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-sky-600 px-3 py-2 text-sm text-white">{answer.q}</div>
                <div className="mt-2 max-w-[95%] rounded-2xl rounded-bl-md bg-stone-100 px-3 py-2.5 text-[15px] leading-snug">{answer.a}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {answer.cites.map((c) => (
                    <button key={c} onClick={() => jump(c)} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100">
                      ↳ {citeLabel(c)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 6. upload doctor's note + 7. digest */}
          <section className="grid grid-cols-2 gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                onFile(e.dataTransfer.files?.[0])
              }}
              className="flex flex-col items-start gap-1 rounded-2xl border-2 border-dashed border-stone-300 bg-white p-4 text-left hover:border-sky-400"
            >
              <span className="text-2xl">📄</span>
              <span className="font-bold leading-tight">{uploading ? 'Uploading…' : 'Upload doctor’s note'}</span>
              <span className="text-xs text-stone-500">Photo or PDF · drop here</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <button
              onClick={async () => {
                setDigesting(true)
                try {
                  await api.digest()
                } finally {
                  setDigesting(false)
                }
              }}
              className="flex flex-col items-start gap-1 rounded-2xl bg-[var(--color-ink)] p-4 text-left text-white"
            >
              <span className="text-2xl">🌙</span>
              <span className="font-bold leading-tight">{digesting ? 'Writing…' : 'Evening digest'}</span>
              <span className="text-xs text-white/60">Summary + email</span>
            </button>
          </section>
          <button onClick={async () => onFile(await sampleNote())} className="-mt-2 text-xs font-medium text-stone-400 underline hover:text-stone-600">
            no photo handy? use a sample (fake) note
          </button>
          {digest && (
            <section className="pop rounded-2xl bg-indigo-50 p-4 ring-1 ring-indigo-200">
              <div className="flex justify-between text-sm font-bold text-indigo-900">
                <span>Evening digest</span>
                <span>Emailed to Priya ✓</span>
              </div>
              <p className="mt-2 font-[family-name:var(--font-serif)] text-[15px] leading-relaxed text-indigo-950">{digest}</p>
            </section>
          )}
        </aside>
      </div>

      {/* 8. live transcript drawer */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[1280px] px-4 pb-[env(safe-area-inset-bottom)] sm:px-6 lg:px-8">
        <div className="rounded-t-2xl bg-[var(--color-ink)] text-white shadow-2xl">
          <button onClick={() => setDrawer((d) => !d)} className="flex w-full items-center justify-between px-4 py-2.5 text-sm">
            <span className="font-semibold">🎙 Live transcript</span>
            <span className="max-w-[60%] truncate text-white/60">{lines.at(-1)?.text ?? 'listening…'}</span>
          </button>
          {drawer && (
            <div className="max-h-48 space-y-1 overflow-y-auto px-4 pb-3 text-sm">
              {lines.map((l, i) => (
                <div key={i} className={l.final ? 'text-white' : 'text-white/50'}>
                  <span className="mr-2 text-white/40 tabular-nums">{fmtTime(l.t)}</span>“{l.text}”
                </div>
              ))}
              <Link to="/debug" className="block pt-2 text-xs text-white/30">debug</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
