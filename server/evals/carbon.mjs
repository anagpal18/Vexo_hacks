// Carbon checks (Shresth): node evals/carbon.mjs   — document extraction on 3 fake notes, ask(), digest().
// Prints PASS/MISS per check: "never invent a dose or time", grounded citations, <= 120-word digest.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOW, TASKS } from './ctx.mjs';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of [join(here, '../.env'), join(here, '../../.env'), join(here, '../../../.env')]) {
  if (process.env.GEMINI_API_KEY || !existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0 && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1).trim(); }
}
const { extractDocument, ask, digest, NOT_IN_LOG } = await import('../src/gemini/index.ts');

let pass = 0, total = 0;
const check = (ok, what) => { total++; if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'MISS'}  ${what}`); };
const find = (items, re) => items.find((x) => re.test(x.title) || re.test(x.sourceLine));
const nextWeekday = (wd) => { const d = new Date(NOW); d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7 || 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const out = {};

const docs = [
  ['note1-demo.jpg', (it) => {
    const a = find(it, /amlodipine/i), ins = find(it, /insulin/i), fu = find(it, /checkup|follow/i);
    check(a?.dose?.replace(/\s/g, '') === '5mg' && a?.times?.join() === '16:00', 'amlodipine 5 mg at 16:00');
    check(/10\s*units/i.test(ins?.dose ?? '') && ins?.times?.join() === '19:00', 'insulin 10 units at 19:00');
    check(fu?.date === nextWeekday(4) && fu?.times?.join() === '10:00', `follow-up on Thursday ${nextWeekday(4)} at 10:00`);
    check(it.some((x) => x.kind === 'instruction' && /salt/i.test(x.sourceLine)), 'low-salt instruction');
  }],
  ['note2-no-times.jpg', (it) => {
    const m = find(it, /metformin/i), s = find(it, /atorvastatin/i), eye = find(it, /eye/i);
    check(/500\s*mg/i.test(m?.dose ?? '') && !m?.times?.length, 'metformin 500 mg, NO invented times ("with meals")');
    check(/20\s*mg/i.test(s?.dose ?? '') && !s?.times?.length, 'atorvastatin 20 mg, NO invented time ("at bedtime")');
    check(/-12-03$/.test(eye?.date ?? '') && eye?.times?.join() === '14:30', 'eye clinic Dec 3 at 14:30');
  }],
  ['note3-photo.jpg', (it) => {
    const l = find(it, /lisinopril/i), bt = find(it, /blood test/i);
    check(!!l && !l.dose && !l.times?.length, 'lisinopril: NO invented dose or time (photo)');
    check(bt?.date === nextWeekday(1) && bt?.times?.join() === '09:15', `blood test Monday ${nextWeekday(1)} at 09:15`);
  }],
];
for (const [file, test] of docs) {
  const r = await extractDocument({ data: readFileSync(join(here, 'notes', file)), mimeType: 'image/jpeg', filename: file }, NOW);
  console.log(`\n${file}: ${r.items.length} items · ${r.model} ${(r.latencyMs / 1000).toFixed(1)} s + Decision 1 check ${(r.verifyMs / 1000).toFixed(1)} s`);
  for (const x of r.items) console.log(`    [${x.kind}] ${x.title} | ${x.dose ?? '-'} | ${x.times?.join(',') ?? '-'} | ${x.date ?? '-'} | conf ${x.confidence} | line ${x.checks?.line?.toFixed?.(2) ?? '-'} detail ${x.checks?.detail?.toFixed?.(2) ?? '-'}`);
  test(r.items);
  out[file] = r;
}

const log = {
  person: { name: 'Asha', relation: 'Mom' }, now: NOW,
  tasks: TASKS.map((t) => t.id === 't_bp' ? { ...t, status: 'confirmed', confirmQuote: 'Yes dear, took it.' } : t.id === 't_insulin' ? { ...t, status: 'missed', attempts: 2 } : t),
  concerns: [{ id: 'c1', t: NOW - 3600e3, severity: 'info', category: 'mood', summary: 'Mom said she felt a bit lonely', quote: 'It is quiet without the kids around.' }],
  alerts: [{ id: 'a1', t: NOW, severity: 'warn', title: "Mom hasn't confirmed her 7 PM insulin", body: '', channels: ['imessage', 'email'] }],
  activity: { steps: 2400, state: 'still' },
  utterances: [{ id: 'u1', t: NOW - 7200e3, text: 'Back from my walk! The roses are blooming.' }, { id: 'u2', t: NOW - 600e3, text: 'Yes dear, took it.' }],
};
console.log('\nask():');
const a1 = await ask('Did she take her blood pressure pill?', log);
console.log(`    "${a1.answer}" ${JSON.stringify(a1.citations)} · ${a1.model} ${(a1.latencyMs / 1000).toFixed(1)} s`);
check(a1.citations.includes('t_bp') || a1.citations.includes('u2'), 'BP pill answer cites the task or her words');
const a2 = await ask('Did she eat lunch?', log);
console.log(`    "${a2.answer}" ${JSON.stringify(a2.citations)}`);
check(a2.answer === NOT_IN_LOG, 'not in the log -> "I didn\'t hear anything about that today."');
const a3 = await ask('How was her day?', log);
console.log(`    "${a3.answer}" ${JSON.stringify(a3.citations)}`);
check(a3.citations.length > 0 && a3.answer.split(/[.!?]+\s/).length <= 4, 'day summary: cited, <= 3 sentences');

console.log('\ndigest():');
const d = await digest(log);
console.log(d.text.split('\n').map((l) => '    ' + l).join('\n') + `\n    (${d.text.split(/\s+/).length} words · ${d.model} ${(d.latencyMs / 1000).toFixed(1)} s)`);
check(d.text.split(/\s+/).length <= 120 && /insulin/i.test(d.text), 'digest <= 120 words and mentions the missed insulin');

console.log(`\nCarbon checks: ${pass}/${total}`);
writeFileSync(join(here, 'results-carbon.json'), JSON.stringify({ pass, total, at: new Date().toISOString(), docs: out, ask: [a1, a2, a3], digest: d }, null, 2));
