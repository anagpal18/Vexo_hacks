// Evals for understand() (Shresth): node evals/run.mjs [--model gemini-4-carbon] [--extra] [--all]
// Scores tool NAME + key ARGS (not quote wording). Prints "Hydrogen: 18/20 correct · median 1.8 s" and the misses,
// and writes evals/results-<model>.json for the slide. Reads GEMINI_API_KEY from the env or ../../.env files.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ctx as baseCtx, NOW } from './ctx.mjs';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of [join(here, '../.env'), join(here, '../../.env'), join(here, '../../../.env')]) {
  if (process.env.GEMINI_API_KEY || !existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const i = line.indexOf('='); if (i < 1) continue;
    const k = line.slice(0, i).trim(); if (!process.env[k]) process.env[k] = line.slice(i + 1).trim();
  }
}
const { understandOnce } = await import('../src/gemini/understand.ts');

const args = process.argv.slice(2);
const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : (process.env.GEMINI_FAST || 'gemini-4-hydrogen');
const files = args.includes('--all') ? ['cases.jsonl', 'cases-extra.jsonl'] : args.includes('--extra') ? ['cases-extra.jsonl'] : ['cases.jsonl'];
const cases = files.flatMap((f) => readFileSync(join(here, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));

function argMatch(want, got) {
  for (const [k, v] of Object.entries(want)) {
    if (k === 'weekday') { const d = new Date(got.dueAt); if (d.getDay() !== v || got.dueAt <= NOW) return false; continue; }
    if (k === 'monthDay') { const d = new Date(got.dueAt); if (`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` !== v) return false; continue; }
    if (got[k] !== v) return false;
  }
  return true;
}
function score(c, actions) {
  const gotNames = new Set(actions.map((a) => a.name)), wantNames = new Set(c.expect.map((e) => e.name));
  if (gotNames.size !== wantNames.size || [...wantNames].some((n) => !gotNames.has(n))) return false;
  return c.expect.every((e) => !e.args || actions.some((a) => a.name === e.name && argMatch(e.args, a.args)));
}

async function runCase(c) {
  const o = { ...(c.ctx ?? {}) };
  if (o.lastSpoken) o.lastSpoken = { t: NOW + (o.lastSpoken.offsetMs ?? 0), text: o.lastSpoken.text };
  const r = await understandOnce({ text: c.text, t: NOW }, baseCtx(o), model);
  return { id: c.id, text: c.text, pass: score(c, r.actions), latencyMs: r.latencyMs, source: r.source, model: r.model,
    got: r.actions.map((a) => ({ name: a.name, ...a.args, quote: undefined, dueAt: undefined })), want: c.expect };
}

// 4 at a time
const results = [];
for (let i = 0; i < cases.length; i += 4) results.push(...await Promise.all(cases.slice(i, i + 4).map(runCase)));

const pass = results.filter((r) => r.pass).length;
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const modelTimes = results.filter((r) => r.source === 'model' && r.model === model).map((r) => r.latencyMs);
const median = med(modelTimes);
const fast = results.filter((r) => r.model === 'gemini-decision-1').map((r) => r.latencyMs);
const guard = results.filter((r) => r.source === 'guardrail' || r.source === 'echo').length;
const pretty = (m) => m.replace('gemini-4-', '').replace(/^./, (c) => c.toUpperCase());
const name = pretty(model);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'MISS'}  ${r.id.padEnd(14)} ${String(r.latencyMs).padStart(5)} ms  ${r.source.padEnd(9)} ${r.pass ? '' : `"${r.text}"\n        got  ${JSON.stringify(r.got)}\n        want ${JSON.stringify(r.want)}`}`);
console.log(`\n${name}: ${pass}/${results.length} correct · ${name} median ${(median / 1000).toFixed(1)} s (${modelTimes.length} calls)`
  + (fast.length ? ` · Decision 1 fast path median ${(med(fast) / 1000).toFixed(2)} s (${fast.length} confirmations)` : '')
  + ` · ${guard} instant (guardrails / echo)`);
writeFileSync(join(here, `results-${model}.json`), JSON.stringify({ model, pass, total: results.length, medianMs: median, fastPathMedianMs: med(fast), instant: guard, at: new Date().toISOString(), results }, null, 2));
