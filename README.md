# pi-retro

A retrospective loop for your [pi](https://pi.dev) coding-agent setup.

Agents collect **friction** all week — tooling misbehavior, token/context
pain, hallucination or spec drift, git trouble, security near-misses, workflow
gaps — into a cost-filtered ledger. Once a week, a review aggregates it,
verdicts your active **trials**, and proposes `adopt / evaluate / reject`
changes. You approve; nothing auto-applies.

Not a memory store (no verified facts), not observability (no call traces) —
a curated improvement queue with a human in the loop.

## Install

```bash
pi install npm:pi-retro        # once published
# or from git:
pi install git:github.com/<you>/pi-retro
# or try it once without installing:
pi -e ./pi-retro
```

## Quickstart

1. Hit friction in any session → the agent calls `log_friction` (the
   `friction-log` skill triggers automatically on real friction).
2. Run `/retro` weekly. The review writes a dated report and proposes changes.
3. Approve → apply, then `friction_archive` clears the reviewed ledger.

First `log_friction` call bootstraps the ledger file with a header you can
edit (areas are config — see below). `friction_stats` works before that: it
reports zeros and the path it would create, and never throws just because
nothing has been logged yet.

`/retro` prints the same aggregate without invoking a model turn, which is the
cheap way to check whether a weekly review is due.

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
| `friction_stats` | Read-only aggregate: counts by area/project, open vs resolved, top recurring. Use instead of reading whole files. |
| `friction_resolve` | Append a resolution marker to one unambiguously-matched open entry. |
| `friction_archive` | Move resolved (and optionally stale) entries to `archive/YYYY-MM-DD.md`. |

## The weekly ritual (`/retro`)

1. `friction_stats` both scopes; read unresolved entries.
2. Evaluate ACTIVE trials from your trials registry against their
   pre-registered success criteria → KEEP / REMOVE / EXTEND.
3. Optionally research trends for the top friction areas.
4. Write a dated report (`~/.pi/agent/meta/weekly-reviews/YYYY-MM-DD.md`)
   with `adopt` / `evaluate` / `reject` buckets — rejections carry reasons,
   and future suggestions bounce against them.
5. Propose. The owner approves. Then apply, archive, and promote durable
   lessons into project docs.

Suggestions stay evidence-tethered: the `fix` field on a friction entry IS
the suggestion, with the friction as its reason. There is deliberately no
free-form suggestion inbox.

## Security & trust

- No network access, no telemetry, no dependencies beyond pi's host-provided
  packages (peerDependencies only).
- Writes are confined to the ledger file and its `archive/` directory; no
  tool accepts a path parameter.
- Extension is small enough to read in one sitting (~300 lines) — please do.
- Review the source before installing, as with any pi package.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test (type-stripped TS, node >= 22.6)
```

## License

MIT
