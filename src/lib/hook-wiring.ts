import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { dirname } from 'node:path';
import { CLAUDE_SETTINGS_FILE } from './constants.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { escapeUnsafe } from './terminal-safe.js';
import { isPlainObject, safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// Hook-wiring drift: which hooks upstream's `.claude/settings.json` wires that
// the project does not. `settings.json` is user-owned and never overwritten,
// so when upstream re-wires its hooks the project keeps the old wiring; this
// module is the report — a pure set difference, never a write.
//
// WHAT "WIRED" MEANS is what Claude Code runs: the union of the project's
// `.claude/settings.json` and the per-user `.claude/settings.local.json`. A
// hook found ONLY in the local file is reported `local-only`, not missing.
// User-level `~/.claude/settings.json` is deliberately NOT read.
//
// Trust: every file is read as DATA — size-capped, opened non-blocking (a FIFO
// is refused, not waited on), regular files only, never executed. A project
// file may be a symlinked FILE (Claude Code reads through it too); a symlinked
// `.claude/` directory is refused. Every entry printed, project or upstream,
// renders through `displayHook`, escaped and capped.
//
// REPLACE vs ADD: a missing upstream hook whose `.claude/hooks/<name>` the
// project already wires under the same event and matcher is a differently
// spelled wiring of the same script; adding upstream's line beside it would run
// the script twice, so the note says to replace it. Advisory; no status change.
//
// Equality is TEXTUAL over `Event · matcher · command · args`: an equivalent
// rewrite reads as missing, and the message says so. Extra user hooks never
// count.
// ---------------------------------------------------------------------------

/** The per-user settings file Claude Code merges over `settings.json`. */
const LOCAL_SETTINGS_FILE = '.claude/settings.local.json';

/** A single wired hook, normalized. */
export interface HookEntry {
  event: string;
  matcher: string;
  command: string;
  args: string[];
}

export type HookWiringStatus =
  /** Every upstream hook is wired in `settings.json` (extra user hooks allowed). */
  | 'match'
  /** Every upstream hook is wired, some only in `settings.local.json`. */
  | 'local-only'
  /** At least one upstream hook is wired in neither project file. */
  | 'missing'
  /** Upstream ships no readable settings.json / hooks block — nothing to compare. */
  | 'no-upstream'
  /** Neither project settings file exists. */
  | 'project-absent'
  /** A project settings file exists but cannot be read as JSON hooks. */
  | 'unreadable';

export interface HookWiringDiff {
  status: HookWiringStatus;
  missing: HookEntry[];
  /** Upstream hooks wired only in `settings.local.json` (when there are any). */
  localOnly?: HookEntry[];
  /** Which project file is unreadable, and why (only for `unreadable`). */
  file?: string;
  reason?: string;
  /**
   * The members of `missing` whose script the project already wires under the
   * same event and matcher, spelled differently — with the project's own
   * line(s), `settings.json` first. Only for `missing`, only when non-empty.
   */
  replace?: HookReplacement[];
}

/** A missing upstream hook and the project lines that wire its script now. */
export interface HookReplacement {
  upstream: HookEntry;
  existing: { file: string; entry: HookEntry }[];
}

const MAX_SETTINGS_BYTES = 256 * 1024;

type ReadResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'absent' }
  | { kind: 'unreadable'; reason: string };

// O_NONBLOCK keeps open(2) on a FIFO from blocking forever. Absent on win32.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

/**
 * Read one settings file under `base`: a symlinked FILE is followed (as Claude
 * Code does), a symlinked directory on the way is not. The clone holds no
 * links (lib/repo.ts), so the walk only matters for the project.
 */
function readSettings(base: string, rel: string): ReadResult {
  let linked: string | null;
  try {
    linked = findSymlinkComponent(base, dirname(rel));
  } catch {
    return {
      kind: 'unreadable',
      reason: 'a path component is not a directory',
    };
  }
  if (linked !== null)
    return { kind: 'unreadable', reason: `${linked} is a symbolic link` };
  let fd: number;
  try {
    fd = openSync(safeJoin(base, rel), OPEN_FLAGS);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { kind: 'absent' };
    // A non-directory component the walk did not raise on: `.claude` is a file.
    if (code === 'ENOTDIR')
      return {
        kind: 'unreadable',
        reason: 'a path component is not a directory',
      };
    return { kind: 'unreadable', reason: 'it cannot be opened' };
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile())
      return { kind: 'unreadable', reason: 'it is not a regular file' };
    if (st.size > MAX_SETTINGS_BYTES)
      return { kind: 'unreadable', reason: 'it is larger than 256 KB' };
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < buf.length) {
      const n = readSync(fd, buf, off, buf.length - off, off);
      if (n === 0) break;
      off += n;
    }
    try {
      return {
        kind: 'ok',
        value: JSON.parse(buf.subarray(0, off).toString('utf8')),
      };
    } catch {
      return { kind: 'unreadable', reason: 'it is not valid JSON' };
    }
  } catch {
    return { kind: 'unreadable', reason: 'it cannot be read' };
  } finally {
    closeSync(fd);
  }
}

/**
 * Normalize a settings object's `hooks` block into entries, or `null` when there
 * is no usable `hooks` object. Malformed members are skipped, not thrown on.
 */
export function hookEntries(settings: unknown): HookEntry[] | null {
  if (!isPlainObject(settings) || !isPlainObject(settings.hooks)) return null;
  const out: HookEntry[] = [];
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isPlainObject(group) || !Array.isArray(group.hooks)) continue;
      const matcher = typeof group.matcher === 'string' ? group.matcher : '';
      for (const hook of group.hooks) {
        if (!isPlainObject(hook) || typeof hook.command !== 'string') continue;
        const args = Array.isArray(hook.args)
          ? hook.args.filter((a): a is string => typeof a === 'string')
          : [];
        out.push({ event, matcher, command: hook.command, args });
      }
    }
  }
  return out;
}

function entryKey(e: HookEntry): string {
  return JSON.stringify([e.event, e.matcher, e.command, e.args]);
}

/** The entries a project file wires; an absent file wires nothing. */
function projectEntries(
  result: ReadResult & { kind: 'ok' | 'absent' },
): HookEntry[] {
  return result.kind === 'ok' ? (hookEntries(result.value) ?? []) : [];
}

/**
 * Does the hook's `command` or any `args` element CONTAIN one of `rels`? A
 * substring test, so the plain, the `$CLAUDE_PROJECT_DIR`-anchored and the
 * exec (`args`) forms all match. TEXTUAL: a wrapper script is not seen through.
 */
function entryMentions(e: HookEntry, rels: readonly string[]): boolean {
  const mentions = (text: string): boolean =>
    rels.some((rel) => text.includes(rel));
  return mentions(e.command) || e.args.some(mentions);
}

const HOOK_SCRIPT_RE = /\.claude\/hooks\/[A-Za-z0-9._-]+/g;

/** Every `.claude/hooks/<name>` an entry's command or args names. */
function hookScriptRels(e: HookEntry): string[] {
  const out = new Set<string>();
  for (const text of [e.command, ...e.args])
    for (const m of text.matchAll(HOOK_SCRIPT_RE)) out.add(m[0]);
  return [...out];
}

/**
 * For each missing upstream entry, the project lines that already wire one of
 * its scripts under the same event and matcher. A project line that IS some
 * upstream entry is never offered: it is a correct wiring, not one to replace.
 */
function findReplacements(
  missing: readonly HookEntry[],
  upstreamKeys: ReadonlySet<string>,
  project: readonly { file: string; entries: HookEntry[] }[],
): HookReplacement[] {
  const out: HookReplacement[] = [];
  for (const upstream of missing) {
    const rels = hookScriptRels(upstream);
    if (rels.length === 0) continue;
    const existing: HookReplacement['existing'] = [];
    for (const { file, entries } of project)
      for (const entry of entries)
        if (
          entry.event === upstream.event &&
          entry.matcher === upstream.matcher &&
          !upstreamKeys.has(entryKey(entry)) &&
          entryMentions(entry, rels)
        )
          existing.push({ file, entry });
    if (existing.length > 0) out.push({ upstream, existing });
  }
  return out;
}

/** Compare the project's hook wiring with the fetched upstream clone's. */
export function diffHookWiring(
  repoDir: string,
  projectRoot: string,
): HookWiringDiff {
  const upstream = readSettings(repoDir, CLAUDE_SETTINGS_FILE);
  const upstreamEntries =
    upstream.kind === 'ok' ? hookEntries(upstream.value) : null;
  if (upstreamEntries === null || upstreamEntries.length === 0)
    return { status: 'no-upstream', missing: [] };

  const shared = readSettings(projectRoot, CLAUDE_SETTINGS_FILE);
  const local = readSettings(projectRoot, LOCAL_SETTINGS_FILE);
  // An unreadable file could wire anything: the answer is "unknown", never a
  // guess from the other file.
  for (const [file, result] of [
    [CLAUDE_SETTINGS_FILE, shared],
    [LOCAL_SETTINGS_FILE, local],
  ] as const) {
    if (result.kind === 'unreadable')
      return {
        status: 'unreadable',
        missing: upstreamEntries,
        file,
        reason: result.reason,
      };
  }
  if (shared.kind === 'absent' && local.kind === 'absent')
    return { status: 'project-absent', missing: upstreamEntries };

  const sharedEntries = projectEntries(
    shared as ReadResult & { kind: 'ok' | 'absent' },
  );
  const localEntries = projectEntries(
    local as ReadResult & { kind: 'ok' | 'absent' },
  );
  const inShared = new Set(sharedEntries.map(entryKey));
  const inLocal = new Set(localEntries.map(entryKey));
  const missing = upstreamEntries.filter(
    (e) => !inShared.has(entryKey(e)) && !inLocal.has(entryKey(e)),
  );
  const localOnly = upstreamEntries.filter(
    (e) => !inShared.has(entryKey(e)) && inLocal.has(entryKey(e)),
  );
  if (missing.length) {
    const replace = findReplacements(
      missing,
      new Set(upstreamEntries.map(entryKey)),
      [
        { file: CLAUDE_SETTINGS_FILE, entries: sharedEntries },
        { file: LOCAL_SETTINGS_FILE, entries: localEntries },
      ],
    );
    return replace.length > 0
      ? { status: 'missing', missing, replace }
      : { status: 'missing', missing };
  }
  if (localOnly.length) return { status: 'local-only', missing, localOnly };
  return { status: 'match', missing };
}

/** The project's hook entries that mention a script, per settings file. */
export type HookReference =
  | { file: string; kind: 'ok'; entries: HookEntry[] }
  | { file: string; kind: 'unreadable'; reason: string };

/**
 * The project's hooks (both settings files) whose `command` or any `args`
 * element CONTAINS one of `scriptRels` — the wiring `pharn uninstall` leaves
 * pointing at a script it removed. TEXTUAL: a wrapper or a differently spelled
 * path is not found. Read as `diffHookWiring` reads; files with no match are
 * omitted, and an unreadable file is reported, since it could wire anything.
 */
export function hooksReferencing(
  projectRoot: string,
  scriptRels: readonly string[],
): HookReference[] {
  if (scriptRels.length === 0) return [];
  const out: HookReference[] = [];
  for (const file of [CLAUDE_SETTINGS_FILE, LOCAL_SETTINGS_FILE]) {
    const read = readSettings(projectRoot, file);
    if (read.kind === 'absent') continue;
    if (read.kind === 'unreadable') {
      out.push({ file, kind: 'unreadable', reason: read.reason });
      continue;
    }
    const entries = (hookEntries(read.value) ?? []).filter((e) =>
      entryMentions(e, scriptRels),
    );
    if (entries.length > 0) out.push({ file, kind: 'ok', entries });
  }
  return out;
}

/**
 * Does this diff fail `status --strict`? A hook wired only locally IS wired for
 * this user, so `local-only` passes.
 */
export function hookWiringFails(diff: HookWiringDiff): boolean {
  return (
    diff.status === 'missing' ||
    diff.status === 'unreadable' ||
    diff.status === 'project-absent'
  );
}

/** Longest line the note prints for one hook. */
const MAX_LINE = 300;

/**
 * One display line: `Event [matcher]: <the hook as JSON>`, `args` only when
 * present, so exec and shell forms print differently and a pasted line
 * satisfies the check. Escaped and capped at MAX_LINE characters.
 */
export function displayHook(e: HookEntry): string {
  const hook =
    e.args.length > 0
      ? { type: 'command', command: e.command, args: e.args }
      : { type: 'command', command: e.command };
  const where = e.matcher ? `${e.event} [${e.matcher}]` : e.event;
  const line = `${escapeUnsafe(where)}: ${escapeUnsafe(JSON.stringify(hook))}`;
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line;
}

const FILES = `${CLAUDE_SETTINGS_FILE} or ${LOCAL_SETTINGS_FILE}`;

/**
 * The note body both `update` and `status` print, or `null` when there is
 * nothing to say (`match` / `no-upstream`).
 */
export function hookWiringLines(diff: HookWiringDiff): string[] | null {
  if (diff.status === 'match' || diff.status === 'no-upstream') return null;
  if (diff.status === 'local-only') {
    const only = diff.localOnly ?? [];
    return [
      `  Every hook upstream wires is wired — ${only.length} of them only in ${LOCAL_SETTINGS_FILE}.`,
      '  They run for you, not for teammates or CI:',
      ...only.map((e) => `  ${displayHook(e)}`),
    ];
  }
  const replace = diff.status === 'missing' ? (diff.replace ?? []) : [];
  if (replace.length > 0) return replaceAndAddLines(diff.missing, replace);
  const head =
    diff.status === 'project-absent'
      ? `  Neither ${FILES} exists. Upstream wires:`
      : diff.status === 'unreadable'
        ? `  ${diff.file ?? CLAUDE_SETTINGS_FILE} could not be read (${diff.reason ?? 'unknown'}). Upstream wires:`
        : `  Upstream wires ${diff.missing.length} hook(s) that neither ${FILES} does:`;
  return [
    head,
    ...diff.missing.map((e) => `  ${displayHook(e)}`),
    '',
    `  pharn never writes ${CLAUDE_SETTINGS_FILE} after init — merge these by hand:`,
    ...FOOTER,
  ];
}

const FOOTER = [
  '  each line is one hook, as JSON, under its event [matcher]. Matching is',
  '  textual: an equivalent hook you wrote differently is listed too.',
];

/**
 * The `missing` note when some upstream hooks have a differently spelled
 * counterpart in the project: those are REPLACE (the project's current line
 * shown, through displayHook), the rest keep the ADD advice.
 */
function replaceAndAddLines(
  missing: readonly HookEntry[],
  replace: readonly HookReplacement[],
): string[] {
  const replaced = new Set(replace.map((r) => r.upstream));
  const add = missing.filter((e) => !replaced.has(e));
  const lines = [
    `  Upstream wires ${missing.length} hook(s) that neither ${FILES} does.`,
    '',
    `  REPLACE — ${replace.length} of them run a script you already wire under the same`,
    "  event [matcher], spelled differently. Replace your line with upstream's;",
    '  adding it beside yours would run the script twice:',
  ];
  for (const r of replace) {
    for (const { file, entry } of r.existing)
      lines.push(`    yours (${file}): ${displayHook(entry)}`);
    lines.push(`    upstream: ${displayHook(r.upstream)}`);
  }
  if (add.length > 0)
    lines.push(
      '',
      `  ADD — ${add.length} wired in neither file:`,
      ...add.map((e) => `  ${displayHook(e)}`),
    );
  return [
    ...lines,
    '',
    `  pharn never writes ${CLAUDE_SETTINGS_FILE} after init — edit these by hand:`,
    ...FOOTER,
  ];
}

/**
 * The HOOKS note `init` prints over a PRESERVED `.claude/settings.json` — the
 * `status`/`update` body plus the consequence `status` would report — or
 * `null`. ONE composition for the real run and `init --dry-run`.
 */
export function preservedSettingsHookLines(
  diff: HookWiringDiff,
): string[] | null {
  const lines = hookWiringLines(diff);
  if (lines === null) return null;
  return hookWiringFails(diff)
    ? [...lines, '  `pharn status --strict` fails until they are wired.']
    : lines;
}

// ---------------------------------------------------------------------------
// A FRESH install: with no project `.claude/settings.json`, init copies
// upstream's verbatim — the hook commands Claude Code will run, the largest
// trust surface of an install (THREAT-MODEL.md §4a) — and LISTS what it wires.
//
// Read through the settings reader above. The copy has no size cap or JSON
// check, so a file this reader refuses was still installed: the note then says
// it could not list the hooks, never nothing. Members `hookEntries` drops are
// COUNTED (`skipped`) so the note can point at the file.
// ---------------------------------------------------------------------------

/** What a fresh `.claude/settings.json` from upstream wires. */
export type FreshSettingsSummary =
  | {
      status: 'ok';
      /** `hookEntries` of the file, in file order (empty when none). */
      hooks: HookEntry[];
      /** Top-level own keys other than `hooks` and `_comment`, sorted. */
      otherKeys: string[];
      /** Members of `hooks` that `hookEntries` drops (see countSkipped). */
      skipped: number;
    }
  | { status: 'unreadable'; reason: string };

/**
 * The members `hookEntries` drops, one per `continue` it takes: an event whose
 * value is not an array, a group that is not an object with a `hooks` array, a
 * hook that is not an object with a string `command` (a `prompt` hook, say).
 * A `hooks` value that is present but not an object counts as one.
 */
function countSkipped(settings: Record<string, unknown>): number {
  if (!('hooks' in settings)) return 0;
  if (!isPlainObject(settings.hooks)) return 1;
  let skipped = 0;
  for (const groups of Object.values(settings.hooks)) {
    if (!Array.isArray(groups)) {
      skipped++;
      continue;
    }
    for (const group of groups) {
      if (!isPlainObject(group) || !Array.isArray(group.hooks)) {
        skipped++;
        continue;
      }
      for (const hook of group.hooks)
        if (!isPlainObject(hook) || typeof hook.command !== 'string') skipped++;
    }
  }
  return skipped;
}

/**
 * Summarize the clone's `.claude/settings.json` for the fresh-install note.
 * Never throws; JSON that is not an object lists nothing.
 */
export function upstreamSettingsSummary(repoDir: string): FreshSettingsSummary {
  const read = readSettings(repoDir, CLAUDE_SETTINGS_FILE);
  if (read.kind === 'absent')
    return { status: 'unreadable', reason: 'it does not exist' };
  if (read.kind === 'unreadable')
    return { status: 'unreadable', reason: read.reason };
  if (!isPlainObject(read.value))
    return { status: 'ok', hooks: [], otherKeys: [], skipped: 0 };
  return {
    status: 'ok',
    hooks: hookEntries(read.value) ?? [],
    otherKeys: Object.keys(read.value)
      .filter((k) => k !== 'hooks' && k !== '_comment')
      .sort(),
    skipped: countSkipped(read.value),
  };
}

/** Longest key, and most keys, the fresh note names. */
const MAX_KEY = 100;
const MAX_KEYS = 20;

/** One untrusted key, capped then escaped (capping first never splits an escape). */
function displayKey(key: string): string {
  return escapeUnsafe(key.length > MAX_KEY ? `${key.slice(0, MAX_KEY)}…` : key);
}

/**
 * The HOOKS note `init` prints after WRITING `.claude/settings.json` from
 * upstream — one composition for the real run and `init --dry-run`, never
 * empty. Hooks go through `displayHook`; keys and the reason through
 * `escapeUnsafe`, capped.
 */
export function freshSettingsHookLines(
  summary: FreshSettingsSummary,
): string[] {
  const review =
    '  Claude Code runs these commands; review `.claude/settings.json`.';
  if (summary.status === 'unreadable')
    return [
      `  Wrote ${CLAUDE_SETTINGS_FILE} from upstream, but could not list its hooks (${escapeUnsafe(summary.reason)}).`,
      review,
    ];
  const lines =
    summary.hooks.length > 0
      ? [
          `  Wrote ${CLAUDE_SETTINGS_FILE} from upstream. It wires ${summary.hooks.length} hook(s):`,
          ...summary.hooks.map((e) => `  ${displayHook(e)}`),
        ]
      : [`  Wrote ${CLAUDE_SETTINGS_FILE} from upstream. It wires no hooks.`];
  if (summary.skipped > 0)
    lines.push(
      `  ${summary.skipped} other hook entr${summary.skipped === 1 ? 'y' : 'ies'} not shown — review the file.`,
    );
  if (summary.otherKeys.length > 0) {
    const shown = summary.otherKeys.slice(0, MAX_KEYS).map(displayKey);
    const more = summary.otherKeys.length - shown.length;
    lines.push(
      `  It also sets: ${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}`,
    );
  }
  return [...lines, review];
}
