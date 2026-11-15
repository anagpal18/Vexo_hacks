// extractDocument(): Gemini 4 Carbon reads a doctor's note (photo or PDF) into reminders-to-approve (Shresth).
// Then Gemini Decision 1 VERIFIES every item against the same image: is the source line really on the note, and are
// the dose and times really written there? Unverified doses/times are removed ("never invent a dose"), and the
// item's confidence becomes the lowest of Carbon's own score and the calibrated checks. Nothing becomes a reminder
// until the family approves it (Kenil's document-intake workflow).
import type { ExtractedItem } from '../../../shared/types.ts';
import { ai, aiBeta, deepCall, errMsg, MODELS } from './client.ts';

export type ItemDraft = Omit<ExtractedItem, 'id' | 'decision'> & { checks?: { line: number | null; detail: number | null } };

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['med', 'appointment', 'instruction'] },
          title: { type: 'string', description: 'Medicine name (+ what it is for if written), appointment, or a short instruction' },
          dose: { type: ['string', 'null'], description: 'Exactly as written, e.g. "5 mg", "10 units". null if not written.' },
          times: { type: 'array', items: { type: 'string' }, description: 'HH:MM 24-hour times written on the note. [] if none written.' },
          date: { type: ['string', 'null'], description: 'YYYY-MM-DD for appointments, if written. null otherwise.' },
          sourceLine: { type: 'string', description: 'The exact line copied from the note' },
          confidence: { type: 'number', description: '0 to 1: how sure you are this item is read correctly' },
        },
        required: ['kind', 'title', 'dose', 'times', 'date', 'sourceLine', 'confidence'],
      },
    },
  },
  required: ['items'],
};

const PROMPT = (today: string) => `This is a doctor's note or discharge summary for an older adult. Today is ${today}.
Extract every:
- medicine: name, dose exactly as written, and the times it must be taken as 24-hour HH:MM ("4 PM" = "16:00";
  "morning" or "with meals" are NOT times: leave times empty and keep the wording in sourceLine)
- appointment: what, date (YYYY-MM-DD, resolve weekdays from today) and time
- instruction: diet, activity, warning signs to watch for
Rules: sourceLine = the exact line from the note. NEVER invent a dose, time or date: if it is not written, leave it
null/empty. Confidence below 0.6 if the handwriting or photo is hard to read. No medical advice.`;

const pad = (n: number) => String(n).padStart(2, '0');

export async function extractDocument(file: { data: Buffer | Uint8Array; mimeType: string; filename?: string }, now = Date.now()):
  Promise<{ items: ItemDraft[]; model: string; latencyMs: number; verifyMs: number }> {
  const b64 = Buffer.from(file.data).toString('base64');
  const block = file.mimeType === 'application/pdf'
    ? { type: 'document', data: b64, mime_type: 'application/pdf' }
    : { type: 'image', data: b64, mime_type: file.mimeType };
  const d = new Date(now);
  const today = `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const t0 = Date.now();
  const { value: raw, model } = await deepCall(async (m) => {
    const res: any = await ai().interactions.create({
      model: m,
      input: [{ type: 'user_input', content: [block, { type: 'text', text: PROMPT(today) }] }],   // v1: content goes inside a step
      response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
      store: false,
    } as any);
    return JSON.parse(res.output_text ?? '{"items":[]}').items as any[];
  }, 60000);
  const latencyMs = Date.now() - t0;
  let items: ItemDraft[] = (raw ?? []).map((x) => ({
    kind: ['med', 'appointment', 'instruction'].includes(x.kind) ? x.kind : 'instruction',
    title: String(x.title ?? '').trim(),
    ...(x.dose ? { dose: String(x.dose) } : {}),
    ...(Array.isArray(x.times) && x.times.length ? { times: x.times.filter((t: string) => /^\d{2}:\d{2}$/.test(t)) } : {}),
    ...(x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? { date: x.date } : {}),
    sourceLine: String(x.sourceLine ?? '').trim(),
    confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0.5)),
  })).filter((x) => x.title && x.sourceLine);

  const v0 = Date.now();
  items = await verify(block, items);
  return { items, model, latencyMs, verifyMs: Date.now() - v0 };
}

/** Decision 1: one call, two yes/no questions per item, over the same image. */
async function verify(block: any, items: ItemDraft[]): Promise<ItemDraft[]> {
  if (!items.length) return items;
  const questions: Record<string, any> = {};
  items.forEach((it, i) => {
    questions[`line_${i}`] = { type: 'noul', instructions: `Does the note contain this line, or nearly the same words: "${it.sourceLine}"?` };
    if (it.dose || it.times?.length || it.date) {
      const ampm = (t: string) => { const [h, m] = t.split(':').map(Number); return `${t} (${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'})`; };
      const day = (d: string) => { const [y, mo, dd] = d.split('-').map(Number); const x = new Date(y, mo - 1, dd);
        return `${x.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} (it may be written only as a weekday such as "${x.toLocaleDateString('en-US', { weekday: 'long' })}" or "next ${x.toLocaleDateString('en-US', { weekday: 'long' })}", or as a date)`; };
      const parts = [it.dose && `the dose ${it.dose}`, it.times?.length && `the time(s) ${it.times.map(ampm).join(', ')}`, it.date && `the day ${day(it.date)}`].filter(Boolean).join(' and ');
      questions[`detail_${i}`] = { type: 'noul', instructions: `Does the note explicitly state ${parts} for "${it.title}"? Answer no if any of it is not written on the note.` };
    }
  });
  try {
    const res: any = await aiBeta().decisions.create({
      model: MODELS.decision,
      input: [block, { type: 'text', text: 'A doctor\'s note. Check what is written on it.' }],
      questions,
    } as any);
    return items.map((it, i) => {
      const line = res.answers?.[`line_${i}`]?.noul ?? null;
      const detail = res.answers?.[`detail_${i}`]?.noul ?? null;
      const out: ItemDraft = { ...it, checks: { line, detail } };
      if (detail !== null && detail < 0.35) { delete out.dose; delete out.times; delete out.date; }   // not on the note: never keep it
      out.confidence = +Math.min(it.confidence, line ?? 1, detail ?? 1).toFixed(2);
      return out;
    });
  } catch (e) {
    console.warn(`[extractDocument] verification skipped: ${errMsg(e)}`);
    return items.map((it) => ({ ...it, confidence: Math.min(it.confidence, 0.59) }));   // unverified -> amber
  }
}
