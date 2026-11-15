import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, apiMode } from '../api/client'

// Hidden stage panel (README §8 fallbacks): demo clock, fake speech, fake band events.
const SAYS = ['Yes dear, took it', 'Dr. Patel also said I have a checkup Thursday at 10', 'I feel a bit dizzy today', 'Back from my walk!']

export default function Debug() {
  const [text, setText] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [mode, setMode] = useState('…')
  useEffect(() => {
    apiMode().then(setMode)
  }, [])
  const run = async (label: string, f: () => Promise<unknown>) => {
    try {
      const r = await f()
      setLog((l) => [`✓ ${label} ${r && typeof r === 'object' && 'now' in (r as any) ? new Date((r as any).now).toLocaleTimeString() : ''}`, ...l].slice(0, 8))
    } catch (e: any) {
      setLog((l) => [`✗ ${label}: ${e.message}`, ...l].slice(0, 8))
    }
  }
  const B = ({ label, onClick, tone = 'bg-stone-800' }: { label: string; onClick: () => void; tone?: string }) => (
    <button onClick={onClick} className={`rounded-xl ${tone} px-4 py-3 font-semibold text-white hover:opacity-90`}>
      {label}
    </button>
  )
  return (
    <div className="mx-auto max-w-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Demo panel</h1>
        <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold">{mode === 'live' ? 'server :8787' : 'mock server'}</span>
      </div>
      <div className="space-y-4">
        <section>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">Clock</div>
          <div className="grid grid-cols-3 gap-2">
            <B label="→ 15:59" onClick={() => run('15:59', () => api.demo.advance({ to: '15:59' }))} />
            <B label="→ 16:00" onClick={() => run('16:00', () => api.demo.advance({ to: '16:00' }))} />
            <B label="→ 19:00" onClick={() => run('19:00', () => api.demo.advance({ to: '19:00' }))} />
            <B label="+1 min" onClick={() => run('+1', () => api.demo.advance({ minutes: 1 }))} />
            <B label="+2 min" onClick={() => run('+2', () => api.demo.advance({ minutes: 2 }))} />
          </div>
        </section>
        <section>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">Mom says</div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (text) run(`say "${text}"`, () => api.demo.say(text))
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-stone-100 px-3 py-2 text-[16px]" placeholder="as if Mom said it" />
            <B label="Say" onClick={() => text && run(`say "${text}"`, () => api.demo.say(text))} />
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SAYS.map((s) => (
              <button key={s} onClick={() => run(`say "${s}"`, () => api.demo.say(s))} className="rounded-full bg-stone-100 px-3 py-1 text-xs">
                {s}
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">Band</div>
          <div className="grid grid-cols-2 gap-2">
            <B label="Fake free-fall" tone="bg-rose-600" onClick={() => run('free-fall', () => api.demo.event('free-fall'))} />
            <B label="Fake double-tap" tone="bg-sky-600" onClick={() => run('double-tap', () => api.demo.event('double-tap'))} />
          </div>
        </section>
        <section className="grid grid-cols-2 gap-2">
          <B label="Digest" tone="bg-indigo-600" onClick={() => run('digest', () => api.digest())} />
          <B label="Reset seed" tone="bg-stone-500" onClick={() => run('reset', () => api.demo.reset())} />
        </section>
        <div className="rounded-xl bg-stone-900 p-3 font-mono text-xs text-stone-200">
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : 'ready'}
        </div>
        <div className="flex gap-4 text-sm">
          <Link to="/" className="underline">Dashboard</Link>
          <Link to="/hub" className="underline">Hub</Link>
        </div>
      </div>
    </div>
  )
}
