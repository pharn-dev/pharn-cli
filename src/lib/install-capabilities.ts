import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
} from 'node:fs';
import {
  assertSafeString,
  CAPABILITY_NAME_RE,
  ManifestValidationError,
  safeJoin,
} from './validate.js';
import { CLAUDE_SETTINGS_FILE } from './constants.js';
import {
  capabilitySubtree,
  detectLayout,
  layoutPaths,
  type LayoutPaths,
} from './layout.js';
import {
  capabilityCloneFiles,
  collectExpectedInstallPaths,
  PHARN_CONFIG_FILE,
} from './install-manifest.js';
import { RECORDS_FILE } from './install-records.js';
import {
  manifestDeclaresSettings,
  readUpstreamManifest,
} from './upstream-manifest.js';
import {
  applyWrites,
  ApplyError,
  writtenBeforeFailureLines,
} from './apply-update.js';
import { errorMessage } from './report-error.js';
import { createBackup, printBackupNotice } from './backup.js';
import { backupDirIgnored } from './gitignore.js';
import {
  findSymlinkComponent,
  findSymlinkComponentOr,
  findTypeCollision,
} from './symlink-guard.js';
import type { InstalledCapability, Layout, Selection } from '../types.js';

// ---------------------------------------------------------------------------
// Capability install (archetype install). Writes the RESOLVED capabilities +
// the FIXED product surfaces from a fetched pharn-oss clone into the user's
// project, mirroring pharn-oss's relative paths so the copied product commands'
// own project-root-relative references resolve after install.
//
// The install manifest (lib/install-manifest.ts) is the copy list: every file
// is written by `update`'s per-file writer (lib/apply-update.ts → applyWrites),
// which walks each destination for symlinks and replaces the file by name, so
// a hard-linked destination's other name keeps its bytes. `add` writes one
// capability's clone file list the same way. `.claude/settings.json`, the one
// file outside the manifest, is written only when absent (COPYFILE_EXCL).
//
// Trust: every name read from the untrusted clone is allowlist-validated or
// safeJoin-contained before any path-join. File CONTENTS are copied verbatim,
// never executed or parsed.
//
// Dev-only exclusion is STRUCTURAL: the manifest lists only the declared source
// subtrees, so `pharn-dev-*` commands, `.dev/features/`, `.dev/memory-bank/`
// and `*.test.*` are never written. A declared surface the clone does not ship
// is named by install-manifest.ts → absentInstallSurfaces.
// ---------------------------------------------------------------------------

export interface InstallCapabilitiesResult {
  // The capabilities actually copied (name + role), for pharn.config.json.
  capabilities: InstalledCapability[];
  // True when the project already had .claude/settings.json (never overwritten).
  settingsPreserved: boolean;
  // True when the install WROTE .claude/settings.json from upstream. Not the
  // negation of settingsPreserved: a clone that ships none gets none written.
  settingsWritten: boolean;
  // The layout mirrored from the fetched clone, recorded in pharn.config.json.
  layout: Layout;
  // The trusted docs written (project-relative, paths.docs order): the ones the
  // manifest holds, so the caller reports what landed, never the expected list.
  docs: string[];
}

/**
 * Refuse a selected capability whose name fails the allowlist or whose source
 * dir is missing in the clone — before any write.
 */
function assertCapabilitySources(
  repoDir: string,
  capabilities: InstalledCapability[],
  paths: LayoutPaths,
): void {
  for (const cap of capabilities) {
    assertSafeString(cap.name, `capability "${cap.name}"`, CAPABILITY_NAME_RE);
    const subtree = capabilitySubtree(paths, cap.role);
    if (!existsSync(safeJoin(repoDir, `${subtree}/${cap.name}`))) {
      throw new ManifestValidationError(
        `Capability "${cap.name}" (${cap.role}) is missing at ${subtree}/${cap.name} in the fetched repo.`,
      );
    }
  }
}

/**
 * Write just the given capability dirs (every file, incl. evals/) at the
 * mirrored project-root paths — WITHOUT the fixed product surfaces. Every
 * source is checked before any write, so a bad name or missing source writes
 * nothing. `seen`: the destination hashes the caller's scan saw.
 */
export function installCapabilityDirs(
  repoDir: string,
  projectRoot: string,
  capabilities: InstalledCapability[],
  seen?: ReadonlyMap<string, string | null>,
): InstalledCapability[] {
  const paths = layoutPaths(detectLayout(repoDir));
  assertCapabilitySources(repoDir, capabilities, paths);
  const expected = new Map<string, string>();
  for (const cap of capabilities) {
    // The layout is mirrored, so each path addresses source and destination.
    for (const rel of capabilityCloneFiles(repoDir, cap))
      expected.set(rel, safeJoin(repoDir, rel));
  }
  writeInstallFiles(projectRoot, expected, seen);
  return capabilities.map(({ name, role }) => ({ name, role }));
}

/** What the destination pre-flight checked, for the copy that follows it. */
export interface PreparedInstall {
  // The layout mirrored from the clone (flat OR pharn/).
  paths: LayoutPaths;
  // Every file the install writes, dest → source (collectExpectedInstallPaths).
  manifest: ReadonlyMap<string, string>;
}

/**
 * The install's destination pre-flight: refuse, before anything is written,
 * every project the copy could not finish in — a path through a symlink or a
 * type in the way. Read-only; throws ManifestValidationError.
 *
 * Exported so `init`'s plan runs it once, before any prompt (a refused install
 * writes nothing, `pharn/.backup/` included) and hands the result to
 * `installPrepared`; `installCapabilities` runs it itself. `manifest` absent →
 * computed here.
 */
export function prepareInstall(
  repoDir: string,
  projectRoot: string,
  capabilities: InstalledCapability[],
  manifest?: ReadonlyMap<string, string>,
): PreparedInstall {
  // The resolved relative paths are the clone SOURCE and the project DEST at once.
  const paths = layoutPaths(detectLayout(repoDir));
  const expected =
    manifest ?? collectExpectedInstallPaths({ repoDir, capabilities });

  assertDestinationsInProject(projectRoot, expected);
  assertDestinationTypes(projectRoot, expected);

  return { paths, manifest: expected };
}

/** The pre-flight, then the copy: what every caller without a plan uses. */
export function installCapabilities(
  repoDir: string,
  projectRoot: string,
  selection: Selection,
  manifest?: ReadonlyMap<string, string>,
  // The destination hashes the caller's scan saw (lib/dest-drift.ts).
  seen?: ReadonlyMap<string, string | null>,
): InstallCapabilitiesResult {
  return installPrepared(
    repoDir,
    projectRoot,
    selection,
    prepareInstall(repoDir, projectRoot, selection.selected, manifest),
    seen,
  );
}

/**
 * The copy over a destination `prepareInstall` already checked — init's one
 * plan runs the pre-flight before its prompts and hands its result here, so it
 * is not run twice. Between the two, the writer's own per-file symlink walk is
 * the backstop. Residual: a type collision that appears while a prompt is open
 * fails the write part-way, and the ApplyError names the files that landed.
 */
export function installPrepared(
  repoDir: string,
  projectRoot: string,
  selection: Selection,
  prepared: PreparedInstall,
  seen?: ReadonlyMap<string, string | null>,
): InstallCapabilitiesResult {
  assertCapabilitySources(repoDir, selection.selected, prepared.paths);

  // --- settings.json, last: NEVER overwrite the user's existing one ----------
  // Exclusive create, so an existing file (or a link, live or dangling) is
  // never opened for writing: no exists-then-copy race.
  const settingsWritten = writeInstallFiles(
    projectRoot,
    prepared.manifest,
    seen,
    () =>
      upstreamSettingsCopyable(repoDir) &&
      copySettingsIfAbsent(repoDir, projectRoot),
  );
  const settingsPreserved =
    !settingsWritten && existsSync(safeJoin(projectRoot, CLAUDE_SETTINGS_FILE));

  return {
    capabilities: selection.selected.map(({ name, role }) => ({ name, role })),
    settingsPreserved,
    settingsWritten,
    layout: prepared.paths.layout,
    docs: prepared.paths.docs.filter((doc) => prepared.manifest.has(doc)),
  };
}

/**
 * Write every `expected` file through the one writer. A file edited since the
 * caller's scan (`seen`) is backed up — one backup, announced — and then
 * written; then `last` runs and its answer is returned. A failure after any
 * write throws an ApplyError whose message names the files that landed: the
 * caller writes no records or config after it.
 */
function writeInstallFiles(
  projectRoot: string,
  expected: ReadonlyMap<string, string>,
  seen: ReadonlyMap<string, string | null> | undefined,
  last: () => boolean = () => false,
): boolean {
  const written: string[] = [];
  try {
    const first = applyWrites({
      projectRoot,
      expected,
      writes: [...expected.keys()],
      seen,
    });
    written.push(...first.written);
    if (first.changed.length > 0) {
      printBackupNotice({
        dir: createBackup(projectRoot, first.changed),
        saved: first.changed.length,
        action: 'overwriting',
        gitignored: backupDirIgnored(projectRoot),
      });
      const again = { projectRoot, expected, writes: first.changed };
      written.push(...applyWrites(again).written);
    }
    return last();
  } catch (err) {
    const landed =
      err instanceof ApplyError ? [...written, ...err.written] : written;
    if (landed.length === 0) throw err;
    const lines = [errorMessage(err), ...writtenBeforeFailureLines(landed)];
    throw new ApplyError(lines.join('\n'), landed);
  }
}

/**
 * Copy upstream's `.claude/settings.json` when the project has none. False when
 * one exists (EEXIST). The `.claude` component is walked first: an exclusive
 * create still follows a symlinked parent.
 */
function copySettingsIfAbsent(repoDir: string, projectRoot: string): boolean {
  const link = findSymlinkComponent(projectRoot, '.claude');
  if (link !== null) {
    throw new ManifestValidationError(
      `${link} is a symlink; refusing to write through it.`,
    );
  }
  mkdirSync(safeJoin(projectRoot, '.claude'), { recursive: true });
  try {
    copyFileSync(
      safeJoin(repoDir, CLAUDE_SETTINGS_FILE),
      safeJoin(projectRoot, CLAUDE_SETTINGS_FILE),
      constants.COPYFILE_EXCL,
    );
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
}

/**
 * Would the install copy the clone's `.claude/settings.json` into a project
 * that has none? ONE predicate for the copy and `init --dry-run`'s plan.
 */
export function upstreamSettingsCopyable(repoDir: string): boolean {
  // Declared `if-absent` by the manifest (and sha-verified, so present).
  return manifestDeclaresSettings(readUpstreamManifest(repoDir));
}

/**
 * Refuse the whole install when any path it would write (the manifest plus
 * `.claude/settings.json`) crosses a symlinked component below `projectRoot`.
 * `safeJoin` is lexical; the writer refuses each such path too, but only after
 * the files before it landed.
 *
 * A symlinked LEAF is refused too: the writer REPLACES the link with a regular
 * file, so the user's link is lost. Pinned by tests/install-capabilities.test.ts.
 * `.claude/settings.json` is exempt while its link is LIVE (an existing settings
 * file is never written); a dangling one is refused.
 *
 * ENOTDIR from the walk is left to assertDestinationTypes. Residual: a link
 * created between this walk and the copy is caught by the writer's own walk,
 * part-way.
 */
function assertDestinationsInProject(
  projectRoot: string,
  manifest: ReadonlyMap<string, string>,
): void {
  const dirs = new Set<string>();
  const files = new Set<string>();
  for (const rel of manifest.keys()) {
    const hit = findSymlinkComponentOr(projectRoot, rel, null);
    if (hit !== null) (hit === rel ? files : dirs).add(hit);
  }
  const settingsHit = findSymlinkComponentOr(
    projectRoot,
    CLAUDE_SETTINGS_FILE,
    null,
  );
  if (settingsHit === CLAUDE_SETTINGS_FILE) {
    if (!existsSync(safeJoin(projectRoot, CLAUDE_SETTINGS_FILE))) {
      files.add(settingsHit);
    }
  } else if (settingsHit !== null) {
    dirs.add(settingsHit);
  }
  if (dirs.size === 0 && files.size === 0) return;

  const sentences: string[] = [];
  if (dirs.size > 0) {
    const one = dirs.size === 1;
    sentences.push(
      `${shownList(dirs)} ${one ? 'is a symbolic link' : 'are symbolic links'} inside the project, so writing through ${one ? 'it' : 'them'} would put files OUTSIDE the project. Replace ${one ? 'it' : 'each'} with a real directory (or remove ${one ? 'it' : 'them'}).`,
    );
  }
  if (files.size > 0) {
    const one = files.size === 1;
    sentences.push(
      `${shownList(files)} ${one ? 'is a symbolic link' : 'are symbolic links'} where pharn writes a file, so the install would replace ${one ? 'it' : 'them'} with pharn's copy and the link would be lost. Replace ${one ? 'it' : 'each'} with a regular file (or remove ${one ? 'it' : 'them'}).`,
    );
    if (files.has(CLAUDE_SETTINGS_FILE)) {
      sentences.push(
        `A link at ${CLAUDE_SETTINGS_FILE} is fine while it points at an existing file — pharn never writes over an existing one — but this one points at nothing.`,
      );
    }
  }
  throw new ManifestValidationError(
    `Refusing to install: ${sentences.join(' ')} Nothing was written; re-run \`pharn init\` once that is done.`,
  );
}

const MAX_LINKED_SHOWN = 5;

/** A sorted, capped, comma-joined list of project paths for a refusal. */
function shownList(items: ReadonlySet<string>): string {
  const shown = [...items].sort();
  return shown.length > MAX_LINKED_SHOWN
    ? `${shown.slice(0, MAX_LINKED_SHOWN).join(', ')} and ${shown.length - MAX_LINKED_SHOWN} more`
    : shown.join(', ');
}

/**
 * Refuse the whole install when any path it would write collides by TYPE with
 * the project (a non-directory component on the way, or a non-file leaf): the
 * writer would otherwise fail part-way, leaving files but no config and no
 * records. Runs after assertDestinationsInProject, so a symlink is reported as
 * a symlink. Every manifest entry is held to it, the features README included.
 *
 * A DIRECTORY at `pharn.config.json` / `pharn.records.json` is refused too —
 * the only type that makes their atomic `rename` fail. Out of the walk:
 * `.claude/settings.json` (never overwritten).
 */
function assertDestinationTypes(
  projectRoot: string,
  manifest: ReadonlyMap<string, string>,
): void {
  const colliding = new Set<string>();
  for (const rel of manifest.keys()) {
    const hit = findTypeCollision(projectRoot, rel);
    if (hit !== null) colliding.add(hit);
  }
  for (const rel of [PHARN_CONFIG_FILE, RECORDS_FILE]) {
    const stat = lstatSync(safeJoin(projectRoot, rel), {
      throwIfNoEntry: false,
    });
    if (stat?.isDirectory()) colliding.add(rel);
  }
  if (colliding.size === 0) return;
  const one = colliding.size === 1;
  throw new ManifestValidationError(
    `Refusing to install: ${shownList(colliding)} ${one ? 'is in the way' : 'are in the way'} — pharn needs a file where you have a directory, or a directory where you have a file. Nothing was written. Move or rename ${one ? 'it' : 'them'} and re-run \`pharn init\`.`,
  );
}
