---
name: weekly-review
description: >-
  Run the weekly pi-retro review: aggregate friction ledgers, evaluate active
  trials, optionally research trends, and write a dated adopt/evaluate/reject
  report for owner approval. Load only when explicitly asked to run the
  weekly review or retro (e.g. via the /retro command).
disable-model-invocation: true
---

# Weekly review (pi-retro)

The review PROPOSES; the owner approves before any setup change. Never
auto-apply. Manual by design — schedule-based automation has failed before;
run when asked, or ~7 days after the previous report.

1. **Collect** — call `friction_stats` (both scopes). Then read the tail of
   each ledger file directly for the unresolved entries' wording, plus any
   dated archive from the last week if the owner asks for history.
2. **Trials** — if a trials registry exists (convention:
   `~/.pi/agent/meta/extension-trials.md`), evaluate every ACTIVE trial
   against its pre-registered success criteria; run its Verify commands where
   possible; record KEEP / REMOVE / EXTEND per trial. This is the positive
   signal — friction is the negative one.
3. **Trends** (optional) — web-research current practice for the top friction
   areas; generic public-knowledge queries only, never ledger content.
4. **Write a dated report** to the reviews directory (convention:
   `~/.pi/agent/meta/weekly-reviews/YYYY-MM-DD.md`) with three buckets:
   - `adopt` — clear win; propose the specific change
   - `evaluate` — promising; propose a trial with pre-registered success criteria
   - `reject` — not worth it, WITH the reason (future suggestions bounce
     against recorded rejections)
   Include per-trial verdicts and the top recurring friction with counts.
5. **Propose** — return the report and the proposed changes; wait for
   approval.

## After approval

- Apply approved `adopt` items. Global setup changes under `~/.pi/agent/` go
  in directly; project changes go through that project's own gates.
- `friction_archive` each reviewed ledger (resolved entries out, unresolved
  stay).
- Promote durable lessons into the owning project's docs/skills — never an
  agent-memory store.
- Record the next review date (≈ 7 days out) in the report footer.
