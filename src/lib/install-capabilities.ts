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
  FEATURES_README,
  FLOOR_TEST_FIXTURES_DIR,
  PRODUCT_COMMAND_PREFIX,
} from './constants.js';
import { detectLayout, layoutPaths, type LayoutPaths } from './layout.js';
import { findSymlinkComponent } from './symlink-guard.js';
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
    const subtree = cap.role === 'griller' ? paths.grillers : paths.lenses;
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

export function installCapabilities(
  repoDir: string,
  projectRoot: string,
  selection: Selection,
): InstallCapabilitiesResult {
  // Mirror whichever layout the fetched clone has (flat OR the relocated pharn/).
  // The resolved relative paths are the clone SOURCE and the project DEST at once —
  // the CLI never rewrites copied file contents (lib/layout.ts).
  const paths = layoutPaths(detectLayout(repoDir));

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

  // --- trusted docs (the SAME four in both layouts; only the prefix differs --
  // at the project root when flat, under pharn/ otherwise) --------------------
  for (const doc of paths.docs) {
    const from = safeJoin(repoDir, doc);
    if (existsSync(from) && !isSymlink(from)) {
      cpSync(from, safeJoin(projectRoot, doc), { force: true });
    }
  }

  // --- features/README.md (root in BOTH layouts, like .claude/*) -------------
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
  const featuresFrom = safeJoin(repoDir, FEATURES_README);
  if (
    findSymlinkComponent(repoDir, FEATURES_README) === null &&
    existsSync(featuresFrom) &&
    !isSymlink(featuresFrom) &&
    destAcceptsWrite(projectRoot, FEATURES_README)
  ) {
    cpSync(featuresFrom, safeJoin(projectRoot, FEATURES_README), {
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

  return { capabilities, settingsPreserved, layout: paths.layout };
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
    return findSymlinkComponent(projectRoot, rel) === null;
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
