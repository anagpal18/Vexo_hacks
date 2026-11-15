// understand(): Gemini 4 Hydrogen listens to every final utterance and returns tool calls (Shresth).
//   1. guardrails (regex, instant, never wait for a model)
//   2. Hydrogen with native function declarations, tool_choice 'any', thinking 'low'
//   3. code checks on every call: grounded quote, real task id, dates from the demo clock,
//      doctor's-note contradictions become a concern, im_ok only during a fall check
import { ai, aiBeta, MODELS, withTimeout, errMsg } from './client.ts';
import { guardrails } from './guardrails.ts';
import type { Action, UnderstandCtx, UnderstandResult } from './types.ts';

const TIMEOUT_MS = 8000;
export const MERGE_MS = Number(process.env.UNDERSTAND_MERGE_MS) || 1500;   // finals closer than this are one sentence

const TOOLS = [
  { type: 'function', name: 'add_task',
    description: 'Mom states something SHE must do at a stated time or date (medicine, appointment, call, chore). Never for TV/radio or other people\'s plans.',
    parameters: { type: 'object', properties: {
      title: { type: 'string', description: 'Short title, e.g. "Checkup with Dr. Patel", "Blood pressure pill"' },
      kind: { type: 'string', enum: ['med', 'appointment', 'call', 'chore'] },
      due_time: { type: 'string', description: '24-hour HH:MM' },
      date: { type: 'string', description: 'YYYY-MM-DD, only if a day or date was said (resolve weekdays from today)' },
      recurrence: { type: 'string', enum: ['none', 'daily'] },
      quote: { type: 'string', description: 'The exact words Mom used, copied from the utterance' },
    }, required: ['title', 'kind', 'due_time', 'recurrence', 'quote'] } },
  { type: 'function', name: 'confirm_task',
    description: 'Mom says something about an OPEN task: done (confirmed), indirectly done (likely), or not yet / forgot / later (denied).',
    parameters: { type: 'object', properties: {
      task_id: { type: 'string', description: 'id of the open task (prefer the one being awaited)' },
      level: { type: 'string', enum: ['confirmed', 'likely', 'denied'] },
      quote: { type: 'string' },
    }, required: ['task_id', 'level', 'quote'] } },
  { type: 'function', name: 'flag_concern',
    description: 'Something the family should know: health, mood, confusion, safety or a possible scam.',
    parameters: { type: 'object', properties: {
      severity: { type: 'string', enum: ['info', 'warn', 'urgent'] },
      category: { type: 'string', enum: ['health', 'mood', 'confusion', 'safety', 'scam'] },
      summary: { type: 'string', description: 'One short factual sentence for the family, e.g. "Mom said 2 pills at 8; the doctor\'s note says 1 pill at 16:00"' },
      quote: { type: 'string' },
    }, required: ['severity', 'category', 'summary', 'quote'] } },
  { type: 'function', name: 'im_ok', description: 'During a fall check only: Mom says she is fine.',
    parameters: { type: 'object', properties: { quote: { type: 'string' } }, required: ['quote'] } },
  { type: 'function', name: 'no_action', description: 'Nothing to do: chit-chat, TV/radio, other people\'s tasks, unclear speech.',
    parameters: { type: 'object', properties: {} } },
];

const SYSTEM = `You listen to an older adult (Mom) at home through a wristband microphone. You never talk to her; you only call tools.
Only act on what she clearly said. Every action must include the exact quote (copied words) from the utterance.
confirm_task: match by meaning against the open tasks; prefer the task being awaited.
  confirmed = explicit statement it is done ("took it", "done", "had my pill", "yes dear, took it").
  likely = indirect sign it is done ("these pills are bitter", "okay, with water").
  denied = "not yet", "I forgot", "later", "in a minute".
add_task: only when she states a time or a date for HER OWN task. Resolve weekdays from today's date. Ignore TV, radio,
  the news, and other people's plans ("Priya has a meeting at 3"). Daily only if she says every day / each morning etc.
Contradiction: if a medicine she mentions matches a doctor's-note medicine by name but the time or dose differs,
  call flag_concern with category "confusion" and a summary "Mom said X; the doctor's note says Y" instead of add_task.
flag_concern: sadness or loneliness = mood/info or warn; forgetting things or being confused = confusion; new symptoms = health.
im_ok: only when a fall check is in progress and she says she is fine.
Several actions are allowed ("I took my pill and I'm seeing Dr. Lee Friday at 2" = confirm_task + add_task).
Never give medical advice. If nothing applies, call no_action.`;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

function buildInput(text: string, ctx: UnderstandCtx) {
  const today = new Date(ctx.now);
  return JSON.stringify({
    now: `${today.toLocaleDateString('en-US', { weekday: 'long' })} ${ymd(today)} ${hm(ctx.now)}`,
    person: ctx.person.name,
    awaiting: ctx.awaiting,
    openTasks: ctx.openTasks.map((t) => ({ id: t.id, title: t.title, kind: t.kind, due: hm(t.dueAt), status: t.status })),
    doctorsNoteMeds: ctx.approvedMeds.map((m) => ({ title: m.title, dose: m.dose, times: m.times })),
    recent: ctx.recent.slice(-10).map((r) => r.text),
    utterance: text,
  });
}

/** Turn the model's tool calls into checked Actions. */
export function checkActions(raw: { name: string; args: any }[], text: string, ctx: UnderstandCtx) {
  const actions: Action[] = [];
  const dropped: { name: string; reason: string }[] = [];
  const said = norm(text);
  const grounded = (q: unknown) => {
    const n = norm(String(q ?? ''));
    return n && said.includes(n) ? String(q).trim() : text.trim();     // ungrounded quote -> the whole utterance
  };
  for (const { name, args = {} } of raw) {
    if (name === 'no_action') continue;
    if (name === 'add_task') {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(args.due_time ?? '').trim());
      if (!m) { dropped.push({ name, reason: `no valid time (${args.due_time})` }); continue; }
      const hh = +m[1], mm = +m[2];
      if (hh > 23 || mm > 59) { dropped.push({ name, reason: `bad time ${args.due_time}` }); continue; }
      let day = new Date(ctx.now);
      if (args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date)) { const [y, mo, d] = args.date.split('-').map(Number); day = new Date(y, mo - 1, d); }
      const dueAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm).getTime();
      const title = String(args.title ?? '').trim() || 'Task';
      const kind = ['med', 'appointment', 'call', 'chore'].includes(args.kind) ? args.kind : 'chore';
      const due_time = `${pad(hh)}:${pad(mm)}`;
      // contradiction with the doctor's note (checked in code too, not only by the prompt)
      const med = kind === 'med' && ctx.approvedMeds.find((x) => x.kind === 'med' && sameMed(x.title, title));
      if (med && med.times?.length && !med.times.includes(due_time)) {
        actions.push({ name: 'flag_concern', args: { severity: 'warn', category: 'confusion', quote: grounded(args.quote),
          summary: `Mom said ${title} at ${due_time}; the doctor's note says ${med.times.join(', ')}${med.dose ? ` (${med.dose})` : ''}` } });
        continue;
      }
      actions.push({ name, args: { title, kind, due_time, ...(args.date ? { date: args.date } : {}),
        recurrence: args.recurrence === 'daily' ? 'daily' : 'none', quote: grounded(args.quote), dueAt } });
    } else if (name === 'confirm_task') {
      let id = String(args.task_id ?? '');
      if (!ctx.openTasks.some((t) => t.id === id)) {
        if (ctx.awaiting?.kind === 'confirm') id = ctx.awaiting.taskId;
        else { dropped.push({ name, reason: `unknown task ${args.task_id}` }); continue; }
      }
      const level = ['confirmed', 'likely', 'denied'].includes(args.level) ? args.level : 'likely';
      actions.push({ name, args: { task_id: id, level, quote: grounded(args.quote) } });
    } else if (name === 'flag_concern') {
      const severity = ['info', 'warn', 'urgent'].includes(args.severity) ? args.severity : 'info';
      const category = ['health', 'mood', 'confusion', 'safety', 'scam'].includes(args.category) ? args.category : 'health';
      actions.push({ name, args: { severity, category, summary: String(args.summary ?? '').slice(0, 200) || text, quote: grounded(args.quote) } });
    } else if (name === 'im_ok') {
      if (ctx.awaiting?.kind !== 'fall_check') { dropped.push({ name, reason: 'not in a fall check' }); continue; }
      actions.push({ name, args: { quote: grounded(args.quote) } });
    } else dropped.push({ name, reason: 'unknown tool' });
  }
  // de-duplicate
  const seen = new Set<string>();
  const unique = actions.filter((a) => { const k = `${a.name}:${JSON.stringify({ ...a.args, quote: '' })}`; return seen.has(k) ? false : (seen.add(k), true); });
  return { actions: unique.length ? unique : [{ name: 'no_action', args: {} } as Action], dropped };
}

function sameMed(a: string, b: string) {
  const words = (s: string) => norm(s).split(' ').filter((w) => w.length > 3 && !['pill', 'pills', 'tablet', 'medicine', 'take', 'morning', 'evening'].includes(w));
  const wa = words(a), wb = words(b);
  return wa.some((w) => wb.includes(w));
}

/** The hub's own voice coming back through the band mic? (the speaker is in the same room) */
function isEcho(text: string, ctx: UnderstandCtx) {
  if (!ctx.lastSpoken || ctx.now - ctx.lastSpoken.t > 15000) return false;
  const a = new Set(norm(text).split(' ')), b = norm(ctx.lastSpoken.text).split(' ');
  const overlap = b.filter((w) => a.has(w)).length / Math.max(1, Math.min(a.size, b.length));
  return overlap >= 0.7;
}

/** One utterance -> actions, no queueing (used by evals and by understand()). */
export async function understandOnce(utterance: { text: string; t: number }, ctx: UnderstandCtx, model = MODELS.fast): Promise<UnderstandResult> {
  const text = utterance.text.trim();
  const base = { text, dropped: [] as { name: string; reason: string }[] };
  if (!text) return { ...base, actions: [{ name: 'no_action', args: {} }], latencyMs: 0, model: 'none', source: 'model' };
  const g = guardrails(text);
  if (g.length) return { ...base, actions: g, latencyMs: 0, model: 'guardrail', source: 'guardrail' };
  if (isEcho(text, ctx)) return { ...base, actions: [{ name: 'no_action', args: {} }], latencyMs: 0, model: 'echo', source: 'echo' };
  const fast = await confirmFastPath(text, ctx);
  if (fast) return { ...base, ...fast };
  const t0 = Date.now();
  try {
    const res: any = await withTimeout(ai().interactions.create({
      model,
      system_instruction: SYSTEM,
      input: buildInput(text, ctx),
      tools: TOOLS,
      generation_config: { thinking_level: 'low', tool_choice: 'any' },
      store: false,
    } as any), TIMEOUT_MS, model);
    const latencyMs = Date.now() - t0;
    const calls = (res.steps ?? []).filter((s: any) => s.type === 'function_call').map((s: any) => ({ name: s.name, args: s.arguments ?? {} }));
    const { actions, dropped } = checkActions(calls, text, ctx);
    return { text, actions, dropped, latencyMs, model, source: 'model' };
  } catch (e) {
    console.warn(`[understand] ${model} failed: ${errMsg(e)}`);
    return { ...base, actions: [{ name: 'no_action', args: {} }], latencyMs: Date.now() - t0, model, source: 'fallback' };
  }
}

// ---------------------------------------------------------------- Decision 1 fast path (awaiting a confirmation)
const FAST_MAX_WORDS = 10;
const HAS_TIME = /\b(\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|evening|tonight|appointment|doctor|dr)\b/i;
/**
 * While a reminder waits for an answer, a short reply ("Yes dear, took it", "not yet") is a closed choice: Gemini
 * Decision 1 answers it in ~0.4 s with a calibrated confidence. Long replies, or ones that mention a time/day/doctor
 * (maybe a new task too), and anything below 0.8 confidence go to Hydrogen.
 */
async function confirmFastPath(text: string, ctx: UnderstandCtx): Promise<Omit<UnderstandResult, 'text' | 'dropped'> | null> {
  if (process.env.UNDERSTAND_FAST_PATH === 'off' || ctx.awaiting?.kind !== 'confirm') return null;
  if (text.split(/\s+/).length > FAST_MAX_WORDS || HAS_TIME.test(text)) return null;
  const task = ctx.openTasks.find((t) => t.id === (ctx.awaiting as { taskId: string }).taskId);
  if (!task) return null;
  const t0 = Date.now();
  try {
    const res: any = await withTimeout(aiBeta().decisions.create({
      model: MODELS.decision,
      input: `An older adult was just reminded: "it's time for your ${task.title}". She replied: "${text}"`,
      questions: { reply: { type: 'choice', instructions: 'What does her reply mean about this task?', criteria: {
        confirmed: 'She clearly says it is done (took it, done, had it, yes I did).',
        denied: 'Not done yet: not yet, later, I forgot, in a minute, no.',
        likely: 'Indirect sign it is done or being done (these pills are bitter, okay with water).',
        other: 'About something else, unclear, or more than an answer about this task.',
      } } },
    } as any), 2500, 'decision');
    const a = res?.answers?.reply;
    if (!a || a.choice === 'other' || (a.confidence ?? 0) < 0.8) return null;
    return { actions: [{ name: 'confirm_task', args: { task_id: task.id, level: a.choice, quote: text } }],
      latencyMs: Date.now() - t0, model: MODELS.decision, source: 'model' };
  } catch (e) {
    console.warn(`[understand] fast path skipped: ${errMsg(e)}`);
    return null;
  }
}

// ---------------------------------------------------------------- queue: merge close finals, one call in flight
type Waiter = { resolve: (r: UnderstandResult) => void };
let batch: { texts: string[]; t: number; ctx: UnderstandCtx; waiters: Waiter[]; timer: ReturnType<typeof setTimeout> } | null = null;
let chain: Promise<unknown> = Promise.resolve();

/**
 * Call for every FINAL utterance. Guardrail hits return at once. Otherwise finals that arrive within MERGE_MS of
 * each other are merged into one Hydrogen call ("Dr. Patel wants me on the pressure pill" + "at 4"), and only one
 * call runs at a time. The merged call's result goes to the LAST caller; earlier callers get
 * { actions: [], source: 'merged' } so nothing is applied twice.
 */
export function understand(utterance: { text: string; t: number }, ctx: UnderstandCtx): Promise<UnderstandResult> {
  const g = guardrails(utterance.text);
  if (g.length) return Promise.resolve({ text: utterance.text, actions: g, latencyMs: 0, model: 'guardrail', source: 'guardrail', dropped: [] });
  return new Promise((resolve) => {
    if (batch) { clearTimeout(batch.timer); batch.texts.push(utterance.text); batch.ctx = ctx; batch.waiters.push({ resolve }); }
    else batch = { texts: [utterance.text], t: utterance.t, ctx, waiters: [{ resolve }], timer: 0 as any };
    batch.timer = setTimeout(flush, MERGE_MS);
  });
}

function flush() {
  const b = batch; batch = null;
  if (!b) return;
  const text = b.texts.join(' ');
  chain = chain.then(async () => {
    const r = await understandOnce({ text, t: b.t }, b.ctx);
    b.waiters.forEach((w, i) => w.resolve(i === b.waiters.length - 1 ? r : { ...r, actions: [], source: 'merged' }));
  });
}
