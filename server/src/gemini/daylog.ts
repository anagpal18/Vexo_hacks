// What ask() and digest() read: the day so far. Kenil builds it from the state; every item has an id to cite.
import type { Alert, Concern, Task } from '../../../shared/types.ts';
export type DayLog = {
  person: { name: string; relation: string };
  now: number;
  tasks: Task[]; concerns: Concern[]; alerts: Alert[];
  activity: { steps: number; state: 'still' | 'walk' | 'run' };
  utterances: { id: string; t: number; text: string }[];
};
