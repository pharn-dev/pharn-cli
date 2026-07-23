import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { collectExpectedInstallPaths } from './install-manifest.js';
import { safeJoin } from './validate.js';
import type { InstalledCapability, Layout } from '../types.js';

export interface InstallDiff {
  // .claude-relative paths present on disk but whose bytes differ from upstream.
  modified: string[];
  // Expected by an installed module/skill but absent on disk.
  missing: string[];
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
 * trusted docs, hooks, contracts, and floor checkers ARE compared. Every read is
 * safeJoin-guarded.
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

// Byte-compare each expected file against `baseDir`, partitioning into
// modified / missing / ok. safeJoin-guarded.
function compareExpected(
  expected: Map<string, string>,
  baseDir: string,
): InstallDiff {
  const modified: string[] = [];
  const missing: string[] = [];
  let okCount = 0;
  for (const [rel, repoPath] of expected) {
    const diskPath = safeJoin(baseDir, rel);
    if (!existsSync(diskPath)) {
      missing.push(rel);
    } else if (hash(repoPath) === hash(diskPath)) {
      okCount += 1;
    } else {
      modified.push(rel);
    }
  }
  modified.sort();
  missing.sort();
  return { modified, missing, okCount };
}

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
