---
name: friction-log
description: >-
  Log friction to the pi-retro ledger with the log_friction tool. Use whenever
  real friction is hit during work — tool or API misbehavior, token/context
  pain, hallucination or spec drift, git/isolation trouble, security
  near-misses, manual workflow gaps, reviewer or test misses. Triggers on
  "log this problem", "note this friction", "problems ledger", "that cost us
  an hour". Also load to resolve a known friction entry or check ledger stats.
---

# Friction logging (pi-retro)

Call `log_friction` once per friction event. The weekly review parses the
ledger — keep fields clean: one line, no pipes, no newlines.

## When to log (cost filter)

Log only when the event cost real time, tokens, or context, or risked
correctness. Not every stumble. If a similar entry exists from the last 30
days the tool detects it automatically and logs a recurrence (`xN`) instead
of a duplicate line — let it; do not force new lines for repeats.

## Scope routing (privacy rule)

- `user` (default): your private cross-project ledger
  (`~/.pi/agent/meta/problems-ledger.md`). Personal-setup friction — model
  quota, host issues, your own extension quirks — goes ONLY here.
- `project`: shared ledger at `<repo>/.pi/retro/ledger.md`. Use ONLY for
  friction the whole team can act on (CI gaps, test-suite holes, review
  misses, repo workflow). Never copy personal entries into the project
  ledger; never write to the project ledger without the cost filter.

Log once, in the scope whose audience can act on it. Do not double-log.

## Suggestions stay evidence-tethered

Use the optional `fix` field for the improvement suggestion and the reason.
A suggestion without a friction event behind it is an opinion, not a
suggestion — don't log those. Free-form suggestion queues rot.

## Not for the ledger

Verified facts and durable lessons do NOT belong here — promote them into
the project's own docs/skills per its knowledge-hygiene rules. The ledger is
friction only.

## Resolving and checking

- `friction_resolve { search, resolution }` — mark an entry fixed; the
  resolution note is the highest-value positive signal the review gets.
- `friction_stats` — aggregate instead of reading whole ledger files.
