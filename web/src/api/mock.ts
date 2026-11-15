// Small in-browser stand-in for Kenil's server (README §3–5). Emits the exact /ws/hub and
// /ws/family messages. One tab owns the engine (Web Locks); hub + dashboard tabs share it
// through a BroadcastChannel, so the on-stage loop works on one laptop with no server.
import type {
  Alert, ApproveBody, AskResponse, BandEventKind, Concern, Doc, ExtractedItem, NewTask, ServerToFamily, ServerToHub, Snapshot, Task,
} from '@shared/types'
import { atTime, fmtTime } from '../lib/time'

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`
const FOLLOWUP_AFTER = 45_000 // demo-clock ms without an answer → follow-up
const MISS_AFTER = 90_000 // → missed + iMessage
const FALL_WINDOW = 30_000 // real ms to double-tap after a fall

// ---------------------------------------------------------------- engine (runs in the leader tab only)
type Out = { to: 'hub' | 'family'; msg: ServerToHub | ServerToFamily }
class Engine {
  s!: Snapshot
  log: { t: number; text: string }[] = []
  docs = new Map<string, Doc>()
  fallTimer: number | null = null
  emit: (o: Out) => void
  constructor(emit: (o: Out) => void) {
    this.emit = emit
    this.reset()
    setInterval(() => this.tick(1000), 1000) // demo clock runs at 1× between jumps
  }
  family(msg: ServerToFamily) {
    this.emit({ to: 'family', msg })
  }
  hub(msg: ServerToHub) {
    this.emit({ to: 'hub', msg })
  }
  reset() {
    const base = new Date()
    base.setHours(15, 50, 0, 0)
    const now = base.getTime()
    const mk = (title: string, kind: Task['kind'], hhmm: string, status: Task['status'], source: Task['source'], extra: Partial<Task> = {}): Task => ({
      id: uid('task'), title, kind, dueAt: atTime(now, hhmm), recurrence: 'daily', status, source, attempts: status === 'confirmed' ? 1 : 0, createdAt: atTime(now, '08:00'), ...extra,
    })
    const series: [number, number][] = []
    let steps = 0
    for (let h = 7; h <= 15; h++) for (const m of [0, 30]) {
      steps += h === 9 ? 1400 : Math.round(150 + Math.random() * 260)
      series.push([atTime(now, `${h}:${m}`), steps])
    }
    this.s = {
      person: { name: 'Asha', relation: 'Mom' },
      now,
      status: 'good',
      statusLine: '',
      lastHeardAt: now - 6 * 60000,
      band: 'connected',
      tasks: [
        mk('Morning walk', 'chore', '09:00', 'confirmed', 'family', { confirmQuote: 'Back from my walk!' }),
        mk('Call Priya', 'call', '11:00', 'confirmed', 'family', { confirmQuote: 'Just talked to Priya, she says hi.' }),
        mk('Blood pressure pill', 'med', '16:00', 'pending', 'document', { sourceQuote: 'Lisinopril 10 mg — take once daily at 4 PM.' }),
        mk('Evening insulin', 'med', '19:00', 'pending', 'family'),
      ],
      concerns: [{ id: uid('c'), t: atTime(now, '13:10'), severity: 'info', category: 'mood', summary: 'Sounded cheerful at lunch', quote: 'The roses are finally blooming!' }],
      alerts: [],
      activity: { steps, state: 'still', series },
    }
    this.log = [
      { t: atTime(now, '09:02'), text: 'Mom: "Back from my walk!"' },
      { t: atTime(now, '11:05'), text: 'Mom: "Just talked to Priya, she says hi."' },
      { t: atTime(now, '13:10'), text: 'Mom: "The roses are finally blooming!"' },
    ]
    this.docs.clear()
    this.recompute()
    this.family({ type: 'state', snapshot: this.s })
    this.hub({ type: 'clock', now: this.s.now })
    this.hub({ type: 'next', task: this.nextTask() })
  }
  recompute() {
    const s = this.s
    const urgent = s.alerts.some((a) => a.severity === 'urgent')
    const check = urgent ? false : s.tasks.some((t) => t.status === 'missed' || t.status === 'needs_review') || s.alerts.some((a) => a.severity === 'warn') || s.concerns.some((c) => c.severity === 'warn')
    s.status = urgent ? 'urgent' : check ? 'check' : 'good'
    const heard = s.lastHeardAt == null ? 'not heard yet' : (() => {
      const m = Math.max(0, Math.round((s.now - s.lastHeardAt!) / 60000))
      return m < 1 ? 'last heard just now' : `last heard ${m} min ago`
    })()
    s.statusLine =
      s.status === 'urgent' ? `Possible fall — no response · ${heard}`
      : s.status === 'check' ? `${s.tasks.filter((t) => t.status === 'missed').length ? 'Missed a reminder' : 'Something to look at'} · ${heard}`
      : `All reminders on track · ${heard}`
  }
  nextTask() {
    return this.s.tasks.filter((t) => t.status === 'pending' || t.status === 'reminded').sort((a, b) => a.dueAt - b.dueAt)[0] ?? null
  }
  upsertTask(t: Task) {
    const i = this.s.tasks.findIndex((x) => x.id === t.id)
    if (i >= 0) this.s.tasks[i] = t
    else this.s.tasks.push(t)
    this.recompute()
    this.family({ type: 'task', task: t })
    this.hub({ type: 'next', task: this.nextTask() })
    this.pushStatus()
  }
  pushStatus() {
    this.family({ type: 'state', snapshot: this.s })
  }
  speak(text: string, reason: Extract<ServerToHub, { type: 'speak' }>['reason']) {
    const id = uid('say')
    this.hub({ type: 'speak', id, text, audioUrl: `/audio/${id}.wav`, reason })
    this.log.push({ t: this.s.now, text: `Hub said (${reason}): "${text}"` })
  }
  alert(a: Omit<Alert, 'id' | 't' | 'sentAt'>) {
    const al: Alert = { ...a, id: uid('al'), t: this.s.now, sentAt: this.s.now }
    this.s.alerts.unshift(al)
    this.recompute()
    this.family({ type: 'alert', alert: al })
    this.pushStatus()
    this.log.push({ t: this.s.now, text: `Alert sent: ${a.title}` })
  }
  concern(c: Omit<Concern, 'id' | 't'>) {
    const cc: Concern = { ...c, id: uid('c'), t: this.s.now }
    this.s.concerns.unshift(cc)
    this.recompute()
    this.family({ type: 'concern', concern: cc })
    this.pushStatus()
  }
  // advance the demo clock and run the reminder loop
  tick(dt: number) {
    const s = this.s
    s.now += dt
    for (const t of s.tasks) {
      if (t.status === 'pending' && s.now >= t.dueAt) {
        t.status = 'reminded'
        t.attempts = 1
        this.speak(`${s.person.relation}, it's time for your ${t.title.toLowerCase()}.`, 'reminder')
        this.upsertTask({ ...t })
      } else if (t.status === 'reminded') {
        const since = s.now - t.dueAt
        if (t.attempts === 1 && since >= FOLLOWUP_AFTER) {
          t.attempts = 2
          this.speak(`${s.person.relation}, just checking — did you take your ${t.title.toLowerCase()}? Say "yes" or double-tap your band.`, 'followup')
          this.upsertTask({ ...t })
        } else if (t.attempts >= 2 && since >= MISS_AFTER) {
          t.status = 'missed'
          this.upsertTask({ ...t })
          this.alert({ severity: 'warn', title: `${s.person.relation} missed ${t.title.toLowerCase()}`, body: `No answer to 2 reminders for the ${fmtTime(t.dueAt)} ${t.title.toLowerCase()}.`, channels: ['imessage'], taskId: t.id })
        }
      }
    }
    if (s.now % 60000 < dt) {
      this.recompute()
      this.pushStatus()
    }
    this.family({ type: 'clock', now: s.now })
    this.hub({ type: 'clock', now: s.now })
  }
  advance(body: { minutes?: number; to?: string }) {
    const target = body.to ? atTime(this.s.now, body.to) : this.s.now + (body.minutes ?? 0) * 60000
    const step = 30_000
    while (this.s.now + step < target) this.tick(step) // walk through so reminders fire in order
    this.tick(Math.max(0, target - this.s.now))
    this.recompute()
    this.pushStatus()
    return { now: this.s.now }
  }
  heard(text: string) {
    const s = this.s
    s.lastHeardAt = s.now
    this.family({ type: 'transcript', t: s.now, text, final: true })
    this.hub({ type: 'transcript', t: s.now, text, final: true })
    this.log.push({ t: s.now, text: `Mom: "${text}"` })
  }
  say(text: string) {
    this.heard(text)
    const s = this.s
    const lower = text.toLowerCase()
    const open = s.tasks.filter((t) => t.status === 'reminded').sort((a, b) => b.dueAt - a.dueAt)[0]
    if (open && /\b(yes|took|done|did|already)\b/.test(lower)) {
      this.upsertTask({ ...open, status: 'confirmed', confirmQuote: text })
      this.speak(`Thank you, ${s.person.relation}. I'll let ${'Priya'} know.`, 'ack')
    } else if (/checkup|appointment|doctor|dr\./.test(lower) && /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)/.test(lower)) {
      const time = lower.match(/at (\d{1,2})/)?.[1]
      const due = new Date(s.now)
      due.setDate(due.getDate() + 2)
      due.setHours(time ? Number(time) : 10, 0, 0, 0)
      const t: Task = { id: uid('task'), title: 'Checkup with Dr. Patel', kind: 'appointment', dueAt: due.getTime(), recurrence: 'none', status: 'pending', source: 'voice', sourceQuote: text, attempts: 0, createdAt: s.now }
      this.upsertTask(t)
      this.speak(`Got it — checkup on Thursday at ${time ?? 10}. I'll remind you.`, 'ack')
    } else if (/dizzy|pain|fell|hurt|confus|don't remember|chest/.test(lower)) {
      this.concern({ severity: 'warn', category: /confus|remember/.test(lower) ? 'confusion' : 'health', summary: 'Mentioned not feeling well', quote: text })
    } else if (/bank|gift card|password|social security/.test(lower)) {
      this.concern({ severity: 'warn', category: 'scam', summary: 'Possible scam call mentioned', quote: text })
    }
    this.recompute()
    this.pushStatus()
  }
  event(kind: BandEventKind) {
    const s = this.s
    if (kind === 'free-fall') {
      this.speak(`${s.person.name}, are you okay? Double-tap your band if you're fine.`, 'fall_check')
      this.concern({ severity: 'warn', category: 'fall', summary: 'Band detected a possible fall — checking in' })
      if (this.fallTimer) clearTimeout(this.fallTimer)
      this.fallTimer = window.setTimeout(() => {
        this.fallTimer = null
        this.alert({ severity: 'urgent', title: `Possible fall — ${s.person.relation} isn't responding`, body: `The band detected a fall at ${fmtTime(s.now)} and ${s.person.name} didn't double-tap within 30 s.`, channels: ['imessage', 'email'] })
        this.concern({ severity: 'urgent', category: 'fall', summary: 'No response after possible fall' })
      }, FALL_WINDOW)
    } else if (kind === 'double-tap') {
      s.lastHeardAt = s.now
      if (this.fallTimer) {
        clearTimeout(this.fallTimer)
        this.fallTimer = null
        this.speak(`Okay, glad you're alright, ${s.person.name}.`, 'ack')
        this.concern({ severity: 'info', category: 'fall', summary: 'Double-tapped after the fall check — says she’s okay' })
        return
      }
      const open = s.tasks.filter((t) => t.status === 'reminded').sort((a, b) => b.dueAt - a.dueAt)[0]
      if (open) {
        this.upsertTask({ ...open, status: 'confirmed', confirmQuote: '(double-tap)' })
        this.speak('Thank you!', 'ack')
      }
    }
  }
  addTask(b: NewTask): Task {
    const t: Task = { ...b, id: uid('task'), status: 'pending', source: 'family', attempts: 0, createdAt: this.s.now }
    this.upsertTask(t)
    return t
  }
  patchTask(id: string, p: Partial<Task>): Task | null {
    const t = this.s.tasks.find((x) => x.id === id)
    if (!t) return null
    const n = { ...t, ...p }
    this.upsertTask(n)
    return n
  }
  uploadDoc(filename: string, previewUrl: string): Doc {
    const doc: Doc = { id: uid('doc'), filename, status: 'extracting', items: [], previewUrl }
    this.docs.set(doc.id, doc)
    this.family({ type: 'document', doc })
    setTimeout(() => {
      // FAKE note content — never real medical data (README §7)
      const items: ExtractedItem[] = [
        { id: uid('x'), kind: 'med', title: 'Metformin', dose: '500 mg', times: ['08:00', '20:00'], sourceLine: 'Metformin 500 mg by mouth twice daily with meals.', confidence: 0.93 },
        { id: uid('x'), kind: 'appointment', title: 'Follow-up with Dr. Patel', date: 'Thursday', times: ['10:00'], sourceLine: 'Follow up in clinic with Dr. Patel on Thursday 10:00 AM.', confidence: 0.88 },
        { id: uid('x'), kind: 'instruction', title: 'Check blood pressure daily', times: ['17:00'], sourceLine: 'Check BP daily; call if above 160/100.', confidence: 0.54 },
      ]
      const d = { ...doc, status: 'review' as const, items }
      this.docs.set(d.id, d)
      this.family({ type: 'document', doc: d })
    }, 2800)
    return doc
  }
  getDoc(id: string) {
    return this.docs.get(id) ?? null
  }
  approve(id: string, body: ApproveBody): { tasks: Task[] } {
    const d = this.docs.get(id)
    if (!d) return { tasks: [] }
    const tasks: Task[] = []
    for (const it of d.items) {
      const dec = body.items.find((x) => x.id === it.id)
      const item = { ...it, ...(dec?.edits ?? {}), decision: dec?.decision }
      if (dec?.decision !== 'approved') continue
      for (const tm of item.times ?? ['09:00']) {
        let due = atTime(this.s.now, tm)
        if (item.kind === 'appointment' || due <= this.s.now) {
          // appointments are on Thursday; daily doses already past today start tomorrow
          const dd = new Date(due)
          dd.setDate(dd.getDate() + (item.kind === 'appointment' ? 2 : 1))
          due = dd.getTime()
        }
        const t: Task = {
          id: uid('task'), title: item.dose ? `${item.title} ${item.dose}` : item.title, kind: item.kind === 'appointment' ? 'appointment' : item.kind === 'med' ? 'med' : 'chore',
          dueAt: due, recurrence: item.kind === 'appointment' ? 'none' : 'daily', status: 'pending', source: 'document', sourceQuote: item.sourceLine, attempts: 0, createdAt: this.s.now,
        }
        tasks.push(t)
        this.upsertTask(t)
      }
    }
    const nd: Doc = { ...d, status: 'approved', items: d.items.map((it) => ({ ...it, decision: body.items.find((x) => x.id === it.id)?.decision })) }
    this.docs.set(id, nd)
    this.family({ type: 'document', doc: nd })
    return { tasks }
  }
  ask(question: string): AskResponse {
    const q = question.toLowerCase()
    const s = this.s
    const done = s.tasks.filter((t) => t.status === 'confirmed')
    const missed = s.tasks.filter((t) => t.status === 'missed')
    const fall = s.alerts.find((a) => a.severity === 'urgent')
    let answer: string
    const cites: string[] = []
    if (/pill|med|insulin|took/.test(q)) {
      answer = `${done.filter((t) => t.kind === 'med').map((t) => `She confirmed her ${t.title.toLowerCase()} ("${t.confirmQuote}")`).join('. ') || 'No medication confirmed yet today'}.${missed.length ? ` She missed: ${missed.map((t) => t.title.toLowerCase()).join(', ')}.` : ''}`
      done.filter((t) => t.kind === 'med').forEach((t) => cites.push(t.id))
      missed.forEach((t) => cites.push(t.id))
    } else {
      answer = `${s.person.name} had a ${fall ? 'mostly good day, but the band detected a possible fall and she didn’t respond' : missed.length ? 'good day with one missed reminder' : 'good day'}. She did her morning walk ("Back from my walk!"), talked to Priya, and said the roses are blooming. ${done.length} of ${s.tasks.length} tasks confirmed; ${s.activity.steps.toLocaleString()} steps so far.`
      done.slice(0, 3).forEach((t) => cites.push(t.id))
      if (fall) cites.push(fall.id)
    }
    return { answer, citations: cites }
  }
  digest(): { text: string } {
    const s = this.s
    const text = `Evening digest for ${s.person.name} — ${s.tasks.filter((t) => t.status === 'confirmed').length} confirmed, ${s.tasks.filter((t) => t.status === 'missed').length} missed, ${s.alerts.length} alert(s). ${s.activity.steps.toLocaleString()} steps. Highlights: morning walk done, chatted with Priya, roses are blooming.`
    this.family({ type: 'digest', text })
    return { text }
  }
  call(cmd: string, args: any): any {
    switch (cmd) {
      case 'state': return this.s
      case 'advance': return this.advance(args)
      case 'say': this.say(args.text); return { ok: true }
      case 'event': this.event(args.kind); return { ok: true }
      case 'reset': this.reset(); return { ok: true }
      case 'addTask': return this.addTask(args)
      case 'patchTask': return this.patchTask(args.id, args.patch)
      case 'uploadDoc': return this.uploadDoc(args.filename, args.previewUrl)
      case 'getDoc': return this.getDoc(args.id)
      case 'approve': return this.approve(args.id, args.body)
      case 'ask': return this.ask(args.question)
      case 'digest': return this.digest()
      case 'hubMsg': if (args.type === 'band_event') this.event(args.kind); return { ok: true }
    }
  }
}

// ---------------------------------------------------------------- cross-tab plumbing
const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('careloop-mock') : null
let engine: Engine | null = null
const listeners = { hub: new Set<(m: ServerToHub) => void>(), family: new Set<(m: ServerToFamily) => void>() }
const pending = new Map<string, (v: any) => void>()

function deliver(o: Out) {
  if (o.to === 'hub') listeners.hub.forEach((f) => f(o.msg as ServerToHub))
  else listeners.family.forEach((f) => f(o.msg as ServerToFamily))
}

let started = false
export function startMock() {
  if (started) return
  started = true
  const becomeLeader = () => {
    engine = new Engine((o) => {
      deliver(o)
      ch?.postMessage({ kind: 'out', o })
    })
  }
  if (navigator.locks) navigator.locks.request('careloop-mock-server', () => new Promise(() => becomeLeader()))
  else becomeLeader()
  ch?.addEventListener('message', (e) => {
    const d = e.data
    if (d.kind === 'out' && !engine) deliver(d.o)
    else if (d.kind === 'cmd' && engine) ch!.postMessage({ kind: 'res', id: d.id, result: engine.call(d.cmd, d.args) })
    else if (d.kind === 'res') pending.get(d.id)?.(d.result)
  })
}

export function mockCall<T = any>(cmd: string, args: any = {}): Promise<T> {
  startMock()
  if (engine) return Promise.resolve(engine.call(cmd, args))
  return new Promise((res, rej) => {
    const id = uid('rq')
    const to = setTimeout(() => {
      pending.delete(id)
      engine ? res(engine.call(cmd, args)) : rej(new Error('mock server not ready'))
    }, 1500)
    pending.set(id, (v) => {
      clearTimeout(to)
      pending.delete(id)
      res(v)
    })
    ch?.postMessage({ kind: 'cmd', id, cmd, args })
  })
}

export function mockSubscribe(to: 'hub', f: (m: ServerToHub) => void): () => void
export function mockSubscribe(to: 'family', f: (m: ServerToFamily) => void): () => void
export function mockSubscribe(to: 'hub' | 'family', f: any) {
  startMock()
  listeners[to].add(f)
  return () => {
    listeners[to].delete(f)
  }
}
