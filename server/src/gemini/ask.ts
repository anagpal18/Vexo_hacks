// ask(): "Ask about Mom" on Gemini 4 Carbon, answered ONLY from today's log, with citations (Shresth).
// Citations are checked in code against the log's ids; an answer with no valid citation becomes
// "I didn't hear anything about that today." so the model can never answer from imagination.
import { ai, deepCall, errMsg } from './client.ts';
import { dayLogForModel, logIds, type DayLog } from './daylog.ts';

export const NOT_IN_LOG = "I didn't hear anything about that today.";

const SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'At most 3 short sentences, warm and factual' },
    citations: { type: 'array', items: { type: 'string' }, description: 'ids of the log entries the answer uses' },
  },
  required: ['answer', 'citations'],
};

const SYSTEM = `You answer a family member's question about their parent's day, using ONLY the day log you are given.
At most 3 short sentences, warm and factual. Quote her own words when they help. Cite the ids of every log entry you used.
If the log does not contain the answer, reply exactly "${NOT_IN_LOG}" with no citations.
No medical advice. Do not guess feelings beyond what she said.`;

const sentences = (s: string, n: number) => (s.match(/[^.!?]+[.!?]+["']?|\S[^.!?]*$/g) ?? [s]).slice(0, n).join(' ').trim();

export async function ask(question: string, log: DayLog): Promise<{ answer: string; citations: string[]; model: string; latencyMs: number }> {
  const t0 = Date.now();
  try {
    const { value, model } = await deepCall(async (m) => {
      const res: any = await ai().interactions.create({
        model: m,
        system_instruction: SYSTEM,
        input: JSON.stringify({ question, dayLog: dayLogForModel(log) }),
        response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
        generation_config: { thinking_level: 'low' },
        store: false,
      } as any);
      return JSON.parse(res.output_text ?? '{}');
    });
    const ids = logIds(log);
    const citations = [...new Set((value.citations ?? []).map(String))].filter((c) => ids.has(c));
    const answer = citations.length ? sentences(String(value.answer ?? ''), 3) : NOT_IN_LOG;
    return { answer, citations, model, latencyMs: Date.now() - t0 };
  } catch (e) {
    console.warn(`[ask] failed: ${errMsg(e)}`);
    return { answer: 'Sorry, I could not check the day log just now.', citations: [], model: 'none', latencyMs: Date.now() - t0 };
  }
}
