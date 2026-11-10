import { lstatSync } from 'node:fs';
import { readJsonBounded } from './bounded-read.js';
import {
  ignoreAddition,
  ignorePatterns,
  readIgnoreFile,
  writeIgnoreFile,
  type IgnorePattern,
  type IgnoreRefusal,
} from './ignore-file.js';
import { PHARN_CONFIG_FILE } from './install-manifest.js';
import { MODELS_RECORD_KEY, RECORDS_FILE } from './install-records.js';
import {
  CAPABILITY_SUBTREES,
  SURFACE_DIRS,
  isInstallRootPath,
} from './install-surfaces.js';
import { layoutPaths } from './layout.js';
import { isPlainObject, safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// pharn's lines in the project's root `.prettierignore`. One axis (P3): keep a
// project's Prettier check off the files pharn installs and rewrites.
//
// Why: pharn copies pharn-oss's files verbatim, formatted for pharn-oss's own
// Prettier config, so a project gating on `prettier . --check` under ITS
// config goes red on them (250 files under `pharn/pharn-review/`, measured
// 2026-11-10). Reformatting them makes them `modified`, so `pharn update` then
// skips them. And `pharn.config.json`, which every `init`/`update` rewrites as
// `JSON.stringify` output, fails `prettier --check` too.
//
// Only when the project uses Prettier (`usesPrettier`); otherwise nothing is
// read further and nothing is written.
//
// The entries are DERIVED from the paths pharn writes (`prettierignoreEntries`
// — the install manifest's keys, or the record store's, which are the same
// paths), never a second list: each path is reduced to the whole-directory
// install surface it lies in (lib/install-surfaces.ts), or kept as itself.
//
// APPEND-ONLY, like `.gitignore` (lib/gitignore.ts; mechanics shared in
// lib/ignore-file.ts). An entry already covered — named exactly, by a floating
// basename, by an ancestor directory, or deliberately negated (the user's
// call) — is not added, so a second run writes nothing.
//
// What this does NOT promise (advisory, P0): pharn never runs Prettier. A gate
// that passes its own `--ignore-path`, runs from a subdirectory, or uses a
// pattern pharn does not recognise as covering (`*.md`) is not seen. The
// gate staying green is the expected effect, not a guarantee.
//
// Trust (P2): `.prettierignore` and `package.json` are project content. Both
// are read bounded and only compared against fixed or validated strings; a
// Prettier config file is lstat-ed, never read. A path becomes an ignore line
// only if it is an install-root path AND every segment passes `SAFE_SEGMENT_RE`,
// so a hand-edited record key cannot inject a pattern or a line break.
// ---------------------------------------------------------------------------

export const PRETTIERIGNORE_FILE = '.prettierignore';

/** Written above pharn's entries, once per file. */
export const PRETTIERIGNORE_COMMENT =
  '# Files installed and rewritten by pharn (added by pharn)';

/**
 * Prettier's documented config file names (a `prettier` key in package.json is
 * checked separately). Existence only: never read.
 */
export const PRETTIER_CONFIG_FILES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.toml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.ts',
  '.prettierrc.cts',
  '.prettierrc.mts',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'prettier.config.ts',
  'prettier.config.cts',
  'prettier.config.mts',
] as const;

// One path segment that may become part of an ignore line: no glob or escape
// metacharacter, no space, no leading `!` or `#`, never `.` or `..`.
const SAFE_SEGMENT_RE = /^(?!\.\.?$)[A-Za-z0-9._-]+$/;

// The pharn layout's features dir: its README is a manifest file, and the
// stages write their (partly hash-pinned) artifacts beside it, so the whole dir
// is covered. The flat layout's root `features/` may be the user's own code, so
// there only the README is (it falls through to a file entry).
const PHARN_FEATURES_README = layoutPaths('pharn').featuresReadme;
const PHARN_FEATURES_DIR = PHARN_FEATURES_README.slice(
  0,
  PHARN_FEATURES_README.lastIndexOf('/'),
);

// Whole-directory install surfaces of both layouts, longest first so a nested
// one wins.
const DIR_SURFACES: readonly string[] = [
  ...SURFACE_DIRS,
  ...CAPABILITY_SUBTREES.map((s) => s.subtree),
].sort((a, b) => b.length - a.length);

function lstatExists(projectRoot: string, name: string): boolean {
  try {
    return lstatSync(safeJoin(projectRoot, name)) !== undefined;
  } catch {
    return false;
  }
}

function hasOwn(value: unknown, key: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

/**
 * Does the project use Prettier? Any of: a root `.prettierignore` (whatever its
 * type — a refusal is reported later), a Prettier config file, or a root
 * `package.json` with a top-level `prettier` key or `prettier` in
 * `dependencies` / `devDependencies`. Never throws.
 */
export function usesPrettier(projectRoot: string): boolean {
  if (lstatExists(projectRoot, PRETTIERIGNORE_FILE)) return true;
  if (PRETTIER_CONFIG_FILES.some((name) => lstatExists(projectRoot, name)))
    return true;
  const pkg = readJsonBounded(safeJoin(projectRoot, 'package.json'));
  // Any JSON value parses — `null`, a number, an array — so only an object is
  // read further.
  if (pkg.kind !== 'ok' || !isPlainObject(pkg.value)) return false;
  const value = pkg.value;
  return (
    hasOwn(value, 'prettier') ||
    hasOwn(value.dependencies, 'prettier') ||
    hasOwn(value.devDependencies, 'prettier')
  );
}

/** One `.prettierignore` line pharn writes: `/<dir>/` or `/<file>`. */
function entryFor(path: string): string | null {
  if (path === MODELS_RECORD_KEY || !isInstallRootPath(path)) return null;
  if (!path.split('/').every((s) => SAFE_SEGMENT_RE.test(s))) return null;
  if (path === PHARN_FEATURES_README) return `/${PHARN_FEATURES_DIR}/`;
  const dir = DIR_SURFACES.find((d) => path.startsWith(`${d}/`));
  return dir === undefined ? `/${path}` : `/${dir}/`;
}

/**
 * The lines `.prettierignore` must hold for the project-relative `paths` pharn
 * writes, plus pharn's two root state files. Paths that are not install-root
 * paths (or fail the segment check) contribute nothing. Anchored, de-duplicated,
 * sorted. Empty when `paths` contributes nothing.
 */
export function prettierignoreEntries(paths: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const path of paths) {
    const entry = entryFor(path);
    if (entry !== null) out.add(entry);
  }
  if (out.size === 0) return [];
  out.add(`/${PHARN_CONFIG_FILE}`);
  out.add(`/${RECORDS_FILE}`);
  return [...out].sort();
}

// Does `p` decide the entry for `path`? The exact path (a file only by a
// pattern that is not directory-only), a floating basename, or — for anything
// below it — an ancestor directory, anchored or floating. Negated or not: a
// negation is the user's call and never overridden. A NEGATION of something
// INSIDE a directory entry decides it too: appending the broader line after
// `!pharn/pharn-review/a11y/` would silently undo the user's exception.
function decides(p: IgnorePattern, path: string, isDir: boolean): boolean {
  if (p.core === '') return false;
  const segments = path.split('/');
  const base = segments[segments.length - 1]!;
  const fileOk = isDir || p.suffix === '';
  if (p.core === path && fileOk) return true;
  if (p.floating && p.core === base && fileOk) return true;
  if (path.startsWith(`${p.core}/`)) return true;
  if (isDir && p.negated && p.core.startsWith(`${path}/`)) return true;
  return (
    p.floating &&
    !p.core.includes('/') &&
    segments.slice(0, -1).includes(p.core)
  );
}

/** The subset of `entries` that `bytes` (a `.prettierignore`) already decides. */
export function decidedPrettierEntries(
  bytes: Buffer,
  entries: readonly string[],
): Set<string> {
  const patterns = ignorePatterns(bytes);
  return new Set(
    entries.filter((entry) => {
      const isDir = entry.endsWith('/');
      const path = entry.slice(1, isDir ? -1 : undefined);
      return patterns.some((p) => decides(p, path, isDir));
    }),
  );
}

/** What a run would do (or did) to `.prettierignore`. */
export type PrettierignorePlan =
  | { action: 'none' }
  | { action: 'create' | 'append'; entries: string[] }
  | { action: 'refused'; reason: IgnoreRefusal; entries: string[] };

/** A plan, plus what applying it can add: a write that failed. */
export type PrettierignoreOutcome =
  PrettierignorePlan | { action: 'failed'; code: string; entries: string[] };

function readPlan(
  projectRoot: string,
  paths: Iterable<string>,
): { plan: PrettierignorePlan; old: Buffer | null; append: Buffer } {
  const none = {
    plan: { action: 'none' as const },
    old: null,
    append: Buffer.alloc(0),
  };
  if (!usesPrettier(projectRoot)) return none;
  const entries = prettierignoreEntries(paths);
  if (entries.length === 0) return none;
  const read = readIgnoreFile(projectRoot, PRETTIERIGNORE_FILE);
  if (read.kind === 'refused')
    return {
      plan: { action: 'refused', reason: read.reason, entries },
      old: null,
      append: Buffer.alloc(0),
    };
  const old = read.kind === 'ok' ? read.bytes : null;
  const decided =
    old === null ? new Set<string>() : decidedPrettierEntries(old, entries);
  const missing = entries.filter((e) => !decided.has(e));
  if (missing.length === 0) return { ...none, old };
  const append = ignoreAddition(old, missing, PRETTIERIGNORE_COMMENT);
  return {
    plan: { action: old === null ? 'create' : 'append', entries: missing },
    old,
    append,
  };
}

/**
 * What a run would do to `.prettierignore` for the project-relative `paths`
 * pharn writes. Read-only; never throws.
 */
export function planPrettierignore(
  projectRoot: string,
  paths: Iterable<string>,
): PrettierignorePlan {
  return readPlan(projectRoot, paths).plan;
}

/**
 * Make `.prettierignore` cover `paths`: plan again (callers run this under the
 * project lock, after the install wrote everything else), then write the old
 * bytes plus the addition atomically. A refusal writes nothing; a failed write
 * is returned, never thrown — the install it follows has already landed.
 */
export async function applyPrettierignore(
  projectRoot: string,
  paths: Iterable<string>,
): Promise<PrettierignoreOutcome> {
  const { plan, old, append } = readPlan(projectRoot, [...paths]);
  if (plan.action !== 'create' && plan.action !== 'append') return plan;
  const code = await writeIgnoreFile(
    projectRoot,
    PRETTIERIGNORE_FILE,
    old,
    append,
  );
  return code === null
    ? plan
    : { action: 'failed', code, entries: plan.entries };
}

/** Would a run add an entry (a plan pharn can carry out)? */
export function prettierignorePending(plan: PrettierignorePlan): boolean {
  return plan.action === 'create' || plan.action === 'append';
}

// Text lists show at most this many entries; `--json` and the by-hand advice
// carry them all.
export const MAX_LISTED_ENTRIES = 10;

function shortList(entries: readonly string[]): string {
  const shown = entries.slice(0, MAX_LISTED_ENTRIES).join(', ');
  const more = entries.length - MAX_LISTED_ENTRIES;
  return more > 0 ? `${shown} and ${more} more` : shown;
}

function count(n: number): string {
  return `${n} path${n === 1 ? '' : 's'}`;
}

const REFUSAL_TEXT: Record<IgnoreRefusal, string> = {
  symlink: 'it is a symlink, and pharn never writes through one',
  'not-a-file': 'it is not a regular file',
  unreadable: 'it could not be read',
};

const WHY =
  'so your Prettier check skips the files pharn installs and rewrites';

/**
 * The lines that report `outcome` — ONE wording for `init`, `update`, both dry
 * runs (`preview` = future tense) and `status` (`status` = what is missing and
 * how to add it). Null when there is nothing to say. `warn` marks text a caller
 * prints as a warning.
 */
export function prettierignoreLines(
  outcome: PrettierignoreOutcome,
  opts: { preview?: boolean; status?: boolean } = {},
): { text: string; warn: boolean } | null {
  switch (outcome.action) {
    case 'none':
      return null;
    case 'create':
    case 'append': {
      const n = count(outcome.entries.length);
      const list = shortList(outcome.entries);
      if (opts.status)
        return {
          text: `.prettierignore ${outcome.action === 'create' ? 'does not exist and Prettier is in use' : 'does not cover'} — ${n} pharn installs or rewrites: ${list}. pharn update adds them.`,
          warn: false,
        };
      if (outcome.action === 'create')
        return {
          text: opts.preview
            ? `.prettierignore: would create it with ${n} (${list}) ${WHY}.`
            : `Created .prettierignore with ${n} (${list}) ${WHY}.`,
          warn: false,
        };
      return {
        text: opts.preview
          ? `.prettierignore: would add ${n} (${list}) ${WHY}.`
          : `Added ${n} to .prettierignore (${list}) ${WHY}.`,
        warn: false,
      };
    }
    case 'refused':
    case 'failed': {
      const why =
        outcome.action === 'refused'
          ? REFUSAL_TEXT[outcome.reason]
          : `writing it failed (${outcome.code})`;
      const verb = opts.status
        ? 'cannot be updated by pharn'
        : opts.preview
          ? 'would not be updated'
          : 'was not updated';
      return {
        text: `.prettierignore ${verb}: ${why}. Add these lines yourself ${WHY}: ${outcome.entries.join(', ')}`,
        warn: true,
      };
    }
  }
}

/** The `--json` projection of a plan (init, update and status share it). */
export type PrettierignoreReport =
  | { action: 'create' | 'append'; entries: string[] }
  | { action: 'refused'; reason: IgnoreRefusal; entries: string[] };

/**
 * The JSON form of `plan`, or null when nothing would change. Built field by
 * field: every value is a fixed literal or a gated entry.
 */
export function prettierignoreReport(
  plan: PrettierignorePlan,
): PrettierignoreReport | null {
  switch (plan.action) {
    case 'none':
      return null;
    case 'create':
    case 'append':
      return { action: plan.action, entries: [...plan.entries] };
    case 'refused':
      return {
        action: 'refused',
        reason: plan.reason,
        entries: [...plan.entries],
      };
  }
}
