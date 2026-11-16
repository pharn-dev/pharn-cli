import { lstatSync } from 'node:fs';
import { relative } from 'node:path';
import { contentHash } from './hash.js';
import type { FileRecords } from './install-records.js';
import { findSymlinkComponentOr } from './symlink-guard.js';
import { decideFileAction, type FileDecision } from './update-decision.js';
import { safeJoin, toPosix } from './validate.js';

// ---------------------------------------------------------------------------
// The destination scan — what a capability copy (`add`, a re-run `init`) is
// about to destroy. One walk, three answers:
//
//   drifted[] — dest regular files `update` would have SKIPPED; the caller backs
//               exactly these up before its first write. `labels` says why.
//   unsafe[]  — dest paths crossing a SYMLINKED component; `add` refuses.
//   seen      — each classified rel's dest hash (`null`: absent), for the
//               writer's changed-since-plan compare (lib/apply-update.ts).
//
// "Drifted" is update's definition (decideFileAction with `force: true` → its
// `backup` bit): `modified` / `unrecorded` with a usable baseline, every
// differing file `unverifiable` without one. A file still at its recorded hash
// is a clean upgrade, and identical content (CRLF≡LF) is no drift at all.
// Each rel is compared with its REAL source (`sources`: the mapped LICENSE).
//
// `unsafe` is a REFUSAL, not a skip: the writer refuses each such path on its
// own, but only after the files before it landed, and a backup is impossible
// (`createBackup` refuses symlinked components). Refusing up front writes
// nothing (pinned by tests/commands/add.test.ts).
//
// Both `safeJoin`s run before either walk, so an escaping path from the
// untrusted clone throws loudly instead of being buried by a catch.
//
// Residual: a CHECK, not a lock — a component turned into a symlink between
// this scan and the copy is not seen.
// ---------------------------------------------------------------------------

/** A destination path the copy would reach THROUGH a symlink. */
export interface UnsafeDest {
  /** The project-relative path the copy would have written. */
  rel: string;
  /** The first symlinked component of it, below the project root. */
  link: string;
}

/** Why a drifted file is backed up — update's SKIP label for it. */
export type DriftLabel = 'modified' | 'unrecorded' | 'unverifiable';

export interface DestScan {
  /** Existing dest files update would have skipped — back these up. */
  drifted: string[];
  /** Why each `drifted` rel is in the set. */
  labels: ReadonlyMap<string, DriftLabel>;
  /** Paths the copy would write through a symlink — refuse the install. */
  unsafe: UnsafeDest[];
  /** Each classified rel's dest hash, `null` when absent; skipped rels have none. */
  seen: ReadonlyMap<string, string | null>;
}

/**
 * Scan the destination for `rels` (project-root-relative posix paths). Each is
 * compared with `sources.get(rel)` in the clone, or with the same path there
 * when `sources` has no entry for it. `records` is the validated baseline, or
 * null when there is none to trust. Both lists are sorted; nothing is written.
 */
export function scanDest(params: {
  repoDir: string;
  projectRoot: string;
  rels: readonly string[];
  sources?: ReadonlyMap<string, string>;
  records?: FileRecords | null;
}): DestScan {
  const { repoDir, projectRoot, rels, sources } = params;
  const records = params.records ?? null;
  const drifted: string[] = [];
  const labels = new Map<string, DriftLabel>();
  const unsafe: UnsafeDest[] = [];
  const seen = new Map<string, string | null>();

  for (const rel of rels) {
    const srcRel = sources?.get(rel) ?? rel;
    // Containment first, on BOTH sides: an escaping path throws here.
    const dest = safeJoin(projectRoot, rel);
    const src = safeJoin(repoDir, srcRel);

    const destLink = findSymlinkComponentOr(projectRoot, rel, UNREADABLE);
    if (destLink === UNREADABLE) continue; // ENOTDIR — see UNREADABLE
    if (destLink !== null) {
      unsafe.push({ rel, link: destLink });
      continue;
    }
    const stat = lstatSync(dest, { throwIfNoEntry: false });
    if (stat === undefined) {
      seen.set(rel, null);
      continue;
    }
    if (!stat.isFile()) continue;

    // The clone needs no link walk (lib/repo.ts), but a non-file there is a skip.
    if (!isRegularFile(src)) continue;

    // contentHash's EACCES deliberately PROPAGATES, aborting before any write:
    // "no drift" would clobber an unreadable file. `force: true` because both
    // callers overwrite regardless; the question is only the `backup` bit.
    const diskHash = contentHash(dest);
    seen.set(rel, diskHash);
    const label = driftLabel(
      decideFileAction({
        diskHash,
        latestHash: contentHash(src),
        recordedHash:
          records !== null && Object.hasOwn(records, rel)
            ? (records[rel] ?? null)
            : null,
        recordsAvailable: records !== null,
        force: true,
      }),
    );
    if (label !== null) {
      drifted.push(rel);
      labels.set(rel, label);
    }
  }

  return {
    drifted: drifted.sort(),
    labels,
    unsafe: unsafe.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0)),
    seen,
  };
}

/**
 * The install manifest (`dest → ABSOLUTE clone source`) as `scanDest`'s
 * `sources` (dest → clone-RELATIVE source); `scanDest` re-contains each value.
 */
export function manifestSources(
  repoDir: string,
  manifest: ReadonlyMap<string, string>,
): Map<string, string> {
  const sources = new Map<string, string>();
  for (const [dest, from] of manifest) {
    sources.set(dest, toPosix(relative(repoDir, from)));
  }
  return sources;
}

/**
 * The skip label a forced write backs up for, or null when it needs none.
 * `backup` decides; any other label reads as `unverifiable`, never "no backup".
 */
function driftLabel(decision: FileDecision): DriftLabel | null {
  if (!decision.backup) return null;
  const { label } = decision;
  return label === 'modified' || label === 'unrecorded'
    ? label
    : 'unverifiable';
}

/**
 * The symlink walk's third outcome for `scanDest`: the walk threw (ENOTDIR — a
 * component below a regular file). Deliberately a skip, not `unsafe`: the
 * install's pre-flight refuses that tree, there is nothing at `rel` to lose, and
 * it keeps a non-directory component out of the `drifted` set `createBackup`
 * consumes unwrapped. Containment was checked before the walk, so this cannot
 * swallow an escape.
 */
const UNREADABLE = Symbol('unreadable');

/** A regular file at `path`; anything else — absent, a directory, an ENOTDIR walk — is not. */
function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path, { throwIfNoEntry: false })?.isFile() === true;
  } catch {
    return false;
  }
}
