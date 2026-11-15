import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ServerToHub, Task } from '@shared/types'
import { audioUrl, connectHub, type Conn } from '../api/client'
import { connectBand, startStreaming, type Band, type BandStatus } from '../band/bridge'
import { fmtClock, fmtDate, fmtTime } from '../lib/time'

const RoomHero = lazy(() => import('../three/RoomHero'))
type Speak = Extract<ServerToHub, { type: 'speak' }>

const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

function say(s: Speak) {
  const fallback = () => {
    try {
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(s.text)
      u.rate = 0.92
      speechSynthesis.speak(u)
    } catch {}
  }
  const a = new Audio(audioUrl(s.audioUrl))
  a.onerror = fallback
  a.play().catch(fallback)
}

export default function Hub() {
  const [now, setNow] = useState<number | null>(null)
  const [next, setNext] = useState<Task | null>(null)
  const [speaking, setSpeaking] = useState<Speak | null>(null)
  const [fallAt, setFallAt] = useState<number | null>(null) // real ms when the fall check began
  const [left, setLeft] = useState(30)
  const [line, setLine] = useState<{ text: string; final: boolean } | null>(null)
  const [band, setBand] = useState<Band | null>(null)
  const [bandStatus, setBandStatus] = useState<BandStatus | 'none'>('none')
  const [busy, setBusy] = useState(false)
  const conn = useRef<Conn | null>(null)
  const clearTimer = useRef<number | null>(null)

  useEffect(() => {
    let c: Conn | null = null
    connectHub((m) => {
      if (m.type === 'clock') setNow(m.now)
      else if (m.type === 'next') setNext(m.task)
      else if (m.type === 'transcript') setLine({ text: m.text, final: m.final })
      else if (m.type === 'speak') {
        say(m)
        setSpeaking(m)
        if (m.reason === 'fall_check') setFallAt(performance.now())
        else if (m.reason === 'ack') setFallAt(null)
        if (clearTimer.current) clearTimeout(clearTimer.current)
        clearTimer.current = window.setTimeout(() => setSpeaking(null), m.reason === 'fall_check' ? 30000 : 9000)
      }
    }).then((x) => {
      c = x
      conn.current = x
    })
    return () => {
      c?.close()
    }
  }, [])

  // 30 s countdown ring for the fall check
  useEffect(() => {
    if (fallAt == null) return
    const id = setInterval(() => {
      const l = Math.max(0, 30 - Math.floor((performance.now() - fallAt) / 1000))
      setLeft(l)
      if (l === 0) {
        clearInterval(id)
        setTimeout(() => setFallAt(null), 4000)
      }
    }, 200)
    return () => {
      clearInterval(id)
    }
  }, [fallAt])

  // MUST stay a direct click handler: Chrome opens the band chooser. Also unlocks audio playback.
  const onConnect = async () => {
    new Audio(SILENT).play().catch(() => {})
    try {
      speechSynthesis.speak(new SpeechSynthesisUtterance(''))
    } catch {}
    setBusy(true)
    try {
      const b = await connectBand()
      b.onStatus = setBandStatus
      setBand(b)
      await startStreaming(conn.current?.ws ?? null, b)
      setBandStatus('connected')
      conn.current?.send({ type: 'band_status', status: 'connected' })
    } finally {
      setBusy(false)
    }
  }

  const clock = now ? fmtClock(now) : null
  const fall = fallAt != null
  const R = 120
  const C = 2 * Math.PI * R

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1b1410] text-[#fbf3e6]">
      {/* living room behind frosted glass */}
      <div className="absolute inset-0 opacity-60 blur-[2px]">
        <Suspense fallback={null}>
          <RoomHero status={fall ? 'urgent' : 'good'} camera={{ position: [3.0, 1.6, 2.4], target: [-0.3, 0.7, -1.2] }} />
        </Suspense>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#1b1410]/30 via-[#1b1410]/55 to-[#1b1410]/90" />

      <div className="relative flex h-full flex-col justify-between p-10">
        <header className="flex items-start justify-between">
          <div className="text-2xl font-semibold text-[#fbf3e6]/80">{now ? fmtDate(now) : ''}</div>
          {band ? (
            <div className="flex items-center gap-3 rounded-full bg-black/40 px-5 py-2.5 text-xl backdrop-blur">
              <span className={`h-3.5 w-3.5 rounded-full ${bandStatus === 'connected' ? 'bg-emerald-400' : bandStatus === 'reconnecting' ? 'animate-pulse bg-amber-400' : 'bg-rose-500'}`} />
              Band {bandStatus}
            </div>
          ) : (
            <button onClick={onConnect} disabled={busy} className="rounded-2xl bg-[#fbf3e6] px-8 py-4 text-2xl font-bold text-[#1b1410] shadow-2xl hover:bg-white disabled:opacity-60">
              {busy ? 'Connecting…' : 'Connect band'}
            </button>
          )}
        </header>

        <main className="flex flex-col items-center">
          {clock && (
            <div className="flex items-start font-[family-name:var(--font-serif)] leading-none tracking-tight">
              <span className="text-[min(26vw,320px)] tabular-nums">{clock.hm}</span>
              <span className="ml-4 mt-[3vw] text-[min(5vw,64px)] text-[#fbf3e6]/70">{clock.ampm}</span>
            </div>
          )}
          {next && (
            <div className="mt-6 flex items-center gap-5 rounded-3xl bg-black/35 px-9 py-6 backdrop-blur-md">
              <span className="text-5xl">{next.kind === 'med' ? '💊' : next.kind === 'appointment' ? '📅' : next.kind === 'call' ? '📞' : '🌿'}</span>
              <div>
                <div className="text-xl font-semibold uppercase tracking-[0.2em] text-[#fbf3e6]/60">Next</div>
                <div className="text-4xl font-bold">
                  {fmtTime(next.dueAt)} · {next.title}
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="min-h-[2.5rem] text-center text-2xl text-[#fbf3e6]/60">{line ? `“${line.text}”` : ''}</footer>
      </div>

      {/* spoken reminder */}
      {speaking && !fall && (
        <div className="pop absolute inset-x-10 bottom-24 flex items-center gap-6 rounded-[32px] bg-[#fbf3e6] px-10 py-8 text-[#1b1410] shadow-2xl">
          <div className="speak grid h-24 w-24 shrink-0 place-items-center rounded-full bg-[#1b1410] text-5xl text-[#fbf3e6]">🔊</div>
          <div className="font-[family-name:var(--font-serif)] text-5xl leading-tight">{speaking.text}</div>
        </div>
      )}

      {/* fall check: full-screen amber with a 30 s ring */}
      {fall && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-amber-500 text-[#1b1410]">
          <div className="relative grid h-[300px] w-[300px] place-items-center">
            <svg viewBox="0 0 300 300" className="absolute inset-0 -rotate-90">
              <circle cx="150" cy="150" r={R} stroke="rgba(0,0,0,0.15)" strokeWidth="18" fill="none" />
              <circle cx="150" cy="150" r={R} stroke="#1b1410" strokeWidth="18" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / 30)} style={{ transition: 'stroke-dashoffset .2s linear' }} />
            </svg>
            <span className="text-9xl font-black tabular-nums">{left}</span>
          </div>
          <div className="mt-10 font-[family-name:var(--font-serif)] text-7xl">Are you okay?</div>
          <div className="mt-4 text-4xl font-semibold">Double-tap your band if you’re fine.</div>
          {left === 0 && <div className="mt-8 rounded-full bg-[#1b1410] px-8 py-3 text-2xl font-bold text-amber-400">Calling Priya…</div>}
        </div>
      )}
    </div>
  )
}
