import { readDiskState } from './apply-update.js';
import { sha256File } from './hash.js';
import { collectExpectedInstallPaths } from './install-manifest.js';
import type { InstalledCapability, Layout } from '../types.js';

export interface InstallDiff {
  // .claude-relative paths present on disk but whose bytes differ from upstream.
  modified: string[];
  // Expected by an installed module/skill but absent on disk.
  missing: string[];
  // Expected paths that EXIST but cannot be compared: a symlink (live OR
  // dangling), a directory, another non-regular file, an unreadable file, or a
  // path whose parent is a regular file. Reported by name with the reason,
  // never folded into ok/modified/missing — a symlink read THROUGH would
  // masquerade as `modified` (different bytes) or, worse, as `ok` (identical
  // bytes), silently blessing a path that points outside the install. Sorted by
  // `rel`.
  unreadable: { rel: string; reason: string }[];
  // Files present on disk and byte-identical to upstream.
  okCount: number;
}

/**
 * Read-only comparison of an archetype install's PHARN-owned files against a
 * fetched clone. The expected set is the shared install manifest
 * (lib/install-manifest.ts → collectExpectedInstallPaths — the selected capability
 * dirs + the fixed product surfaces at the recorded layout); this byte-compares
 * each entry against `projectRoot`. `.claude/settings.json` is user-owned
 * (preserved at install) and is excluded by the manifest; the copied-verbatim
 * trusted docs, hooks, contracts, and floor checkers ARE compared.
 *
 * Every read stays safeJoin-contained, though this module no longer calls
 * safeJoin itself: the project side is contained by `readDiskState`
 * (lib/apply-update.ts) and the clone side by `collectExpectedInstallPaths`.
 */
export function diffInstalledCapabilities(params: {
  repoDir: string;
  projectRoot: string;
  capabilities: InstalledCapability[];
  // The project's recorded layout (config.layout via configLayout). The expected
  // set is derived at the layout's paths for BOTH the clone source and the project
  // dest (the mirror). A clone at @main whose layout differs simply lacks the
  // source (existsSync false → skipped) in the manifest.
  layout: Layout;
}): InstallDiff {
  const { repoDir, projectRoot, capabilities, layout } = params;
  const expected = collectExpectedInstallPaths({
    repoDir,
    capabilities,
    layout,
  });
  return compareExpected(expected, projectRoot);
}

// Compare each expected file against `baseDir`, partitioning into
// modified / missing / unreadable / ok.
//
// The PROJECT side goes through `readDiskState` — the same total classifier
// `pharn update` writes against, so the read and the write can never disagree
// about what a symlink (or a directory, or an ENOTDIR parent) at an owned path
// means. It never throws, so one unreadable path can no longer collapse the
// whole report.
//
// The CLONE side is deliberately NOT symmetric: a plain `sha256File`. The
// manifest only ever emits paths it existsSync-verified in a fresh private temp
// clone THIS run, and its walkers exclude symlinks — so a clone-side read
// failure means the clone corrupted mid-run, which is genuinely exceptional and
// keeps its existing behavior of surfacing through runStatus's catch. There is
// no fifth state.
function compareExpected(
  expected: Map<string, string>,
  baseDir: string,
): InstallDiff {
  const modified: string[] = [];
  const missing: string[] = [];
  const unreadable: { rel: string; reason: string }[] = [];
  let okCount = 0;
  for (const [rel, repoPath] of expected) {
    const state = readDiskState(baseDir, rel);
    if (state.kind === 'absent') {
      missing.push(rel);
    } else if (state.kind === 'unreadable') {
      unreadable.push({ rel, reason: state.reason });
    } else if (state.hash === sha256File(repoPath)) {
      okCount += 1;
    } else {
      modified.push(rel);
    }
  }
  modified.sort();
  missing.sort();
  // Code-unit comparison, matching the `.sort()` default above. NOT
  // localeCompare, which is locale-dependent and would order the report
  // differently across machines (P5). Written branch-free rather than as a
  // ternary chain so there is no equality arm that map-key uniqueness makes
  // unreachable — this yields -1 / 0 / 1 arithmetically.
  unreadable.sort((a, b) => Number(a.rel > b.rel) - Number(a.rel < b.rel));
  return { modified, missing, unreadable, okCount };
}
