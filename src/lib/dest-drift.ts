import { lstatSync } from 'node:fs';
import { sha256File } from './hash.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// The destination scan — what a capability copy is about to destroy. It answers
// two questions in ONE walk, because they are two readings of the same fact:
//
//   drifted[] — the dest exists as a regular file whose bytes DIFFER from the
//               clone's. `pharn add` backs exactly these up (lib/backup.ts)
//               before its first write, so an overwrite stops being final.
//   unsafe[]  — the dest path crosses a SYMLINKED component. These must not be
//               copied at all: see below. `add` refuses the whole install.
//
// Why `add` needs this and `init`/`update` do not: `init` asks first
// (steps/overwrite-check.ts) and `update` decides per file against
// pharn.records.json (lib/update-decision.ts). `add` did neither — and `update`
// itself manufactures the sequence that makes that reachable: a dropped
// capability's files are LEFT on disk (update never deletes), the user edits
// them, and a later `add` of that capability is not a config no-op.
//
// WHY `unsafe` IS A REFUSAL AND NOT A SKIP — measured, not assumed. Node's
// `cpSync(from, to, { recursive: true, force: true, filter: noSymlinks })` guards
// only the SOURCE; the destination side behaves three different ways, and one of
// them destroys data (measured on node v24.13.1):
//
//   * dest LEAF is a symlink        → the link is REPLACED by a regular file; the
//                                     target keeps its bytes. The user's link is
//                                     still lost, silently and unrecoverably.
//   * the capability ROOT is a link → cpSync throws ERR_FS_CP_DIR_TO_NON_DIR
//                                     having written nothing. Loud; safe.
//   * an INTERMEDIATE dir is a link → cpSync WRITES THROUGH IT. Bytes anywhere
//                                     the link points — including outside the
//                                     project entirely — are replaced.
//
// That last row is the one that matters, and a skip makes it WORSE than doing
// nothing: excluding the path from `drifted` means the copy still writes through
// the link while the backup that was supposed to protect it silently omits it.
// Backing it up instead is not available either — `createBackup` refuses a
// symlinked component by design, and `copyFileSync` would save the TARGET's bytes
// rather than the link.
//
// So the terminal is REFUSE: `add` writes nothing and names the offending
// component. That is the same answer `update` reaches by a different route — #131
// classifies such a path `unreadable` and skips the write — and the same shape as
// `add`'s existing version and layout gates: refuse, name the fix, change nothing.
//
// Byte-identical is NOT drift — the reading update's table gives row
// `identical → no-op`. A drop-then-re-add of unedited files must stay silent, or
// every such add would litter `.pharn-backup/` with copies of bytes nobody lost.
//
// Determinism (P5): every branch is a type check or a byte comparison — a
// symlink test, `isFile()`, `sha256 !==`. No judgment, no third outcome.
//
// Trust (P2): `repoDir` is an untrusted tree — a codeload tarball fetched and
// extracted into a temp dir (lib/repo.ts, lib/tar-extract.ts) — and `rels` are
// names read from it. Both `safeJoin`s run BEFORE either walk, so a rel that
// escapes either base is refused LOUDLY and no catch below can bury it. File
// contents are hashed, never parsed or executed.
//
// NAMED RESIDUAL — this scan is a CHECK, not a LOCK (P0/P7, and stated rather
// than implied). It reads the destination at time T; `installCapabilityDirs`
// copies at T+1. A component that becomes a symlink in between is not seen by
// either, because `cpSync`'s `filter` guards only the SOURCE — so the pre-existing
// hazard is refused while the racing one is not. What this closes is the case
// that actually occurs (a symlink the user already had); what it does NOT close is
// a concurrent local attacker, which is a threat THREAT-MODEL.md does not model
// (its Surface B is hostile REMOTE content). Closing it needs a destination-side
// guard inside the copy itself — `cpSync`'s filter receives `(src, dest)` and
// refusing a symlinked dest there would stop the descent at copy time — but that
// filter is `installCapabilityDirs`', shared with `init`, so it is a separate
// increment with its own plan rather than a widening of this one.
//
// One axis (P3): what an install is about to destroy at the destination.
// ---------------------------------------------------------------------------

/** A destination path the copy would reach THROUGH a symlink. */
export interface UnsafeDest {
  /** The project-relative path the copy would have written. */
  rel: string;
  /** The first symlinked component of it, below the project root. */
  link: string;
}

export interface DestScan {
  /** Existing dest files whose bytes differ from the clone's — back these up. */
  drifted: string[];
  /** Paths the copy would write through a symlink — refuse the install. */
  unsafe: UnsafeDest[];
}

/**
 * Scan the destination for `rels` (project-root-relative posix paths, which are
 * also their paths inside the mirrored clone). Both lists are sorted; nothing is
 * written.
 */
export function scanDest(params: {
  repoDir: string;
  projectRoot: string;
  rels: readonly string[];
}): DestScan {
  const { repoDir, projectRoot, rels } = params;
  const drifted: string[] = [];
  const unsafe: UnsafeDest[] = [];

  for (const rel of rels) {
    // Containment first, on BOTH sides: an escaping rel throws here rather than
    // being swallowed by the unreadable-catch below (P2 is never a silent skip).
    const dest = safeJoin(projectRoot, rel);
    const src = safeJoin(repoDir, rel);

    const destLink = symlinkComponent(projectRoot, rel);
    if (destLink === UNREADABLE) continue; // ENOTDIR — see symlinkComponent
    if (destLink !== null) {
      unsafe.push({ rel, link: destLink });
      continue;
    }
    if (!lstatSync(dest, { throwIfNoEntry: false })?.isFile()) continue;

    // The clone side is walked the same way, but a hit here is a SKIP, not a
    // refusal: the copy's own `noSymlinks` filter never copies such an entry, so
    // there is no destination hazard to refuse over. No rel capabilityCloneFiles
    // produces can even carry one (walkFiles recurses only into real dirs) — this
    // is defense in depth for a function that is exported and takes a plain
    // string[], the same reasoning install-records.ts records for shape-checking
    // a key it never path-joins.
    if (symlinkComponent(repoDir, rel) !== null) continue;
    if (!lstatSync(src, { throwIfNoEntry: false })?.isFile()) continue;

    // sha256File's failure on a path that IS a regular file (EACCES) deliberately
    // PROPAGATES: it aborts `add` before any write, with the clone cleaned up.
    // Treating an unreadable file as "no drift" would clobber it.
    if (sha256File(dest) !== sha256File(src)) drifted.push(rel);
  }

  return {
    drifted: drifted.sort(),
    unsafe: unsafe.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0)),
  };
}

/** `symlinkComponent`'s third outcome: the walk could not be completed. */
const UNREADABLE = Symbol('unreadable');

/**
 * The first symlinked component of `rel` under `base`, `null` when there is
 * none, or `UNREADABLE` when the walk cannot answer.
 *
 * `findSymlinkComponent` is NOT total: `throwIfNoEntry: false` suppresses ENOENT
 * only, so a component below a REGULAR FILE raises ENOTDIR out of the walk
 * (lib/symlink-guard.ts states where each of its callers stands). That case is
 * deliberately NOT `unsafe`: `cpSync` throws ERR_FS_CP_DIR_TO_NON_DIR on such a
 * tree having written nothing, so it fails loudly on its own and its message is
 * the useful one. There is also nothing at `rel` to lose.
 *
 * Keeping it out of the caller's set is what keeps `createBackup` safe, too: it
 * does NOT wrap its own `findSymlinkComponent` call, and it consumes exactly the
 * `drifted` list — so a non-directory component must never reach it. That is the
 * shape `readDiskState` gives `update`: classify on the read side, so the backup
 * set only ever holds paths already proven regular files.
 *
 * The escape refusal cannot arrive here — `scanDest` `safeJoin`s both sides
 * before calling — so this catch cannot swallow a containment violation.
 */
function symlinkComponent(
  base: string,
  rel: string,
): string | null | typeof UNREADABLE {
  try {
    return findSymlinkComponent(base, rel);
  } catch {
    return UNREADABLE;
  }
}
