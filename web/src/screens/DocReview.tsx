import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Doc, ExtractedItem } from '@shared/types'
import { api, connectFamily } from '../api/client'
import { useFamily } from '../store/family'

type Decision = 'approved' | 'rejected' | undefined
const KIND = { med: { icon: '💊', label: 'Medication' }, appointment: { icon: '📅', label: 'Appointment' }, instruction: { icon: '📝', label: 'Instruction' } } as const

function ItemCard({ it, decision, edits, onDecide, onEdit }: { it: ExtractedItem; decision: Decision; edits: Partial<ExtractedItem>; onDecide: (d: Decision) => void; onEdit: (e: Partial<ExtractedItem>) => void }) {
  const [editing, setEditing] = useState(false)
  const v = { ...it, ...edits }
  const low = it.confidence < 0.6
  return (
    <div className={`pop rounded-2xl bg-white p-4 shadow-sm ring-1 transition ${decision === 'approved' ? 'ring-2 ring-emerald-400' : decision === 'rejected' ? 'opacity-50 ring-stone-200' : 'ring-stone-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{KIND[it.kind].icon}</span>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">{KIND[it.kind].label}</div>
            {editing ? (
              <input autoFocus value={v.title} onChange={(e) => onEdit({ title: e.target.value })} className="rounded-lg bg-stone-100 px-2 py-1 text-[16px] font-bold" />
            ) : (
              <div className="text-lg font-bold leading-tight">{v.title}</div>
            )}
          </div>
        </div>
        {decision && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${decision === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'}`}>{decision}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {v.dose && <span className="rounded-lg bg-stone-100 px-2 py-0.5 font-semibold">{v.dose}</span>}
        {v.date && <span className="rounded-lg bg-stone-100 px-2 py-0.5 font-semibold">{v.date}</span>}
        {editing ? (
          <input value={(v.times ?? []).join(', ')} onChange={(e) => onEdit({ times: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} className="rounded-lg bg-stone-100 px-2 py-0.5 text-[16px]" />
        ) : (
          v.times?.map((t) => (
            <span key={t} className="rounded-lg bg-sky-50 px-2 py-0.5 font-semibold text-sky-800">
              {t}
            </span>
          ))
        )}
      </div>
      <blockquote className="mt-3 border-l-4 border-sky-300 bg-sky-50/60 px-3 py-2 font-[family-name:var(--font-serif)] text-[15px] italic text-stone-700">“{it.sourceLine}”</blockquote>
      <div className="mt-3">
        <div className="flex justify-between text-xs font-semibold text-stone-500">
          <span>Confidence</span>
          <span className={low ? 'text-amber-600' : ''}>
            {Math.round(it.confidence * 100)}%{low ? ' · check this one' : ''}
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
          <div className={`h-full rounded-full ${low ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${it.confidence * 100}%` }} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button onClick={() => onDecide('approved')} className="rounded-xl bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-500">Approve</button>
        <button onClick={() => setEditing((e) => !e)} className="rounded-xl bg-stone-100 py-2 font-semibold hover:bg-stone-200">{editing ? 'Done' : 'Edit'}</button>
        <button onClick={() => onDecide('rejected')} className="rounded-xl bg-stone-100 py-2 font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
      </div>
    </div>
  )
}

export default function DocReview() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const fromStore = useFamily((s) => s.docs[id])
  const apply = useFamily((s) => s.apply)
  const [doc, setDoc] = useState<Doc | null>(fromStore ?? null)
  const [dec, setDec] = useState<Record<string, Decision>>({})
  const [edits, setEdits] = useState<Record<string, Partial<ExtractedItem>>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let c: { close: () => void } | null = null
    connectFamily(apply).then((x) => {
      c = x
    })
    return () => {
      c?.close()
    }
  }, [apply])
  useEffect(() => {
    if (fromStore) setDoc(fromStore)
  }, [fromStore])
  // poll until extraction finishes (also covers missing WS deltas)
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const d = await api.doc(id).catch(() => null)
      if (!alive) return
      if (d) setDoc(d)
      if (!d || d.status === 'extracting') setTimeout(tick, 1000)
    }
    tick()
    return () => {
      alive = false
    }
  }, [id])

  const approveAll = async (only?: boolean) => {
    if (!doc) return
    setSaving(true)
    try {
      const items = doc.items.map((it) => ({ id: it.id, decision: (only ? dec[it.id] ?? 'rejected' : dec[it.id] === 'rejected' ? 'rejected' : 'approved') as 'approved' | 'rejected', edits: edits[it.id] }))
      await api.approve(doc.id, { items })
      nav('/')
    } finally {
      setSaving(false)
    }
  }

  const extracting = !doc || doc.status === 'extracting'
  return (
    <div className="mx-auto min-h-screen max-w-[1200px] px-4 py-4 sm:px-6">
      <header className="mb-4 flex items-center justify-between">
        <Link to="/" className="text-sm font-semibold text-stone-500 hover:text-stone-800">← Dashboard</Link>
        <span className="truncate text-sm text-stone-500">{doc?.filename}</span>
      </header>
      <div className="mb-5 rounded-2xl bg-[var(--color-ink)] px-5 py-3 text-center font-semibold text-white">🔒 Nothing becomes a reminder until you approve it.</div>

      <div className="grid gap-6 lg:grid-cols-[1fr_460px]">
        <div className={`relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 ${extracting ? 'scan' : ''}`}>
          {doc?.previewUrl ? <img src={doc.previewUrl} alt="Doctor's note" className="max-h-[78vh] w-full object-contain" /> : <div className="aspect-[3/4]" />}
          {extracting && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/90 to-transparent p-5 text-center font-semibold text-sky-700">✨ Gemini is reading the note…</div>
          )}
        </div>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-xl font-bold">{extracting ? 'Reading…' : `${doc!.items.length} items found`}</h1>
            {!extracting && <span className="text-sm text-stone-500">tap to approve, edit or reject</span>}
          </div>
          {extracting
            ? [0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-stone-200/60" />)
            : doc!.items.map((it) => (
                <ItemCard key={it.id} it={it} decision={dec[it.id] ?? it.decision} edits={edits[it.id] ?? {}} onDecide={(d) => setDec((x) => ({ ...x, [it.id]: d }))} onEdit={(e) => setEdits((x) => ({ ...x, [it.id]: { ...x[it.id], ...e } }))} />
              ))}
          {!extracting && doc!.status !== 'approved' && (
            <div className="sticky bottom-3 grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => approveAll(true)} disabled={saving} className="rounded-2xl bg-white py-4 font-bold shadow ring-1 ring-stone-200 disabled:opacity-50">Save choices</button>
              <button onClick={() => approveAll()} disabled={saving} className="rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white shadow-lg disabled:opacity-50">{saving ? 'Saving…' : 'Approve all'}</button>
            </div>
          )}
          {doc?.status === 'approved' && <div className="rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-800">Approved — the reminders are on Mom’s timeline.</div>}
        </div>
      </div>
    </div>
  )
}
