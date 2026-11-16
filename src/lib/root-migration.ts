import { lstatSync, readdirSync, unlinkSync } from 'node:fs';
import { readBoundedFile } from './bounded-read.js';
import { PHARN_ROOT_FALLBACK_DOCS } from './constants.js';
import { contentHash } from './hash.js';
import type { FileRecords } from './install-records.js';
import { resolveTrustedDocs } from './layout.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { planUninstall } from './uninstall-plan.js';
import { safeJoin } from './validate.js';
import type { Layout } from '../types.js';

// ---------------------------------------------------------------------------
// The old ROOT footprint of a pharn-layout install, and how a run retires it.
//
// From pharn-oss SKILLS 7.0.0 the pharn layout keeps everything under pharn/.
// Older installs left four kinds of thing at the root, each handled by the
// narrowest safe rule:
//
//   docs      Root THREAT-MODEL.md / LIMITS.md (exactly PHARN_ROOT_FALLBACK_DOCS):
//             deleted only when the pharn/ copy landed AND the root copy still
//             equals its record (uninstall's classifier); anything else stays.
//   user data `memory-bank/`, `pharn.spec-template.md`: NEVER moved, copied or
//             deleted — a path's type is no proof it is PHARN's (`memory-bank/`
//             is also Cline's). The note only hints at the command.
//   scratch   `.pharn/`: only noticed (its `ci.yml` is pharn-ci's).
//   gitignore read, never written; old entries get their replacement printed.
//
// Below SKILLS 7 the hints and notices are inert. Only `deleteRootDocs` writes,
// under the caller's project lock.
// ---------------------------------------------------------------------------

/** What a run does with one old root doc. */
export type RootDocAction =
  'delete' | 'keep-edited' | 'absent' | 'unverifiable';
export interface RootDocStep {
  rel: string;
  action: RootDocAction;
}

/**
 * One old root user-data path still there, and its hint: `free` → `git mv`;
 * `exists` → "merge by hand" (a `git mv` would nest). Never acted on.
 */
export interface RootUserDataHint {
  // Project-relative; a directory ends in `/`.
  from: string;
  to: string;
  destination: 'free' | 'exists';
}

/** The JSON-safe facts a preview shows and a real run acts on. */
export interface RootMigration {
  docs: RootDocStep[];
  userData: RootUserDataHint[];
  scratchNotice: boolean;
  gitignoreHints: string[];
}

// The SKILLS_VERSION major from which pharn-oss reads the pharn/ paths: the
// user-data hints and both notices apply from it.
export const ROOT_MIGRATION_FROM_MAJOR = 7;

// The old user-data paths, in report order.
const USER_DATA_PATHS: readonly { from: string; to: string; dir: boolean }[] = [
  { from: 'memory-bank', to: 'pharn/memory-bank', dir: true },
  { from: 'pharn.spec-template.md', to: 'pharn/spec-template.md', dir: false },
];

// Old `.gitignore` entries and the line that replaces each, matched as whole
// normalized lines (see gitignoreHints); never rewritten.
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
 * SKILLS 7 and ships neither doc under pharn/. `records` is the usable baseline
 * or null; `skillsVersion` is the clone's.
 */
export function planRootMigration(input: {
  projectRoot: string;
  repoDir: string;
  layout: Layout;
  // The layout RECORDED before this run. A flat install moving to the pharn
  // layout leaves its root docs as the flat tree, which is never deleted.
  installedLayout: Layout;
  skillsVersion: string;
  records: FileRecords | null;
}): RootMigration | null {
  const { projectRoot, repoDir, layout, skillsVersion, records } = input;
  if (layout !== 'pharn' || input.installedLayout !== 'pharn') return null;
  const docs = planRootDocs(projectRoot, repoDir, records);
  const major = versionMajor(skillsVersion);
  const sevenApplies = major !== null && major >= ROOT_MIGRATION_FROM_MAJOR;
  if (!sevenApplies && docs.length === 0) return null;
  return {
    docs,
    userData: sevenApplies ? userDataHints(projectRoot) : [],
    scratchNotice: sevenApplies && scratchNotice(projectRoot),
    gitignoreHints: sevenApplies ? gitignoreHints(projectRoot) : [],
  };
}

// One step per root doc whose pharn/ counterpart this clone ships (a doc the
// clone still keeps at the root is an ordinary install file).
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
  // `unverifiable` (or the unreachable `unsafe`/`outside`): kept.
  return 'unverifiable';
}

// One hint per old user-data path still at the root (any entry type; an
// un-lstat-able one is left out). `destination` is `exists` when the pharn/
// path has an entry OR cannot be checked — the fail-safe, so the note never
// prints a `git mv` that would nest or fail.
function userDataHints(projectRoot: string): RootUserDataHint[] {
  const present = (rel: string): boolean | null => {
    try {
      return (
        lstatSync(safeJoin(projectRoot, rel), { throwIfNoEntry: false }) !==
        undefined
      );
    } catch {
      return null;
    }
  };
  const hints: RootUserDataHint[] = [];
  for (const { from, to, dir } of USER_DATA_PATHS) {
    if (present(from) !== true) continue;
    const shown = (rel: string): string => (dir ? `${rel}/` : rel);
    hints.push({
      from: shown(from),
      to: shown(to),
      destination: present(to) === false ? 'free' : 'exists',
    });
  }
  return hints;
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
// `/**` or `*`; comments and negations never count. The file's text is never
// echoed.
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
 * Delete each `delete` doc whose pharn/ copy LANDED (a regular file, no
 * symlinked component, contentHash equal to the clone's). A failed unlink keeps
 * the file and is reported, never thrown — the run's earlier writes must still
 * be recorded.
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

/** What the writer did, for the past-tense note. */
export interface RootMigrationResult {
  deleted: string[];
  kept: string[];
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
  // User data is never moved: the same hint in preview and result. Paths are
  // fixed literals, never disk text.
  for (const { from, to, destination } of m.userData) {
    const bare = (rel: string): string => rel.replace(/\/$/, '');
    if (destination === 'free')
      lines.push(
        `  ${from} is at the project root; PHARN 7 reads ${to}. pharn does not move it. If it is PHARN's, move it: git mv ${bare(from)} ${bare(to)} (or mv, if git does not track it).`,
      );
    else
      lines.push(
        `  ${from} is at the project root, and ${to} already exists (or cannot be checked); PHARN 7 reads ${to}. pharn does not move or merge them. If the root copy is PHARN's, merge it into ${to} by hand, then delete ${from}.`,
      );
  }
  if (m.scratchNotice)
    lines.push(
      `  ${SCRATCH_DIR}/ — runtime scratch now lives in pharn/.run/. The old ${SCRATCH_DIR}/ contents other than ${SCRATCH_KEEP} can be deleted.`,
    );
  if (m.gitignoreHints.length > 0)
    lines.push(
      `  .gitignore names pharn's old paths. Replace them with: ${m.gitignoreHints.join(', ')} (pharn only appends its own entries; it never rewrites yours).`,
    );
  return lines.length > 0 ? lines : null;
}
