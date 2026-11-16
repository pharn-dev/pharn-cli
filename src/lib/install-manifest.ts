import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CLAUDE_AGENTS_DIR,
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  FLOOR_TEST_FIXTURES_DIRS,
} from './constants.js';
import {
  capabilitySubtree,
  layoutPaths,
  resolveFeaturesReadme,
  resolveTrustedDocs,
  type LayoutPaths,
} from './layout.js';
import {
  assertSafeString,
  COPY_FILENAME_RE,
  safeJoin,
  toPosix,
} from './validate.js';
import {
  isInstalledHookFile,
  isProductAgentFile,
  isProductCommandFile,
} from './install-surfaces.js';
import {
  manifestCapabilityFiles,
  manifestInstallFiles,
  readUpstreamManifest,
} from './upstream-manifest.js';
import type { InstalledCapability, Layout } from '../types.js';

// ---------------------------------------------------------------------------
// Install manifest — the SINGLE source of truth for the project-root-relative
// paths an archetype install writes. Pure + read-only: it enumerates the
// fetched clone and never writes. Consumed by lib/diff.ts (`status`), the
// overwrite prompt, and — via capabilityCloneFiles — `add`. When the tree
// declares pharn-install.json (lib/upstream-manifest.ts), the set is the one it
// declares; the enumeration below is the fallback for a tree without it.
//
// It IS the copy list: installCapabilities (lib/install-capabilities.ts)
// writes exactly these files; tests/install-manifest.test.ts compares a REAL
// install run with it. Names are held here too: commands, hooks and agents
// must pass COPY_FILENAME_RE, so `init` and `update` refuse the same clone
// (`status` hard-fails on such a name, as `init` does).
//
// The clone is untrusted: names are only safeJoin-contained for existence
// checks and returned as data; contents are never read or executed here.
// `.claude/settings.json` is user-owned and NOT part of the set.
// ---------------------------------------------------------------------------

// The config file init writes at the project root; it joins the overwrite
// conflict set below.
export const PHARN_CONFIG_FILE = 'pharn.config.json';

// The filename filters for the flat `.claude/` surfaces live beside the
// install-root bound that also uses them (lib/install-surfaces.ts).
export {
  isInstalledHookFile,
  isProductAgentFile,
  isProductCommandFile,
} from './install-surfaces.js';

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
  // The clone-relative path pharn looked at — a CLI-owned constant, never a
  // name read from the clone.
  path: string;
}

/** One declared surface and how many files it contributed to the manifest. */
interface SurfaceAccount extends AbsentSurface {
  files: number;
}

// Relative paths (posix) of every file (not directory) under `dir`, recursively.
function* walkFiles(dir: string, prefix = ''): Generator<string> {
  // The clone holds only regular files and directories (lib/repo.ts).
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
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
 * product surfaces, at `layout`. `.claude/settings.json` is NOT included.
 */
export function collectExpectedInstallPaths(params: {
  repoDir: string;
  capabilities: InstalledCapability[];
  layout: Layout;
}): Map<string, string> {
  return collectInstallManifest(params).expected;
}

/**
 * The declared fixed surfaces the clone ships NO file for at `layout`, in
 * declaration order. From the same enumeration as the manifest, so "absent"
 * means exactly "contributes zero files": missing, wrong-typed, or nothing
 * passing its filter (hooks renamed to `.js`, say). `pharn-core` is declared
 * for the `pharn` layout only (the flat path is a documented no-op). A closed,
 * CLI-side list (LIMITS.md §3e): a surface upstream ADDS is not named.
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
  // A tree that declares pharn-install.json installs exactly what it declares,
  // at its one layout (`pharn`); a request for another layout is answered by
  // the derivation below, as before. The derivation is the fallback for a tree
  // without the manifest: removed in v0.22.0 (CORE-186).
  const manifest = layout === 'pharn' ? readUpstreamManifest(repoDir) : null;
  if (manifest) {
    const expected = manifestInstallFiles(repoDir, manifest, capabilities);
    return { expected, surfaces: accountManifest(expected, paths) };
  }
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
  // Enumerate one source dir's files (optionally filtered) into the expected
  // map. A root that is not a directory contributes nothing. `validate` runs
  // AFTER `keep` and BEFORE `add`, so a non-candidate name never throws while
  // a candidate is held to the allowlist; it throws, never silently skips.
  const addDir = (
    relDir: string,
    keep?: (rel: string) => boolean,
    validate?: (rel: string) => void,
  ): number => {
    const from = safeJoin(repoDir, relDir);
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

  // The filename floor for commands, hooks and agents ONLY (`rel` is the
  // basename there). Everything else is copied verbatim with no name check
  // (safeJoin-contained only), as it always has been.
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
  // Agent definitions: top-level non-dev pharn-*.md. NOT accounted: the surface
  // is optional (pharn-oss before 6.64.0 ships none), so reporting its absence
  // would turn `status --strict` red for every older clone.
  addDir(
    CLAUDE_AGENTS_DIR,
    isProductAgentFile,
    copyNameFloor(CLAUDE_AGENTS_DIR),
  );
  // Trusted docs, at the path THIS clone keeps each one (resolveTrustedDocs:
  // a pre-7.0 pharn-layout clone keeps THREAT-MODEL + LIMITS at the root).
  // isFile, not exists: a directory can stand where a doc is expected. Absent →
  // named at the LAYOUT's own path, not the probe's fallback.
  const layoutDocs = paths.docs;
  resolveTrustedDocs(repoDir, layout).forEach((doc, i) => {
    const from = safeJoin(repoDir, doc);
    const shipped =
      lstatSync(from, { throwIfNoEntry: false })?.isFile() === true;
    if (shipped) add(doc, from);
    account('trusted-doc', shipped ? doc : layoutDocs[i]!, shipped ? 1 : 0);
  });
  // Upstream's LICENSE at a MAPPED destination — the one entry whose dest
  // differs from its source, which is what the dest→source map shape is for.
  let licenseShipped = false;
  const licenseFrom = safeJoin(repoDir, paths.license.from);
  if (lstatSync(licenseFrom, { throwIfNoEntry: false })?.isFile()) {
    add(paths.license.to, licenseFrom);
    licenseShipped = true;
  }
  account('license', paths.license.from, licenseShipped ? 1 : 0);
  // features/README.md — layout-dependent; see resolveFeaturesReadme.
  const featuresRel = resolveFeaturesReadme(repoDir, layout);
  let featuresShipped = false;
  const featuresFrom = safeJoin(repoDir, featuresRel);
  if (lstatSync(featuresFrom, { throwIfNoEntry: false })?.isFile()) {
    add(featuresRel, featuresFrom);
    featuresShipped = true;
  }
  // Absent → named at the LAYOUT's own path, not the resolver's fallback.
  account(
    'features-readme',
    featuresShipped ? featuresRel : paths.featuresReadme,
    featuresShipped ? 1 : 0,
  );
  // Contracts + pharn-core (whole dirs) + floor checkers (test files excluded),
  // at layout paths. A flat clone has no pharn-core, so it contributes nothing.
  account('contracts', paths.contracts, addDir(paths.contracts));
  const coreFiles = addDir(paths.core);
  if (layout === 'pharn') account('core', paths.core, coreFiles);
  // The floor minus its test files and its root test-apparatus dirs.
  const floorFiles = addDir(
    paths.floor,
    (rel) => !/\.test\.(mjs|cjs)$/.test(rel) && !isFloorTestFixturePath(rel),
  );
  account('floor', paths.floor, floorFiles);

  return { expected, surfaces };
}

// The same accounting as the derivation's, read off a manifest's install set
// by destination: what each surface this CLI declares contributed, so
// `absentInstallSurfaces` means "contributes zero files" either way. A surface
// the manifest adds is installed but not accounted (nothing to report).
function accountManifest(
  expected: ReadonlyMap<string, string>,
  paths: LayoutPaths,
): SurfaceAccount[] {
  const dests = [...expected.keys()];
  const under = (dir: string): number =>
    dests.filter((d) => d.startsWith(`${dir}/`)).length;
  const one = (dest: string): number => (expected.has(dest) ? 1 : 0);
  return [
    {
      surface: 'commands',
      path: CLAUDE_COMMANDS_DIR,
      files: under(CLAUDE_COMMANDS_DIR),
    },
    {
      surface: 'hooks',
      path: CLAUDE_HOOKS_DIR,
      files: under(CLAUDE_HOOKS_DIR),
    },
    ...paths.docs.map((doc) => ({
      surface: 'trusted-doc' as const,
      path: doc,
      files: one(doc),
    })),
    {
      surface: 'license',
      path: paths.license.from,
      files: one(paths.license.to),
    },
    {
      surface: 'features-readme',
      path: paths.featuresReadme,
      files: one(paths.featuresReadme),
    },
    {
      surface: 'contracts',
      path: paths.contracts,
      files: under(paths.contracts),
    },
    { surface: 'core', path: paths.core, files: under(paths.core) },
    { surface: 'floor', path: paths.floor, files: under(paths.floor) },
  ];
}

/**
 * Is this floor-RELATIVE posix path one of the floor's test-apparatus dirs
 * (`FLOOR_TEST_FIXTURES_DIRS`) or inside one? Anchored at the floor root, so a
 * nested `lib/fixtures/x` is kept and `''` never matches.
 */
function isFloorTestFixturePath(rel: string): boolean {
  return FLOOR_TEST_FIXTURES_DIRS.some(
    (dir) => rel === dir || rel.startsWith(`${dir}/`),
  );
}

/**
 * The paths an archetype install would write that ALREADY exist under
 * `projectRoot` — the overwrite-conflict set: the manifest plus
 * `pharn.config.json`, sorted. A fresh project yields `[]`.
 *
 * `pharn.records.json` and `pharn/.backup/` are deliberately NOT in it: they are
 * CLI-owned derived state, and every line of this warning should be one of the
 * user's files. Pinned by "CLI-owned metadata is outside the install set" in
 * tests/install-manifest.test.ts.
 */
export function conflictingWriteTargets(params: {
  repoDir: string;
  projectRoot: string;
  capabilities: InstalledCapability[];
  layout: Layout;
  // The manifest for exactly these inputs, when the caller has it (`init`
  // computes it once per run). Absent → computed here.
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
 * CLONE (the layout is mirrored, so each addresses source and destination).
 * `pharn add` derives its drift set and records keys from it, so a user's file
 * that merely sits in a leftover capability dir is never recorded as pharn's.
 *
 * A source that is absent or not a directory contributes NOTHING: the curated
 * refusal belongs to installCapabilityDirs' pre-flight, which runs after this.
 */
export function capabilityCloneFiles(
  repoDir: string,
  paths: LayoutPaths,
  capability: InstalledCapability,
): string[] {
  // From the manifest when the tree declares one (same rule as the install
  // set above); the walk is the fallback, removed in v0.22.0 (CORE-186).
  const manifest =
    paths.layout === 'pharn' ? readUpstreamManifest(repoDir) : null;
  if (manifest) return manifestCapabilityFiles(manifest, capability);
  const subtree = capabilitySubtree(paths, capability.role);
  const relDir = `${subtree}/${capability.name}`;
  const from = safeJoin(repoDir, relDir);
  if (!lstatSync(from, { throwIfNoEntry: false })?.isDirectory()) return [];
  return [...walkFiles(from)].map((rel) => `${relDir}/${rel}`).sort();
}
