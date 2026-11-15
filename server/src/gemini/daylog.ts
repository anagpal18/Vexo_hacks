// What ask() and digest() read: the day so far. Every entry has an id the model can cite (Shresth).
import type { Alert, Concern, Snapshot, Task } from '../../../shared/types.ts';

export type DayLog = {
  person: { name: string; relation: string };
  now: number;
  tasks: Task[]; concerns: Concern[]; alerts: Alert[];
  activity: { steps: number; state: 'still' | 'walk' | 'run' };
  utterances: { id: string; t: number; text: string }[];       // final transcripts, with ids
};

/** Kenil: build it from the snapshot + the utterance list you keep. */
export function dayLogFromSnapshot(s: Snapshot, utterances: { id: string; t: number; text: string }[]): DayLog {
  return { person: s.person, now: s.now, tasks: s.tasks, concerns: s.concerns, alerts: s.alerts,
    activity: { steps: s.activity.steps, state: s.activity.state }, utterances };
}

const hm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** Compact, model-friendly view: times as HH:MM, only the fields that matter. */
export function dayLogForModel(l: DayLog) {
  return {
    person: l.person, now: hm(l.now),
    tasks: l.tasks.map((t) => ({ id: t.id, title: t.title, kind: t.kind, due: hm(t.dueAt), status: t.status, source: t.source,
      ...(t.sourceQuote ? { sourceQuote: t.sourceQuote } : {}), ...(t.confirmQuote ? { confirmQuote: t.confirmQuote } : {}), attempts: t.attempts })),
    concerns: l.concerns.map((c) => ({ id: c.id, at: hm(c.t), severity: c.severity, category: c.category, summary: c.summary, ...(c.quote ? { quote: c.quote } : {}) })),
    alerts: l.alerts.map((a) => ({ id: a.id, at: hm(a.t), severity: a.severity, title: a.title })),
    activity: l.activity,
    utterances: l.utterances.map((u) => ({ id: u.id, at: hm(u.t), text: u.text })),
  };
}

export function logIds(l: DayLog) {
  return new Set<string>([...l.tasks.map((t) => t.id), ...l.concerns.map((c) => c.id), ...l.alerts.map((a) => a.id), ...l.utterances.map((u) => u.id)]);
}
