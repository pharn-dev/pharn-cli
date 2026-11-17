import { readDiskState } from './apply-update.js';
import { contentHash } from './hash.js';
import { collectExpectedInstallPaths } from './install-manifest.js';
import type { InstalledCapability } from '../types.js';

export interface InstallDiff {
  // .claude-relative paths present on disk but whose bytes differ from upstream.
  modified: string[];
  // Expected but absent on disk.
  missing: string[];
  // Expected paths that cannot be compared: a symlink (live or dangling) at the
  // path or any parent component, a directory or other non-regular file, an
  // unreadable file, or a path under a regular file. Not in `missing`, since a
  // restore would write through what is in the way; never folded into ok or
  // modified, since a symlink read THROUGH would bless a path pointing outside
  // the install. Sorted by `rel`.
  unreadable: { rel: string; reason: string }[];
  // Files present on disk and identical to upstream (contentHash: CRLF≡LF in text).
  okCount: number;
}

/**
 * Read-only comparison of an archetype install's PHARN-owned files against a
 * fetched clone. The expected set is the shared install manifest (callers
 * compare only an install recorded at the clone's layout);
 * `.claude/settings.json` (user-owned) is excluded, the
 * copied-verbatim docs, hooks, contracts and floor checkers ARE compared.
 * Reads stay contained through `readDiskState` (project) and
 * `collectExpectedInstallPaths` (clone).
 */
export function diffInstalledCapabilities(params: {
  repoDir: string;
  projectRoot: string;
  capabilities: InstalledCapability[];
}): InstallDiff {
  const { repoDir, projectRoot, capabilities } = params;
  const expected = collectExpectedInstallPaths({ repoDir, capabilities });
  return compareExpected(expected, projectRoot);
}

// Compare each expected file against `baseDir`: modified / missing /
// unreadable / ok. The PROJECT side goes through `readDiskState`, the same
// classifier and symlink walk `pharn update` writes against, so the read and
// write agree; it never throws. The CLONE side is a plain `contentHash`: the
// manifest only emits paths verified in this run's private clone, so a read
// failure there is exceptional and surfaces through runStatus's catch.
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
    } else if (state.hash === contentHash(repoPath)) {
      okCount += 1;
    } else {
      modified.push(rel);
    }
  }
  modified.sort();
  missing.sort();
  // Code-unit comparison, matching `.sort()` — never localeCompare, which
  // differs across machines.
  unreadable.sort((a, b) => Number(a.rel > b.rel) - Number(a.rel < b.rel));
  return { modified, missing, unreadable, okCount };
}
