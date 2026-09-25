import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import {
  assertNoDotDot,
  assertSafeString,
  CAPABILITY_NAME_RE,
  COPY_FILENAME_RE,
  ManifestValidationError,
  safeJoin,
  toPosix,
} from './validate.js';
import {
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  CLAUDE_SETTINGS_FILE,
  DEV_COMMAND_PREFIX,
  FLOOR_TEST_FIXTURES_DIR,
  PRODUCT_COMMAND_PREFIX,
} from './constants.js';
import {
  capabilitySubtree,
  detectLayout,
  layoutPaths,
  resolveFeaturesReadme,
  type LayoutPaths,
} from './layout.js';
import {
  collectExpectedInstallPaths,
  PHARN_CONFIG_FILE,
} from './install-manifest.js';
import { RECORDS_FILE } from './install-records.js';
import { findSymlinkComponent, findTypeCollision } from './symlink-guard.js';
import type { InstalledCapability, Layout, Selection } from '../types.js';

// ---------------------------------------------------------------------------
// Capability copy routine (archetype install). Copies the RESOLVED capabilities
// + the FIXED product surfaces from a fetched pharn-oss clone into the user's
// project, mirroring pharn-oss's relative paths so the copied product commands'
// own project-root-relative references resolve after install.
//
// Trust (P2): the fetched repo is untrusted. Every name read from the tree is
// validated against a fixed allowlist (validate.ts) BEFORE any path-join, and
// every read/write is safeJoin-guarded so nothing escapes its base dir. File
// CONTENTS are copied verbatim and never executed/parsed by the CLI (the user's
// Claude Code runs them later — the same posture as the module install).
//
// Dev-only exclusion is STRUCTURAL, not a scan: only these source subtrees are
// ever copied — selected grillers/lenses, `pharn-*` (non-`pharn-dev-*`) commands,
// `.cjs` hooks, settings.json, the trusted docs, the root features/README.md,
// pharn-contracts/, pharn-core/, and `.dev/floor/` minus test FILES and its
// `test-fixtures/` subtree. `pharn-dev-*` commands, `.dev/features/`,
// `.dev/memory-bank/`, and `*.test.*` are NEVER in the copy set.
//
// One axis (P3): the capability copy routine.
// ---------------------------------------------------------------------------

export interface InstallCapabilitiesResult {
  // The capabilities actually copied (name + role), for pharn.config.json.
  capabilities: InstalledCapability[];
  // True when the project already had .claude/settings.json — the install did
  // NOT overwrite it (the user's Claude Code config is preserved). The caller
  // surfaces this so the user knows the hooks may need wiring by hand.
  settingsPreserved: boolean;
  // The layout mirrored from the fetched clone (flat OR pharn/). Recorded in
  // pharn.config.json so status/remove address the project the same way.
  layout: Layout;
  // The trusted docs actually COPIED, as project-relative dest paths, in
  // paths.docs order. Each doc copy is existence-guarded (a clone that predates
  // a doc simply does not get it, P7), so this is a subset — and it is collected
  // INSIDE the copy branch, so a doc that failed its guard cannot appear here by
  // construction. The caller reports it instead of claiming "docs written"
  // unconditionally, which is what let two docs go missing from every install
  // with no warning (see PHARN_TRUSTED_DOCS in constants.ts).
  docs: string[];
}

const isTestFile = (p: string): boolean => /\.test\.(mjs|cjs)$/.test(p);

// Is this absolute source path the floor's test-fixtures dir, or inside it?
//
// ANCHORED at the floor root, deliberately. cpSync hands the filter an ABSOLUTE
// path and calls it for the source ROOT too, so a bare segment test on the
// absolute path would also match an ANCESTOR directory that happens to be named
// `test-fixtures` — returning false for the root and copying NOTHING, silently
// shipping no floor at all. Anchoring also makes this the same test, on the same
// path shape, as the manifest mirror's: both compare a floor-relative posix
// string. `relative(floorFrom, floorFrom)` is '', so the root is always kept.
const inFloorFixtures = (floorFrom: string, src: string): boolean => {
  const rel = toPosix(relative(floorFrom, src));
  return (
    rel === FLOOR_TEST_FIXTURES_DIR ||
    rel.startsWith(`${FLOOR_TEST_FIXTURES_DIR}/`)
  );
};

// Trust (P2): the fetched repo is untrusted, and a recursive cpSync copies
// symlinks VERBATIM by default — so a malicious clone could plant a symlink
// (e.g. onto a file outside the project) that lands in the user's tree and is
// later followed by their tools. Reject symlinks the same way copyFilteredDir
// does (skip, never materialize): `isSymlink` guards each whole-dir/single-file
// copy root; `noSymlinks` is the cpSync filter that skips nested symlinks.
const isSymlink = (p: string): boolean => lstatSync(p).isSymbolicLink();
const noSymlinks = (src: string): boolean => !isSymlink(src);

/**
 * Copy the resolved capabilities + the fixed product surfaces from `repoDir`
 * into `projectRoot`. Pre-flights every selected capability source before any
 * write (no partial installs). Returns the copied capability list + whether the
 * user's existing settings.json was preserved.
 */
/**
 * Copy just the given capability dirs (whole dir, incl. evals/) into the mirrored
 * project-root paths — WITHOUT the fixed product surfaces. Pre-flights every
 * source (validated name + safeJoin + existence) before any write, so a bad name
 * or missing source fails with nothing written. The focused primitive `add` and
 * the archetype install share; `remove` mirrors its path derivation.
 */
export function installCapabilityDirs(
  repoDir: string,
  projectRoot: string,
  capabilities: InstalledCapability[],
  // The layout to mirror; defaults to the fetched clone's own layout (flat OR
  // pharn/). `add` uses the default; `installCapabilities` passes the layout it
  // detected once, so contracts/floor/docs stay consistent with the subtrees.
  paths: LayoutPaths = layoutPaths(detectLayout(repoDir)),
): InstalledCapability[] {
  const planned = capabilities.map((cap) => {
    assertSafeString(cap.name, `capability "${cap.name}"`, CAPABILITY_NAME_RE);
    assertNoDotDot(cap.name, `capability "${cap.name}"`);
    const subtree = capabilitySubtree(paths, cap.role);
    const from = safeJoin(repoDir, `${subtree}/${cap.name}`);
    if (!existsSync(from)) {
      throw new ManifestValidationError(
        `Capability "${cap.name}" (${cap.role}) is missing at ${subtree}/${cap.name} in the fetched repo.`,
      );
    }
    if (isSymlink(from)) {
      throw new ManifestValidationError(
        `Capability "${cap.name}" (${cap.role}) is a symlink at ${subtree}/${cap.name}; refusing to copy from the untrusted repo.`,
      );
    }
    return { name: cap.name, role: cap.role, subtree, from };
  });

  const installed: InstalledCapability[] = [];
  for (const cap of planned) {
    const to = safeJoin(projectRoot, `${cap.subtree}/${cap.name}`);
    cpSync(cap.from, to, { recursive: true, force: true, filter: noSymlinks });
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
 * every project the copy could not finish in — a path through a symlink (see
 * assertDestinationsInProject) or a type in the way (see assertDestinationTypes).
 * Read-only; throws ManifestValidationError, or returns what it checked.
 *
 * Exported so `init` can run it BEFORE its backup (steps/install-archetype.ts):
 * a refused install then writes nothing at all — no `.pharn-backup/` either.
 * `installCapabilities` still runs it itself, so no caller can copy without it.
 *
 * `manifest` is the install manifest for these capabilities at the clone's
 * layout, when the caller already computed it (init does, once per run);
 * absent → computed here.
 */
export function prepareInstall(
  repoDir: string,
  projectRoot: string,
  capabilities: InstalledCapability[],
  manifest?: ReadonlyMap<string, string>,
): PreparedInstall {
  // Mirror whichever layout the fetched clone has (flat OR the relocated pharn/).
  // The resolved relative paths are the clone SOURCE and the project DEST at once —
  // the CLI never rewrites copied file contents (lib/layout.ts).
  const paths = layoutPaths(detectLayout(repoDir));
  const featuresRel = resolveFeaturesReadme(repoDir, paths.layout);
  const expected =
    manifest ??
    collectExpectedInstallPaths({
      repoDir,
      capabilities,
      layout: paths.layout,
    });

  // Nothing below may follow a symlinked project directory out of the project
  // (see assertDestinationsInProject)...
  assertDestinationsInProject(projectRoot, expected);
  // ...and nothing may start writing into a tree whose TYPES it cannot write:
  // a collision found by `cpSync` part-way leaves a half-installed project with
  // no config and no records (see assertDestinationTypes).
  assertDestinationTypes(projectRoot, expected, featuresRel);

  return { paths, featuresRel, manifest: expected };
}

export function installCapabilities(
  repoDir: string,
  projectRoot: string,
  selection: Selection,
  // The install manifest, when the caller already computed it (see
  // prepareInstall). The pre-flight runs here either way, before the first write.
  manifest?: ReadonlyMap<string, string>,
): InstallCapabilitiesResult {
  const { paths, featuresRel } = prepareInstall(
    repoDir,
    projectRoot,
    selection.selected,
    manifest,
  );

  // Copy the selected capability dirs (pre-flighted; no partial installs).
  const capabilities = installCapabilityDirs(
    repoDir,
    projectRoot,
    selection.selected,
    paths,
  );

  // --- product commands: pharn-*.md, excluding pharn-dev-*.md ----------------
  copyFilteredDir(repoDir, projectRoot, CLAUDE_COMMANDS_DIR, (fileName) => {
    if (!fileName.endsWith('.md')) return false;
    if (fileName.startsWith(DEV_COMMAND_PREFIX)) return false;
    return fileName.startsWith(PRODUCT_COMMAND_PREFIX);
  });

  // --- hooks: *.cjs, excluding *.test.cjs ------------------------------------
  copyFilteredDir(repoDir, projectRoot, CLAUDE_HOOKS_DIR, (fileName) => {
    if (!fileName.endsWith('.cjs')) return false;
    return !isTestFile(fileName);
  });

  // --- settings.json: NEVER overwrite the user's existing one (grill F1) -----
  // `existsSync` FOLLOWS a symlink, so a live link here counts as existing and
  // is never written; a dangling one was refused by the pre-flight.
  const settingsFrom = safeJoin(repoDir, CLAUDE_SETTINGS_FILE);
  const settingsTo = safeJoin(projectRoot, CLAUDE_SETTINGS_FILE);
  const settingsPreserved = existsSync(settingsTo);
  if (
    !settingsPreserved &&
    existsSync(settingsFrom) &&
    !isSymlink(settingsFrom)
  ) {
    mkdirSync(safeJoin(projectRoot, '.claude'), { recursive: true });
    cpSync(settingsFrom, settingsTo, { force: true });
  }

  // --- trusted docs (the same FOUR documents in both layouts; the prefix is
  // per-DOC, not per-layout — flat keeps all four at the root, while the pharn
  // layout has CONSTITUTION/ARCHITECTURE under pharn/ and THREAT-MODEL/LIMITS
  // still at the root, because that is where upstream keeps each one and the
  // install mirrors it, see PHARN_TRUSTED_DOCS in constants.ts) ---------------
  //
  // The leaf-only isSymlink is sufficient here and NOT the weaker form of the
  // features/README.md guard: every root-prefixed entry has no intermediate
  // directory at all, and the pharn/-prefixed pair's component exposure is
  // unchanged by this loop's shape. `written` collects only the docs this branch
  // actually copied — the outro reports that, never the expected list.
  const written: string[] = [];
  for (const doc of paths.docs) {
    const from = safeJoin(repoDir, doc);
    if (existsSync(from) && !isSymlink(from)) {
      cpSync(from, safeJoin(projectRoot, doc), { force: true });
      written.push(doc);
    }
  }

  // --- upstream's Apache-2.0 LICENSE, at a MAPPED destination ---------------
  // Apache-2.0 §4(a): a redistributor must give recipients a copy of the
  // license, and a user who commits and publishes a pharn-initialized repo is
  // redistributing ~450 Apache-2.0 files. Same guard shape as the docs loop —
  // but NOT the same path on both ends: the dest is pharn's own
  // (`pharn/LICENSE` / `PHARN-LICENSE`), because copying to a root `LICENSE`
  // would overwrite the user's with `{ force: true }` and no prompt.
  const licenseFrom = safeJoin(repoDir, paths.license.from);
  if (existsSync(licenseFrom) && !isSymlink(licenseFrom)) {
    cpSync(licenseFrom, safeJoin(projectRoot, paths.license.to), {
      force: true,
    });
  }

  // --- features/README.md (layout-dependent; see resolveFeaturesReadme) ------
  // The product-loop boundary contract the installed product commands cite by
  // name. Deliberately NOT called a trusted doc: it is not write-protected by
  // the installed hook.
  //
  // findSymlinkComponent, not just the leaf isSymlink the trusted docs use. This
  // is the first ROOT-RELATIVE file the install copies that has an INTERMEDIATE
  // directory, so the leaf-only check is newly insufficient: measured on this
  // Node, a clone whose `features/` is a symlink reports existsSync true and
  // lstat(leaf).isSymbolicLink() FALSE, and cpSync copies the pointed-to bytes
  // straight through — bytes from outside the clone, into the user's project.
  // safeJoin cannot catch it (it is lexical and never resolves a link). The
  // manifest already walks every component; the writer must agree, or the two
  // trust floors diverge on exactly the path this increment adds (P2).
  //
  // The DESTINATION is walked too, for the mirror-image reason: measured, a
  // project whose own `features/` is a symlink to an external directory takes
  // the copy straight THROUGH it, creating or overwriting a README.md outside
  // the project root — and the pre-install overwrite check never warns, because
  // `existsSync` on the absent leaf inside that link is false. safeJoin is
  // lexical here too. This is the posture `apply-update.ts` already takes on
  // every write it makes; the install path must match it for the one surface
  // whose destination has an intermediate directory (P2).
  //
  // ORDER MATTERS: the SOURCE checks come first and short-circuit. The file is
  // optional (an older pinned clone has none), and its absence must stay a
  // silent no-op — so a clone without it must never reach the destination walk,
  // which can raise on a project the copy would not have touched anyway.
  const featuresFrom = safeJoin(repoDir, featuresRel);
  if (
    findSymlinkComponent(repoDir, featuresRel) === null &&
    existsSync(featuresFrom) &&
    !isSymlink(featuresFrom) &&
    destAcceptsWrite(projectRoot, featuresRel)
  ) {
    cpSync(featuresFrom, safeJoin(projectRoot, featuresRel), {
      force: true,
    });
  }

  // --- contracts (whole dir; mirrored at the layout's path) ------------------
  const contractsFrom = safeJoin(repoDir, paths.contracts);
  if (existsSync(contractsFrom) && !isSymlink(contractsFrom)) {
    cpSync(contractsFrom, safeJoin(projectRoot, paths.contracts), {
      recursive: true,
      force: true,
      filter: noSymlinks,
    });
  }

  // --- pharn-core (whole dir; mirrored at the layout's path) -----------------
  // The agnostic mechanism layer the copied product commands cite by path (today
  // the seam-resolver skill + its evals). Copied like pharn-contracts — whole,
  // verbatim, no filter: its evals are content, not test files. Contents are
  // NEVER parsed; its `role: skill` frontmatter is deliberately outside
  // ROLE_VALUES and never reaches the capability index. A flat clone has no such
  // dir upstream, so this is a no-op there (P7).
  const coreFrom = safeJoin(repoDir, paths.core);
  if (existsSync(coreFrom) && !isSymlink(coreFrom)) {
    cpSync(coreFrom, safeJoin(projectRoot, paths.core), {
      recursive: true,
      force: true,
      filter: noSymlinks,
    });
  }

  // --- floor checkers (whole dir minus test files + test-fixtures/) ----------
  const floorFrom = safeJoin(repoDir, paths.floor);
  if (existsSync(floorFrom) && !isSymlink(floorFrom)) {
    cpSync(floorFrom, safeJoin(projectRoot, paths.floor), {
      recursive: true,
      force: true,
      filter: (src) =>
        !isTestFile(src) && !inFloorFixtures(floorFrom, src) && noSymlinks(src),
    });
  }

  return {
    capabilities,
    settingsPreserved,
    layout: paths.layout,
    docs: written,
  };
}

/**
 * Refuse the whole install when any path it would write crosses a symlinked
 * component below `projectRoot`. Every copy here is `safeJoin`-contained, but
 * that check is LEXICAL: measured, a project whose `.claude/commands` or `pharn/`
 * is a symlink to an external directory takes `cpSync` straight THROUGH it,
 * creating and overwriting files outside the project with no prompt (the
 * overwrite check's `existsSync` sees no conflict inside an empty target). This
 * is the posture `update` (apply-update.ts) and `add` (dest-drift.ts) already
 * take, applied once to the full write set: every file the install manifest
 * says this install writes, plus the user-owned `.claude/settings.json`.
 *
 * A symlinked LEAF is refused too, for a different reason, and the message says
 * which: `cpSync` does not follow a link at the file it writes — measured on
 * Node 20.13, 22 and 24, it REPLACES the link with a regular file, so nothing
 * lands outside the project, but the user's link is gone without a word.
 *
 * `.claude/settings.json` is the one leaf exempt while its link is LIVE:
 * `installCapabilities` never writes an existing settings file (`existsSync`
 * follows the link), so there is nothing to refuse. A DANGLING link there does
 * not exist to `existsSync`, so the install would write upstream's settings in
 * its place — replacing the link — and is refused like any other leaf. A
 * symlinked `.claude/` is an intermediate component, refused as ever.
 *
 * ENOTDIR from the walk (a component below a REGULAR file) is not a symlink and
 * is left to assertDestinationTypes, which names it.
 *
 * Residual (advisory): a link created between this walk and the copy (TOCTOU)
 * is not covered — the same residual `update` names.
 */
function assertDestinationsInProject(
  projectRoot: string,
  manifest: ReadonlyMap<string, string>,
): void {
  const dirs = new Set<string>();
  const files = new Set<string>();
  for (const rel of manifest.keys()) {
    const hit = symlinkedComponent(projectRoot, rel);
    if (hit !== null) (hit === rel ? files : dirs).add(hit);
  }
  const settingsHit = symlinkedComponent(projectRoot, CLAUDE_SETTINGS_FILE);
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

/**
 * `findSymlinkComponent`, with its ENOTDIR (a component below a regular file)
 * read as "no symlink here" — assertDestinationTypes reports that path.
 */
function symlinkedComponent(projectRoot: string, rel: string): string | null {
  try {
    return findSymlinkComponent(projectRoot, rel);
  } catch {
    return null;
  }
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
 * what is already in the project: an existing component on the way that is not
 * a directory, or an existing leaf that is not a regular file. Without this,
 * `cpSync` meets the collision part-way (ENOTDIR / ERR_FS_CP_NON_DIR_TO_DIR)
 * and the project is left with hundreds of new files but no `pharn.config.json`
 * and no records. Runs AFTER assertDestinationsInProject, so a symlink is still
 * reported as a symlink.
 *
 * The two files `init` writes BESIDE the copy are walked too: a DIRECTORY at
 * `pharn.config.json` or `pharn.records.json` passed every check before, so the
 * whole tree was copied and then the atomic write's `rename` failed (EISDIR),
 * leaving no records and no config. Only a directory blocks that rename — it
 * replaces a file, a FIFO or a symlink (even one to a directory) in place — so
 * a directory is the one type refused there.
 *
 * Out of the walk: `.claude/settings.json` (never overwritten — `existsSync`
 * skips it) and the optional features README (`destAcceptsWrite` skips it on a
 * collision, by contract). Each path's walk stops at its FIRST non-directory
 * component: nothing below it can be lstat-ed.
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
 * May the install write `rel` under `projectRoot`? False when any component
 * below the root is a symlink — following one writes OUTSIDE the project, which
 * `safeJoin` cannot see (it is lexical) and the pre-install overwrite prompt
 * cannot warn about (the leaf inside the link does not exist, so it is not a
 * conflict). This is the posture `apply-update.ts` already takes on every write.
 *
 * ENOTDIR — a component below a REGULAR FILE — is a SKIP, not a failure.
 * `findSymlinkComponent` deliberately lets that raise (it suppresses ENOENT
 * only), and each caller owns the shape: here `cpSync` would throw on the same
 * tree anyway, so failing the whole install over one OPTIONAL surface would turn
 * a project that merely has a file named `features` into an init that cannot
 * complete. Skipping leaves that project exactly as it was.
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
 * project-root dir. Each kept name is validated (COPY_FILENAME_RE + no `..`)
 * before it is path-joined — a name that is a copy candidate but fails the
 * allowlist hard-fails (P2), it is never silently skipped. Missing source dir is
 * a no-op (nothing to copy).
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
    if (!entry.isFile() || entry.isSymbolicLink()) continue;
    if (!keep(entry.name)) continue;
    assertSafeString(entry.name, `${relDir}/${entry.name}`, COPY_FILENAME_RE);
    assertNoDotDot(entry.name, `${relDir}/${entry.name}`);
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
