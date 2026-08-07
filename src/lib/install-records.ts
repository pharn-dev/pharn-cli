import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256File } from './hash.js';
import { isPlainObject, safeJoin } from './validate.js';
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

// A record key is a project-root-relative posix path. Validated for shape even
// though it is never path-joined (defense in depth, P2).
const RECORD_KEY_RE = /^[^/\\][^\\]*$/;

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
    if (!RECORD_KEY_RE.test(key) || key.includes('..')) {
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
  if (
    store.skillsVersion !== config.skillsVersion ||
    store.commit !== config.commit
  ) {
    return {
      records: null,
      note: `${RECORDS_FILE} was written for a different install state (skills v${store.skillsVersion}) than pharn.config.json (skills v${config.skillsVersion}); ignoring it`,
    };
  }
  return { records: store.files, note: null };
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
  await writeFile(
    recordsPath(cwd),
    `${JSON.stringify(store, null, 2)}\n`,
    'utf8',
  );
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
    const stat = lstatSync(dest, { throwIfNoEntry: false });
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
 * The project-relative paths of one INSTALLED capability's files, read from the
 * project (not the clone) — what `pharn add` just wrote, so it can record
 * exactly those and never a path it did not touch. Symlinks are skipped (the
 * installer never materializes one), and every read is safeJoin-contained.
 */
export function capabilityRecordPaths(
  projectRoot: string,
  paths: LayoutPaths,
  capability: InstalledCapability,
): string[] {
  const subtree = capability.role === 'griller' ? paths.grillers : paths.lenses;
  const relDir = `${subtree}/${capability.name}`;
  const root = safeJoin(projectRoot, relDir);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const rel = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(resolve(dir, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(root, relDir);
  return out.sort();
}
