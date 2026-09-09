import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { writeJsonAtomic } from './atomic-write.js';
import { resolve } from 'node:path';
import { sha256File } from './hash.js';
import { isPlainObject, safeJoin, toPosix } from './validate.js';
import type { LayoutPaths } from './layout.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// The install record store — `pharn.records.json`, a CLI-owned sidecar next to
// `pharn.config.json` recording sha256(dest bytes) for every PHARN-owned file an
// install wrote. It is the BASELINE `pharn update` compares against so it can
// tell "pharn wrote these bytes" from "the user edited this file" and refuse to
// destroy the latter (lib/update-decision.ts).
//
// Why a sidecar and not a `pharn.config.json` field: a full install is hundreds
// of files, and the config is hand-edited (`models` / `seam`). Keeping the hash
// map out of it keeps the config readable and its diffs meaningful.
//
// TRUST (P2): this file is LOCAL but user-editable — untrusted input. It is
// parsed defensively and any failure degrades to "records unavailable", which is
// FAIL-CLOSED (update then SKIPS rather than overwrites). Critically, a record
// KEY is never path-joined: consumers iterate the install manifest and look each
// manifest-derived key up here, so a hostile key can never drive a filesystem
// access. A corrupt store is reported BY NAME, never silently collapsed into
// "absent" (the same lesson lib/pharn-config.ts encodes for `models`/`seam`).
//
// THE STAMP: the store carries the `skillsVersion` + `commit` that
// `pharn.config.json` holds after the operation that wrote it. Every pharn
// operation writes both files, so a stamp that DISAGREES with the config means
// something changed one without the other — an older CLI that rewrote the tree
// while ignoring this file, or a hand edit. That is treated as records-
// unavailable (fail closed) rather than trusting hashes that may describe bytes
// nobody wrote (P5/P7).
//
// One axis (P3): the install record store.
// ---------------------------------------------------------------------------

export const RECORDS_FILE = 'pharn.records.json';

// Exact-match schema discriminator (P5). A store written by a future CLI with a
// different version is NOT guessed at — it reads as unavailable, and update
// skips. Bumping this is the additive escape hatch P7 requires; the per-value
// hash sweep ranges over `files` only, so a future sibling key cannot read as
// corrupt.
export const RECORDS_SCHEMA_VERSION = 1;

// A recorded content hash: lowercase sha256 hex. Enum/regex floor (P0).
export const SHA256_RE = /^[0-9a-f]{64}$/;

// A record key is a project-root-relative posix path, and the reader accepts it
// on a SEGMENT rule: a key is rejected when it normalizes to nothing, when it is
// absolute, or when any of its path segments is exactly `..` or `.`.
//
// That is deliberately looser than banning `..` as a SUBSTRING. `migration..v2.md`
// is an ordinary filename, and so is one carrying a backslash on posix — and the
// writer records whatever the install manifest enumerated out of the untrusted
// clone, whose capability contents, contracts and floor files are copied verbatim
// with their basenames never name-validated. A reader stricter than its own
// writer declares pharn's OWN store corrupt for such a name and degrades the
// whole update to `unverifiable`: fail-closed, but for nothing. Writer and reader
// now agree BY CONSTRUCTION, since every key originates from
// collectExpectedInstallPaths (toPosix-normalized, root-relative).
//
// The rule remains defense in depth (P2), never containment: a key is COMPARED,
// never path-joined (see the header), so containment is safeJoin's job and
// accepting an odd-but-inert name gives up nothing. The corollary is that what it
// rejects is narrow ON PURPOSE — a posix key holding `..\..\etc\passwd` as one
// opaque segment reads as an ordinary name here, and is inert for the same reason
// every other key is.
function isInvalidRecordKey(key: string): boolean {
  // Normalize a COPY to split it; the key itself is stored verbatim, because the
  // manifest supplies the lookups and they are literal string comparisons.
  // toPosix converts the PLATFORM separator (lib/validate.ts), so a win32-written
  // `a\b\c` splits into components while a posix key with a literal backslash
  // stays one opaque segment — the same reading findSymlinkComponent relies on.
  const normalized = toPosix(key);
  if (normalized === '' || normalized.startsWith('/')) return true;
  // "Absolute" has a second spelling. A win32 `C:\x` normalizes to `C:/x`, which
  // no leading-`/` test catches — so without this the reader would accept a key
  // the docs call invalid. The separator after the colon is required, and that is
  // the whole point: `C:notes.md` is an ordinary posix filename, and rejecting it
  // would recreate the over-rejection this rule exists to remove.
  if (DRIVE_ABSOLUTE_RE.test(normalized)) return true;
  return normalized
    .split('/')
    .some((segment) => segment === '..' || segment === '.');
}

// A drive letter followed by a separator — `C:/x`, and a win32 `C:\x` once
// toPosix has run. Enum/regex floor (P0), matching SHA256_RE's style.
const DRIVE_ABSOLUTE_RE = /^[A-Za-z]:\//;

/** rel path (posix) → sha256 of the bytes pharn wrote there. */
export type FileRecords = Record<string, string>;

export interface RecordStore {
  schemaVersion: number;
  // The config values this store is stamped against (see THE STAMP above).
  skillsVersion: string;
  commit: string | null;
  files: FileRecords;
}

/**
 * The outcome of reading the store. `absent` (never installed with records) and
 * `invalid` (present but unreadable/malformed/unknown-version) are DIFFERENT
 * facts with the same fail-closed consequence — they are kept apart so the
 * report can name a fixable JSON error instead of blaming a legacy install.
 */
export type ReadRecordsResult =
  | { kind: 'ok'; store: RecordStore }
  | { kind: 'absent' }
  | { kind: 'invalid'; message: string };

export function recordsPath(cwd: string): string {
  return resolve(cwd, RECORDS_FILE);
}

/**
 * Read + validate `pharn.records.json`. Every failure mode is named, and none of
 * them throws: the caller degrades to records-unavailable (SKIP), which is the
 * safe terminal (P5).
 */
export function readRecords(cwd: string): ReadRecordsResult {
  const path = recordsPath(cwd);
  if (!existsSync(path)) return { kind: 'absent' };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { kind: 'invalid', message: `${RECORDS_FILE} is not valid JSON` };
  }
  if (!isPlainObject(raw)) {
    return { kind: 'invalid', message: `${RECORDS_FILE} is not a JSON object` };
  }
  if (raw.schemaVersion !== RECORDS_SCHEMA_VERSION) {
    return {
      kind: 'invalid',
      message: `${RECORDS_FILE} has unknown schemaVersion ${JSON.stringify(raw.schemaVersion)} (expected ${RECORDS_SCHEMA_VERSION})`,
    };
  }
  // The stamp fields are only ever COMPARED to pharn.config.json's — they never
  // become a path, a ref, or a fetch. So they are TYPE-checked, not format-
  // checked: applying VERSION_RE/COMMIT_RE here would make a store pharn itself
  // wrote read as corrupt whenever a config carries an older-shaped value, which
  // would degrade the whole install to `unverifiable` for no security gain. The
  // formats are enforced where the values ENTER (readSkillsVersion, fetchRepo).
  if (typeof raw.skillsVersion !== 'string') {
    return {
      kind: 'invalid',
      message: `${RECORDS_FILE} has an invalid skillsVersion stamp`,
    };
  }
  if (raw.commit !== null && typeof raw.commit !== 'string') {
    return {
      kind: 'invalid',
      message: `${RECORDS_FILE} has an invalid commit stamp`,
    };
  }
  if (!isPlainObject(raw.files)) {
    return {
      kind: 'invalid',
      message: `${RECORDS_FILE} has no \`files\` object`,
    };
  }

  const files: FileRecords = {};
  for (const [key, value] of Object.entries(raw.files)) {
    if (isInvalidRecordKey(key)) {
      return {
        kind: 'invalid',
        message: `${RECORDS_FILE} has an invalid file path key ${JSON.stringify(key)}`,
      };
    }
    if (typeof value !== 'string' || !SHA256_RE.test(value)) {
      return {
        kind: 'invalid',
        message: `${RECORDS_FILE} has an invalid hash for ${JSON.stringify(key)}`,
      };
    }
    files[key] = value;
  }

  return {
    kind: 'ok',
    store: {
      schemaVersion: RECORDS_SCHEMA_VERSION,
      skillsVersion: raw.skillsVersion,
      commit: raw.commit,
      files,
    },
  };
}

/**
 * Are these records usable as an update baseline? Only when the store parsed AND
 * its stamp matches the config it sits beside — see THE STAMP. Anything else is
 * records-unavailable, with a named reason for the report.
 */
export function recordsBaseline(
  read: ReadRecordsResult,
  config: { skillsVersion: string; commit: string | null },
): { records: FileRecords | null; note: string | null } {
  if (read.kind === 'absent') return { records: null, note: null };
  if (read.kind === 'invalid') return { records: null, note: read.message };
  const { store } = read;
  // The REJECTION is derived from the same list the MESSAGE is rendered from, so
  // the two cannot drift: a stamp field added to `stampMismatches` starts being
  // both compared and named in one edit, and an empty list is by construction the
  // "the stamp agrees" path rather than a note with empty parentheses.
  const mismatches = stampMismatches(store, config);
  if (mismatches.length > 0) {
    const side = (pick: (m: StampMismatch) => string): string =>
      mismatches.map((m) => `${m.field} ${pick(m)}`).join(', ');
    return {
      records: null,
      note: `${RECORDS_FILE} was written for a different install state (${side((m) => m.store)}) than pharn.config.json (${side((m) => m.config)}); ignoring it, so every file that differs from upstream is \`unverifiable\` instead of a clean upgrade`,
    };
  }
  return { records: store.files, note: null };
}

interface StampMismatch {
  field: 'skillsVersion' | 'commit';
  // Both sides pre-rendered, so the two halves of the note cannot list different
  // fields — they are two projections of ONE list.
  store: string;
  config: string;
}

/**
 * The stamp fields that DISAGREE, in a fixed source order (P5 — never map
 * iteration order, so the note is byte-stable for a given pair).
 *
 * Only the differing fields, because this note's whole job is to say what is
 * wrong: it used to interpolate `skillsVersion` on both sides while the check
 * fired on EITHER field, so a commit-only mismatch — a torn `add`/`update` that
 * wrote the store but not the config, a hand edit, an older CLI — told the user
 * that "skills v3.0.1" differed from "skills v3.0.1", and dropped the records for
 * a reason that reads as a contradiction.
 *
 * Values go through JSON.stringify like this file's other untrusted-value
 * messages: both stamp fields are deliberately TYPE-checked, not format-checked
 * (see the reader above), so either side may hold an empty string or control
 * characters from a hand edit — quoting makes `""` visible instead of blank and
 * escapes the rest, and it renders a null commit as `null` (the legal
 * floated-branch case) rather than as nothing.
 *
 * The commit is printed in FULL. It is not COMMIT_RE-checked here, so no prefix
 * length is guaranteed to identify it — and two distinct SHAs sharing a short
 * prefix would render as an identical pair, recreating the exact defect this
 * function stopped emitting.
 */
function stampMismatches(
  store: { skillsVersion: string; commit: string | null },
  config: { skillsVersion: string; commit: string | null },
): StampMismatch[] {
  const out: StampMismatch[] = [];
  if (store.skillsVersion !== config.skillsVersion) {
    out.push({
      field: 'skillsVersion',
      store: JSON.stringify(store.skillsVersion),
      config: JSON.stringify(config.skillsVersion),
    });
  }
  if (store.commit !== config.commit) {
    out.push({
      field: 'commit',
      store: JSON.stringify(store.commit),
      config: JSON.stringify(config.commit),
    });
  }
  return out;
}

/** Serialize the store. Stamped with the config values written alongside it. */
export async function writeRecords(
  cwd: string,
  params: {
    skillsVersion: string;
    commit: string | null;
    files: FileRecords;
  },
): Promise<void> {
  const store: RecordStore = {
    schemaVersion: RECORDS_SCHEMA_VERSION,
    skillsVersion: params.skillsVersion,
    commit: params.commit,
    // Sorted so the committed file has a stable, reviewable diff (P5).
    files: sortRecords(params.files),
  };
  // ATOMIC (lib/atomic-write.ts): a torn write would leave truncated JSON, which
  // the reader names `invalid` — fail-closed, but it degrades every update
  // decision to `unverifiable` and silently stops `add`/`remove` maintaining the
  // store. Bytes are unchanged.
  await writeJsonAtomic(recordsPath(cwd), store);
}

function sortRecords(files: FileRecords): FileRecords {
  const out: FileRecords = {};
  for (const key of Object.keys(files).sort()) out[key] = files[key]!;
  return out;
}

/**
 * Hash the DEST bytes of each project-relative path — never the source — so a
 * record can never disagree with what actually landed on disk. A path that is
 * absent or is not a regular file contributes no record (it is not something we
 * can claim to have written).
 */
export function buildRecords(
  projectRoot: string,
  rels: Iterable<string>,
): FileRecords {
  const files: FileRecords = {};
  for (const rel of rels) {
    const dest = safeJoin(projectRoot, rel);
    // An UNSTATABLE dest is treated exactly like an absent one. `throwIfNoEntry`
    // suppresses ENOENT only, so a rel whose parent is a REGULAR FILE raises
    // ENOTDIR here — and the caller feeds this the SOURCE-derived install
    // manifest, which cannot know the copy skipped that path for the same
    // reason. Recording what did not land is impossible; crashing the install
    // after every file is already written is worse. Skipping keeps this
    // function's one invariant intact: a record describes bytes that are
    // actually there.
    let stat;
    try {
      stat = lstatSync(dest, { throwIfNoEntry: false });
    } catch {
      continue;
    }
    if (!stat?.isFile()) continue;
    files[rel] = sha256File(dest);
  }
  return files;
}

/** `next` wins per key; untouched `prev` entries survive. */
export function mergeRecords(
  prev: FileRecords,
  next: FileRecords,
): FileRecords {
  return { ...prev, ...next };
}

/**
 * The subset of a record store that belongs to the given capabilities — a pure
 * KEY-PREFIX filter over the store, never a filesystem walk.
 *
 * `pharn update` needs this for FROZEN capabilities: their files are excluded
 * from the install manifest (nothing unparseable may be written), and
 * `planUpdate` keys `nextRecords` by that manifest, so their entries would be
 * pruned as "no longer installed". But their BYTES on disk are untouched, so the
 * recorded hashes are still TRUE — and dropping them would make the next run,
 * once upstream parses again, classify every one of those files `unrecorded` and
 * skip it, turning a transient upstream break into a `--force`.
 *
 * The trailing slash is load-bearing, exactly as in `pruneCapabilityRecords`:
 * `pharn-review/a11y` must not match `pharn-review/a11y-extended`.
 */
export function recordsUnderCapabilities(
  records: FileRecords,
  paths: LayoutPaths,
  capabilities: readonly InstalledCapability[],
): FileRecords {
  const prefixes = capabilities.map((cap) => {
    const subtree = cap.role === 'griller' ? paths.grillers : paths.lenses;
    return `${subtree}/${cap.name}/`;
  });
  if (prefixes.length === 0) return {};
  const out: FileRecords = {};
  for (const [rel, hash] of Object.entries(records)) {
    if (prefixes.some((prefix) => rel.startsWith(prefix))) out[rel] = hash;
  }
  return out;
}
