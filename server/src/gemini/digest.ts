// digest(): the evening email to the family on Gemini 4 Carbon, at most 120 words (Shresth).
// Falls back to a plain template built from the log if the model fails, so the button always works.
import { ai, deepCall, errMsg } from './client.ts';
import { dayLogForModel, type DayLog } from './daylog.ts';

const SYSTEM = `Write a short evening update email body for the family about their parent's day, from the day log only.
At most 120 words. Plain text, no greeting line, no signature. Include:
- how she seemed, with 1-2 short quotes of her own words
- done (✓) and missed (✗) tasks
- activity (about how many steps)
- anything to follow up, and one gentle suggestion (for example "maybe call about the missed insulin")
No alarmism. No medical advice.`;

const words = (s: string) => s.trim().split(/\s+/);
function cap(text: string, max = 120) {
  if (words(text).length <= max) return text.trim();
  const cut = words(text).slice(0, max).join(' ');
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return (end > 40 ? cut.slice(0, end + 1) : cut + '…').trim();
}

export function templateDigest(log: DayLog) {
  const done = log.tasks.filter((t) => t.status === 'confirmed' || t.status === 'likely').map((t) => `✓ ${t.title}`);
  const missed = log.tasks.filter((t) => t.status === 'missed').map((t) => `✗ ${t.title}`);
  const quote = log.utterances.at(-1)?.text;
  return cap([`${log.person.name} had about ${log.activity.steps.toLocaleString()} steps today.`,
    ...done, ...missed, quote ? `Last thing she said: "${quote}"` : '',
    missed.length ? `Maybe give her a call about ${missed.length === 1 ? 'the missed ' + log.tasks.find((t) => t.status === 'missed')!.title.toLowerCase() : 'the missed tasks'}.` : ''].filter(Boolean).join('\n'));
}

export async function digest(log: DayLog): Promise<{ text: string; model: string; latencyMs: number }> {
  const t0 = Date.now();
  try {
    const { value, model } = await deepCall(async (m) => {
      const res: any = await ai().interactions.create({
        model: m, system_instruction: SYSTEM, input: JSON.stringify(dayLogForModel(log)),
        generation_config: { thinking_level: 'low' }, store: false,
      } as any);
      return String(res.output_text ?? '').trim();
    });
    if (!value) throw new Error('empty digest');
    return { text: cap(value), model, latencyMs: Date.now() - t0 };
  } catch (e) {
    console.warn(`[digest] model failed, using the template: ${errMsg(e)}`);
    return { text: templateDigest(log), model: 'template', latencyMs: Date.now() - t0 };
  }
}
