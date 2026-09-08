import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  DEV_COMMAND_PREFIX,
  FEATURES_README,
  FLOOR_TEST_FIXTURES_DIR,
  PRODUCT_COMMAND_PREFIX,
} from './constants.js';
import { layoutPaths, type LayoutPaths } from './layout.js';
import { findSymlinkComponent } from './symlink-guard.js';
import {
  assertNoDotDot,
  assertSafeString,
  COPY_FILENAME_RE,
  safeJoin,
  toPosix,
} from './validate.js';
import type { InstalledCapability, Layout } from '../types.js';

// ---------------------------------------------------------------------------
// Install manifest — the SINGLE source of truth for the set of project-root-
// relative paths an archetype install writes (lib/install-capabilities.ts →
// installCapabilities). Pure + read-only: it enumerates the fetched clone and
// NEVER writes. Consumed by lib/diff.ts (byte-compare at `status`),
// steps/overwrite-check.ts (the pre-install overwrite warning), and — through
// capabilityCloneFiles below — commands/add.ts (its destination-drift set and
// its records keys), so the "what an install writes" knowledge lives in exactly
// one place.
//
// MIRROR, not the writer: this MIRRORS installCapabilities (the same diff↔install
// mirror the repo already carried, now shared to one function). tests/
// install-manifest.test.ts pins the mirror against a REAL installCapabilities run
// so the two cannot silently drift. The mirror covers NAMES as well as paths: the
// product-command and hook enumerations run the same COPY_FILENAME_RE allowlist
// copyFilteredDir runs (lib/install-capabilities.ts), so one clone cannot be
// refused by `init` and copied in by `update`. A clone carrying such a name makes
// `status` HARD-FAIL rather than report drift — deliberately the posture `init`
// already takes, since the offending name is the fetch boundary's problem, not
// the project's.
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

/**
 * The exact project-root-relative paths an archetype install writes, mapped to
 * their source path in `repoDir` — the selected capability dirs + the fixed
 * product surfaces (product `pharn-*` commands, `.cjs` hooks, trusted docs, the
 * root `features/README.md`, `pharn-contracts/`, `pharn-core/`, `.dev/floor/`
 * minus test files and its `test-fixtures/` subtree), at `layout`. `.claude/settings.json`
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
  //
  // `validate` (optional) runs AFTER `keep` and BEFORE `add` — the exact ordering
  // copyFilteredDir uses — so a name that is not a copy candidate (a `README.md`,
  // a `pharn-dev-*` command, anything nested) can never throw, while a name that
  // IS one is held to the same allowlist on both write paths. It throws
  // (ManifestValidationError); it never silently skips (P2).
  const addDir = (
    relDir: string,
    keep?: (rel: string) => boolean,
    validate?: (rel: string) => void,
  ): void => {
    const from = safeJoin(repoDir, relDir);
    if (findSymlinkComponent(repoDir, relDir) !== null) return;
    if (!lstatSync(from, { throwIfNoEntry: false })?.isDirectory()) return;
    for (const rel of walkFiles(from)) {
      if (keep && !keep(rel)) continue;
      validate?.(rel);
      add(join(relDir, rel), resolve(from, rel));
    }
  };

  // The filename floor copyFilteredDir applies to the same two surfaces. Both
  // keep predicates require `!rel.includes('/')`, so `rel` here IS the basename —
  // the same input install-capabilities.ts validates. Scoped to commands + hooks
  // ONLY: capability dirs, pharn-contracts/, pharn-core/, .dev/floor/ and the
  // trusted docs are copied verbatim by recursive cpSync with no name check, so
  // validating them here would BREAK the mirror (and reject legitimate evals/
  // fixtures, uppercase names, and non-md/cjs/mjs/json extensions).
  const copyNameFloor =
    (dir: string) =>
    (rel: string): void => {
      const label = `${dir}/${rel}`;
      assertSafeString(rel, label, COPY_FILENAME_RE);
      assertNoDotDot(rel, label);
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
    copyNameFloor(CLAUDE_COMMANDS_DIR),
  );
  // Hooks: top-level *.cjs, excluding *.test.cjs.
  addDir(
    CLAUDE_HOOKS_DIR,
    (rel) =>
      !rel.includes('/') && rel.endsWith('.cjs') && !rel.endsWith('.test.cjs'),
    copyNameFloor(CLAUDE_HOOKS_DIR),
  );
  // Trusted docs (flat: root files; pharn: CONSTITUTION + ARCHITECTURE under pharn/).
  // lstat, not exists: a symlinked doc is never copied by the installer, so it is
  // never expected here either (see addDir's note).
  for (const doc of paths.docs) {
    const from = safeJoin(repoDir, doc);
    if (findSymlinkComponent(repoDir, doc) !== null) continue;
    if (lstatSync(from, { throwIfNoEntry: false })?.isFile()) add(doc, from);
  }
  // Upstream's LICENSE at a MAPPED destination — the one entry whose dest differs
  // from its source, which is exactly what this map's dest→source shape exists
  // for. A symlinked source must be absent here as well as unwritten by the
  // installer: a manifest entry the installer never writes is phantom drift, and
  // since this map drives `update`'s WRITES it would also copy one in.
  if (findSymlinkComponent(repoDir, paths.license.from) === null) {
    const licenseFrom = safeJoin(repoDir, paths.license.from);
    if (lstatSync(licenseFrom, { throwIfNoEntry: false })?.isFile()) {
      add(paths.license.to, licenseFrom);
    }
  }
  // features/README.md — the product-loop boundary contract the installed product
  // commands cite by name. Root in BOTH layouts, like .claude/*. Manifest posture
  // (lstat + component walk), not the writer's leaf-only isSymlink: a symlink
  // must never enter the expected set, since this map drives update's WRITES.
  if (findSymlinkComponent(repoDir, FEATURES_README) === null) {
    const featuresFrom = safeJoin(repoDir, FEATURES_README);
    if (lstatSync(featuresFrom, { throwIfNoEntry: false })?.isFile()) {
      add(FEATURES_README, featuresFrom);
    }
  }
  // Contracts + pharn-core (whole dirs) + floor checkers (test files excluded),
  // at layout paths. pharn-core is a FIXED surface, not a capability, so it
  // reaches status/update only through this entry — a flat clone has none, so
  // addDir's lstat finds no directory and contributes nothing (P7).
  addDir(paths.contracts);
  addDir(paths.core);
  // `rel` here is ALREADY a floor-relative posix path (walkFiles builds it with
  // `/`), and the writer's predicate is anchored at the floor root — so both
  // sides test the SAME string, and their equivalence is readable rather than
  // argued. Kept exactly as wide as the writer's, no wider: a mirror that
  // excludes more than the writer copies is the same divergence in the other
  // direction (update would report permanent `missing` entries).
  addDir(
    paths.floor,
    (rel) =>
      !/\.test\.(mjs|cjs)$/.test(rel) &&
      rel !== FLOOR_TEST_FIXTURES_DIR &&
      !rel.startsWith(`${FLOOR_TEST_FIXTURES_DIR}/`),
  );

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

/**
 * The project-root-relative paths of ONE capability's files, enumerated in the
 * CLONE — what a copy of that dir would actually write. The relative path is the
 * same on both sides (the layout is mirrored, lib/layout.ts), so the result
 * addresses the clone source and the project destination at once.
 *
 * `pharn add` uses it twice: for the destination-drift set it backs up
 * (lib/dest-drift.ts) and for the records it merges. Deriving both from the
 * CLONE is what keeps a pre-existing user file that merely SITS in a leftover
 * capability directory out of them — a dest walk would sweep it in and record it
 * as pharn-written.
 *
 * READ-SIDE guards, deliberately not the writer's: a source that is absent, is a
 * symlink at any component, or is not a directory contributes NOTHING. The
 * curated refusal for those cases belongs to installCapabilityDirs' pre-flight
 * (lib/install-capabilities.ts), which runs after this and must be the message
 * the user sees — the same skips-here/throws-there split `addDir` above uses.
 */
export function capabilityCloneFiles(
  repoDir: string,
  paths: LayoutPaths,
  capability: InstalledCapability,
): string[] {
  const subtree = capability.role === 'griller' ? paths.grillers : paths.lenses;
  const relDir = `${subtree}/${capability.name}`;
  if (findSymlinkComponent(repoDir, relDir) !== null) return [];
  const from = safeJoin(repoDir, relDir);
  if (!lstatSync(from, { throwIfNoEntry: false })?.isDirectory()) return [];
  return [...walkFiles(from)].map((rel) => `${relDir}/${rel}`).sort();
}
