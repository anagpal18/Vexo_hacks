import type { DayLog } from './daylog.ts';
/** PLACEHOLDER (real Carbon version lands next). */
export async function digest(log: DayLog) { return { text: `${log.person.name}'s day: ${log.tasks.filter((t) => t.status === 'confirmed').length} tasks done.`, model: 'placeholder', latencyMs: 0 }; }
