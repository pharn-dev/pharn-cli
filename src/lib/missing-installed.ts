import { lstatSync } from 'node:fs';
import { MODELS_RECORD_KEY, type FileRecords } from './install-records.js';
import { capabilitySubtree, configLayout, layoutPaths } from './layout.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { safeJoin } from './validate.js';
import type { PharnConfig } from '../types.js';

/**
 * The first installed path that is PROVABLY gone, or `null` — the local,
 * read-only check that re-opens `pharn update`'s same-version early return.
 *
 * That early return skips planning entirely, so before this check a deleted
 * file (or a whole capability dir) at the current version was never restored
 * until upstream bumped `SKILLS_VERSION` or the user reached for `--force`.
 * Two local facts say "the install is incomplete", and neither needs the
 * network:
 *
 * 1. a `config.capabilities` entry whose directory is absent at the RECORDED
 *    layout (`configLayout` — the address `remove`/`status` use too);
 * 2. a key of a USABLE `pharn.records.json` (the caller passes the stamped
 *    baseline, or `null`) whose path is absent. The models record is not a
 *    path and is skipped. With no usable store only (1) applies.
 *
 * "Provably" is the whole contract, and it is what keeps the re-open BOUNDED.
 * A path counts only when every existing component is a real directory and
 * the leaf does not exist — exactly the `missing → restore` row the planned
 * run writes, after which the next run early-returns again (a missing key the
 * new manifest no longer has is pruned from the store by that run instead).
 * A path that crosses a symlinked component is NOT missing: it is never
 * followed out of the project, and the real run refuses to write through it,
 * so re-opening could not repair it and would never close. A component below
 * a regular file (ENOTDIR) and a non-directory at a capability path are not
 * missing either — the run cannot write there, and `pharn status` reports them.
 *
 * Deterministic (P5): capability dirs in config order, then record keys sorted.
 * Fail-safe: any fs or containment error is "not provably missing".
 */
export function findMissingInstalled(
  cwd: string,
  config: PharnConfig,
  records: FileRecords | null,
): string | null {
  const paths = layoutPaths(configLayout(config));
  for (const cap of config.capabilities ?? []) {
    const rel = `${capabilitySubtree(paths, cap.role)}/${cap.name}`;
    if (provablyAbsent(cwd, rel)) return rel;
  }
  if (records === null) return null;
  for (const rel of Object.keys(records).sort()) {
    if (rel === MODELS_RECORD_KEY) continue;
    if (provablyAbsent(cwd, rel)) return rel;
  }
  return null;
}

function provablyAbsent(base: string, rel: string): boolean {
  try {
    if (findSymlinkComponent(base, rel) !== null) return false;
    return (
      lstatSync(safeJoin(base, rel), { throwIfNoEntry: false }) === undefined
    );
  } catch {
    return false;
  }
}
