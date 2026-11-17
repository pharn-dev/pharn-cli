import { existsSync } from 'node:fs';
import { CLAUDE_COMMANDS_DIR, CLAUDE_HOOKS_DIR } from './constants.js';
import { layoutPaths } from './layout.js';
import { safeJoin } from './validate.js';
import {
  manifestCapabilityFiles,
  manifestInstallFiles,
  readUpstreamManifest,
} from './upstream-manifest.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Install manifest — the SINGLE source of truth for the project-root-relative
// paths an archetype install writes: the set the fetched tree's
// pharn-install.json declares (lib/upstream-manifest.ts), at its one layout
// (`pharn`). Pure + read-only; never writes. Consumed by lib/diff.ts
// (`status`), the overwrite prompt, and — via capabilityCloneFiles — `add`.
//
// It IS the copy list: installCapabilities (lib/install-capabilities.ts)
// writes exactly these files; tests/install-manifest.test.ts compares a REAL
// install run with it.
//
// The clone is untrusted: every path is the manifest's, validated and
// safeJoin-contained there, and returned as data; contents are never read or
// executed here. `.claude/settings.json` (copied only if absent) is NOT in it.
// ---------------------------------------------------------------------------

// The config file init writes at the project root; it joins the overwrite
// conflict set below.
export const PHARN_CONFIG_FILE = 'pharn.config.json';

/**
 * The fixed product surfaces this CLI DECLARES — the ones whose absence it
 * reports. Capabilities are not here: a selected one that is missing in the
 * clone already refuses the install (installCapabilityDirs).
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

/**
 * The exact project-root-relative paths an archetype install writes, mapped to
 * their source path in `repoDir` — the selected capabilities' files + the fixed
 * product surfaces. `.claude/settings.json` is NOT included.
 */
export function collectExpectedInstallPaths(params: {
  repoDir: string;
  capabilities: readonly InstalledCapability[];
}): Map<string, string> {
  const { repoDir, capabilities } = params;
  return manifestInstallFiles(
    repoDir,
    readUpstreamManifest(repoDir),
    capabilities,
  );
}

/**
 * The declared fixed surfaces the clone ships NO file for, in declaration
 * order: those to which the manifest's install set contributes zero files. A
 * closed, CLI-side list (LIMITS.md §3e): a surface upstream ADDS is installed
 * but never named here.
 */
export function absentInstallSurfaces(params: {
  repoDir: string;
}): AbsentSurface[] {
  const expected = collectExpectedInstallPaths({
    repoDir: params.repoDir,
    capabilities: [],
  });
  return accountSurfaces(expected)
    .filter((s) => s.files === 0)
    .map(({ surface, path }) => ({ surface, path }));
}

// What each surface this CLI declares contributed to the install set, by
// destination. A surface the manifest adds is installed but not accounted
// (nothing to report).
function accountSurfaces(
  expected: ReadonlyMap<string, string>,
): SurfaceAccount[] {
  const paths = layoutPaths('pharn');
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
  capabilities: readonly InstalledCapability[];
  // The manifest for exactly these inputs, when the caller has it (`init`
  // computes it once per run). Absent → computed here.
  expected?: ReadonlyMap<string, string>;
}): string[] {
  const { repoDir, projectRoot, capabilities } = params;
  const expected =
    params.expected ?? collectExpectedInstallPaths({ repoDir, capabilities });
  const candidates = new Set<string>(expected.keys());
  candidates.add(PHARN_CONFIG_FILE);
  const conflicts: string[] = [];
  for (const rel of candidates) {
    if (existsSync(safeJoin(projectRoot, rel))) conflicts.push(rel);
  }
  return conflicts.sort();
}

/**
 * The project-root-relative paths of ONE capability's files, as the manifest
 * declares them (each addresses source and destination). `pharn add` derives
 * its drift set and records keys from it, so a user's file that merely sits in
 * a leftover capability dir is never recorded as pharn's.
 *
 * A capability the manifest does not declare contributes NOTHING: the curated
 * refusal belongs to installCapabilityDirs' pre-flight, which runs after this.
 */
export function capabilityCloneFiles(
  repoDir: string,
  capability: InstalledCapability,
): string[] {
  return manifestCapabilityFiles(readUpstreamManifest(repoDir), capability);
}
