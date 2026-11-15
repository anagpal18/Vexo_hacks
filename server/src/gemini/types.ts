// Gemini harness types (Shresth). Kenil applies Actions; this folder never touches state or workflows.
import type { ExtractedItem, Task } from '../../../shared/types.ts';

export type ConcernCategory = 'health' | 'mood' | 'confusion' | 'safety' | 'scam';

export type Action =
  | { name: 'add_task'; args: { title: string; kind: Task['kind']; due_time: string; date?: string;
      recurrence: 'none' | 'daily'; quote: string; dueAt: number } }          // dueAt: computed from ctx.now (demo clock)
  | { name: 'confirm_task'; args: { task_id: string; level: 'confirmed' | 'likely' | 'denied'; quote: string } }
  | { name: 'flag_concern'; args: { severity: 'info' | 'warn' | 'urgent'; category: ConcernCategory; summary: string; quote: string } }
  | { name: 'im_ok'; args: { quote: string } }
  | { name: 'no_action'; args: Record<string, never> };

export type Awaiting = { kind: 'confirm'; taskId: string } | { kind: 'fall_check' } | null;

export type UnderstandCtx = {
  now: number;                                   // demo clock ms
  person: { name: string };
  openTasks: Task[];
  approvedMeds: ExtractedItem[];
  recent: { t: number; text: string }[];         // last ~10 utterances (context only)
  awaiting: Awaiting;
  lastSpoken?: { t: number; text: string };      // what the hub said last (the band mic hears the speaker)
};

export type UnderstandResult = {
  actions: Action[];
  latencyMs: number;                             // model time only (0 for guardrails)
  model: string;                                 // 'gemini-4-hydrogen' | 'guardrail' | ...
  source: 'guardrail' | 'model' | 'fallback' | 'merged' | 'echo';
  text: string;                                  // the (possibly merged) utterance that was understood
  dropped: { name: string; reason: string }[];   // model actions the code checks refused (debug panel)
};
