import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { dirname } from 'node:path';
import { CLAUDE_SETTINGS_FILE } from './constants.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { isPlainObject, safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// Hook-wiring drift: which hooks upstream's `.claude/settings.json` wires that
// the project does not.
//
// `settings.json` is user-owned — `init` writes it only when absent and nothing
// ever overwrites it (install-capabilities.ts). That stays. What was wrong was
// the SILENCE: upstream re-wired its hooks (6.1.0 anchored both guards on
// CLAUDE_PROJECT_DIR because the relative form was silently off after a `cd`;
// 6.12.0 added a `Stop` hook), `update` installed the new hook SCRIPTS, and the
// project kept the old wiring with `status --strict` green. This module is the
// report: a pure set difference, never a write.
//
// WHAT "WIRED" MEANS is what Claude Code runs: it merges the hooks of the
// project's `.claude/settings.json` and the per-user, gitignored
// `.claude/settings.local.json`, so both are read and their union is compared.
// A hook found ONLY in the local file is wired for this user alone, which the
// report says (`local-only`) without calling it missing. User-level
// `~/.claude/settings.json` is deliberately NOT read: this is a report about
// the project.
//
// Trust (P2): upstream's file is untrusted remote content and the project's are
// local user content. All are read as DATA — size-capped, opened non-blocking
// (a FIFO is refused, not waited on), regular files only, JSON-parsed, never
// executed. Upstream's may not be a symlink at any component. A project file
// may be a symlinked FILE (a dotfiles-managed settings.json — Claude Code reads
// through it too); a symlinked `.claude/` directory is still refused. Project
// content is never printed: only UPSTREAM entries reach a terminal, escaped and
// capped by `displayHook`.
//
// Determinism (P5): an entry is `Event · matcher · command · args` compared as
// an exact string. Equality is TEXTUAL — a user's equivalent rewrite of a hook
// reads as missing; the message says so, and the human decides (advisory).
// Extra hooks the user added never count.
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
}

const MAX_SETTINGS_BYTES = 256 * 1024;

type ReadResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'absent' }
  | { kind: 'unreadable'; reason: string };

// O_NONBLOCK keeps open(2) on a FIFO from blocking forever — the PHARN-14/15
// rule for every reader of a path it does not control. POSIX-only constants are
// simply absent on win32, where the flag is not set.
const PROJECT_OPEN = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);
const UPSTREAM_OPEN = PROJECT_OPEN | (constants.O_NOFOLLOW ?? 0);

/**
 * Read one settings file under `base`. `followLeaf` is the project side: a
 * symlinked FILE is followed, a symlinked directory on the way is not.
 */
function readSettings(
  base: string,
  rel: string,
  followLeaf: boolean,
): ReadResult {
  let linked: string | null;
  try {
    linked = findSymlinkComponent(base, followLeaf ? dirname(rel) : rel);
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
    fd = openSync(
      safeJoin(base, rel),
      followLeaf ? PROJECT_OPEN : UPSTREAM_OPEN,
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { kind: 'absent' };
    // Only the project side reaches this with a non-directory component (the
    // upstream walk above covers every component): `.claude` is a file.
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
 * is no usable `hooks` object. Malformed members are skipped, not thrown on: a
 * shape this reader does not understand is simply not an entry.
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

/** The entry keys a project file wires; an absent file wires nothing. */
function wiredKeys(
  result: ReadResult & { kind: 'ok' | 'absent' },
): Set<string> {
  return new Set(
    result.kind === 'ok' ? (hookEntries(result.value) ?? []).map(entryKey) : [],
  );
}

/** Compare the project's hook wiring with the fetched upstream clone's. */
export function diffHookWiring(
  repoDir: string,
  projectRoot: string,
): HookWiringDiff {
  const upstream = readSettings(repoDir, CLAUDE_SETTINGS_FILE, false);
  const upstreamEntries =
    upstream.kind === 'ok' ? hookEntries(upstream.value) : null;
  if (upstreamEntries === null || upstreamEntries.length === 0)
    return { status: 'no-upstream', missing: [] };

  const shared = readSettings(projectRoot, CLAUDE_SETTINGS_FILE, true);
  const local = readSettings(projectRoot, LOCAL_SETTINGS_FILE, true);
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

  const inShared = wiredKeys(shared as ReadResult & { kind: 'ok' | 'absent' });
  const inLocal = wiredKeys(local as ReadResult & { kind: 'ok' | 'absent' });
  const missing = upstreamEntries.filter(
    (e) => !inShared.has(entryKey(e)) && !inLocal.has(entryKey(e)),
  );
  const localOnly = upstreamEntries.filter(
    (e) => !inShared.has(entryKey(e)) && inLocal.has(entryKey(e)),
  );
  if (missing.length) return { status: 'missing', missing };
  if (localOnly.length) return { status: 'local-only', missing, localOnly };
  return { status: 'match', missing };
}

/**
 * Does this diff fail `status --strict`? A hook wired only locally IS wired
 * (it runs for this user), so `local-only` passes; in CI the local file does
 * not exist, so CI's answer is the same as before.
 */
export function hookWiringFails(diff: HookWiringDiff): boolean {
  return (
    diff.status === 'missing' ||
    diff.status === 'unreadable' ||
    diff.status === 'project-absent'
  );
}

// What never reaches a terminal raw: the shared sanitizer's set (C0, DEL, C1,
// Unicode format characters — lib/terminal-safe.ts) plus the two Unicode line
// separators, which are not format characters but still move text. Built from
// code points so no such character sits in this source file.
const ESCAPED = new RegExp(
  `[\\x00-\\x1f\\x7f-\\x9f\\p{Cf}${String.fromCodePoint(0x2028, 0x2029)}]`,
  'gu',
);
/** Longest line the note prints for one hook. */
const MAX_LINE = 300;

/**
 * Each UTF-16 unit of each unsafe character as `\uXXXX`. Inside a JSON string
 * these are JSON escapes, so the printed object parses back to the EXACT
 * upstream string; outside one they are just visible text.
 */
function escapeUnsafe(text: string): string {
  return text.replace(ESCAPED, (ch) =>
    [...Array(ch.length).keys()]
      .map((i) => `\\u${ch.charCodeAt(i).toString(16).padStart(4, '0')}`)
      .join(''),
  );
}

/**
 * One display line: `Event [matcher]: <the hook as JSON>`. The JSON is the hook
 * itself — `args` only when present — so an exec-form hook and a shell-form one
 * print differently, and a printed line pasted into a settings file satisfies
 * the check. Escaped (see above) and capped at MAX_LINE characters.
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
    '  each line is one hook, as JSON, under its event [matcher]. Matching is',
    '  textual: an equivalent hook you wrote differently is listed too.',
  ];
}
