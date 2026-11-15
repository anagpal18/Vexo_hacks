# CareLoop — shared README (read this first, 5 min)

> **Reminders are easy. Getting a real answer from Mom, without calling her five times a day, is the hard part.**

CareLoop is a companion for a parent who lives alone. They wear the **Vexo band** all day.
- It **hears to-dos** in normal speech: "Dr. Patel wants me on the pressure pill at 4."
- It **reminds** them out loud, in their daughter's cloned voice (with her consent).
- It **listens for an answer**: "Yes dear, took it."
- It **follows up** when no answer comes.
- It **tells the family** only when something matters (missed meds, a fall, confusion), by iMessage and email.
- The family can also **upload a doctor's note**. Gemini turns it into reminders after the family approves each one.

Team:
| Person | Owns | File |
|---|---|---|
| Shresth | **Gemini harness** (Hydrogen + Carbon), band bridge, evals | `shresth.md` |
| Aditya | **Frontend**: Hub page + Family dashboard | `aditya.md` |
| Kenil | **Backend**: server, Deepgram, Mastra workflows, Gradium voice, iMessage/email, demo clock | `kenil.md` |

This file is the **contract**. Don't change a message, route or field without telling the team chat first.

---

## 1. Architecture (no iOS app, everything is web)

```
 Vexo band (Grandma's wrist)
   mic · free-fall · double-tap · activity
        │ Bluetooth (Chrome only)
        ▼
 HUB PAGE  (Chrome on a laptop at Grandma's place)     FAMILY DASHBOARD  (any browser, incl. iPhone Safari)
   • connects the band, forwards it to the server        • status, today's timeline, alerts
   • plays reminders out loud (speaker)                   • upload doctor's note → approve items
   • big clock + next reminder                            • "Ask about Mom"
        │ ws /ws/hub                                            │ ws /ws/family + REST
        └───────────────────────┬───────────────────────────────┘
                                ▼
 SERVER (Node + TypeScript, runs on a Mac — needed for iMessage)
   audio → Deepgram STT → Gemini harness: Hydrogen (understand: add/confirm/concern)
   band events → Mastra workflows: reminder · fall check · document intake · digest
   Gradium TTS (daughter's cloned voice) → hub speaker
   alerts → iMessage (osascript) + email
   demo clock (jump to 4:00 PM on stage)
```

**Hard facts about the band** (from the kit):
- Only **Chrome/Edge on a computer** can connect it (Web Bluetooth); Node can't. One program at a time. **Double-tap the band before connecting.**
- **The band has no speaker or vibration, and the LED is locked while the mic is on.** All speech comes out of the hub laptop's speaker.
- Streams we use: `audio` (Opus 16 kHz; Deepgram takes the raw packets), `events` (`double-tap`, `free-fall`, `tap`), `activity` (steps, still/walk/run).
- All times use `Date.now()` ms, and the **server's demo clock** decides what "now" is for schedules.

---

## 2. Data model (`shared/types.ts`, copy exactly)

```ts
type TaskStatus = 'pending' | 'reminded' | 'confirmed' | 'likely' | 'missed' | 'needs_review';
type Task = {
  id: string; title: string; kind: 'med' | 'appointment' | 'call' | 'chore';
  dueAt: number;                       // demo-clock ms
  recurrence: 'none' | 'daily';
  status: TaskStatus;
  source: 'voice' | 'document' | 'family';
  sourceQuote?: string;                // what Mom said, or the doctor's-note line
  confirmQuote?: string;               // "Yes dear, took it" or "(double-tap)"
  attempts: number;                    // reminders spoken so far
  createdAt: number;
};
type Concern = { id: string; t: number; severity: 'info' | 'warn' | 'urgent';
  category: 'health' | 'safety' | 'mood' | 'confusion' | 'scam' | 'fall' | 'inactivity'; summary: string; quote?: string };
type Alert = { id: string; t: number; severity: 'warn' | 'urgent'; title: string; body: string;
  channels: ('imessage' | 'email')[]; sentAt?: number; taskId?: string };
type ExtractedItem = { id: string; kind: 'med' | 'appointment' | 'instruction'; title: string;
  dose?: string; times?: string[]; date?: string; sourceLine: string; confidence: number;
  decision?: 'approved' | 'rejected' };
type Doc = { id: string; filename: string; status: 'extracting' | 'review' | 'approved' | 'failed';
  items: ExtractedItem[]; previewUrl: string };
type Snapshot = {
  person: { name: string; relation: string };          // { name: 'Asha', relation: 'Mom' }
  now: number;                                          // demo clock
  status: 'good' | 'check' | 'urgent';                  // good = nothing open; check = missed/needs_review/warn; urgent = urgent alert open
  statusLine: string;                                   // "Mom is doing well · last heard 2 min ago"
  lastHeardAt: number | null;
  tasks: Task[]; concerns: Concern[]; alerts: Alert[];
  activity: { steps: number; state: 'still' | 'walk' | 'run'; series: [number, number][] }; // [t, steps]
  band: 'connected' | 'reconnecting' | 'disconnected';
};
```

## 3. REST (server :8787)
| Method | Route | Body → Response |
|---|---|---|
| GET | `/api/health` | `{ ok, deepgram, gemini, gradium, imessage, email }` |
| GET | `/api/state` | `Snapshot` |
| POST | `/api/tasks` | `{ title, kind, dueAt, recurrence }` → `Task` (family adds one by hand) |
| PATCH | `/api/tasks/:id` | partial Task → `Task` |
| POST | `/api/documents` | multipart `file` (jpg/png/pdf) → `Doc` (status `extracting`) |
| GET | `/api/documents/:id` | `Doc` |
| POST | `/api/documents/:id/approve` | `{ items: [{ id, decision, edits? }] }` → `{ tasks: Task[] }` |
| POST | `/api/ask` | `{ question }` → `{ answer, citations: string[] }` (Carbon, from the day log only) |
| POST | `/api/digest` | → `{ text }` (also emails the family) |
| POST | `/api/demo/advance` | `{ minutes }` or `{ to: "16:00" }` → `{ now }` |
| POST | `/api/demo/say` | `{ text }`: as if Mom said it (**backup when the band or mic fails**) |
| POST | `/api/demo/event` | `{ kind: 'free-fall' \| 'double-tap' }`: fake a band event (backup) |
| POST | `/api/demo/reset` | clear everything, reload the seed data |
| GET | `/audio/:id.wav` | generated speech |

## 4. WebSockets
**`/ws/hub`** (Hub page ⇄ server)
- Hub → server: **binary** = one raw Opus packet from the band, in order. JSON:
  - `{ type:'audio_start', time }`
  - `{ type:'band_event', time, kind }` (`double-tap` | `free-fall` | `tap`)
  - `{ type:'activity', time, steps, cadence, state }`
  - `{ type:'band_status', status, battery? }`
- Server → hub:
  - `{ type:'speak', id, text, audioUrl, reason: 'reminder'|'followup'|'fall_check'|'ack'|'checkin' }`. The hub plays `audioUrl`, or falls back to `speechSynthesis(text)`.
  - `{ type:'next', task: Task | null }`
  - `{ type:'transcript', t, text, final }`
  - `{ type:'clock', now }`

**`/ws/family`** (server → dashboard). Send the full `{ type:'state', snapshot }` on connect, then:
- `{type:'task', task}`
- `{type:'concern', concern}`
- `{type:'alert', alert}`
- `{type:'activity', activity}`
- `{type:'transcript', t, text, final}`
- `{type:'document', doc}`
- `{type:'digest', text}`
- `{type:'clock', now}`
- `{type:'state', snapshot}` (any time; replace everything)

## 5. Seed data (on `/api/demo/reset`)
- Person: **Asha (Mom)**. Family: daughter **Priya** (iMessage + email).
- Tasks: "Morning walk" 9:00 confirmed (quote "Back from my walk!"), "Call Priya" 11:00 confirmed, "Blood pressure pill" 16:00 pending (from the doctor's note), "Evening insulin" 19:00 pending.
- The demo clock starts at **15:50**.

## 6. Timeline (now → submit 5:45 PM)
| Time | Shresth | Kenil | Aditya |
|---|---|---|---|
| 3:45–4:00 | Band bridge (reuse) in the hub, streams flowing | Server skeleton, WS, `/state`, seed | Vite app, 2 routes, mock Snapshot |
| 4:00–4:30 | `understand()` on Hydrogen + guardrails, on text | Deepgram → transcript → call `understand()` → apply the tool calls | Dashboard + hub on mock data, then the real WS |
| **4:30** | **Checkpoint 1: Mom speaks → a task card appears on the dashboard** | | |
| 4:30–5:00 | `extractDocument`, `ask`, `digest`, evals | Reminder + fall workflows, Gradium voice, iMessage + email | Timeline, alerts, upload + review screen, Ask box |
| **5:00** | **Checkpoint 2: reminder → confirm/miss → iMessage; fall → alert** (+ document intake if ready) | | |
| 5:00–5:15 | Polish; **freeze at 5:15** | | |
| 5:15–5:40 | **Backup video** of the full demo, then rehearse twice | | |
| **5:45** | **SUBMIT** | | |

## 7. Demo script (3 min)
1. **(15 s) Hook:** "My grandmother lives alone. My mom calls her five times a day to ask: did you eat, did you take your pill. Most of those calls are just to get one answer."
2. **(25 s) Doctor's note:** Priya uploads a discharge note photo. Gemini Carbon pulls out 3 items with source lines, and she approves them. They land on the timeline.
3. **(40 s) Voice:** Mom (Kenil wearing the band) says "Dr. Patel also said I have a checkup Thursday at 10." A card appears live, marked "from Mom's words".
4. **(40 s) The loop:** jump the clock to 16:00. The hub plays "Mom, it's time for your blood pressure pill" **in Priya's voice**. Mom says "Yes dear, took it" → ✓ with her quote. Next, the insulin reminder gets no answer → follow-up → still nothing → **an iMessage arrives on Priya's (a judge's) phone.**
5. **(30 s) Fall:** drop the band onto a pillow. The hub asks "Asha, are you okay? Double-tap your band if you're fine." No tap → **urgent iMessage + email.**
6. **(20 s) Close:** "Ask about Mom: how was her day?" Carbon answers with quotes, then show the eval slide (X/20 correct tool calls). "CareLoop: one quiet loop instead of five worried calls."

**Never use real medical data.** Use a fake printed note.

## 8. Fallbacks (have them ready)
- Band or Bluetooth dies → `/api/demo/say` and `/api/demo/event` from a hidden debug panel.
- iMessage fails → email + the dashboard alert. Gradium fails → browser `speechSynthesis`.
- Gemini slow → the guardrail rules still fire alerts. Keep the backup video ready.

## 9. Sponsors (only what we really use)
Vexo band (core), Google DeepMind Gemini 4 Hydrogen + Carbon, Mastra, Gradium, Deepgram.
