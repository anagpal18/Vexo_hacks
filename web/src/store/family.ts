import { create } from 'zustand'
import type { Doc, ServerToFamily, Snapshot } from '@shared/types'

type FamilyState = {
  snap: Snapshot | null
  docs: Record<string, Doc>
  lines: { t: number; text: string; final: boolean }[]
  digest: string | null
  fresh: Record<string, number> // id → when it arrived (for slide-in animation)
  conn: 'open' | 'closed'
  apply: (m: ServerToFamily) => void
}

const upsert = <T extends { id: string }>(arr: T[], x: T, front = false) => {
  const i = arr.findIndex((y) => y.id === x.id)
  if (i >= 0) return arr.map((y, k) => (k === i ? x : y))
  return front ? [x, ...arr] : [...arr, x]
}

export const useFamily = create<FamilyState>((set, get) => ({
  snap: null,
  docs: {},
  lines: [],
  digest: null,
  fresh: {},
  conn: 'closed',
  apply: (m) => {
    const { snap } = get()
    const mark = (id: string) => ({ ...get().fresh, [id]: performance.now() })
    switch (m.type) {
      case 'state':
        set({ snap: m.snapshot }) // replace everything
        break
      case 'clock':
        if (snap) set({ snap: { ...snap, now: m.now } })
        break
      case 'task':
        if (snap) set({ snap: { ...snap, tasks: upsert(snap.tasks, m.task) }, fresh: snap.tasks.some((t) => t.id === m.task.id) ? get().fresh : mark(m.task.id) })
        break
      case 'concern':
        if (snap) set({ snap: { ...snap, concerns: upsert(snap.concerns, m.concern, true) }, fresh: mark(m.concern.id) })
        break
      case 'alert':
        if (snap) set({ snap: { ...snap, alerts: upsert(snap.alerts, m.alert, true) }, fresh: mark(m.alert.id) })
        break
      case 'activity':
        if (snap) set({ snap: { ...snap, activity: m.activity } })
        break
      case 'transcript': {
        const lines = get().lines.filter((l) => l.final)
        set({ lines: [...lines, { t: m.t, text: m.text, final: m.final }].slice(-30) })
        break
      }
      case 'document':
        set({ docs: { ...get().docs, [m.doc.id]: m.doc } })
        break
      case 'digest':
        set({ digest: m.text })
        break
    }
  },
}))
