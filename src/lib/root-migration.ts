import { lstatSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { readBoundedFile } from './bounded-read.js';
import { PHARN_ROOT_FALLBACK_DOCS } from './constants.js';
import { contentHash } from './hash.js';
import type { FileRecords } from './install-records.js';
import { configLayout, resolveTrustedDocs } from './layout.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { planUninstall } from './uninstall-plan.js';
import { terminalSafe } from './terminal-safe.js';
import { safeJoin } from './validate.js';
import type { Layout, PharnConfig } from '../types.js';

// ---------------------------------------------------------------------------
// The old ROOT footprint of a pharn-layout install, and how a run retires it.
//
// From pharn-oss SKILLS_VERSION 7.0.0 the pharn layout keeps everything under
// pharn/: an installed project's root holds only `.claude/`, `pharn/` and
// pharn's two JSON files. Older installs left four kinds of thing at the root,
// and each is handled by the narrowest rule that is still safe:
//
//   docs      Root THREAT-MODEL.md / LIMITS.md, which pharn itself wrote. Once
//             the clone ships them under pharn/ AND the new copy landed, a root
//             copy whose bytes equal its record is DELETED — uninstall's own
//             classifier decides (lib/uninstall-plan.ts, reused, not forked).
//             Anything else (edited, unrecorded, a symlink, unreadable, absent)
//             is left alone. Exactly the two-entry PHARN_ROOT_FALLBACK_DOCS
//             list: no record key ever becomes a delete path here.
//   moves     `memory-bank/` and `pharn.spec-template.md`, the USER's data
//             (pharn-oss's canon and the project's SPEC template). Moved —
//             never merged — to pharn/, backed up first, only when the clone is
//             SKILLS 7 or newer (the version that reads them there). Below 7
//             this whole half is inert, which is what lets this CLI ship
//             before pharn-oss moves.
//   scratch   `.pharn/`, pharn-oss's runtime scratch. Never moved or deleted;
//             only noticed (its `ci.yml` belongs to pharn-ci and stays).
//   gitignore The user's `.gitignore`, read and never written: an entry for an
//             old path gets its replacement printed.
//
// Planning reads; nothing here writes except `deleteRootDocs` and
// `applyRootMoves`, which the caller runs under the project lock.
//
// One axis (P3): retiring the old root footprint of a pharn install.
// ---------------------------------------------------------------------------

/** What a run does with one old root doc. */
export type RootDocAction =
  'delete' | 'keep-edited' | 'absent' | 'unverifiable';
/** What a run does with one old root user-data path. */
export type RootMoveAction =
  'move' | 'conflict' | 'refused-symlink' | 'unreadable' | 'absent';

export interface RootDocStep {
  rel: string;
  action: RootDocAction;
}

export interface RootMove {
  // Project-relative; a directory ends in `/`.
  from: string;
  to: string;
  action: RootMoveAction;
}

/** The JSON-safe facts a preview shows and a real run acts on. */
export interface RootMigration {
  docs: RootDocStep[];
  moves: RootMove[];
  scratchNotice: boolean;
  gitignoreHints: string[];
}

/** The plan plus what only the writer needs. */
export interface RootMigrationPlan {
  report: RootMigration;
  // Regular files the moves would back up first (project-relative).
  backups: string[];
}

// The SKILLS_VERSION major from which the user-data moves apply.
export const ROOT_MOVES_FROM_MAJOR = 7;

// The user-data paths that move, in report order. Fixed literals (P5).
const USER_DATA_MOVES: readonly { from: string; to: string; dir: boolean }[] = [
  { from: 'memory-bank', to: 'pharn/memory-bank', dir: true },
  { from: 'pharn.spec-template.md', to: 'pharn/spec-template.md', dir: false },
];

// Old `.gitignore` entries and the line that replaces each. Matched as whole
// lines after normalizing (see gitignoreHints); never written. The old names
// stay in src/ only here (to recognise them) and in project-lock.ts (the
// one-release legacy lock): this is the migration step that retires them.
const GITIGNORE_REPLACEMENTS: readonly { old: string; hint: string }[] = [
  { old: '.pharn', hint: 'pharn/.run/' },
  { old: '.pharn-backup', hint: 'pharn/.backup/' },
  { old: '.pharn.lock', hint: 'pharn/.lock*' },
];

// pharn-ci's config inside the old scratch dir: not scratch, and not moved by
// this CLI (pharn-ci reads it there).
const SCRATCH_DIR = '.pharn';
const SCRATCH_KEEP = 'ci.yml';

/** The major of a `VERSION_RE`-valid version string, or null. */
export function versionMajor(version: string): number | null {
  const m = /^(\d+)\./.exec(version);
  return m === null ? null : Number(m[1]);
}

/**
 * The migration this run would make, or `null` when nothing applies: the
 * clone or the recorded install is not the pharn layout, or the clone is below
 * SKILLS 7 and ships neither doc under pharn/.
 *
 * `records` is the USABLE (stamp-checked) baseline or null. `skillsVersion` is
 * the clone's, already validated by readSkillsVersion.
 */
export function planRootMigration(input: {
  projectRoot: string;
  repoDir: string;
  layout: Layout;
  // The layout the install was RECORDED at before this run. A flat install
  // moving to the pharn layout is not retiring a pharn install's footprint:
  // its root docs are the flat tree the move leaves behind, which `update`
  // never deletes. The next run (now a pharn install) decides them.
  installedLayout: Layout;
  skillsVersion: string;
  records: FileRecords | null;
}): RootMigrationPlan | null {
  const { projectRoot, repoDir, layout, skillsVersion, records } = input;
  if (layout !== 'pharn' || input.installedLayout !== 'pharn') return null;
  const docs = planRootDocs(projectRoot, repoDir, records);
  const major = versionMajor(skillsVersion);
  const movesApply = major !== null && major >= ROOT_MOVES_FROM_MAJOR;
  if (!movesApply && docs.length === 0) return null;
  const moves = movesApply ? planMoves(projectRoot) : [];
  return {
    report: {
      docs,
      moves: moves.map((m) => m.move),
      scratchNotice: movesApply && scratchNotice(projectRoot),
      gitignoreHints: movesApply ? gitignoreHints(projectRoot) : [],
    },
    backups: moves.flatMap((m) => m.backups),
  };
}

// One step per root doc whose pharn/ counterpart this clone ships. A clone that
// still keeps a doc at the root resolves it there (resolveTrustedDocs), so that
// doc is an ordinary install file, not a migration candidate.
function planRootDocs(
  projectRoot: string,
  repoDir: string,
  records: FileRecords | null,
): RootDocStep[] {
  const shipped = new Set(resolveTrustedDocs(repoDir, 'pharn'));
  const steps: RootDocStep[] = [];
  for (const [pharnRel, rootRel] of Object.entries(PHARN_ROOT_FALLBACK_DOCS)) {
    if (!shipped.has(pharnRel)) continue;
    steps.push({
      rel: rootRel,
      action: classifyRootDoc(projectRoot, rootRel, records),
    });
  }
  return steps;
}

// uninstall's buckets, through uninstall's own classifier. A doc with no
// usable record is not provably pharn's: present → kept as `unverifiable`.
function classifyRootDoc(
  projectRoot: string,
  rel: string,
  records: FileRecords | null,
): RootDocAction {
  const recorded =
    records !== null && Object.hasOwn(records, rel) ? records[rel] : undefined;
  if (recorded === undefined) {
    let stat;
    try {
      stat = lstatSync(safeJoin(projectRoot, rel), { throwIfNoEntry: false });
    } catch {
      return 'unverifiable';
    }
    return stat === undefined ? 'absent' : 'unverifiable';
  }
  const plan = planUninstall(projectRoot, { [rel]: recorded });
  if (plan.delete.length > 0) return 'delete';
  if (plan.edited.length > 0) return 'keep-edited';
  if (plan.absent.length > 0) return 'absent';
  // `unverifiable`, and — unreachable for a root-level file, which has no
  // parent to walk — `unsafe`/`outside`: kept either way.
  return 'unverifiable';
}

function planMoves(
  projectRoot: string,
): { move: RootMove; backups: string[] }[] {
  return USER_DATA_MOVES.map(({ from, to, dir }) => {
    const shown = (rel: string): string => (dir ? `${rel}/` : rel);
    const move = (action: RootMoveAction): RootMove => ({
      from: shown(from),
      to: shown(to),
      action,
    });
    let source;
    try {
      source = lstatSync(safeJoin(projectRoot, from), {
        throwIfNoEntry: false,
      });
    } catch {
      return { move: move('refused-symlink'), backups: [] };
    }
    if (source === undefined) return { move: move('absent'), backups: [] };
    if (source.isSymbolicLink())
      return { move: move('refused-symlink'), backups: [] };
    // Only the expected type moves: a directory at memory-bank/, a regular
    // file at the template. Anything else (a FIFO, a device, a directory named
    // like the template) is not something pharn-oss wrote, and copying it for
    // the backup could block or fail — refused, named, never moved.
    if (dir ? !source.isDirectory() : !source.isFile())
      return { move: move('unreadable'), backups: [] };
    // The destination's parent chain (`pharn/`) may not be a link either.
    let destLink: string | null;
    let dest;
    try {
      destLink = findSymlinkComponent(projectRoot, to);
      dest = lstatSync(safeJoin(projectRoot, to), { throwIfNoEntry: false });
    } catch {
      return { move: move('refused-symlink'), backups: [] };
    }
    if (destLink !== null)
      return { move: move('refused-symlink'), backups: [] };
    if (dest !== undefined) return { move: move('conflict'), backups: [] };
    if (!dir) return { move: move('move'), backups: [from] };
    // A move that cannot be backed up does not run — and must not fail the
    // whole update either: an unreadable directory is this move's refusal.
    try {
      return {
        move: move('move'),
        backups: regularFilesUnder(projectRoot, from),
      };
    } catch {
      return { move: move('unreadable'), backups: [] };
    }
  });
}

// Every REGULAR file under `rel`, depth-first, sorted; symlinks are neither
// followed nor listed (the rename moves them as they are), and FIFOs, sockets
// and devices are skipped (opening a FIFO blocks). Throws on an unreadable
// directory; the caller turns that into the move's `unreadable` refusal.
function regularFilesUnder(projectRoot: string, rel: string): string[] {
  const out: string[] = [];
  const names = readdirSync(safeJoin(projectRoot, rel)).sort();
  for (const name of names) {
    const child = `${rel}/${name}`;
    const stat = lstatSync(safeJoin(projectRoot, child));
    if (stat.isDirectory()) out.push(...regularFilesUnder(projectRoot, child));
    else if (stat.isFile()) out.push(child);
  }
  return out;
}

// True when `.pharn/` is a real directory holding anything but pharn-ci's
// `ci.yml`. lstat: a symlinked `.pharn` is never listed.
function scratchNotice(projectRoot: string): boolean {
  try {
    const stat = lstatSync(safeJoin(projectRoot, SCRATCH_DIR), {
      throwIfNoEntry: false,
    });
    if (stat === undefined || !stat.isDirectory()) return false;
    return readdirSync(safeJoin(projectRoot, SCRATCH_DIR)).some(
      (name) => name !== SCRATCH_KEEP,
    );
  } catch {
    return false;
  }
}

// The replacement for each old path the project's `.gitignore` names. A line
// counts after trimming, dropping one leading `/`, and one trailing `/`, `/*`,
// `/**` or `*`; comments and negations never count. Membership on fixed
// literals (P5) — the file's text is never echoed.
function gitignoreHints(projectRoot: string): string[] {
  const read = readBoundedFile(safeJoin(projectRoot, '.gitignore'));
  if (read.kind !== 'ok') return [];
  const lines = new Set(
    read.bytes
      .toString('utf8')
      .split('\n')
      .map((line) =>
        line
          .trim()
          .replace(/^\//, '')
          .replace(/(\/\*\*|\/\*|\/|\*)$/, ''),
      ),
  );
  return GITIGNORE_REPLACEMENTS.filter(({ old }) => lines.has(old)).map(
    ({ hint }) => hint,
  );
}

/**
 * Delete each `delete` doc whose pharn/ copy LANDED: a regular file, reached
 * through no symlinked component, whose contentHash equals the clone's. Run
 * under the lock, after the run's writes. A failed unlink keeps the file (and
 * so its record) and is reported, never thrown — every write before this one
 * has already landed and must still be recorded.
 */
export function deleteRootDocs(
  projectRoot: string,
  repoDir: string,
  docs: readonly RootDocStep[],
): { deleted: string[]; kept: string[] } {
  const deleted: string[] = [];
  const kept: string[] = [];
  for (const { rel, action } of docs) {
    if (action !== 'delete') continue;
    const pharnRel = pharnCounterpart(rel);
    if (pharnRel === null || !landed(projectRoot, repoDir, pharnRel)) {
      kept.push(rel);
      continue;
    }
    try {
      unlinkSync(safeJoin(projectRoot, rel));
      deleted.push(rel);
    } catch {
      kept.push(rel);
    }
  }
  return { deleted, kept };
}

function pharnCounterpart(rootRel: string): string | null {
  for (const [pharnRel, rel] of Object.entries(PHARN_ROOT_FALLBACK_DOCS))
    if (rel === rootRel) return pharnRel;
  return null;
}

function landed(projectRoot: string, repoDir: string, rel: string): boolean {
  try {
    if (findSymlinkComponent(projectRoot, rel) !== null) return false;
    const stat = lstatSync(safeJoin(projectRoot, rel), {
      throwIfNoEntry: false,
    });
    if (stat === undefined || !stat.isFile()) return false;
    return (
      contentHash(safeJoin(projectRoot, rel)) ===
      contentHash(safeJoin(repoDir, rel))
    );
  } catch {
    return false;
  }
}

/** One move the writer attempted and could not make, with why. */
export interface RootMoveFailure {
  move: RootMove;
  reason: string;
}

/**
 * Make the planned `move`s: re-check, under the lock, that the source is still
 * a non-link and the destination still absent, then `renameSync` (atomic on one
 * filesystem; EXDEV and every other error leave the source where it was). The
 * caller backed the sources up first.
 */
export function applyRootMoves(
  projectRoot: string,
  moves: readonly RootMove[],
): { moved: RootMove[]; failed: RootMoveFailure[] } {
  const moved: RootMove[] = [];
  const failed: RootMoveFailure[] = [];
  for (const move of moves) {
    if (move.action !== 'move') continue;
    const from = move.from.replace(/\/$/, '');
    const to = move.to.replace(/\/$/, '');
    try {
      const source = lstatSync(safeJoin(projectRoot, from));
      if (source.isSymbolicLink()) throw new Error('it is now a symbolic link');
      if (findSymlinkComponent(projectRoot, to) !== null)
        throw new Error(`a component of ${to} is a symbolic link`);
      if (lstatSync(safeJoin(projectRoot, to), { throwIfNoEntry: false }))
        throw new Error(`${to} now exists`);
      renameSync(safeJoin(projectRoot, from), safeJoin(projectRoot, to));
      moved.push(move);
    } catch (err) {
      failed.push({
        move,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { moved, failed };
}

/** True when a move step leaves the run failed (exit 1). */
export function moveBlocks(action: RootMoveAction): boolean {
  return (
    action === 'conflict' ||
    action === 'refused-symlink' ||
    action === 'unreadable'
  );
}

/**
 * The old root path a same-version `update` must re-open for, or null — the
 * local, read-only signal that keeps an install already at SKILLS 7 (updated
 * by an older CLI, which never ran this migration) from keeping its old root
 * footprint forever behind the early return. Two facts count, both only for a
 * pharn-layout install at SKILLS major ≥ 7:
 *
 *   1. a root doc the usable baseline records, still record-equal on disk,
 *      whose pharn/ counterpart is neither recorded NOR present on disk — the
 *      older CLI never copied it;
 *   2. a user-data path (`memory-bank/`, the SPEC template) still at the root,
 *      of the expected type and not a link, whose destination is absent.
 *
 * BOUNDED, and that is the contract: the opened run records the pharn/ doc and
 * deletes the root one, and moves the user data — after which neither fact
 * holds. Anything the opened run could NOT finish never counts: an edited root
 * doc, a pharn/ copy that is already there (recorded or not — the run skips an
 * unrecorded one rather than land it), a move onto existing data (`conflict`),
 * or a link. RESIDUAL, named: a SKILLS ≥ 7 pharn-oss that still shipped a doc
 * only at the root would make fact 1 fire on every run (each re-fetches, never
 * "Already up to date") — 7.0.0 is the version that moves them, so this rests
 * on that premise.
 */
export function pendingRootMigration(
  projectRoot: string,
  config: PharnConfig,
  records: FileRecords | null,
): string | null {
  if (configLayout(config) !== 'pharn') return null;
  const major = versionMajor(config.skillsVersion);
  if (major === null || major < ROOT_MOVES_FROM_MAJOR) return null;
  if (records !== null) {
    for (const [pharnRel, rootRel] of Object.entries(
      PHARN_ROOT_FALLBACK_DOCS,
    )) {
      if (!Object.hasOwn(records, rootRel) || Object.hasOwn(records, pharnRel))
        continue;
      if (!provablyAbsent(projectRoot, pharnRel)) continue;
      if (
        planUninstall(projectRoot, { [rootRel]: records[rootRel]! }).delete
          .length > 0
      )
        return rootRel;
    }
  }
  for (const m of planMoves(projectRoot))
    if (m.move.action === 'move') return m.move.from;
  return null;
}

// Nothing at `rel`, and nothing on the way to it is a link.
function provablyAbsent(projectRoot: string, rel: string): boolean {
  try {
    return (
      findSymlinkComponent(projectRoot, rel) === null &&
      lstatSync(safeJoin(projectRoot, rel), { throwIfNoEntry: false }) ===
        undefined
    );
  } catch {
    return false;
  }
}

/** What the writer did, for the past-tense note. */
export interface RootMigrationResult {
  deleted: string[];
  kept: string[];
  moved: RootMove[];
  failed: RootMoveFailure[];
}

/**
 * The ROOT MIGRATION note's lines — one wording for `update` and `init`, the
 * preview (`result` null, future tense) and the real run. `null` when there is
 * nothing to say: absent paths are not news.
 */
export function rootMigrationNoteLines(
  m: RootMigration,
  result: RootMigrationResult | null,
): string[] | null {
  const lines: string[] = [];
  const preview = result === null;
  for (const { rel, action } of m.docs) {
    const now = `pharn/${rel}`;
    if (action === 'delete') {
      if (preview)
        lines.push(
          `  WOULD DELETE ${rel} — pharn now keeps it at ${now}, and this copy is still exactly as pharn wrote it.`,
        );
      else if (result.deleted.includes(rel))
        lines.push(`  deleted ${rel} — pharn now keeps it at ${now}.`);
      else
        lines.push(
          `  kept ${rel} — ${now} did not land as upstream ships it, so the root copy stays.`,
        );
    } else if (action === 'keep-edited') {
      lines.push(
        `  kept ${rel} — you edited it. pharn now ships ${now}; this copy is no longer managed (listed under ORPHANED).`,
      );
    } else if (action === 'unverifiable') {
      lines.push(
        `  kept ${rel} — pharn cannot prove it wrote these bytes. pharn now ships ${now}; delete this one yourself if it is pharn's old copy.`,
      );
    }
  }
  for (const move of m.moves) {
    const { from, to, action } = move;
    if (action === 'move') {
      if (preview) lines.push(`  WOULD MOVE ${from} → ${to} (backed up first)`);
      else {
        const failure = result.failed.find((f) => f.move === move);
        lines.push(
          failure === undefined
            ? `  moved ${from} → ${to}`
            : `  NOT MOVED ${from}: ${terminalSafe(failure.reason)}. Nothing was moved; move it by hand.`,
        );
      }
    } else if (action === 'conflict') {
      lines.push(
        `  NOT MOVED ${from} — ${to} already exists. pharn never merges them: merge them by hand, then delete ${from}.`,
      );
    } else if (action === 'refused-symlink') {
      lines.push(
        `  NOT MOVED ${from} — it, or the way to ${to}, is a symbolic link. Move it by hand.`,
      );
    } else if (action === 'unreadable') {
      lines.push(
        `  NOT MOVED ${from} — it cannot be read, or it is not ${from.endsWith('/') ? 'a directory' : 'a regular file'}. Move it by hand.`,
      );
    }
  }
  if (m.scratchNotice)
    lines.push(
      `  ${SCRATCH_DIR}/ — runtime scratch now lives in pharn/.run/. The old ${SCRATCH_DIR}/ contents other than ${SCRATCH_KEEP} can be deleted.`,
    );
  if (m.gitignoreHints.length > 0)
    lines.push(
      `  .gitignore names pharn's old paths. Replace them with: ${m.gitignoreHints.join(', ')} (pharn never edits .gitignore).`,
    );
  return lines.length > 0 ? lines : null;
}

/** True when the run must exit 1 for a move it could not make. */
export function rootMigrationFailed(
  m: RootMigration | null,
  result: RootMigrationResult | null,
): boolean {
  if (m === null) return false;
  return (
    m.moves.some((move) => moveBlocks(move.action)) ||
    (result?.failed.length ?? 0) > 0
  );
}
