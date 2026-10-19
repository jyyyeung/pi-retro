# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
