/**
 * pi-retro — retrospective loop for your coding-agent setup.
 *
 * Tools (namespace "retro"):
 *   log_friction      append one friction entry (or bump a recurrence)
 *   friction_stats    aggregate one or both ledgers — read-only
 *   friction_resolve  mark a matched entry resolved, with a note
 *   friction_archive  move reviewed entries into a dated archive file
 *
 * Writes are confined to the ledger file and its archive/ directory.
 * No network access, no user-provided paths, no telemetry.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  bumpRecurrence,
  computeStats,
  findMalformed,
  findSimilar,
  formatLine,
  parseConfig,
  parseItems,
  partitionForArchive,
  renderHeader,
  renderStats,
  today,
  tokenize,
  type FrictionEntry,
  type LedgerItem,
  type Stats,
} from "../src/ledger.ts";

type Scope = "user" | "project";

const USER_LEDGER =
  process.env.PI_RETRO_LEDGER ??
  path.join(os.homedir(), ".pi", "agent", "meta", "problems-ledger.md");

const DEDUP_WINDOW_DAYS = 30;

/** Serialize every read-modify-write of a ledger file within this process. */
let mutationChain: Promise<unknown> = Promise.resolve();
function withLedgerLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = mutationChain.then(fn, fn);
  mutationChain = run.catch(() => {});
  return run;
}

function projectLedgerPath(cwd: string): string {
  let root: string | undefined;
  try {
    root = execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // not a git repo — fall back to the working directory
  }
  return path.join(root ?? cwd, ".pi", "retro", "ledger.md");
}

function ledgerPathFor(scope: Scope, cwd: string): string {
  return scope === "user" ? USER_LEDGER : projectLedgerPath(cwd);
}

function ensureLedger(ledgerPath: string): void {
  if (fs.existsSync(ledgerPath)) return;
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, renderHeader());
}

/** Ledger fields are one line each; pipes are escaped by formatLine. */
function clean(s: string): string {
  return s.replace(/\s*\n\s*/g, " ").trim();
}

/** Whole-file rewrite: temp file + rename, so a crash mid-write cannot leave a truncated ledger. */
function writeItems(ledgerPath: string, items: LedgerItem[]): void {
  const body = items.map((i) => i.line).join("\n").replace(/\n+$/, "\n");
  const text = body.endsWith("\n") ? body : body + "\n";
  const tmp = `${ledgerPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, ledgerPath);
}

/** Append one entry. O_APPEND keeps concurrent writers from clobbering each other. */
function appendLine(ledgerPath: string, line: string): void {
  let prefix = "";
  try {
    const { size } = fs.statSync(ledgerPath);
    if (size > 0) {
      const fd = fs.openSync(ledgerPath, "r");
      const buf = Buffer.alloc(1);
      fs.readSync(fd, buf, 0, 1, size - 1);
      fs.closeSync(fd);
      if (buf.toString() !== "\n") prefix = "\n";
    }
  } catch {
    /* new file: no prefix needed */
  }
  fs.appendFileSync(ledgerPath, prefix + line + "\n");
}

function loadLedger(ledgerPath: string): { text: string; items: LedgerItem[]; areas: string[] } {
  ensureLedger(ledgerPath);
  const text = fs.readFileSync(ledgerPath, "utf8");
  return { text, items: parseItems(text), areas: parseConfig(text).areas };
}

function scopeParam(extra: Record<string, unknown> = {}) {
  return Type.Optional(
    Type.Union([Type.Literal("user"), Type.Literal("project")], {
      description:
        "Ledger scope. 'user' (default): private cross-project ledger. 'project': shared <repo>/.pi/retro/ledger.md — only for friction the team can act on; never copy personal-setup entries there.",
      ...extra,
    }),
  );
}

const StatsSchema = Type.Object({
  since: Type.String(),
  activeWindowDays: Type.Number(),
  entriesInWindow: Type.Number(),
  byArea: Type.Record(Type.String(), Type.Number()),
  byProject: Type.Record(Type.String(), Type.Number()),
  open: Type.Number(),
  resolved: Type.Number(),
  resolvedInWindow: Type.Number(),
  recurring: Type.Array(
    Type.Object({
      problem: Type.String(),
      area: Type.String(),
      count: Type.Number(),
      lastSeen: Type.String(),
    }),
  ),
});

type StatsJson = Static<typeof StatsSchema>;
const toStatsJson = (s: Stats): StatsJson => s as StatsJson;

export default function (pi: ExtensionAPI) {
  const namespace = {
    name: "retro",
    description: "pi-retro friction ledger: collect, aggregate, resolve, archive",
  };

  pi.registerTool({
    name: "log_friction",
    label: "Log friction",
    namespace,
    description:
      "Append one friction entry to the pi-retro ledger. Call when real friction cost time/tokens/context or " +
      "risked correctness: tooling misbehavior, token/context pain, hallucination or spec drift, isolation/git " +
      "friction, security near-miss, manual workflow gap, reviewer/test miss. One call per event, terse. A similar " +
      "recent unresolved entry is detected automatically and logged as a recurrence instead of a duplicate line.",
    parameters: Type.Object({
      project: Type.String({ description: "Project name or directory this happened in (e.g. my-app, global)" }),
      area: Type.String({
        description: "Friction category — must be one of the ledger's configured areas (default: tooling, tokens, hallucination, isolation, security, workflow, quality)",
      }),
      phase: Type.String({ description: "Agent/phase where it happened, e.g. orchestrator, reviewer, implementer" }),
      problem: Type.String({ description: "One-line problem statement (newlines are collapsed; a literal | is escaped automatically)" }),
      fix: Type.Optional(
        Type.String({ description: "Suggested or already-applied fix — the evidence-tethered suggestion the weekly review reads" }),
      ),
      cost: Type.Optional(
        Type.Union([Type.Literal("S"), Type.Literal("M"), Type.Literal("L")], {
          description: "Estimated cost: S < 5 min, M < 30 min, L >= 30 min or correctness risk. Suffix the problem line with (cost:X).",
        }),
      ),
      scope: scopeParam(),
      force: Type.Optional(Type.Boolean({ description: "Bypass recurrence detection and append a new line" })),
    }),
    promptSnippet: "Log one friction event to the pi-retro ledger (similar entries become recurrences)",
    promptGuidelines: [
      "log_friction is for friction that cost real time/tokens/context or risked correctness — not for ordinary work; one call per event, terse.",
    ],
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return withLedgerLock(() => {
        const now = today();
        const scope: Scope = (params.scope as Scope) ?? "user";
        const ledgerPath = ledgerPathFor(scope, ctx?.cwd ?? process.cwd());
        const { items, areas } = loadLedger(ledgerPath);

        if (!areas.includes(params.area)) {
          throw new Error(`area must be one of: ${areas.join(", ")} (edit the ledger header config line to add areas)`);
        }
        let problem = clean(params.problem);
        if (params.cost) problem += ` (cost:${params.cost})`;
        const fix = params.fix ? clean(params.fix) : undefined;

        if (!params.force) {
          const match = findSimilar(items, params.area, problem, DEDUP_WINDOW_DAYS, now);
          if (match) {
            const bumped = bumpRecurrence(match.item, fix, now);
            writeItems(ledgerPath, items);
            const details: { scope: Scope; ledgerPath: string; recurrence?: number } = {
              scope,
              ledgerPath,
              recurrence: bumped.recurrence ?? 2,
            };
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Recurrence logged (x${bumped.recurrence}, similarity ${Math.round(match.score * 100)}%): ` +
                    `${match.item.line}\nLedger: ${ledgerPath}`,
                },
              ],
              details,
            };
          }
        }

        const entry: FrictionEntry = {
          date: now,
          project: clean(params.project),
          area: params.area,
          phase: clean(params.phase),
          problem,
          ...(fix ? { fix } : {}),
        };
        const line = formatLine(entry);
        items.push({ line, entry });
        appendLine(ledgerPath, line);
        const details: { scope: Scope; ledgerPath: string; recurrence?: number } = { scope, ledgerPath };
        return {
          content: [{ type: "text", text: `Logged to ${scope} ledger: ${line}` }],
          details,
        };
      });
    },
  });

  pi.registerTool({
    name: "friction_stats",
    label: "Friction stats",
    namespace,
    description:
      "Aggregate pi-retro ledger(s): entry counts by area/project over an active window, open vs resolved, top " +
      "recurring friction. Read-only. Use this instead of reading whole ledger files.",
    promptSnippet: "Aggregate pi-retro ledger stats (read-only: counts by area/project, open vs resolved, recurrences)",
    promptGuidelines: [
      "Use friction_stats instead of reading whole ledger files; it never writes the ledger and works on a not-yet-created ledger (reporting zeros).",
    ],
    annotations: { readOnlyHint: true },
    parameters: Type.Object({
      scope: Type.Optional(
        Type.Union([Type.Literal("user"), Type.Literal("project"), Type.Literal("both")], {
          description: "Which ledger to aggregate (default both)",
        }),
      ),
      days: Type.Optional(Type.Number({ description: "Active window in days (default 14)" })),
    }),
    outputSchema: Type.Object({
      user: StatsSchema,
      project: Type.Optional(StatsSchema),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const now = today();
      const days = params.days ?? 14;
      const want = params.scope ?? "both";
      const cwd = ctx?.cwd ?? process.cwd();

      const readScope = (scope: Scope): { stats: Stats; missing: boolean; malformed: ReturnType<typeof findMalformed> } => {
        const ledgerPath = ledgerPathFor(scope, cwd);
        // A read-only tool must not throw just because nothing has been logged
        // yet: an empty ledger and "no ledger" aggregate to the same zeros.
        const text = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, "utf8") : "";
        const entries = parseItems(text)
          .map((i) => i.entry)
          .filter((e): e is FrictionEntry => !!e);
        return { stats: computeStats(entries, days, now), missing: !fs.existsSync(ledgerPath), malformed: findMalformed(text) };
      };

      const report = (scope: Scope, r: ReturnType<typeof readScope>): string => {
        const head = renderStats(scope, r.stats);
        if (r.missing) return `${head}\n- ledger not created yet (log_friction with scope=${scope} creates it at ${ledgerPathFor(scope, cwd)})`;
        if (!r.malformed.length) return head;
        const listed = r.malformed.slice(0, 5).map((m) => `    ${m.line}: ${m.text}`).join("\n");
        const more = r.malformed.length > 5 ? `\n    …and ${r.malformed.length - 5} more` : "";
        return `${head}\n- WARNING: ${r.malformed.length} entry-shaped line(s) could not be parsed and are excluded from these numbers:\n${listed}${more}`;
      };

      const user = readScope("user");
      const structured: { user: StatsJson; project?: StatsJson } = { user: toStatsJson(user.stats) };
      const textParts = [report("user", user)];

      if (want !== "user") {
        const project = readScope("project");
        if (project.missing) {
          textParts.push("## project ledger: not present (bootstrap by logging with scope=project inside a repo)");
        } else {
          structured.project = toStatsJson(project.stats);
          textParts.push(report("project", project));
        }
      }

      return {
        content: [{ type: "text", text: textParts.join("\n\n") }],
        structuredContent: structured,
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "friction_resolve",
    label: "Resolve friction",
    namespace,
    description:
      "Mark an open ledger entry resolved: appends '→ RESOLVED <date>: <resolution>' to the matched line. " +
      "Provide a search phrase that uniquely matches one unresolved entry (matched against problem+fix+phase).",
    parameters: Type.Object({
      search: Type.String({ description: "Search phrase — all tokens must appear in the target entry" }),
      resolution: Type.String({ description: "What fixed it, terse (newlines are collapsed)" }),
      scope: scopeParam(),
    }),
    promptSnippet: "Mark a pi-retro ledger entry resolved with a one-line note",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return withLedgerLock(() => {
        const scope: Scope = (params.scope as Scope) ?? "user";
        const ledgerPath = ledgerPathFor(scope, ctx?.cwd ?? process.cwd());
        const { items } = loadLedger(ledgerPath);

        const tokens = tokenize(params.search);
        if (!tokens.length) throw new Error("search produced no usable tokens");
        const matches = items.filter((i) => {
          const e = i.entry;
          if (!e || e.resolvedDate) return false;
          const hay = new Set(tokenize(`${e.problem} ${e.fix ?? ""} ${e.phase}`));
          return tokens.every((t) => hay.has(t));
        });

        if (matches.length === 0) throw new Error(`no unresolved entry matches "${params.search}" in the ${scope} ledger`);
        if (matches.length > 1) {
          const listed = matches.slice(0, 5).map((m) => `  ${m.line}`).join("\n");
          throw new Error(`ambiguous — ${matches.length} unresolved entries match. Narrow the search:\n${listed}`);
        }

        const target = matches[0];
        target.entry!.resolvedDate = today();
        target.entry!.resolvedNote = clean(params.resolution);
        target.line = formatLine(target.entry!);
        writeItems(ledgerPath, items);
        return {
          content: [{ type: "text", text: `Resolved: ${target.line}` }],
          details: { scope, ledgerPath },
        };
      });
    },
  });

  pi.registerTool({
    name: "friction_archive",
    label: "Archive reviewed friction",
    namespace,
    description:
      "After a review, move resolved entries (and optionally stale unresolved ones) into a dated archive file " +
      "next to the ledger, keeping the live ledger short. Non-entry lines always stay. Run only with owner approval.",
    parameters: Type.Object({
      scope: scopeParam(),
      resolvedOnly: Type.Optional(
        Type.Boolean({ description: "Archive resolved entries only (default true). False: also archive unresolved entries idle longer than `days`." }),
      ),
      days: Type.Optional(Type.Number({ description: "Staleness threshold in days when resolvedOnly=false (default 30)" })),
    }),
    promptSnippet: "Archive reviewed pi-retro entries into a dated archive file (owner approval only)",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return withLedgerLock(() => {
        const scope: Scope = (params.scope as Scope) ?? "user";
        const ledgerPath = ledgerPathFor(scope, ctx?.cwd ?? process.cwd());
        const { items } = loadLedger(ledgerPath);

        const { archive, keep } = partitionForArchive(items, {
          resolvedOnly: params.resolvedOnly ?? true,
          days: params.days ?? 30,
          now: today(),
        });
        if (!archive.length) {
          const details: { scope: Scope; ledgerPath: string; archivePath?: string; archived: number } = {
            scope,
            ledgerPath,
            archived: 0,
          };
          return {
            content: [{ type: "text", text: `nothing to archive in the ${scope} ledger` }],
            details,
          };
        }

        const archiveDir = path.join(path.dirname(ledgerPath), "archive");
        fs.mkdirSync(archiveDir, { recursive: true });
        const archivePath = path.join(archiveDir, `${today()}.md`);
        const block = `\n## archived ${today()} (${archive.length} entries)\n\n${archive.join("\n")}\n`;
        fs.appendFileSync(archivePath, fs.existsSync(archivePath) ? block : `# pi-retro archive\n${block}`);
        writeItems(ledgerPath, keep.map((line) => ({ line, entry: null })));

        const details: { scope: Scope; ledgerPath: string; archivePath?: string; archived: number } = {
          scope,
          ledgerPath,
          archivePath,
          archived: archive.length,
        };
        return {
          content: [
            { type: "text", text: `Archived ${archive.length} entries → ${archivePath}; live ledger keeps ${keep.filter((l) => /^\d{4}/.test(l)).length} entries` },
          ],
          details,
        };
      });
    },
  });

  pi.registerCommand("retro", {
    description: "Show pi-retro friction stats (user ledger, plus this repo's ledger when present)",
    handler: async (_args: string, ctx) => {
      const cwd = ctx?.cwd ?? process.cwd();
      const now = today();
      const parts: string[] = [];
      for (const scope of ["user", "project"] as const) {
        const ledgerPath = ledgerPathFor(scope, cwd);
        if (!fs.existsSync(ledgerPath)) {
          parts.push(`## ${scope} ledger: not present (${ledgerPath})`);
          continue;
        }
        const text = fs.readFileSync(ledgerPath, "utf8");
        const entries = parseItems(text)
          .map((i) => i.entry)
          .filter((e): e is FrictionEntry => !!e);
        parts.push(renderStats(scope, computeStats(entries, 14, now)));
        const malformed = findMalformed(text);
        if (malformed.length) parts.push(`- WARNING: ${malformed.length} unparsable entry-shaped line(s) in ${ledgerPath}`);
      }
      report(ctx, parts.join("\n\n"));
    },
  });
}

function report(ctx: { ui?: { notify?: (msg: string, level?: "info" | "warning" | "error") => void } }, message: string): void {
  try {
    ctx.ui?.notify?.(message, "info");
  } catch {
    /* non-interactive mode */
  }
}
