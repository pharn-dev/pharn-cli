import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  DEV_COMMAND_PREFIX,
  PRODUCT_COMMAND_PREFIX,
} from './constants.js';
import { layoutPaths } from './layout.js';
import { safeJoin } from './validate.js';
import type { InstalledCapability, Layout } from '../types.js';

// ---------------------------------------------------------------------------
// Install manifest — the SINGLE source of truth for the set of project-root-
// relative paths an archetype install writes (lib/install-capabilities.ts →
// installCapabilities). Pure + read-only: it enumerates the fetched clone and
// NEVER writes. Consumed by BOTH lib/diff.ts (byte-compare at `status`) and
// steps/overwrite-check.ts (the pre-install overwrite warning), so the "what
// init writes" knowledge lives in exactly one place.
//
// MIRROR, not the writer: this MIRRORS installCapabilities (the same diff↔install
// mirror the repo already carried, now shared to one function). tests/
// install-manifest.test.ts pins the mirror against a REAL installCapabilities run
// so the two cannot silently drift.
//
// Trust (P2): the fetched clone is untrusted. Names read from it are only
// path-joined via safeJoin (containment) for existence checks and returned as
// data; file CONTENTS are never read or executed here. `.claude/settings.json` is
// user-owned (preserved at install) and is intentionally NOT part of the set.
// One axis (P3): the install path manifest.
// ---------------------------------------------------------------------------

// The config file init writes at the project root (lib/pharn-config.ts →
// configPath's basename). Init also writes this, and the old confirmOverwriteIfExists
// guarded exactly it — so it joins the conflict set below.
export const PHARN_CONFIG_FILE = 'pharn.config.json';

// Relative paths (posix) of every file (not directory) under `dir`, recursively.
function* walkFiles(dir: string, prefix = ''): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Untrusted clone (P2): a symlink's Dirent reports isDirectory()===false, so
    // it would otherwise be yielded as a file. installCapabilities NEVER copies
    // symlinks (isSymlink guards + noSymlinks cpSync filters), so the mirror must
    // skip them too — else the manifest claims a path the installer never writes
    // (spurious status drift; a symlink-following read in diff.ts).
    if (entry.isSymbolicLink()) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      yield* walkFiles(resolve(dir, entry.name), rel);
    } else {
      yield rel;
    }
  }
}

// Normalize a dest/relpath to a posix, no-trailing-slash key.
function toPosix(rel: string): string {
  return rel.split(sep).join('/').replace(/\/+$/, '');
}

/**
 * Is ANY component of `rel` (below `base`) a symlink? `lstat` only refuses to
 * dereference the FINAL component — it happily resolves every ancestor — so
 * checking the leaf alone would still enumerate a clone whose `pharn-review/`,
 * `.dev/`, or `pharn/` directory is a symlink pointing outside the clone. Since
 * this manifest now drives `pharn update`'s writes, such an entry would copy
 * out-of-clone bytes into the user's project (P2). Components are checked below
 * `base` only: the clone's own temp root may legitimately sit under a symlinked
 * ancestor (e.g. macOS `/tmp`).
 */
function hasSymlinkComponent(base: string, rel: string): boolean {
  let current = '';
  for (const segment of toPosix(rel).split('/')) {
    if (!segment) continue;
    current = current ? `${current}/${segment}` : segment;
    if (
      lstatSync(safeJoin(base, current), {
        throwIfNoEntry: false,
      })?.isSymbolicLink()
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The exact project-root-relative paths an archetype install writes, mapped to
 * their source path in `repoDir` — the selected capability dirs + the fixed
 * product surfaces (product `pharn-*` commands, `.cjs` hooks, trusted docs,
 * `pharn-contracts/`, `.dev/floor/` minus tests), at `layout`. `.claude/settings.json`
 * is user-owned (preserved at install) and is NOT included. Mirrors
 * installCapabilities (lib/install-capabilities.ts); every read is safeJoin-guarded.
 */
export function collectExpectedInstallPaths(params: {
  repoDir: string;
  capabilities: InstalledCapability[];
  layout: Layout;
}): Map<string, string> {
  const { repoDir, capabilities, layout } = params;
  const paths = layoutPaths(layout);
  const expected = new Map<string, string>();
  const add = (rel: string, repoPath: string): void => {
    expected.set(toPosix(rel), repoPath);
  };
  // Enumerate one source dir's files (optionally filtered by relative name) into
  // the expected map at the mirrored path. The root is lstat-checked, NOT
  // stat-checked: a symlinked source root would otherwise resolve outside the
  // clone and contribute paths sourced from anywhere on disk. installCapabilities
  // never copies through such a root (isSymlink guards / noSymlinks filters), so
  // the mirror must not enumerate one either — and since this manifest now drives
  // `pharn update`'s WRITES (not just status's comparison), that is the
  // difference between reporting a phantom file and copying one in (P2).
  const addDir = (relDir: string, keep?: (rel: string) => boolean): void => {
    const from = safeJoin(repoDir, relDir);
    if (hasSymlinkComponent(repoDir, relDir)) return;
    if (!lstatSync(from, { throwIfNoEntry: false })?.isDirectory()) return;
    for (const rel of walkFiles(from)) {
      if (keep && !keep(rel)) continue;
      add(join(relDir, rel), resolve(from, rel));
    }
  };

  // Selected capabilities (whole dir, incl. evals) at the layout's subtree.
  for (const cap of capabilities) {
    const subtree = cap.role === 'griller' ? paths.grillers : paths.lenses;
    addDir(`${subtree}/${cap.name}`);
  }
  // Product commands: top-level non-dev pharn-*.md.
  addDir(
    CLAUDE_COMMANDS_DIR,
    (rel) =>
      !rel.includes('/') &&
      rel.endsWith('.md') &&
      rel.startsWith(PRODUCT_COMMAND_PREFIX) &&
      !rel.startsWith(DEV_COMMAND_PREFIX),
  );
  // Hooks: top-level *.cjs, excluding *.test.cjs.
  addDir(
    CLAUDE_HOOKS_DIR,
    (rel) =>
      !rel.includes('/') && rel.endsWith('.cjs') && !rel.endsWith('.test.cjs'),
  );
  // Trusted docs (flat: root files; pharn: CONSTITUTION + ARCHITECTURE under pharn/).
  // lstat, not exists: a symlinked doc is never copied by the installer, so it is
  // never expected here either (see addDir's note).
  for (const doc of paths.docs) {
    const from = safeJoin(repoDir, doc);
    if (hasSymlinkComponent(repoDir, doc)) continue;
    if (lstatSync(from, { throwIfNoEntry: false })?.isFile()) add(doc, from);
  }
  // Contracts (whole dir) + floor checkers (test files excluded), at layout paths.
  addDir(paths.contracts);
  addDir(paths.floor, (rel) => !/\.test\.(mjs|cjs)$/.test(rel));

  return expected;
}

/**
 * The project-root-relative paths an archetype install would write that ALREADY
 * exist under `projectRoot` — the pre-install overwrite-conflict set. Derived
 * from collectExpectedInstallPaths (the copied product surfaces + selected
 * capabilities) PLUS `pharn.config.json` (init also writes it; the old
 * confirmOverwriteIfExists guarded exactly it). Sorted for deterministic output
 * (P5). Every existence check is safeJoin-contained (P2). Pure; a fresh project
 * (nothing already installed) yields `[]`.
 */
export function conflictingWriteTargets(params: {
  repoDir: string;
  projectRoot: string;
  capabilities: InstalledCapability[];
  layout: Layout;
}): string[] {
  const { repoDir, projectRoot, capabilities, layout } = params;
  const expected = collectExpectedInstallPaths({
    repoDir,
    capabilities,
    layout,
  });
  const candidates = new Set<string>(expected.keys());
  candidates.add(PHARN_CONFIG_FILE);
  const conflicts: string[] = [];
  for (const rel of candidates) {
    if (existsSync(safeJoin(projectRoot, rel))) conflicts.push(rel);
  }
  return conflicts.sort();
}
