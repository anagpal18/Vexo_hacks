# Gemini harness (Shresth) — how to use it (Kenil)

```ts
import { understand, extractDocument, ask, digest, dayLogFromSnapshot } from './gemini/index.ts';
```
Setup: `cd server/src/gemini && npm install` (its own `package.json`, so it doesn't collide with yours; `@google/genai` resolves from here).
Env: `GEMINI_API_KEY`, `GEMINI_FAST=gemini-4-hydrogen`, `GEMINI_DEEP=gemini-4-carbon` (falls back to `gemini-4-argon` on its own).
Imports use `.ts` extensions: fine with `tsx`/Node ≥ 22.6; for `tsc --noEmit` set `"allowImportingTsExtensions": true`.

## understand(utterance, ctx) → Promise<UnderstandResult>
Call it for every **final** transcript (also `/api/demo/say`). Apply `result.actions`:
- `add_task {title, kind, due_time, date?, recurrence, quote, dueAt}` → Task (`source:'voice'`, `sourceQuote: quote`). `dueAt` is already computed from `ctx.now` (demo clock).
- `confirm_task {task_id, level: confirmed|likely|denied, quote}` → resume the reminder workflow. `task_id` is always a real open task.
- `flag_concern {severity, category, summary, quote}` → Concern; `urgent` → sendAlert at once (guardrail hits come back in ~0 ms).
- `im_ok {quote}` → resume the fall workflow (only ever returned while `ctx.awaiting = {kind:'fall_check'}`).
- `no_action` → nothing.

`ctx = { now, person, openTasks, approvedMeds, recent, awaiting, lastSpoken? }`
- **Pass `lastSpoken: { t, text }` = the last line the hub spoke.** The band mic hears the hub speaker; a transcript that
  repeats it is ignored (`source:'echo'`). Without it, "Mom, it's time for your pill" comes back as Mom talking.
- `awaiting = {kind:'confirm', taskId}` while a reminder waits: short replies then go to **Gemini Decision 1** (~0.4 s);
  everything else to **Gemini 4 Hydrogen** (~1.7 s).

Finals closer than `MERGE_MS` (1.5 s) are merged into one call; only one call runs at a time. The merged call's result
goes to the **last** caller; earlier callers get `{ actions: [], source: 'merged' }`, so just apply whatever each
promise returns. `result.latencyMs` and `result.model` are for the debug panel ("Hydrogen · 1.6 s").
`understandOnce()` = the same without merging/queueing.

## extractDocument({ data, mimeType, filename }, now?) → { items, model, latencyMs, verifyMs }
Gemini 4 Carbon reads the photo/PDF (≈7–12 s), then Gemini Decision 1 checks each item against the image (≈1 s).
`items` = `ExtractedItem` without `id`/`decision` (+ `checks: {line, detail}` for the UI). Add ids, set the doc to
`review`, suspend for approval. Doses/times that are not on the note are removed; `confidence < 0.6` → show amber.

## ask(question, dayLog) → { answer, citations, model, latencyMs }
Carbon, from the day log only (≈5–7 s). Citations are real log ids (tasks, concerns, alerts, utterances); if nothing in
the log answers it, `answer === NOT_IN_LOG` ("I didn't hear anything about that today.").
`dayLogFromSnapshot(snapshot, utterances)` builds the log; keep utterances as `{ id, t, text }`.

## digest(dayLog) → { text, model, latencyMs }
Carbon, ≤ 120 words, falls back to a template if the model fails (the button always works).

## Evals
`node evals/run.mjs` (20 spec cases) · `--all` (+4 robustness cases) · `--model gemini-4-carbon` · `node evals/carbon.mjs`
(documents, ask, digest). Latest numbers: `evals/RESULTS.md`.
