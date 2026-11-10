import { readBoundedFile } from './bounded-read.js';
import {
  ignoreAddition,
  ignorePatterns,
  readIgnoreFile,
  writeIgnoreFile,
  type IgnorePattern,
  type IgnoreRefusal,
} from './ignore-file.js';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// pharn's lines in the project's root `.gitignore`. One axis (P3): make sure
// git never tracks PHARN's runtime scratch (`pharn/.run/`, written by
// pharn-oss's floor at a fixed path for every layout) or this CLI's backups
// (`pharn/.backup/`). A tracked run directory turned a correct build into 55
// "escapes" in pharn-oss's reconcile (pharn-oss #408), and a backup holds the
// user's pre-overwrite bytes, which do not belong in a commit.
//
// APPEND-ONLY. The new file is the old file's exact bytes followed by pharn's
// block — never a decode/re-encode, never a reorder, never a removed line. An
// entry already covered (in any recognised spelling, or deliberately negated)
// is not added, so a second run writes nothing.
//
// What this does NOT promise (advisory, P0): a `.gitignore` line does not
// untrack a file already committed, and a broader pattern that also covers the
// path (`pharn/`, `pharn/.*`, `*`) is not recognised — pharn then appends its
// own line, which is redundant and harmless.
//
// Trust (P2): `.gitignore` is project content and may be hostile. It is read
// bounded and only compared against fixed literals; its text never reaches a
// terminal and never drives a path. The only write target is the fixed root
// `.gitignore`, replaced atomically — never written through a symlink or into a
// hard-linked inode. The reading, parsing and appending are lib/ignore-file.ts,
// shared with lib/prettierignore.ts; the covered test below is this file's.
// ---------------------------------------------------------------------------

export const GITIGNORE_FILE = '.gitignore';

/** The lines pharn makes sure the project's `.gitignore` covers, in order. */
export const PHARN_GITIGNORE_ENTRIES = [
  'pharn/.run/',
  'pharn/.backup/',
] as const;

export type GitignoreEntry = (typeof PHARN_GITIGNORE_ENTRIES)[number];

/** Written above pharn's entries, once per file. */
export const GITIGNORE_COMMENT =
  '# PHARN run state and update backups (added by pharn)';

/** Why `.gitignore` was left alone. Fixed values, never file content. */
export type GitignoreRefusal = IgnoreRefusal;

/** What a run would do (or did) to `.gitignore`. */
export type GitignorePlan =
  | { action: 'none' }
  | { action: 'create' | 'append'; entries: GitignoreEntry[] }
  | { action: 'refused'; reason: GitignoreRefusal; entries: GitignoreEntry[] };

/** A plan, plus what applying it can add: a write that failed. */
export type GitignoreOutcome =
  GitignorePlan | { action: 'failed'; code: string; entries: GitignoreEntry[] };

// Does `pattern` decide `entry`? Its exact path does (anchored or not, both
// include the root one); a bare basename (`.run`) does only while it floats.
function decides(pattern: IgnorePattern, entry: GitignoreEntry): boolean {
  const path = entry.slice(0, -1); // 'pharn/.run'
  const base = path.slice(path.lastIndexOf('/') + 1); // '.run'
  return pattern.core === path || (pattern.core === base && pattern.floating);
}

/**
 * The entries `bytes` (a `.gitignore`'s content) already decides — covered by a
 * pattern, or deliberately negated (`!pharn/.run/`), which is the user's call
 * and never overridden.
 */
export function decidedEntries(bytes: Buffer): Set<GitignoreEntry> {
  const patterns = ignorePatterns(bytes);
  return new Set(
    PHARN_GITIGNORE_ENTRIES.filter((entry) =>
      patterns.some((p) => decides(p, entry)),
    ),
  );
}

/**
 * The bytes to APPEND to `bytes` (null = no file yet) so that every entry is
 * decided, and which entries they add. Empty when nothing is missing.
 *
 * Line endings follow the file: CRLF when its first line ending is `\r\n`,
 * else LF (and LF for a new file). A non-empty file that does not end in a line
 * ending gets one first, so pharn's block starts on a line of its own. The
 * comment is written only when the file does not already hold it.
 */
export function gitignoreAddition(bytes: Buffer | null): {
  entries: GitignoreEntry[];
  append: Buffer;
} {
  const decided = decidedEntries(bytes ?? Buffer.alloc(0));
  const entries = PHARN_GITIGNORE_ENTRIES.filter((e) => !decided.has(e));
  return { entries, append: ignoreAddition(bytes, entries, GITIGNORE_COMMENT) };
}

// The plan plus the bytes it was made from, so apply writes exactly what it
// planned over.
function readPlan(projectRoot: string): {
  plan: GitignorePlan;
  old: Buffer | null;
  append: Buffer;
} {
  const read = readIgnoreFile(projectRoot, GITIGNORE_FILE);
  if (read.kind === 'refused')
    return {
      plan: {
        action: 'refused',
        reason: read.reason,
        entries: [...PHARN_GITIGNORE_ENTRIES],
      },
      old: null,
      append: Buffer.alloc(0),
    };
  const old = read.kind === 'ok' ? read.bytes : null;
  const { entries, append } = gitignoreAddition(old);
  if (old === null) return { plan: { action: 'create', entries }, old, append };
  if (entries.length === 0) return { plan: { action: 'none' }, old, append };
  return { plan: { action: 'append', entries }, old, append };
}

/** What a run would do to `.gitignore`. Read-only; never throws. */
export function planGitignore(projectRoot: string): GitignorePlan {
  return readPlan(projectRoot).plan;
}

/**
 * Make `.gitignore` cover pharn's entries: plan again (callers run this under
 * the project lock, after the install wrote everything else), then write the
 * old bytes plus the addition atomically. A refusal writes nothing; a failed
 * write is returned, never thrown — the install it follows has already landed.
 */
export async function applyGitignore(
  projectRoot: string,
): Promise<GitignoreOutcome> {
  const { plan, old, append } = readPlan(projectRoot);
  if (plan.action !== 'create' && plan.action !== 'append') return plan;
  const code = await writeIgnoreFile(projectRoot, GITIGNORE_FILE, old, append);
  return code === null
    ? plan
    : { action: 'failed', code, entries: plan.entries };
}

/** Would a run add an entry (a plan pharn can carry out)? */
export function gitignorePending(plan: GitignorePlan): boolean {
  return plan.action === 'create' || plan.action === 'append';
}

/**
 * Is `pharn/.backup/` already out of git, or about to be (`plan` adds it)? The
 * backup notice's advice is printed only when neither holds.
 */
export function backupDirIgnored(
  projectRoot: string,
  plan: GitignorePlan | null = null,
): boolean {
  if (
    plan !== null &&
    gitignorePending(plan) &&
    'entries' in plan &&
    plan.entries.includes('pharn/.backup/')
  )
    return true;
  const read = readBoundedFile(safeJoin(projectRoot, GITIGNORE_FILE));
  return read.kind === 'ok' && decidedEntries(read.bytes).has('pharn/.backup/');
}

const REFUSAL_TEXT: Record<GitignoreRefusal, string> = {
  symlink: 'it is a symlink, and pharn never writes through one',
  'not-a-file': 'it is not a regular file',
  unreadable: 'it could not be read',
};

/**
 * The lines that report `outcome` — ONE wording for `init`, `update` and both
 * dry runs. `preview` = future tense (a dry run). Null when there is nothing to
 * say. `warn` marks lines a caller prints as a warning.
 */
export function gitignoreLines(
  outcome: GitignoreOutcome,
  opts: { preview?: boolean } = {},
): { text: string; warn: boolean } | null {
  const list = (entries: readonly string[]) => entries.join(', ');
  switch (outcome.action) {
    case 'none':
      return null;
    case 'create':
      return {
        text: opts.preview
          ? `.gitignore: would create it with ${list(outcome.entries)} (PHARN's run state and update backups).`
          : `Created .gitignore with ${list(outcome.entries)} (PHARN's run state and update backups).`,
        warn: false,
      };
    case 'append':
      return {
        text: opts.preview
          ? `.gitignore: would add ${list(outcome.entries)} (PHARN's run state and update backups).`
          : `Added ${list(outcome.entries)} to .gitignore (PHARN's run state and update backups).`,
        warn: false,
      };
    case 'refused':
    case 'failed': {
      const why =
        outcome.action === 'refused'
          ? REFUSAL_TEXT[outcome.reason]
          : `writing it failed (${outcome.code})`;
      return {
        text: `.gitignore ${opts.preview ? 'would not be' : 'was not'} updated: ${why}. Add these lines yourself so PHARN's run state is never committed: ${list(outcome.entries)}`,
        warn: true,
      };
    }
  }
}

/** The `--dry-run --json` projection of a plan (init and update share it). */
export type GitignoreReport =
  | { action: 'create' | 'append'; entries: string[] }
  | { action: 'refused'; reason: GitignoreRefusal; entries: string[] };

/**
 * The JSON form of `plan`, or null when nothing would change — the caller then
 * omits the key, so a report with nothing to add keeps its earlier bytes.
 * Built field by field: every value is a fixed literal.
 */
export function gitignoreReport(plan: GitignorePlan): GitignoreReport | null {
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
