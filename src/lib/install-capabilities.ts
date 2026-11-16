import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import {
  assertSafeString,
  CAPABILITY_NAME_RE,
  COPY_FILENAME_RE,
  ManifestValidationError,
  safeJoin,
  toPosix,
} from './validate.js';
import {
  CLAUDE_AGENTS_DIR,
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  CLAUDE_SETTINGS_FILE,
} from './constants.js';
import {
  capabilitySubtree,
  detectLayout,
  layoutPaths,
  resolveFeaturesReadme,
  resolveTrustedDocs,
  type LayoutPaths,
} from './layout.js';
import {
  collectExpectedInstallPaths,
  isFloorTestFixturePath,
  isInstalledHookFile,
  isProductAgentFile,
  isProductCommandFile,
  PHARN_CONFIG_FILE,
} from './install-manifest.js';
import { RECORDS_FILE } from './install-records.js';
import {
  findSymlinkComponent,
  findSymlinkComponentOr,
  findTypeCollision,
} from './symlink-guard.js';
import type { InstalledCapability, Layout, Selection } from '../types.js';

// ---------------------------------------------------------------------------
// Capability copy routine (archetype install). Copies the RESOLVED capabilities
// + the FIXED product surfaces from a fetched pharn-oss clone into the user's
// project, mirroring pharn-oss's relative paths so the copied product commands'
// own project-root-relative references resolve after install.
//
// Trust: every name read from the untrusted clone is allowlist-validated before
// any path-join, and every read/write is safeJoin-guarded. File CONTENTS are
// copied verbatim, never executed or parsed.
//
// Dev-only exclusion is STRUCTURAL: only the listed source subtrees are ever
// copied, so `pharn-dev-*` commands, `.dev/features/`, `.dev/memory-bank/` and
// `*.test.*` never are. A declared surface the clone does not ship is skipped
// here and named by install-manifest.ts → absentInstallSurfaces.
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
  // The trusted docs actually COPIED (project-relative, paths.docs order) —
  // collected inside the copy branch, so the caller reports what landed, never
  // the expected list.
  docs: string[];
}

const isTestFile = (p: string): boolean => /\.test\.(mjs|cjs)$/.test(p);

// Is this absolute source path one of the floor's test-apparatus dirs, or
// inside one? ANCHORED at the floor root: cpSync also calls the filter for the
// source root, so an absolute-path segment test would match an ancestor named
// `fixtures` and copy nothing. Same test as the manifest's.
const inFloorFixtures = (floorFrom: string, src: string): boolean =>
  isFloorTestFixturePath(toPosix(relative(floorFrom, src)));

// The clone holds only regular files and directories (lib/repo.ts), so only
// the DESTINATION is guarded for links (prepareInstall, destAcceptsWrite).
//
// Every recursive cpSync passes a filter, and this one exists for that alone: a
// recursive copy with a filter unlinks each destination first, one without
// writes into a hard-linked destination's inode. Pinned by
// tests/install-capabilities.test.ts ("HARD-LINKED destination").
const unlinkFirst = (): boolean => true;

/**
 * Copy just the given capability dirs (whole dir, incl. evals/) into the mirrored
 * project-root paths — WITHOUT the fixed product surfaces. Pre-flights every
 * source before any write, so a bad name or missing source writes nothing.
 */
export function installCapabilityDirs(
  repoDir: string,
  projectRoot: string,
  capabilities: InstalledCapability[],
  // Defaults to the clone's own layout; `installCapabilities` passes the one it
  // detected so every surface uses the same layout.
  paths: LayoutPaths = layoutPaths(detectLayout(repoDir)),
): InstalledCapability[] {
  const planned = capabilities.map((cap) => {
    assertSafeString(cap.name, `capability "${cap.name}"`, CAPABILITY_NAME_RE);
    const subtree = capabilitySubtree(paths, cap.role);
    const from = safeJoin(repoDir, `${subtree}/${cap.name}`);
    if (!existsSync(from)) {
      throw new ManifestValidationError(
        `Capability "${cap.name}" (${cap.role}) is missing at ${subtree}/${cap.name} in the fetched repo.`,
      );
    }
    return { name: cap.name, role: cap.role, subtree, from };
  });

  const installed: InstalledCapability[] = [];
  for (const cap of planned) {
    const to = safeJoin(projectRoot, `${cap.subtree}/${cap.name}`);
    cpSync(cap.from, to, { recursive: true, force: true, filter: unlinkFirst });
    installed.push({ name: cap.name, role: cap.role });
  }
  return installed;
}

/** What the destination pre-flight checked, for the copy that follows it. */
export interface PreparedInstall {
  // The layout mirrored from the clone (flat OR pharn/).
  paths: LayoutPaths;
  // Where this clone keeps the optional features README (resolveFeaturesReadme).
  featuresRel: string;
  // Every file the install writes, dest → source (collectExpectedInstallPaths).
  manifest: ReadonlyMap<string, string>;
}

/**
 * The install's destination pre-flight: refuse, before anything is written,
 * every project the copy could not finish in — a path through a symlink or a
 * type in the way. Read-only; throws ManifestValidationError.
 *
 * Exported so `init` can run it before its backup (a refused install writes
 * nothing, `pharn/.backup/` included); `installCapabilities` runs it again, so
 * no caller can copy without it. `manifest` absent → computed here.
 */
export function prepareInstall(
  repoDir: string,
  projectRoot: string,
  capabilities: InstalledCapability[],
  manifest?: ReadonlyMap<string, string>,
): PreparedInstall {
  // The resolved relative paths are the clone SOURCE and the project DEST at once.
  const paths = layoutPaths(detectLayout(repoDir));
  const featuresRel = resolveFeaturesReadme(repoDir, paths.layout);
  const expected =
    manifest ??
    collectExpectedInstallPaths({
      repoDir,
      capabilities,
      layout: paths.layout,
    });

  assertDestinationsInProject(projectRoot, expected);
  assertDestinationTypes(projectRoot, expected, featuresRel);

  return { paths, featuresRel, manifest: expected };
}

export function installCapabilities(
  repoDir: string,
  projectRoot: string,
  selection: Selection,
  // The pre-flight runs here either way, before the first write.
  manifest?: ReadonlyMap<string, string>,
): InstallCapabilitiesResult {
  const { paths, featuresRel } = prepareInstall(
    repoDir,
    projectRoot,
    selection.selected,
    manifest,
  );

  const capabilities = installCapabilityDirs(
    repoDir,
    projectRoot,
    selection.selected,
    paths,
  );

  // --- product commands: pharn-*.md, excluding pharn-dev-*.md ----------------
  // The name filters are the manifest's own, so copy and mirror agree.
  copyFilteredDir(
    repoDir,
    projectRoot,
    CLAUDE_COMMANDS_DIR,
    isProductCommandFile,
  );

  // --- hooks: *.cjs / *.mjs, excluding *.test.cjs / *.test.mjs ---------------
  copyFilteredDir(repoDir, projectRoot, CLAUDE_HOOKS_DIR, isInstalledHookFile);

  // --- agents: pharn-*.md, excluding pharn-dev-*.md ---------------------------
  // Optional (pharn-oss < 6.64.0 ships none): an absent dir is a silent no-op.
  copyFilteredDir(repoDir, projectRoot, CLAUDE_AGENTS_DIR, isProductAgentFile);

  // --- settings.json: NEVER overwrite the user's existing one ----------------
  // `existsSync` follows a symlink, so a live link is never written; a dangling
  // one was refused by the pre-flight.
  const settingsFrom = safeJoin(repoDir, CLAUDE_SETTINGS_FILE);
  const settingsTo = safeJoin(projectRoot, CLAUDE_SETTINGS_FILE);
  const settingsPreserved = existsSync(settingsTo);
  const settingsWritten =
    !settingsPreserved && upstreamSettingsCopyable(repoDir);
  if (settingsWritten) {
    mkdirSync(safeJoin(projectRoot, '.claude'), { recursive: true });
    cpSync(settingsFrom, settingsTo, { force: true });
  }

  // --- trusted docs (where the clone keeps each: resolveTrustedDocs) ---------
  const written: string[] = [];
  for (const doc of resolveTrustedDocs(repoDir, paths.layout)) {
    const from = safeJoin(repoDir, doc);
    if (existsSync(from)) {
      cpSync(from, safeJoin(projectRoot, doc), { force: true });
      written.push(doc);
    }
  }

  // --- upstream's Apache-2.0 LICENSE, at a MAPPED destination ---------------
  // Apache-2.0 §4(a): redistributors must pass on the license. The dest is
  // pharn's own (`pharn/LICENSE` / `PHARN-LICENSE`) so a root `LICENSE` — the
  // user's — is never overwritten.
  const licenseFrom = safeJoin(repoDir, paths.license.from);
  if (existsSync(licenseFrom)) {
    cpSync(licenseFrom, safeJoin(projectRoot, paths.license.to), {
      force: true,
    });
  }

  // --- features/README.md (layout-dependent; see resolveFeaturesReadme) ------
  // The product-loop boundary contract the product commands cite. Not a
  // trusted doc: the installed hook does not write-protect it.
  //
  // Its DESTINATION has an intermediate directory, so it is walked: a symlinked
  // `features/` would take the copy outside the project. The SOURCE check comes
  // first, so an optional file the clone lacks never reaches the walk.
  const featuresFrom = safeJoin(repoDir, featuresRel);
  if (existsSync(featuresFrom) && destAcceptsWrite(projectRoot, featuresRel)) {
    cpSync(featuresFrom, safeJoin(projectRoot, featuresRel), {
      force: true,
    });
  }

  // --- contracts (whole dir; mirrored at the layout's path) ------------------
  const contractsFrom = safeJoin(repoDir, paths.contracts);
  if (existsSync(contractsFrom)) {
    cpSync(contractsFrom, safeJoin(projectRoot, paths.contracts), {
      recursive: true,
      force: true,
      filter: unlinkFirst,
    });
  }

  // --- pharn-core (whole dir; mirrored at the layout's path) -----------------
  // The mechanism layer the product commands cite by path. Whole and verbatim,
  // no test-file filter (its evals are content); never parsed, so its
  // `role: skill` never reaches the capability index. No-op for a flat clone.
  const coreFrom = safeJoin(repoDir, paths.core);
  if (existsSync(coreFrom)) {
    cpSync(coreFrom, safeJoin(projectRoot, paths.core), {
      recursive: true,
      force: true,
      filter: unlinkFirst,
    });
  }

  // --- floor checkers (whole dir minus test files + test-fixture dirs) -------
  const floorFrom = safeJoin(repoDir, paths.floor);
  if (existsSync(floorFrom)) {
    cpSync(floorFrom, safeJoin(projectRoot, paths.floor), {
      recursive: true,
      force: true,
      filter: (src) => !isTestFile(src) && !inFloorFixtures(floorFrom, src),
    });
  }

  return {
    capabilities,
    settingsPreserved,
    settingsWritten,
    layout: paths.layout,
    docs: written,
  };
}

/**
 * Would the install copy the clone's `.claude/settings.json` into a project
 * that has none? ONE predicate for the copy and `init --dry-run`'s plan.
 */
export function upstreamSettingsCopyable(repoDir: string): boolean {
  const from = safeJoin(repoDir, CLAUDE_SETTINGS_FILE);
  return existsSync(from);
}

/**
 * Refuse the whole install when any path it would write (the manifest plus
 * `.claude/settings.json`) crosses a symlinked component below `projectRoot`.
 * `safeJoin` is lexical, and `cpSync` follows a symlinked directory out of the
 * project.
 *
 * A symlinked LEAF is refused too: `cpSync` REPLACES the link with a regular
 * file, so the user's link is lost. Pinned by tests/install-capabilities.test.ts.
 * `.claude/settings.json` is exempt while its link is LIVE (an existing settings
 * file is never written); a dangling one is refused.
 *
 * ENOTDIR from the walk is left to assertDestinationTypes. Residual: a link
 * created between this walk and the copy is not covered.
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
 * the project (a non-directory component on the way, or a non-file leaf):
 * `cpSync` would otherwise fail part-way, leaving files but no config and no
 * records. Runs after assertDestinationsInProject, so a symlink is reported as
 * a symlink.
 *
 * A DIRECTORY at `pharn.config.json` / `pharn.records.json` is refused too —
 * the only type that makes their atomic `rename` fail. Out of the walk:
 * `.claude/settings.json` (never overwritten) and the optional features README
 * (`destAcceptsWrite` skips it).
 */
function assertDestinationTypes(
  projectRoot: string,
  manifest: ReadonlyMap<string, string>,
  featuresRel: string,
): void {
  const colliding = new Set<string>();
  for (const rel of manifest.keys()) {
    if (rel === featuresRel) continue;
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

/**
 * May the install write the OPTIONAL `rel` under `projectRoot`? False on a
 * symlinked component or a type collision. Any throw of the walk (ENOTDIR) is
 * a skip, not a failure: one optional surface must not fail the whole install.
 */
function destAcceptsWrite(projectRoot: string, rel: string): boolean {
  try {
    return (
      findSymlinkComponent(projectRoot, rel) === null &&
      findTypeCollision(projectRoot, rel) === null
    );
  } catch {
    return false;
  }
}

/**
 * Copy the files of one source dir whose basenames pass `keep` into the mirrored
 * project-root dir. A kept name failing COPY_FILENAME_RE hard-fails, never
 * silently skipped. A missing source dir is a no-op.
 */
function copyFilteredDir(
  repoDir: string,
  projectRoot: string,
  relDir: string,
  keep: (fileName: string) => boolean,
): void {
  const fromDir = safeJoin(repoDir, relDir);
  if (!existsSync(fromDir)) return;
  const entries = readdirSync(fromDir, { withFileTypes: true });
  let ensured = false;
  for (const entry of entries) {
    // A directory can sit here; nothing else can (the clone invariant).
    if (!entry.isFile()) continue;
    if (!keep(entry.name)) continue;
    assertSafeString(entry.name, `${relDir}/${entry.name}`, COPY_FILENAME_RE);
    if (!ensured) {
      mkdirSync(safeJoin(projectRoot, relDir), { recursive: true });
      ensured = true;
    }
    cpSync(
      safeJoin(fromDir, entry.name),
      safeJoin(projectRoot, `${relDir}/${entry.name}`),
      { force: true },
    );
  }
}
