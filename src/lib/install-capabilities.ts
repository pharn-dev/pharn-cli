import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { safeJoin } from './install-modules.js';
import {
  assertNoDotDot,
  assertSafeString,
  CAPABILITY_NAME_RE,
  COPY_FILENAME_RE,
  ManifestValidationError,
} from './validate.js';
import {
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  CLAUDE_SETTINGS_FILE,
  DEV_COMMAND_PREFIX,
  PRODUCT_COMMAND_PREFIX,
} from './constants.js';
import { detectLayout, layoutPaths, type LayoutPaths } from './layout.js';
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
// `.cjs` hooks, settings.json, the trusted docs, pharn-contracts/, and
// `.dev/floor/` minus test files. `pharn-dev-*` commands, `.dev/features/`,
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

  // --- trusted docs (flat: 4 at root; pharn: CONSTITUTION + ARCHITECTURE under
  // pharn/, THREAT-MODEL/LIMITS dropped — they are not under pharn/) -----------
  for (const doc of paths.docs) {
    const from = safeJoin(repoDir, doc);
    if (existsSync(from) && !isSymlink(from)) {
      cpSync(from, safeJoin(projectRoot, doc), { force: true });
    }
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

  // --- floor checkers (whole dir minus test files; mirrored at layout path) --
  const floorFrom = safeJoin(repoDir, paths.floor);
  if (existsSync(floorFrom) && !isSymlink(floorFrom)) {
    cpSync(floorFrom, safeJoin(projectRoot, paths.floor), {
      recursive: true,
      force: true,
      filter: (src) => !isTestFile(src) && noSymlinks(src),
    });
  }

  return { capabilities, settingsPreserved, layout: paths.layout };
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
