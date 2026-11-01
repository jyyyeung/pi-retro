import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bumpRecurrence,
  computeStats,
  daysBetween,
  escapeField,
  findMalformed,
  findSimilar,
  formatLine,
  parseConfig,
  parseItems,
  parseLine,
  partitionForArchive,
  renderHeader,
  similarity,
  splitFields,
  today,
  tokenize,
  unescapeField,
  type FrictionEntry,
} from "../src/ledger.ts";

const NOW = "2026-10-19";

test("parseLine: plain entry", () => {
  const e = parseLine("2026-10-13 | app | tooling | orchestrator | tool x timed out | retry once");
  assert.equal(e?.date, "2026-10-13");
  assert.equal(e?.project, "app");
  assert.equal(e?.area, "tooling");
  assert.equal(e?.phase, "orchestrator");
  assert.equal(e?.problem, "tool x timed out");
  assert.equal(e?.fix, "retry once");
  assert.equal(e?.resolvedDate, undefined);
});

test("parseLine: non-entry lines rejected", () => {
  assert.equal(parseLine("# header"), null);
  assert.equal(parseLine(""), null);
  assert.equal(parseLine("## Entries"), null);
  assert.equal(parseLine("2026-10-13 no pipes here"), null);
});

test("parseLine: recurrence marker", () => {
  const e = parseLine("2026-10-01 | app | tooling | impl | tool x broken [x3 last 2026-10-15]");
  assert.equal(e?.problem, "tool x broken");
  assert.equal(e?.recurrence, 3);
  assert.equal(e?.lastSeen, "2026-10-15");
});

test("parseLine: resolved marker matches existing convention", () => {
  const e = parseLine(
    "2026-10-13 | app | quality | lane | fixtures stale → RESOLVED 2026-10-14: fixtures repaired, seed green",
  );
  assert.equal(e?.resolvedDate, "2026-10-14");
  assert.equal(e?.resolvedNote, "fixtures repaired, seed green");
  assert.equal(e?.fix, undefined);
});

test("parseLine: recurrence + resolved combined roundtrips", () => {
  const line =
    "2026-10-01 | app | tooling | impl | tool x broken [x3 last 2026-10-15] | fix hint → RESOLVED 2026-10-18: host repaired";
  const e = parseLine(line)!;
  assert.equal(e.recurrence, 3);
  assert.equal(e.fix, "fix hint");
  assert.equal(e.resolvedNote, "host repaired");
  assert.equal(formatLine(e), line);
});

test("formatLine: plain roundtrip", () => {
  const line = "2026-10-13 | app | tooling | orchestrator | tool x timed out | retry once";
  assert.equal(formatLine(parseLine(line)!), line);
});

test("findSimilar: matches same area, skips resolved and stale", () => {
  const items = parseItems(
    [
      "2026-10-18 | a | tooling | impl | subagent dispatch fails with module resolution error",
      "2026-10-01 | a | tooling | impl | subagent dispatch fails with module resolution error → RESOLVED 2026-10-02: fixed",
      "2026-10-18 | a | tokens | impl | subagent dispatch fails with module resolution error",
      "2020-01-01 | a | tooling | impl | subagent dispatch fails with module resolution error",
    ].join("\n"),
  );
  const m = findSimilar(items, "tooling", "subagent dispatch fails module resolution error", 30, NOW);
  assert.ok(m);
  assert.equal(m?.item.entry?.date, "2026-10-18");
  // stale (2020) entry beyond window must not match
  const none = findSimilar(items, "tooling", "totally unrelated problem text here", 30, NOW);
  assert.equal(none, null);
});

test("findSimilar: no match for different problem", () => {
  const items = parseItems("2026-10-18 | a | security | impl | secret nearly logged to console output");
  assert.equal(findSimilar(items, "security", "build times doubled after dependency upgrade", 30, NOW), null);
});

test("bumpRecurrence: increments count, fills missing fix, rewrites line", () => {
  const items = parseItems("2026-10-10 | a | tooling | impl | flaky test runner timeout");
  const item = items[0];
  const e = bumpRecurrence(item, "per-repo budget", NOW);
  assert.equal(e.recurrence, 2);
  assert.equal(e.lastSeen, NOW);
  assert.equal(e.fix, "per-repo budget");
  assert.match(item.line, /\[x2 last 2026-10-19\]/);
  assert.match(item.line, /per-repo budget/);
});

test("similarity + tokenize basics", () => {
  const a = tokenize("The subagent dispatch fails!");
  assert.ok(a.includes("subagent"));
  assert.ok(!a.includes("the"));
  assert.ok(similarity(a, tokenize("subagent dispatch fails")) > 0.5);
  assert.equal(similarity(["a", "b"], ["c"]), 0);
});

test("daysBetween: window math", () => {
  assert.equal(daysBetween("2026-10-19", "2026-10-19"), 0);
  assert.equal(daysBetween("2026-10-01", "2026-10-19"), 18);
});

test("computeStats: buckets, windows, recurring", () => {
  const items = parseItems(
    [
      "2026-10-18 | app | tooling | impl | problem alpha [x3 last 2026-10-18]",
      "2026-10-18 | app | tokens | impl | problem beta",
      "2026-10-01 | other | tooling | impl | problem gamma → RESOLVED 2026-10-17: done",
      "2020-01-01 | other | quality | impl | problem delta",
    ].join("\n"),
  );
  const entries = items.map((i) => i.entry).filter((e) => !!e);
  const s = computeStats(entries as never[], 14, NOW);
  assert.equal(s.entriesInWindow, 3); // delta is outside the window
  assert.equal(s.byArea.tooling, 2); // alpha + gamma (resolved this window)
  assert.equal(s.byProject.app, 2);
  assert.equal(s.open, 3);
  assert.equal(s.resolved, 1);
  assert.equal(s.resolvedInWindow, 1);
  assert.equal(s.recurring[0]?.count, 3);
});

test("header config: render → parse roundtrip, custom areas, fallback", () => {
  const header = renderHeader(["tooling", "vibes"]);
  assert.equal(parseConfig(header).areas.join(","), "tooling,vibes");
  assert.equal(parseConfig("no config here").areas.length, 7);
});

test("partitionForArchive: resolvedOnly keeps unresolved and non-entry lines", () => {
  const items = parseItems(
    [
      "# pi-retro friction ledger",
      "<!-- pi-retro: areas = tooling|tokens -->",
      "",
      "## Entries",
      "",
      "2026-10-01 | a | tooling | impl | fixed thing → RESOLVED 2026-10-10: patched",
      "2026-10-02 | a | tooling | impl | open thing",
      "2026-10-03 | a | tooling | impl | idle old thing",
    ].join("\n"),
  );
  const { archive, keep } = partitionForArchive(items, { resolvedOnly: true, days: 30, now: NOW });
  assert.equal(archive.length, 1);
  assert.ok(archive[0].includes("fixed thing"));
  assert.equal(keep.length, items.length - 1);
  assert.ok(keep.some((l) => l.includes("## Entries")));

  const aggressive = partitionForArchive(items, { resolvedOnly: false, days: 7, now: NOW });
  // idle old thing (2026-10-03, >7d) archived, open thing (2026-10-02) also >7d → archived
  assert.equal(aggressive.archive.length, 3);
});

test("parseItems: line count preserved", () => {
  const text = renderHeader() + "2026-10-13 | app | tooling | i | p | f";
  const items = parseItems(text);
  assert.equal(items.length, text.split("\n").length);
});

test("fields: literal pipes survive the round trip (escaped, not mangled)", () => {
  const entry: FrictionEntry = {
    date: "2026-10-13",
    project: "app",
    area: "tooling",
    phase: "impl",
    problem: "shell chokes on `a || b` and on grep 'x|y'",
    fix: "quote the pattern | use -e",
  };
  const line = formatLine(entry);
  assert.ok(line.includes("\\|"), `expected escaped pipe in: ${line}`);
  const back = parseLine(line);
  assert.equal(back?.problem, entry.problem);
  assert.equal(back?.fix, entry.fix);
});

test("fields: unescaped legacy pipes still parse (backward compatible)", () => {
  const e = parseLine("2026-10-13 | app | tooling | impl | problem a | b | fix hint");
  assert.equal(e?.problem, "problem a");
  assert.equal(e?.fix, "b | fix hint");
});

test("fields: resolved note with a pipe roundtrips", () => {
  const entry: FrictionEntry = {
    date: "2026-10-13",
    project: "app",
    area: "quality",
    phase: "lane",
    problem: "flaky",
    resolvedDate: "2026-10-14",
    resolvedNote: "pinned seed | reran suite",
  };
  const back = parseLine(formatLine(entry));
  assert.equal(back?.resolvedNote, "pinned seed | reran suite");
});

test("fields: backslash and pipe escape order is stable", () => {
  assert.equal(unescapeField(escapeField("a\\b|c")), "a\\b|c");
  assert.equal(unescapeField(escapeField("\\|")), "\\|");
  assert.deepEqual(splitFields("x | a\\|b | y"), ["x", "a\\|b", "y"]);
});

test("findMalformed: entry-shaped broken lines reported, header lines ignored", () => {
  const text = [
    "# header",
    "2026-10-13 | app | tooling | impl | good one",
    "2026-10-14 | app | tooling", // truncated hand edit
    "<!-- pi-retro: areas = tooling|tokens -->",
  ].join("\n");
  const bad = findMalformed(text);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].line, 3);
  assert.match(bad[0].text, /truncated|\| app \| tooling$/);
});

test("today: local calendar date, not UTC", () => {
  const d = new Date();
  d.setHours(23, 30, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  assert.equal(today(d), `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
});
