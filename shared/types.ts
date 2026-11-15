// CareLoop shared contract — README.md §2 (copied exactly) + §3/§4 message shapes.
// Don't change a message, route or field without telling the team chat first.

// ---------------------------------------------------------------- §2 data model
export type TaskStatus = 'pending' | 'reminded' | 'confirmed' | 'likely' | 'missed' | 'needs_review'
export type Task = {
  id: string
  title: string
  kind: 'med' | 'appointment' | 'call' | 'chore'
  dueAt: number // demo-clock ms
  recurrence: 'none' | 'daily'
  status: TaskStatus
  source: 'voice' | 'document' | 'family'
  sourceQuote?: string // what Mom said, or the doctor's-note line
  confirmQuote?: string // "Yes dear, took it" or "(double-tap)"
  attempts: number // reminders spoken so far
  createdAt: number
}
export type Concern = {
  id: string
  t: number
  severity: 'info' | 'warn' | 'urgent'
  category: 'health' | 'safety' | 'mood' | 'confusion' | 'scam' | 'fall' | 'inactivity'
  summary: string
  quote?: string
}
export type Alert = {
  id: string
  t: number
  severity: 'warn' | 'urgent'
  title: string
  body: string
  channels: ('imessage' | 'email')[]
  sentAt?: number
  taskId?: string
}
export type ExtractedItem = {
  id: string
  kind: 'med' | 'appointment' | 'instruction'
  title: string
  dose?: string
  times?: string[]
  date?: string
  sourceLine: string
  confidence: number
  decision?: 'approved' | 'rejected'
}
export type Doc = { id: string; filename: string; status: 'extracting' | 'review' | 'approved' | 'failed'; items: ExtractedItem[]; previewUrl: string }
export type Activity = { steps: number; state: 'still' | 'walk' | 'run'; series: [number, number][] } // [t, steps]
export type Snapshot = {
  person: { name: string; relation: string } // { name: 'Asha', relation: 'Mom' }
  now: number // demo clock
  status: 'good' | 'check' | 'urgent' // good = nothing open; check = missed/needs_review/warn; urgent = urgent alert open
  statusLine: string // "Mom is doing well · last heard 2 min ago"
  lastHeardAt: number | null
  tasks: Task[]
  concerns: Concern[]
  alerts: Alert[]
  activity: Activity
  band: 'connected' | 'reconnecting' | 'disconnected'
}

// ---------------------------------------------------------------- §3 REST shapes
export type Health = { ok: boolean; deepgram: boolean; gemini: boolean; gradium: boolean; imessage: boolean; email: boolean }
export type NewTask = { title: string; kind: Task['kind']; dueAt: number; recurrence: Task['recurrence'] }
export type ApproveBody = { items: { id: string; decision: 'approved' | 'rejected'; edits?: Partial<ExtractedItem> }[] }
export type AskResponse = { answer: string; citations: string[] }

// ---------------------------------------------------------------- §4 WebSockets
export type BandEventKind = 'double-tap' | 'free-fall' | 'tap'

/** /ws/hub — hub → server (binary frames = raw Opus packets, in order) */
export type HubToServer =
  | { type: 'audio_start'; time: number }
  | { type: 'band_event'; time: number; kind: BandEventKind }
  | { type: 'activity'; time: number; steps: number; cadence: number; state: Activity['state'] }
  | { type: 'band_status'; status: Snapshot['band']; battery?: number }

/** /ws/hub — server → hub */
export type ServerToHub =
  | { type: 'speak'; id: string; text: string; audioUrl: string; reason: 'reminder' | 'followup' | 'fall_check' | 'ack' | 'checkin' }
  | { type: 'next'; task: Task | null }
  | { type: 'transcript'; t: number; text: string; final: boolean }
  | { type: 'clock'; now: number }

/** /ws/family — server → dashboard (full `state` on connect, then deltas) */
export type ServerToFamily =
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'task'; task: Task }
  | { type: 'concern'; concern: Concern }
  | { type: 'alert'; alert: Alert }
  | { type: 'activity'; activity: Activity }
  | { type: 'transcript'; t: number; text: string; final: boolean }
  | { type: 'document'; doc: Doc }
  | { type: 'digest'; text: string }
  | { type: 'clock'; now: number }
