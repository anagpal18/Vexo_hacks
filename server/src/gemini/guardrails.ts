// Hard guardrails (Shresth): regexes that never wait for a model. An urgent line goes straight to the family.
// Each rule has exceptions for everyday speech ("I fell asleep", "help me find my glasses").
import type { Action, ConcernCategory } from './types.ts';

type Rule = { re: RegExp; severity: 'warn' | 'urgent'; category: ConcernCategory; summary: string };

const RULES: Rule[] = [
  { re: /\bchest (pain|hurts?|is (so )?tight|feels tight|tightness)\b|\bmy chest\b.{0,20}\b(hurts?|pain|tight)\b/i,
    severity: 'urgent', category: 'health', summary: 'Mom reports chest pain or tightness' },
  { re: /\b(can'?t|cannot|can not) breathe\b|\bhard to breathe\b|\bstruggling to breathe\b/i,
    severity: 'urgent', category: 'health', summary: 'Mom says she cannot breathe' },
  { re: /\bi(?:'ve| have)? fallen\b(?! asleep)|\bi fell\b(?! asleep| for\b| behind\b| in love\b)(?!.{0,15}\basleep\b)/i,
    severity: 'urgent', category: 'safety', summary: 'Mom says she fell' },
  { re: /\b(help me|somebody help|someone help|please help)\b(?!\s+(?:me\s+|you\s+|us\s+)?(?:find|with|get|look|remember|cook|open|set|pick|carry|choose|decide|understand|make|call|reach|fix|turn|plug|read|write|use|work|out))/i,
    severity: 'urgent', category: 'safety', summary: 'Mom is calling for help' },
  { re: /\b(can'?t|cannot) get up\b|\bhelp me (get )?up\b|\b(on|off) the floor\b.{0,25}\b(can'?t|help|stuck)\b|\bstuck on the floor\b/i,
    severity: 'urgent', category: 'safety', summary: 'Mom may be on the floor and unable to get up' },
  { re: /\bcall (911|nine one one|an ambulance)\b/i, severity: 'urgent', category: 'safety', summary: 'Mom asked for 911 / an ambulance' },
  { re: /\b(having a stroke|i think it'?s a stroke|my face (is )?(drooping|numb)|can'?t (move|feel) my (arm|leg|face))\b/i,
    severity: 'urgent', category: 'health', summary: 'Mom describes stroke signs' },
  { re: /\b(i'?m|it'?s|i am) bleeding\b|\bwon'?t stop bleeding\b|\bblood everywhere\b/i,
    severity: 'urgent', category: 'health', summary: 'Mom reports bleeding' },
  { re: /\bgift ?cards?\b|\bsocial security number\b|\bwire (the |some )?money\b|\bbank (account )?details\b|\bwarrant for (your|my) arrest\b|\bmy (bank )?pin\b/i,
    severity: 'warn', category: 'scam', summary: 'Possible scam: Mom mentions gift cards / money transfers / personal details' },
];

/** Guardrail actions for this utterance ([] = none). Pure and instant. */
export function guardrails(text: string): Action[] {
  const out: Action[] = [];
  const seen = new Set<string>();
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m || seen.has(r.summary)) continue;
    seen.add(r.summary);
    out.push({ name: 'flag_concern', args: { severity: r.severity, category: r.category, summary: r.summary, quote: text.trim() } });
  }
  return out;
}
