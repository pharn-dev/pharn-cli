import { lstatSync } from 'node:fs';
import { readBoundedFile } from './bounded-read.js';
import { writeFileAtomic } from './atomic-write.js';
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
// bounded (lib/bounded-read.ts) and only compared against fixed literals; its
// text never reaches a terminal and never drives a path. The only write target
// is the fixed root `.gitignore`, replaced atomically — never written through a
// symlink or into a hard-linked inode (lib/atomic-write.ts).
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
export type GitignoreRefusal = 'symlink' | 'not-a-file' | 'unreadable';

/** What a run would do (or did) to `.gitignore`. */
export type GitignorePlan =
  | { action: 'none' }
  | { action: 'create' | 'append'; entries: GitignoreEntry[] }
  | { action: 'refused'; reason: GitignoreRefusal; entries: GitignoreEntry[] };

/** A plan, plus what applying it can add: a write that failed. */
export type GitignoreOutcome =
  GitignorePlan | { action: 'failed'; code: string; entries: GitignoreEntry[] };

// A gitignore pattern reduced to what decides whether it covers one of our
// directories. `floating` = it matches at any depth (no slash before its end,
// or a leading `**/`).
interface Pattern {
  negated: boolean;
  core: string;
  floating: boolean;
}

// One line → its pattern, or null for a blank line or a comment. Git strips
// unescaped TRAILING spaces but keeps leading ones (they are part of the
// pattern), so only the end is trimmed; one trailing CR is a CRLF file's line
// ending. Then one leading `/` (anchored) or `**/` (any depth), and one
// trailing `/`, `/*` or `/**` (the directory itself, or everything in it).
function parsePattern(raw: string): Pattern | null {
  const line = (raw.endsWith('\r') ? raw.slice(0, -1) : raw).replace(
    /[ \t]+$/,
    '',
  );
  if (line === '' || line.startsWith('#')) return null;
  let p = line;
  const negated = p.startsWith('!');
  if (negated) p = p.slice(1);
  let anyDepth = false;
  let anchored = false;
  if (p.startsWith('**/')) {
    anyDepth = true;
    p = p.slice(3);
  } else if (p.startsWith('/')) {
    anchored = true;
    p = p.slice(1);
  }
  // `/*` and `/**` put a slash before the end, which anchors the pattern; a
  // lone trailing `/` only limits it to directories.
  const suffix = /(\/\*\*|\/\*|\/)$/.exec(p)?.[0] ?? '';
  p = p.slice(0, p.length - suffix.length);
  const floating =
    anyDepth ||
    (!anchored && suffix !== '/*' && suffix !== '/**' && !p.includes('/'));
  return { negated, core: p, floating };
}

// Does `pattern` decide `entry`? Its exact path does (anchored or not, both
// include the root one); a bare basename (`.run`) does only while it floats.
function decides(pattern: Pattern, entry: GitignoreEntry): boolean {
  const path = entry.slice(0, -1); // 'pharn/.run'
  const base = path.slice(path.lastIndexOf('/') + 1); // '.run'
  return pattern.core === path || (pattern.core === base && pattern.floating);
}

// A UTF-8 byte-order mark, as latin1 decodes it. Git strips one at the start
// of a `.gitignore`, so the first line is read without it too — detection
// only: the file's bytes are never changed.
const UTF8_BOM = '\u00ef\u00bb\u00bf';

function lines(bytes: Buffer): string[] {
  // latin1 is a 1:1 byte decode: our literals are ASCII, and no byte is lost
  // or merged (the bytes are never re-encoded — only appended to).
  const text = bytes.toString('latin1');
  return (text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text).split(
    '\n',
  );
}

/**
 * The entries `bytes` (a `.gitignore`'s content) already decides — covered by a
 * pattern, or deliberately negated (`!pharn/.run/`), which is the user's call
 * and never overridden.
 */
export function decidedEntries(bytes: Buffer): Set<GitignoreEntry> {
  const patterns = lines(bytes)
    .map(parsePattern)
    .filter((p): p is Pattern => p !== null);
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
  const old = bytes ?? Buffer.alloc(0);
  const decided = decidedEntries(old);
  const entries = PHARN_GITIGNORE_ENTRIES.filter((e) => !decided.has(e));
  if (entries.length === 0) return { entries, append: Buffer.alloc(0) };
  const text = old.toString('latin1');
  const firstLf = text.indexOf('\n');
  const eol = firstLf > 0 && text[firstLf - 1] === '\r' ? '\r\n' : '\n';
  const hasComment = lines(old).some(
    (l) => l.replace(/[ \t\r]+$/, '') === GITIGNORE_COMMENT,
  );
  const parts: string[] = [];
  if (text.length > 0 && !text.endsWith('\n')) parts.push(eol);
  if (!hasComment) parts.push(GITIGNORE_COMMENT + eol);
  for (const entry of entries) parts.push(entry + eol);
  return { entries, append: Buffer.from(parts.join(''), 'latin1') };
}

// The plan plus the bytes it was made from, so apply writes exactly what it
// planned over.
function readPlan(projectRoot: string): {
  plan: GitignorePlan;
  old: Buffer | null;
  append: Buffer;
} {
  const all = [...PHARN_GITIGNORE_ENTRIES];
  const target = safeJoin(projectRoot, GITIGNORE_FILE);
  const refused = (reason: GitignoreRefusal) => ({
    plan: { action: 'refused' as const, reason, entries: all },
    old: null,
    append: Buffer.alloc(0),
  });
  let isLink: boolean;
  try {
    isLink = lstatSync(target).isSymbolicLink();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      return refused('unreadable');
    const { entries, append } = gitignoreAddition(null);
    return { plan: { action: 'create', entries }, old: null, append };
  }
  // A link is never written through, nor replaced (it is the user's).
  if (isLink) return refused('symlink');
  const read = readBoundedFile(target);
  if (read.kind === 'absent') return refused('unreadable'); // gone since lstat
  if (read.kind === 'unusable')
    return refused(
      read.code === 'not-a-file' || read.code === 'EISDIR'
        ? 'not-a-file'
        : 'unreadable',
    );
  const { entries, append } = gitignoreAddition(read.bytes);
  if (entries.length === 0)
    return { plan: { action: 'none' }, old: read.bytes, append };
  return { plan: { action: 'append', entries }, old: read.bytes, append };
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
  try {
    await writeFileAtomic(
      safeJoin(projectRoot, GITIGNORE_FILE),
      Buffer.concat([old ?? Buffer.alloc(0), append]),
    );
    return plan;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      action: 'failed',
      code:
        typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code)
          ? code
          : 'EUNKNOWN',
      entries: plan.entries,
    };
  }
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
