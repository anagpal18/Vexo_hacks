# Eval results (for the last slide)

Measured on Nov 14, ~16:15, key on a paid-tier project. Rerun: `node evals/run.mjs --all` and `node evals/carbon.mjs`.

| understand() — 20 spec cases + 4 robustness cases | correct | median latency |
|---|---|---|
| **CareLoop harness** (guardrails → Decision 1 fast path → Hydrogen) | **24/24** | Hydrogen 1.7 s · confirmations 0.38 s (Decision 1) · 5 instant (guardrails / echo) |
| Gemini 4 Hydrogen alone | 24/24 | 1.8 s |
| Gemini 4 Carbon alone | 22/24 (2 timed out at 8 s) | 4.3 s |

→ **Hydrogen: same accuracy here, ~2.4× faster than Carbon → it is the always-on model.** Carbon does the deep, rare work.

| Carbon work | result |
|---|---|
| Doctor's notes (3 fake notes: typed, no-times, photographed) | 13/13 checks: doses + times right, **no invented dose or time** (Decision 1 verifies every item against the image) |
| Ask about Mom | answers only from the day log, citations checked in code; unknown → "I didn't hear anything about that today." |
| Evening digest | ≤ 120 words, mentions the missed insulin, template fallback |

Cases: 5 add_task (one with a weekday, one daily) · 5 confirm (confirmed / likely / denied) · 3 concerns (incl. a
doctor's-note contradiction) · 2 urgent guardrails · 2 scam · 3 no_action traps (TV, someone else's task, chit-chat)
+ robustness: "I fell asleep", "help me find my glasses", the hub's own reminder heard back, a two-action sentence.
