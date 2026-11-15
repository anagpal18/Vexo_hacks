// Seed context for evals (README §5): Asha (Mom), demo clock 15:50 today.
const d = new Date(); export const NOW = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 15, 50).getTime();
const at = (h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
export const TASKS = [
  { id: 't_walk', title: 'Morning walk', kind: 'chore', dueAt: at(9), recurrence: 'daily', status: 'confirmed', source: 'family', confirmQuote: 'Back from my walk!', attempts: 1, createdAt: at(8) },
  { id: 't_call', title: 'Call Priya', kind: 'call', dueAt: at(11), recurrence: 'none', status: 'confirmed', source: 'family', attempts: 1, createdAt: at(8) },
  { id: 't_bp', title: 'Blood pressure pill', kind: 'med', dueAt: at(16), recurrence: 'daily', status: 'pending', source: 'document', sourceQuote: 'Amlodipine 5 mg once daily at 4 PM', attempts: 0, createdAt: at(8) },
  { id: 't_insulin', title: 'Evening insulin', kind: 'med', dueAt: at(19), recurrence: 'daily', status: 'pending', source: 'document', attempts: 0, createdAt: at(8) },
];
export const MEDS = [
  { id: 'x1', kind: 'med', title: 'Amlodipine (blood pressure pill)', dose: '5 mg', times: ['16:00'], sourceLine: 'Amlodipine 5 mg once daily at 4 PM', confidence: 0.95 },
  { id: 'x2', kind: 'med', title: 'Insulin glargine (evening insulin)', dose: '10 units', times: ['19:00'], sourceLine: 'Insulin glargine 10 units at 7 PM', confidence: 0.92 },
];
export function ctx(over = {}) {
  return { now: NOW, person: { name: 'Asha' }, openTasks: TASKS.filter((t) => !['confirmed'].includes(t.status)), approvedMeds: MEDS,
    recent: [], awaiting: null, ...over };
}
