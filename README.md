# pi-retro

[![npm](https://img.shields.io/npm/v/pi-retro?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/pi-retro) [![CI](https://img.shields.io/github/actions/workflow/status/jyyyeung/pi-retro/test.yml?style=flat&logo=github&label=CI)](https://github.com/jyyyeung/pi-retro/actions/workflows/test.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT) [![Pi](https://img.shields.io/badge/pi-%E2%89%A51.3-6366F1?style=flat)](https://pi.dev) [![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)

A retrospective loop for your [pi](https://pi.dev) coding-agent setup — so
friction turns into changes instead of a memory of vibes.

## What it does

Agents collect **friction** all week — tooling misbehavior, token/context pain,
hallucination or spec drift, git trouble, security near-misses, workflow gaps —
into a cost-filtered ledger. Once a week, a review aggregates it, verdicts your
active **trials**, and proposes `adopt / evaluate / reject` changes. You approve;
nothing auto-applies.

Install it if you keep noticing the same friction every week and never change
anything, or if you are running several extensions and cannot say which of them
are earning their keep.

Not a memory store (no verified facts), not observability (no call traces) — a
curated improvement queue with a human in the loop.

## Install

```bash
pi install npm:pi-retro
```

Then restart pi (or `/reload`).

From a local checkout:

```bash
pi install ./pi-retro
pi -e ./pi-retro/extensions/retro.ts
```

## Quick start

1. Hit friction in any session → the agent calls `log_friction` (the
   bundled `friction-log` skill triggers it on real friction, without asking).
2. Run `/retro` weekly. The review writes a dated report and proposes changes.
3. Approve → apply, then `friction_archive` clears the reviewed ledger.

The first `log_friction` call bootstraps the ledger file with a header you can
edit (areas are config — see below). `friction_stats` works before that: it
reports zeros and the path it would create, and never throws just because
nothing has been logged yet.

`/retro-stats` prints the aggregate without invoking a model turn — the cheap
way to check whether a weekly review is due. (`/retro` is the review itself,
delivered by the bundled prompt template plus the `weekly-review` skill.)

## Scopes

| | user (default) | project |
|---|---|---|
| Path | `~/.pi/agent/meta/problems-ledger.md` | `<repo>/.pi/retro/ledger.md` |
| Audience | you, cross-project | the team |
| For | personal-setup friction (quota, host, your extensions) | friction the team can act on (CI, tests, review, workflow) |

Privacy rule: entries are never copied between scopes. The project ledger is
not created until someone logs with `scope: "project"` inside the repo; team
sharing (committing it) is the team's explicit decision — gitignore it until
then.

## Ledger format

One line per event:

```
YYYY-MM-DD | project | area | phase | problem | fix?
```

Managed markers (tools write them; they stay human-readable):
- `[x3 last 2026-10-15]` — recurrence: the same friction hit again within 30
  days bumps the counter instead of adding a line.
- `→ RESOLVED 2026-10-14: note` — resolution: the strongest positive signal
  the review gets.

A literal `|` inside a field is escaped (`\|`) on write and unescaped on read,
so `a || b fails` stays exactly as written instead of being rewritten to
`a / b`. Entries written by older versions (unescaped pipes) still parse. Lines
that look like entries but fail to parse are reported by `friction_stats`
(with line numbers) instead of being silently dropped from the totals.

### Config lives in the file

```
<!-- pi-retro: areas = tooling|tokens|hallucination|isolation|security|workflow|quality -->
```

Edit that header line to change the area taxonomy. The file is
self-describing, survives package updates, and can differ per scope.

## Tools

| Tool | What it does |
|---|---|
| `log_friction` | Append one entry (or bump a recurrence). Params: `project`, `area`, `phase`, `problem`, optional `fix`, `cost` (S/M/L), `scope`, `force`. |
| `friction_stats` | Read-only aggregate: counts by area/project, open vs resolved, top recurring, malformed-line count. Use instead of reading whole files. |
| `friction_resolve` | Append a resolution marker to one unambiguously-matched open entry. |
| `friction_archive` | Move resolved entries to `archive/YYYY-MM-DD.md`; `resolvedOnly: false` also moves unresolved entries idle longer than `days` (default 30). |

## The weekly ritual (`/retro`)

1. `friction_stats` both scopes; read unresolved entries.
2. Evaluate ACTIVE trials from your trials registry (convention:
   `~/.pi/agent/meta/extension-trials.md`) against their pre-registered
   success criteria → KEEP / REMOVE / EXTEND per trial.
3. Optionally research trends for the top friction areas.
4. Write a dated report (`~/.pi/agent/meta/weekly-reviews/YYYY-MM-DD.md`)
   with `adopt` / `evaluate` / `reject` buckets — rejections carry reasons,
   and future suggestions bounce against them.
5. Propose. The owner approves. Then apply, archive, and promote durable
   lessons into project docs.

Suggestions stay evidence-tethered: the `fix` field on a friction entry IS
the suggestion, with the friction as its reason. There is deliberately no
free-form suggestion inbox.

## Scope and non-goals

- **Not memory.** Nothing in the ledger is treated as a verified fact; the
  agent's memory system is a separate concern.
- **Not observability.** No call traces, timings, or token accounting — one
  line per friction event, and only when it actually cost you something.
- **Not automatic.** The review proposes; you approve. No package configures
  itself because a retro said so.
- **Not a shared inbox.** Scopes never merge: personal friction stays personal,
  team friction stays in the repo you chose to share.

## Security & trust

- No network access, no telemetry, no dependencies beyond pi's host-provided
  packages (peerDependencies only).
- Writes are confined to the ledger file and its `archive/` directory; no
  tool accepts a path parameter.
- Appends use `O_APPEND`; rewrites write a temp file and rename, so a crash
  mid-write cannot truncate the ledger.
- Small enough to read in one sitting (~850 lines across the extension and
  its ledger module) — please do.

## Requirements

| Requirement | Needed for | If missing |
|---|---|---|
| pi ≥ 1.3 | the tools and `/retro` | — |
| Node ≥ 20 (22.6+ to run the tests) | everything | — |
| a writable `~/.pi/agent/meta/` (or `PI_RETRO_LEDGER`) | the user ledger | `log_friction` reports the path it could not write |

## Troubleshooting

**`friction_stats` says the ledger does not exist.** Expected before the first
log: it reports zeros plus the path it would create. `log_friction` bootstraps
the file (with its editable header) on first use.

**My hand-edited line is missing from the totals.** It failed to parse. Run
`friction_stats` again — malformed lines are now listed with line numbers
instead of being dropped silently. The usual cause is a field order change; the
format is `date | project | area | phase | problem | fix?`.

**`/retro` produced no report.** `/retro` is a prompt template plus the
`weekly-review` skill, so it needs a model turn. `/retro-stats` gives you the
same aggregate with no model involvement, and `friction_stats` gives it as a
tool call.

**The ledger went to the wrong repo.** Project entries resolve from the session
cwd. `PI_RETRO_LEDGER` overrides the user ledger path; project ledgers are
`<repo>/.pi/retro/ledger.md` and only appear once you log with
`scope: "project"`.

## Related packages

Five extensions for the same problem — agent sessions sharing a checkout —
covering different moments:

| Package | Moment | Guards against |
|---|---|---|
| [pi-rc-gate](https://github.com/jyyyeung/pi-rc-gate) | at execution | the failure signal being destroyed, so a red command is reported green |
| [pi-checkout-guard](https://github.com/jyyyeung/pi-checkout-guard) | during | concurrent sessions wiping each other's uncommitted work |
| [pi-closeout](https://github.com/jyyyeung/pi-closeout) | at session end | the dirty state a session leaves for the next one |
| **pi-retro** (this) | weekly | friction that keeps recurring because nobody wrote it down |
| [pi-handoff](https://github.com/jyyyeung/pi-handoff) | between sessions | context lost when a session ends |

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test (type-stripped TS, node >= 22.6)
```

## License

MIT © jyyyeung
