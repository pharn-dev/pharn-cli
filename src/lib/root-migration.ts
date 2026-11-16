import { lstatSync, readdirSync, unlinkSync } from 'node:fs';
import { readBoundedFile } from './bounded-read.js';
import { PHARN_ROOT_FALLBACK_DOCS } from './constants.js';
import { contentHash } from './hash.js';
import type { FileRecords } from './install-records.js';
import { configLayout, resolveTrustedDocs } from './layout.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { planUninstall } from './uninstall-plan.js';
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
//   user data `memory-bank/` and `pharn.spec-template.md` at the root. PHARN
//             7 reads them under pharn/, but nothing proves a root copy is
//             PHARN's: `memory-bank/` is also Cline's Memory Bank directory,
//             and a path's type is no proof of who wrote it. So they are NEVER
//             moved, copied or deleted (CORE-158) — the note only HINTS at the
//             command (`git mv`, or "merge by hand" when the pharn/ copy
//             exists), when the clone is SKILLS 7 or newer.
//   scratch   `.pharn/`, pharn-oss's runtime scratch. Never moved or deleted;
//             only noticed (its `ci.yml` belongs to pharn-ci and stays).
//   gitignore The user's `.gitignore`, read and never written: an entry for an
//             old path gets its replacement printed.
//
// Below SKILLS 7 the hints and both notices are inert, which is what let this
// CLI ship before pharn-oss moved. Planning reads; nothing here writes except
// `deleteRootDocs`, which the caller runs under the project lock.
//
// One axis (P3): retiring the old root footprint of a pharn install.
// ---------------------------------------------------------------------------

/** What a run does with one old root doc. */
export type RootDocAction =
  'delete' | 'keep-edited' | 'absent' | 'unverifiable';
export interface RootDocStep {
  rel: string;
  action: RootDocAction;
}

/**
 * One old root user-data path that is still there, and the hint the note
 * prints for it. `destination` says whether the pharn/ path already exists:
 * `free` → a `git mv` hint; `exists` → "merge by hand" (a `git mv` would nest
 * the folder inside the existing one). Never acted on.
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
// user-data hints, both notices and pendingRootMigration apply from it.
export const ROOT_MIGRATION_FROM_MAJOR = 7;

// The old user-data paths, in report order. Fixed literals (P5).
const USER_DATA_PATHS: readonly { from: string; to: string; dir: boolean }[] = [
  { from: 'memory-bank', to: 'pharn/memory-bank', dir: true },
  { from: 'pharn.spec-template.md', to: 'pharn/spec-template.md', dir: false },
];

// Old `.gitignore` entries and the line that replaces each. Matched as whole
// lines after normalizing (see gitignoreHints); never rewritten (pharn only
// appends its own entries — lib/gitignore.ts). The old names
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
 * `records` is the USABLE baseline (`recordsBaseline`) or null. `skillsVersion` is
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

// One hint per old user-data path still at the root — any entry (lstat), for
// pharn proves nothing about what it is; a path it cannot even lstat is left
// out. `destination` is `exists` when the pharn/ path has an entry OR cannot be
// checked (ENOTDIR, EACCES): the fail-safe answer, so the note never prints a
// `git mv` that would nest the folder or fail. Reads only; nothing is moved.
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

/**
 * The old root path a same-version `update` must re-open for, or null — the
 * local, read-only signal that keeps an install already at SKILLS 7 (updated
 * by an older CLI, which never ran this migration) from keeping its old root
 * footprint forever behind the early return. One fact counts, only for a
 * pharn-layout install at SKILLS major ≥ 7: a root doc the usable baseline
 * records, still record-equal on disk, whose pharn/ counterpart is neither
 * recorded NOR present on disk — the older CLI never copied it.
 *
 * User data at the root (`memory-bank/`, the SPEC template) never counts: the
 * run would only print a hint for it (CORE-158), so re-opening for it would be
 * a download that changes nothing.
 *
 * BOUNDED, and that is the contract: the opened run records the pharn/ doc and
 * deletes the root one — after which the fact no longer holds. Anything the
 * opened run could NOT finish never counts: an edited root doc, a pharn/ copy
 * that is already there (recorded or not — the run skips an unrecorded one
 * rather than land it), or a link. RESIDUAL, named: a SKILLS ≥ 7 pharn-oss that
 * still shipped a doc only at the root would make the fact fire on every run
 * (each re-fetches, never "Already up to date") — 7.0.0 is the version that
 * moves them, so this rests on that premise.
 */
export function pendingRootMigration(
  projectRoot: string,
  config: PharnConfig,
  records: FileRecords | null,
): string | null {
  if (configLayout(config) !== 'pharn') return null;
  const major = versionMajor(config.skillsVersion);
  if (major === null || major < ROOT_MIGRATION_FROM_MAJOR) return null;
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
  // The user data is never moved (CORE-158): the same hint in the preview and
  // after the run. Paths are fixed literals, never read from disk text.
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
