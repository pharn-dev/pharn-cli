import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  DEV_COMMAND_PREFIX,
  FLOOR_TEST_FIXTURES_DIRS,
  PRODUCT_COMMAND_PREFIX,
} from './constants.js';
import {
  capabilitySubtree,
  layoutPaths,
  resolveFeaturesReadme,
  type LayoutPaths,
} from './layout.js';
import { findSymlinkComponent } from './symlink-guard.js';
import {
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

// The two filename filters the install applies to its flat surfaces, shared by
// the copy (lib/install-capabilities.ts → copyFilteredDir) and this mirror, so
// the writer and the manifest cannot disagree about which names they take.
// `name` is a path relative to the surface dir: anything nested is never taken.

/** A product command: a top-level `pharn-*.md` that is not a `pharn-dev-*` one. */
export function isProductCommandFile(name: string): boolean {
  return (
    !name.includes('/') &&
    name.endsWith('.md') &&
    name.startsWith(PRODUCT_COMMAND_PREFIX) &&
    !name.startsWith(DEV_COMMAND_PREFIX)
  );
}

/**
 * A hook script: a top-level `.cjs` OR `.mjs` file that is not a test
 * (`*.test.cjs` / `*.test.mjs`). Both module flavours, because upstream may
 * ship either — an `.mjs` hook was silently left out before, while the wiring
 * in settings.json still pointed at it.
 */
export function isInstalledHookFile(name: string): boolean {
  return (
    !name.includes('/') &&
    /\.(cjs|mjs)$/.test(name) &&
    !/\.test\.(cjs|mjs)$/.test(name)
  );
}

/**
 * The fixed product surfaces an install DECLARES — everything it copies that is
 * not a selected capability. Capabilities are not here: a selected one that is
 * missing in the clone already refuses the install (installCapabilityDirs).
 */
export type InstallSurface =
  | 'commands'
  | 'hooks'
  | 'trusted-doc'
  | 'license'
  | 'features-readme'
  | 'contracts'
  | 'core'
  | 'floor';

/** A declared surface the fetched clone ships no file for. */
export interface AbsentSurface {
  surface: InstallSurface;
  // The clone-relative path pharn looked at — a CLI-owned constant resolved for
  // the layout, never a name read from the clone.
  path: string;
}

/** One declared surface and how many files it contributed to the manifest. */
interface SurfaceAccount extends AbsentSurface {
  files: number;
}

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
 * product surfaces (product `pharn-*` commands, `.cjs`/`.mjs` hooks, trusted docs, the
 * root `features/README.md`, `pharn-contracts/`, `pharn-core/`, `.dev/floor/`
 * minus test files and its `test-fixtures/` + `fixtures/` subtrees), at `layout`. `.claude/settings.json`
 * is user-owned (preserved at install) and is NOT included. Mirrors
 * installCapabilities (lib/install-capabilities.ts); every read is safeJoin-guarded.
 */
export function collectExpectedInstallPaths(params: {
  repoDir: string;
  capabilities: InstalledCapability[];
  layout: Layout;
}): Map<string, string> {
  return collectInstallManifest(params).expected;
}

/**
 * The declared fixed surfaces the clone ships NO file for at `layout` — each
 * one the install would otherwise skip in silence. Derived from the SAME
 * enumeration as the manifest (collectInstallManifest), so "absent" means
 * exactly "contributes zero files to what the install writes": a missing
 * source, a symlinked or wrong-typed one, or a dir with no file passing its
 * filter (hooks renamed to `.js`, say). In declaration order.
 *
 * `pharn-core` is declared for the `pharn` layout only: the flat path is a
 * documented no-op (lib/constants.ts → CORE_DIR), and flagging it would make
 * every flat clone report a surface that never existed there.
 *
 * A closed, CLI-side list (LIMITS.md §3e): a surface upstream ADDS is neither
 * installed nor named here.
 */
export function absentInstallSurfaces(params: {
  repoDir: string;
  layout: Layout;
}): AbsentSurface[] {
  return collectInstallManifest({ ...params, capabilities: [] })
    .surfaces.filter((s) => s.files === 0)
    .map(({ surface, path }) => ({ surface, path }));
}

// The one enumeration behind both exports above: the manifest, plus how many
// files each declared fixed surface contributed to it.
function collectInstallManifest(params: {
  repoDir: string;
  capabilities: InstalledCapability[];
  layout: Layout;
}): { expected: Map<string, string>; surfaces: SurfaceAccount[] } {
  const { repoDir, capabilities, layout } = params;
  const paths = layoutPaths(layout);
  const expected = new Map<string, string>();
  const surfaces: SurfaceAccount[] = [];
  const add = (rel: string, repoPath: string): void => {
    expected.set(toPosix(rel), repoPath);
  };
  const account = (
    surface: InstallSurface,
    path: string,
    files: number,
  ): void => {
    surfaces.push({ surface, path, files });
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
  ): number => {
    const from = safeJoin(repoDir, relDir);
    if (findSymlinkComponent(repoDir, relDir) !== null) return 0;
    if (!lstatSync(from, { throwIfNoEntry: false })?.isDirectory()) return 0;
    let added = 0;
    for (const rel of walkFiles(from)) {
      if (keep && !keep(rel)) continue;
      validate?.(rel);
      add(join(relDir, rel), resolve(from, rel));
      added += 1;
    }
    return added;
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
    };

  // Selected capabilities (whole dir, incl. evals) at the layout's subtree.
  for (const cap of capabilities) {
    const subtree = capabilitySubtree(paths, cap.role);
    addDir(`${subtree}/${cap.name}`);
  }
  // Product commands: top-level non-dev pharn-*.md.
  account(
    'commands',
    CLAUDE_COMMANDS_DIR,
    addDir(
      CLAUDE_COMMANDS_DIR,
      isProductCommandFile,
      copyNameFloor(CLAUDE_COMMANDS_DIR),
    ),
  );
  // Hooks: top-level *.cjs / *.mjs, excluding *.test.cjs / *.test.mjs.
  account(
    'hooks',
    CLAUDE_HOOKS_DIR,
    addDir(
      CLAUDE_HOOKS_DIR,
      isInstalledHookFile,
      copyNameFloor(CLAUDE_HOOKS_DIR),
    ),
  );
  // Trusted docs. The prefix is per-DOC, not per-layout: flat keeps all four at
  // the root; the pharn layout has CONSTITUTION + ARCHITECTURE under pharn/ and
  // THREAT-MODEL + LIMITS still at the root, mirroring where upstream keeps each
  // (lib/constants.ts → PHARN_TRUSTED_DOCS). This loop reads whatever the layout
  // resolves and needs no per-entry knowledge of the split.
  // lstat, not exists: a symlinked doc is never copied by the installer, so it is
  // never expected here either (see addDir's note).
  for (const doc of paths.docs) {
    const from = safeJoin(repoDir, doc);
    const shipped =
      findSymlinkComponent(repoDir, doc) === null &&
      lstatSync(from, { throwIfNoEntry: false })?.isFile() === true;
    if (shipped) add(doc, from);
    account('trusted-doc', doc, shipped ? 1 : 0);
  }
  // Upstream's LICENSE at a MAPPED destination — the one entry whose dest differs
  // from its source, which is exactly what this map's dest→source shape exists
  // for. A symlinked source must be absent here as well as unwritten by the
  // installer: a manifest entry the installer never writes is phantom drift, and
  // since this map drives `update`'s WRITES it would also copy one in.
  let licenseShipped = false;
  if (findSymlinkComponent(repoDir, paths.license.from) === null) {
    const licenseFrom = safeJoin(repoDir, paths.license.from);
    if (lstatSync(licenseFrom, { throwIfNoEntry: false })?.isFile()) {
      add(paths.license.to, licenseFrom);
      licenseShipped = true;
    }
  }
  account('license', paths.license.from, licenseShipped ? 1 : 0);
  // features/README.md — layout-dependent since pharn-oss 5.0.0; see resolveFeaturesReadme.
  const featuresRel = resolveFeaturesReadme(repoDir, layout);
  let featuresShipped = false;
  if (findSymlinkComponent(repoDir, featuresRel) === null) {
    const featuresFrom = safeJoin(repoDir, featuresRel);
    if (lstatSync(featuresFrom, { throwIfNoEntry: false })?.isFile()) {
      add(featuresRel, featuresFrom);
      featuresShipped = true;
    }
  }
  // Absent → named at the LAYOUT's own path, not the fallback the resolver
  // returned: the root path is only a pre-relocation window on the pharn layout.
  account(
    'features-readme',
    featuresShipped ? featuresRel : paths.featuresReadme,
    featuresShipped ? 1 : 0,
  );
  // Contracts + pharn-core (whole dirs) + floor checkers (test files excluded),
  // at layout paths. pharn-core is a FIXED surface, not a capability, so it
  // reaches status/update only through this entry — a flat clone has none, so
  // addDir's lstat finds no directory and contributes nothing (P7).
  account('contracts', paths.contracts, addDir(paths.contracts));
  const coreFiles = addDir(paths.core);
  if (layout === 'pharn') account('core', paths.core, coreFiles);
  // `rel` here is ALREADY a floor-relative posix path (walkFiles builds it with
  // `/`), and the writer's predicate is anchored at the floor root — so both
  // sides test the SAME string, and their equivalence is readable rather than
  // argued. Kept exactly as wide as the writer's, no wider: a mirror that
  // excludes more than the writer copies is the same divergence in the other
  // direction (update would report permanent `missing` entries).
  const floorFiles = addDir(
    paths.floor,
    (rel) => !/\.test\.(mjs|cjs)$/.test(rel) && !isFloorTestFixturePath(rel),
  );
  account('floor', paths.floor, floorFiles);

  return { expected, surfaces };
}

/**
 * Is this floor-RELATIVE posix path one of the floor's test-apparatus dirs
 * (`FLOOR_TEST_FIXTURES_DIRS`) or inside one? Anchored at the floor root: only
 * the root's DIRECT child of that name matches, so `lib/fixtures/x` and a file
 * merely named `my-test-fixtures.mjs` are kept, and `''` (the root) never
 * matches. The ONE predicate both the writer (install-capabilities.ts) and this
 * manifest use, so the two cannot disagree on what the floor copy contains.
 */
export function isFloorTestFixturePath(rel: string): boolean {
  return FLOOR_TEST_FIXTURES_DIRS.some(
    (dir) => rel === dir || rel.startsWith(`${dir}/`),
  );
}

/**
 * The project-root-relative paths an archetype install would write that ALREADY
 * exist under `projectRoot` — the pre-install overwrite-conflict set. Derived
 * from collectExpectedInstallPaths (the copied product surfaces + selected
 * capabilities) PLUS `pharn.config.json` (init also writes it; the old
 * confirmOverwriteIfExists guarded exactly it). Sorted for deterministic output
 * (P5). Every existence check is safeJoin-contained (P2). Pure; a fresh project
 * (nothing already installed) yields `[]`.
 *
 * NOT every path an install writes. `init` also writes `pharn.records.json`,
 * and it is deliberately absent from this set: it is CLI-owned DERIVED state
 * that a re-install legitimately regenerates from what it just copied, so
 * prompting about it would add a line the user cannot act on to a warning whose
 * whole value is that every line is one of THEIR files. `.pharn-backup/` is
 * excluded for the same reason. Pinned by the "CLI-owned metadata is outside
 * the install set" case in tests/install-manifest.test.ts — widening this set
 * to match a loose reading of "the install's write targets" breaks it on
 * purpose.
 */
export function conflictingWriteTargets(params: {
  repoDir: string;
  projectRoot: string;
  capabilities: InstalledCapability[];
  layout: Layout;
  // The manifest for exactly these inputs, when the caller already has it:
  // `init` computes it ONCE per run and hands the same map to this prompt and
  // to the install (commands/init.ts). Absent → computed here.
  expected?: ReadonlyMap<string, string>;
}): string[] {
  const { repoDir, projectRoot, capabilities, layout } = params;
  const expected =
    params.expected ??
    collectExpectedInstallPaths({
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
  const subtree = capabilitySubtree(paths, capability.role);
  const relDir = `${subtree}/${capability.name}`;
  if (findSymlinkComponent(repoDir, relDir) !== null) return [];
  const from = safeJoin(repoDir, relDir);
  if (!lstatSync(from, { throwIfNoEntry: false })?.isDirectory()) return [];
  return [...walkFiles(from)].map((rel) => `${relDir}/${rel}`).sort();
}
