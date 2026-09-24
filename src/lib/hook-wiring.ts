import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { CLAUDE_SETTINGS_FILE } from './constants.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { isPlainObject, safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// Hook-wiring drift: which hooks upstream's `.claude/settings.json` wires that
// the project's does not.
//
// `settings.json` is user-owned — `init` writes it only when absent and nothing
// ever overwrites it (install-capabilities.ts). That stays. What was wrong was
// the SILENCE: upstream re-wired its hooks (6.1.0 anchored both guards on
// CLAUDE_PROJECT_DIR because the relative form was silently off after a `cd`;
// 6.12.0 added a `Stop` hook), `update` installed the new hook SCRIPTS, and the
// project kept the old wiring with `status --strict` green. This module is the
// report: a pure set difference, never a write.
//
// Trust (P2): upstream's file is untrusted remote content and the project's is
// local user content. Both are read as DATA — size-capped, symlink-refused,
// JSON-parsed, never executed — and only the command strings reach a terminal,
// with control characters replaced (`displayHook`).
//
// Determinism (P5): an entry is `Event · matcher · command · args` compared as
// an exact string. Equality is TEXTUAL — a user's equivalent rewrite of a hook
// reads as missing; the message says so, and the human decides (advisory).
// Extra hooks the user added never count.
// ---------------------------------------------------------------------------

/** A single wired hook, normalized. */
export interface HookEntry {
  event: string;
  matcher: string;
  command: string;
  args: string[];
}

export type HookWiringStatus =
  /** Every upstream hook is wired in the project (extra user hooks allowed). */
  | 'match'
  /** At least one upstream hook is not wired in the project. */
  | 'missing'
  /** Upstream ships no readable settings.json / hooks block — nothing to compare. */
  | 'no-upstream'
  /** The project has no settings.json at all. */
  | 'project-absent'
  /** The project's settings.json exists but cannot be read as JSON hooks. */
  | 'unreadable';

export interface HookWiringDiff {
  status: HookWiringStatus;
  missing: HookEntry[];
  /** Why the project file is unreadable (only for `unreadable`). */
  reason?: string;
}

const MAX_SETTINGS_BYTES = 256 * 1024;

type ReadResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'absent' }
  | { kind: 'unreadable'; reason: string };

function readSettings(base: string): ReadResult {
  let linked: string | null;
  try {
    linked = findSymlinkComponent(base, CLAUDE_SETTINGS_FILE);
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
    fd = openSync(safeJoin(base, CLAUDE_SETTINGS_FILE), 'r');
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT'
      ? { kind: 'absent' }
      : { kind: 'unreadable', reason: 'it cannot be opened' };
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

/** Compare the project's hook wiring with the fetched upstream clone's. */
export function diffHookWiring(
  repoDir: string,
  projectRoot: string,
): HookWiringDiff {
  const upstream = readSettings(repoDir);
  const upstreamEntries =
    upstream.kind === 'ok' ? hookEntries(upstream.value) : null;
  if (upstreamEntries === null || upstreamEntries.length === 0)
    return { status: 'no-upstream', missing: [] };

  const project = readSettings(projectRoot);
  if (project.kind === 'absent')
    return { status: 'project-absent', missing: upstreamEntries };
  if (project.kind === 'unreadable')
    return {
      status: 'unreadable',
      missing: upstreamEntries,
      reason: project.reason,
    };
  const have = new Set((hookEntries(project.value) ?? []).map(entryKey));
  const missing = upstreamEntries.filter((e) => !have.has(entryKey(e)));
  return { status: missing.length ? 'missing' : 'match', missing };
}

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/g;

/** One display line for an entry, with control characters replaced. */
export function displayHook(e: HookEntry): string {
  const cmd = [e.command, ...e.args].join(' ');
  const where = e.matcher ? `${e.event} [${e.matcher}]` : e.event;
  return `${where}: ${cmd}`.replace(CONTROL_RE, '?');
}

/**
 * The note body both `update` and `status` print, or `null` when there is
 * nothing to say (`match` / `no-upstream`).
 */
export function hookWiringLines(diff: HookWiringDiff): string[] | null {
  if (diff.status === 'match' || diff.status === 'no-upstream') return null;
  const head =
    diff.status === 'project-absent'
      ? `  ${CLAUDE_SETTINGS_FILE} is absent — no PHARN hook is wired. Upstream wires:`
      : diff.status === 'unreadable'
        ? `  ${CLAUDE_SETTINGS_FILE} could not be read (${diff.reason ?? 'unknown'}). Upstream wires:`
        : `  Upstream wires ${diff.missing.length} hook(s) your ${CLAUDE_SETTINGS_FILE} does not:`;
  return [
    head,
    ...diff.missing.map((e) => `  ${displayHook(e)}`),
    '',
    `  pharn never writes ${CLAUDE_SETTINGS_FILE} after init — merge these by hand`,
    '  (compare with pharn-oss .claude/settings.json). Matching is textual: an',
    '  equivalent hook you wrote differently is listed too.',
  ];
}
