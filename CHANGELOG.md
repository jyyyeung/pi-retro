# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2]

### Changed

- **The stats command is now `/retro-stats`.** A registered extension command
  named `retro` shadowed `prompts/retro.md`: pi dispatches extension commands
  before prompt templates, so `/retro` — documented as the weekly review — only
  ever printed aggregate stats and the review was unreachable. `/retro` is now
  the review (prompt template + `weekly-review` skill); `/retro-stats` is the
  free aggregate with no model turn.

### Docs

- README verified claim-by-claim against the source: `friction_archive`'s
  `resolvedOnly`/`days` parameters, the trials registry convention path, and a
  troubleshooting entry that no longer claims `/retro` needs a model to print
  stats.
- LICENSE holder is `jyyyeung` (was unset/`pi-retro contributors`).

## [0.1.1] — 2026-11-01

### Fixed
- `friction_stats` no longer throws `user ledger not found … call
  log_friction once to bootstrap it` on a fresh install (and for
  `scope: "both"`): a missing ledger aggregates to zeros with a one-line
  note, so a read-only tool never fails because nothing was logged yet.
- Project-scope reads and writes now resolve from the session cwd (`ctx.cwd`)
  instead of the agent process's `process.cwd()`, which pointed at the wrong
  repo whenever the session changed directories.
- A literal `|` in a problem/fix/resolution is escaped (`\|`) and unescaped
  on read instead of being silently rewritten to `/`. Older unescaped lines
  still parse.
- Entry-shaped lines that fail to parse are now counted and reported by
  `friction_stats` (line numbers) instead of vanishing from the totals.
- Ledger appends use O_APPEND; whole-file rewrites (recurrence bump, resolve,
  archive) go through a temp file + rename, so a crash or a second process can
  no longer truncate the ledger.
- `today()` returns the local calendar date rather than the UTC one (an entry
  logged at 23:30 local time landed on the wrong day).

### Added
- `promptSnippet`/`promptGuidelines` on all four tools (they were invisible in
  the system prompt's tool list before).
- `/retro` command: prints user + project stats without a model turn.
- Tests for pipe escaping/roundtrip, malformed-line reporting, and local dates
  (15 → 21).

## [0.1.0] — 2026-10-19

### Added
- Ledger engine (`src/ledger.ts`): parse/format the pipe-separated friction
  line format, recurrence (`[xN last DATE]`) and resolution
  (`→ RESOLVED DATE: note`) markers, header-embedded area config, similarity
  dedup, stats aggregation, archive partitioning.
- Extension tools (namespace `retro`): `log_friction` (scope routing +
  recurrence dedup + cost tag), `friction_stats` (read-only aggregate,
  structured output), `friction_resolve` (unambiguous-match resolution),
  `friction_archive` (dated archive, resolved-only by default).
- Skills: `friction-log` (when/how to log, scope privacy rules),
  `weekly-review` (explicit-invocation adopt/evaluate/reject ritual).
- `/retro` prompt template.
- Unit tests for the ledger engine (node:test, type-stripped TS).
