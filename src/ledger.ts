/**
 * pi-retro ledger engine — pure logic, no pi or node imports (except date math).
 *
 * Ledger format (one line per friction event, pipe-separated):
 *   YYYY-MM-DD | project | area | phase | problem | fix?
 *
 * Managed markers (written by tools, parsed here, human-readable):
 *   `[xN last YYYY-MM-DD]`   recurrence counter, appended to the problem field
 *   `→ RESOLVED YYYY-MM-DD: note`  resolution, appended at end of line
 *
 * Config lives in the ledger header so the file is self-describing and
 * survives package updates:
 *   <!-- pi-retro: areas = tooling|tokens|hallucination|isolation|security|workflow|quality -->
 */

export interface LedgerConfig {
  areas: string[];
}

export interface FrictionEntry {
  date: string; // first-seen date
  project: string;
  area: string;
  phase: string;
  problem: string;
  fix?: string;
  recurrence?: number; // >= 2 when bumped
  lastSeen?: string;
  resolvedDate?: string;
  resolvedNote?: string;
}

export interface LedgerItem {
  line: string;
  entry: FrictionEntry | null; // null for header/blank/non-entry lines
}

export const DEFAULT_AREAS: readonly string[] = [
  "tooling",
  "tokens",
  "hallucination",
  "isolation",
  "security",
  "workflow",
  "quality",
];

export function today(now: Date = new Date()): string {
  // Local date, not UTC: a ledger entry written at 23:30 local time must not
  // land on tomorrow's date (or yesterday's, east of UTC).
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// ---------------------------------------------------------------------------
// Header / config

export function renderHeader(areas: readonly string[] = DEFAULT_AREAS): string {
  return [
    "# pi-retro friction ledger",
    "",
    "One line per friction event. Cost filter: log only what cost real time/tokens/context or risked correctness.",
    "Format: `YYYY-MM-DD | project | area | phase | problem | fix?`",
    `Areas: ${areas.join(", ")} (edit the config line below to customize)`,
    "Managed markers: `[xN last DATE]` recurrence, `→ RESOLVED DATE: note` resolution.",
    "",
    `<!-- pi-retro: areas = ${areas.join("|")} -->`,
    "",
    "## Entries",
    "",
  ].join("\n");
}

export function parseConfig(text: string): LedgerConfig {
  const m = text.match(/<!--\s*pi-retro:\s*areas\s*=\s*([a-z0-9|-]+)\s*-->/);
  if (!m) return { areas: [...DEFAULT_AREAS] };
  const areas = m[1].split("|").filter(Boolean);
  return { areas: areas.length ? areas : [...DEFAULT_AREAS] };
}

// ---------------------------------------------------------------------------
// Line parse / format

const ENTRY_PREFIX_RE = /^\d{4}-\d{2}-\d{2} \| /;
const RECURRENCE_RE = /\s*\[x(\d+)(?:\s+last\s+(\d{4}-\d{2}-\d{2}))?\]$/;
const RESOLVED_RE = /\s*→\s*RESOLVED\s+(\d{4}-\d{2}-\d{2}):?\s*(.*)$/;

/**
 * Escaping: a literal `|` is legal in a problem statement ("a || b panics"),
 * and silently rewriting it to `/` changes what the human wrote. Instead the
 * writer escapes `\` and `|`, and the reader unescapes them, so `a || b`
 * survives the round trip while the field separator stays unambiguous.
 */
export function escapeField(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

export function unescapeField(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && (s[i + 1] === "|" || s[i + 1] === "\\")) {
      out += s[i + 1];
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Split on unescaped ` | ` field separators, keeping escape sequences intact. */
export function splitFields(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) {
      cur += ch + s[i + 1];
      i++;
      continue;
    }
    if (ch === " " && s[i + 1] === "|" && s[i + 2] === " ") {
      out.push(cur);
      cur = "";
      i += 2;
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseLine(raw: string): FrictionEntry | null {
  const line = raw.trimEnd();
  if (!ENTRY_PREFIX_RE.test(line)) return null;

  let rest = line;
  let resolvedDate: string | undefined;
  let resolvedNote: string | undefined;
  const rm = rest.match(RESOLVED_RE);
  if (rm) {
    resolvedDate = rm[1];
    resolvedNote = rm[2].trim() ? unescapeField(rm[2].trim()) : undefined;
    rest = rest.slice(0, rm.index);
  }

  const parts = splitFields(rest).map((p) => p.trim());
  if (parts.length < 5) return null;
  const [date, project, area, phase, problemField] = parts;
  const fix = parts.length >= 6 ? unescapeField(parts.slice(5).join(" | ")) : undefined;

  let problem = unescapeField(problemField);
  let recurrence: number | undefined;
  let lastSeen: string | undefined;
  const cm = problem.match(RECURRENCE_RE);
  if (cm) {
    recurrence = parseInt(cm[1], 10);
    lastSeen = cm[2];
    problem = problem.slice(0, cm.index);
  }

  const entry: FrictionEntry = {
    date,
    project: unescapeField(project),
    area: unescapeField(area),
    phase: unescapeField(phase),
    problem: problem.trim(),
  };
  if (fix) entry.fix = fix;
  if (recurrence !== undefined) {
    entry.recurrence = recurrence;
    if (lastSeen) entry.lastSeen = lastSeen;
  }
  if (resolvedDate) {
    entry.resolvedDate = resolvedDate;
    if (resolvedNote) entry.resolvedNote = resolvedNote;
  }
  return entry;
}

export function formatLine(e: FrictionEntry): string {
  let problem = e.problem;
  if (e.recurrence !== undefined && e.recurrence >= 2) {
    problem += ` [x${e.recurrence}${e.lastSeen ? ` last ${e.lastSeen}` : ""}]`;
  }
  const parts = [e.date, escapeField(e.project), escapeField(e.area), escapeField(e.phase), escapeField(problem)];
  if (e.fix) parts.push(escapeField(e.fix));
  let line = parts.join(" | ");
  if (e.resolvedDate) {
    line += ` → RESOLVED ${e.resolvedDate}${e.resolvedNote ? `: ${escapeField(e.resolvedNote)}` : ""}`;
  }
  return line;
}

export function parseItems(text: string): LedgerItem[] {
  return text.split("\n").map((line) => ({ line, entry: parseLine(line) }));
}

export interface MalformedLine {
  line: number; // 1-based
  text: string;
}

/**
 * Entry-shaped lines that failed to parse (hand edits, truncated writes). The
 * stats tools report these instead of silently computing over a subset: a
 * ledger whose lines are quietly ignored looks complete while losing events.
 */
export function findMalformed(text: string): MalformedLine[] {
  const out: MalformedLine[] = [];
  text.split("\n").forEach((line, i) => {
    const trimmed = line.trimEnd();
    if (ENTRY_PREFIX_RE.test(trimmed) && parseLine(trimmed) === null) {
      out.push({ line: i + 1, text: trimmed });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Recurrence dedup

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "not",
  "is", "are", "was", "were", "it", "this", "that", "after", "before", "when",
  "from", "at", "by", "be", "been", "has", "have", "had", "does", "do", "did",
  "no", "but", "over", "under", "again", "still", "all", "any", "its",
]);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/** Jaccard similarity over token sets, [0,1]. */
export function similarity(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export interface SimilarMatch {
  item: LedgerItem;
  score: number;
}

/**
 * Find an unresolved entry in the same area with a similar problem within
 * `withinDays` of `now`. Cross-project matches count: the same friction in
 * two projects is the strongest recurrence signal there is.
 */
export function findSimilar(
  items: LedgerItem[],
  area: string,
  problem: string,
  withinDays: number,
  now: string,
  threshold = 0.55,
): SimilarMatch | null {
  const tokens = tokenize(problem);
  let best: SimilarMatch | null = null;
  for (const item of items) {
    const e = item.entry;
    if (!e || e.area !== area || e.resolvedDate) continue;
    const ref = e.lastSeen ?? e.date;
    if (daysBetween(ref, now) > withinDays) continue;
    const score = similarity(tokens, tokenize(e.problem));
    if (score >= threshold && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best;
}

/** Mutate a matched item in place: bump recurrence, refresh lastSeen, fill fix if absent. */
export function bumpRecurrence(item: LedgerItem, fix: string | undefined, now: string): FrictionEntry {
  const e = item.entry!;
  e.recurrence = (e.recurrence ?? 1) + 1;
  e.lastSeen = now;
  if (fix && !e.fix) e.fix = fix;
  item.line = formatLine(e);
  return e;
}

// ---------------------------------------------------------------------------
// Stats

export interface RecurringItem {
  problem: string;
  area: string;
  count: number;
  lastSeen: string;
}

export interface Stats {
  since: string;
  activeWindowDays: number;
  entriesInWindow: number;
  byArea: Record<string, number>;
  byProject: Record<string, number>;
  open: number;
  resolved: number;
  resolvedInWindow: number;
  recurring: RecurringItem[];
}

export function computeStats(entries: FrictionEntry[], days = 14, now = today()): Stats {
  const inWindow = entries.filter((e) => daysBetween(e.resolvedDate ?? e.lastSeen ?? e.date, now) <= days);
  const byArea: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  for (const e of inWindow) {
    byArea[e.area] = (byArea[e.area] ?? 0) + 1;
    byProject[e.project] = (byProject[e.project] ?? 0) + 1;
  }
  const recurring = entries
    .filter((e) => (e.recurrence ?? 1) >= 2 && !e.resolvedDate)
    .map((e) => ({ problem: e.problem, area: e.area, count: e.recurrence ?? 1, lastSeen: e.lastSeen ?? e.date }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return {
    since: now,
    activeWindowDays: days,
    entriesInWindow: inWindow.length,
    byArea,
    byProject,
    open: entries.filter((e) => !e.resolvedDate).length,
    resolved: entries.filter((e) => !!e.resolvedDate).length,
    resolvedInWindow: entries.filter((e) => e.resolvedDate && daysBetween(e.resolvedDate, now) <= days).length,
    recurring,
  };
}

export function renderStats(scope: string, s: Stats): string {
  const area = Object.entries(s.byArea).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" ") || "none";
  const proj = Object.entries(s.byProject).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" ") || "none";
  const lines = [
    `## ${scope} ledger (active ${s.activeWindowDays}d: ${s.entriesInWindow} entries)`,
    `- by area: ${area}`,
    `- by project: ${proj}`,
    `- open: ${s.open} | resolved: ${s.resolved} (resolved in window: ${s.resolvedInWindow})`,
  ];
  if (s.recurring.length) {
    lines.push(`- recurring (top ${s.recurring.length}):`);
    for (const r of s.recurring) lines.push(`    x${r.count} [${r.area}] ${r.problem} (last ${r.lastSeen})`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Archive

export interface ArchiveOptions {
  resolvedOnly: boolean;
  days: number;
  now: string;
}

export interface ArchiveSplit {
  archive: string[]; // entry lines to move
  keep: string[]; // lines staying in the live ledger (incl. all non-entry lines)
}

/**
 * resolvedOnly (default): archive resolved entries only — unresolved friction
 * is the live improvement queue and stays. Otherwise also archive unresolved
 * entries older than `days` since last sighting.
 */
export function partitionForArchive(items: LedgerItem[], opts: ArchiveOptions): ArchiveSplit {
  const archive: string[] = [];
  const keep: string[] = [];
  for (const item of items) {
    const e = item.entry;
    if (!e) {
      keep.push(item.line);
      continue;
    }
    const age = daysBetween(e.lastSeen ?? e.date, opts.now);
    const take = e.resolvedDate ? true : !opts.resolvedOnly && age > opts.days;
    (take ? archive : keep).push(item.line);
  }
  return { archive, keep };
}
