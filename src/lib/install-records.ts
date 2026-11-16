import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { writeJsonAtomic } from './atomic-write.js';
import { readJsonBounded } from './bounded-read.js';
import { resolve } from 'node:path';
import { contentHash } from './hash.js';
import { isPlainObject, safeJoin, toPosix } from './validate.js';
import { capabilitySubtree, type LayoutPaths } from './layout.js';
import { CLAUDE_SETTINGS_FILE } from './constants.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// The install record store — `pharn.records.json`, a CLI-owned sidecar next to
// `pharn.config.json` recording contentHash(dest) for every PHARN-owned file an
// install wrote. It is the BASELINE `pharn update` compares against to tell
// "pharn wrote these bytes" from "the user edited this file". A sidecar, not a
// config field, so the hand-edited config stays readable.
//
// TRUST: user-editable, so parsed defensively; any failure degrades to "records
// unavailable", which is FAIL-CLOSED (update skips rather than overwrites), and
// a corrupt store is reported BY NAME. A record KEY never drives a write:
// consumers iterate the install manifest and look keys up here. Only two turn a
// key into a path — orphan detection (read) and `uninstall` (delete, only when
// the bytes still match) — and only for an install-root key (or exactly
// `.claude/settings.json` for uninstall) behind safeJoin + symlink walk +
// regular-file checks.
//
// THE STAMP (`skillsVersion` + `commit`) is diagnostics only and NEVER gates
// the baseline: a path whose hash equals its record holds bytes pharn wrote,
// whatever the stamp. Every consumer still requires hash equality before it
// overwrites or deletes. Stated edge cases: a store from an older CLI that
// rewrote the tree while ignoring it labels upstream bytes `modified` (still
// skipped), and a file the user reverted to bytes such a store recorded is
// upgraded.
//
// One key is not a file: MODELS_RECORD_KEY records the `models` block pharn
// wrote INSIDE pharn.config.json; it is compared, never path-joined.
// ---------------------------------------------------------------------------

export const RECORDS_FILE = 'pharn.records.json';

/**
 * The record key for the `models` block pharn wrote into pharn.config.json.
 * `add`/`remove` carry it untouched; `init`/`update` write it with the block.
 */
export const MODELS_RECORD_KEY = 'pharn.config.json#/models';

/**
 * The recorded hash of a `models` block: sha256 of `JSON.stringify(block)`, so
 * re-indenting the file is not an edit and reordering keys is.
 */
export function modelsRecordHash(block: unknown): string {
  return createHash('sha256').update(JSON.stringify(block)).digest('hex');
}

// Exact-match schema discriminator: a store from a future CLI reads as
// unavailable, never guessed at.
export const RECORDS_SCHEMA_VERSION = 1;

// A recorded content hash: lowercase sha256 hex.
export const SHA256_RE = /^[0-9a-f]{64}$/;

// A record key is a root-relative posix path, rejected only when it normalizes
// to nothing, is absolute, or has a segment exactly `..` or `.`. Deliberately
// no looser-than-the-writer substring ban: the writer records whatever names
// the untrusted clone ships (`migration..v2.md` is legal), and a stricter reader
// would declare pharn's own store corrupt. Defense in depth, not containment —
// keys are compared, and path-joined only behind safeJoin.
function isInvalidRecordKey(key: string): boolean {
  // Normalize a COPY to split it; the key is stored verbatim. toPosix converts
  // the PLATFORM separator only, so a posix backslash stays one segment.
  const normalized = toPosix(key);
  if (normalized === '' || normalized.startsWith('/')) return true;
  // A win32 `C:\x` normalizes to `C:/x`. The separator is required, so
  // `C:notes.md` stays an ordinary filename.
  if (DRIVE_ABSOLUTE_RE.test(normalized)) return true;
  return normalized
    .split('/')
    .some((segment) => segment === '..' || segment === '.');
}

// A drive letter followed by a separator.
const DRIVE_ABSOLUTE_RE = /^[A-Za-z]:\//;

/** rel path (posix) → contentHash (lib/hash.ts) of the bytes pharn wrote there. */
export type FileRecords = Record<string, string>;

export interface RecordStore {
  schemaVersion: number;
  // THE STAMP — diagnostics only, never a gate.
  skillsVersion: string;
  commit: string | null;
  files: FileRecords;
}

/**
 * The outcome of reading the store. `absent` and `invalid` have the same
 * fail-closed consequence but are kept apart so the report can name a fixable
 * error.
 */
export type ReadRecordsResult =
  | { kind: 'ok'; store: RecordStore }
  | { kind: 'absent' }
  | { kind: 'invalid'; message: string };

export function recordsPath(cwd: string): string {
  return resolve(cwd, RECORDS_FILE);
}

/**
 * Read + validate `pharn.records.json`. Every failure mode is named, and none
 * throws.
 */
export function readRecords(cwd: string): ReadRecordsResult {
  // Bounded and non-blocking: a FIFO, device or directory is `invalid`, never a hang.
  const read = readJsonBounded(recordsPath(cwd));
  if (read.kind === 'absent') return { kind: 'absent' };
  if (read.kind === 'unusable') {
    return { kind: 'invalid', message: `${RECORDS_FILE} ${read.reason}` };
  }
  if (read.kind === 'invalid-json') {
    return { kind: 'invalid', message: `${RECORDS_FILE} is not valid JSON` };
  }
  const raw = read.value;
  if (!isPlainObject(raw)) {
    return { kind: 'invalid', message: `${RECORDS_FILE} is not a JSON object` };
  }
  if (raw.schemaVersion !== RECORDS_SCHEMA_VERSION) {
    return {
      kind: 'invalid',
      message: `${RECORDS_FILE} has unknown schemaVersion ${JSON.stringify(raw.schemaVersion)} (expected ${RECORDS_SCHEMA_VERSION})`,
    };
  }
  // The stamp never becomes a path, ref or fetch, so it is TYPE-checked only: a
  // format check would make a store pharn wrote read as corrupt for no gain.
  if (typeof raw.skillsVersion !== 'string') {
    return {
      kind: 'invalid',
      message: `${RECORDS_FILE} has an invalid skillsVersion stamp`,
    };
  }
  // An ABSENT commit reads as `null`: a store stamped from a config with no
  // `commit` has no key (JSON.stringify drops `undefined`).
  const commit = raw.commit === undefined ? null : raw.commit;
  if (commit !== null && typeof commit !== 'string') {
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
      commit,
      files,
    },
  };
}

/**
 * Are these records usable as an update baseline? Whenever the store PARSED,
 * whatever its stamp. An `invalid` store carries its named reason as `note`.
 */
export function recordsBaseline(read: ReadRecordsResult): {
  records: FileRecords | null;
  note: string | null;
} {
  if (read.kind === 'absent') return { records: null, note: null };
  if (read.kind === 'invalid') return { records: null, note: read.message };
  return { records: read.store.files, note: null };
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
    // Sorted so the committed file has a stable, reviewable diff.
    files: sortRecords(params.files),
  };
  // ATOMIC: a torn write would leave an `invalid` store.
  await writeJsonAtomic(recordsPath(cwd), store);
}

function sortRecords(files: FileRecords): FileRecords {
  const out: FileRecords = {};
  for (const key of Object.keys(files).sort()) out[key] = files[key]!;
  return out;
}

/**
 * The record of the `.claude/settings.json` a fresh `init` wrote, carried
 * forward by `update` and a re-run `init` — or nothing. No manifest holds that
 * file, so without this the record would be dropped. Carried only while
 * something is at the path (a deleted file is never restored). The hash is not
 * re-checked: an edited file keeps pharn's record, which tells `uninstall` to
 * keep it. Never throws.
 */
export function carriedSettingsRecord(
  projectRoot: string,
  records: FileRecords | null,
): FileRecords {
  const recorded = records?.[CLAUDE_SETTINGS_FILE];
  if (recorded === undefined) return {};
  try {
    const stat = lstatSync(safeJoin(projectRoot, CLAUDE_SETTINGS_FILE), {
      throwIfNoEntry: false,
    });
    return stat === undefined ? {} : { [CLAUDE_SETTINGS_FILE]: recorded };
  } catch {
    return {};
  }
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
    // An UNSTATABLE dest (ENOTDIR under a regular file) is treated as absent:
    // a record describes bytes that are actually there, and crashing after
    // the copy would be worse.
    let stat;
    try {
      stat = lstatSync(dest, { throwIfNoEntry: false });
    } catch {
      continue;
    }
    if (!stat?.isFile()) continue;
    files[rel] = contentHash(dest);
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
 * KEY-PREFIX filter over the store, never a filesystem walk. `update` carries
 * FROZEN capabilities' records this way: their bytes are untouched, so the
 * records stay true, and dropping them would make every file `unrecorded` once
 * upstream parses again. The trailing slash keeps `a11y` from matching
 * `a11y-extended`.
 */
export function recordsUnderCapabilities(
  records: FileRecords,
  paths: LayoutPaths,
  capabilities: readonly InstalledCapability[],
): FileRecords {
  const prefixes = capabilities.map((cap) => {
    const subtree = capabilitySubtree(paths, cap.role);
    return `${subtree}/${cap.name}/`;
  });
  if (prefixes.length === 0) return {};
  const out: FileRecords = {};
  for (const [rel, hash] of Object.entries(records)) {
    if (prefixes.some((prefix) => rel.startsWith(prefix))) out[rel] = hash;
  }
  return out;
}
