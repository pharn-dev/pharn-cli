import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { noteArchiveRefusal } from './archive-refusal.js';
import {
  CLAUDE_SETTINGS_FILE,
  MIN_CLI_FILE,
  REPO,
  REPO_BRANCH,
  SKILLS_VERSION_FILE,
} from './constants.js';
import { onFatalSignal } from './fatal-signal.js';
import { fetchCapped } from './fetch-capped.js';
import type { CappedResponse, FetchCappedError } from './fetch-capped.js';
import { MAX_SHA_BYTES } from './release.js';
import type { InstallSource } from './release.js';
import { readSkillsVersion } from './skills-version.js';
import { extractTarGz } from './tar-extract.js';
import {
  MANIFEST_FILE,
  readUpstreamManifest,
  verifyUpstreamManifest,
} from './upstream-manifest.js';
import type { UpstreamManifest } from './upstream-manifest.js';
import {
  assertSafeString,
  COMMIT_RE,
  ManifestValidationError,
} from './validate.js';

const API = 'https://api.github.com';
const CODELOAD = 'https://codeload.github.com';
const FETCH_TIMEOUT_MS = 8000;
// The clone timeout has to cover a ~2.5 MB streamed body, not just the response
// headers, so it is deliberately not the 8 s the two metadata fetches use.
const CLONE_TIMEOUT_MS = 60_000;
// The compressed cap is counted as bytes stream (codeload sends no
// content-length). The extractor streams the decompressed tar, so the repo's
// own size bounds nothing: headers walked and decompressed bytes walked bound a
// compression bomb's work (both far above pharn-oss v7.25.5's 4,939 entries and
// 43 MB), and the written-byte cap bounds what reaches disk.
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_HEADERS = 200_000;
const MAX_SCANNED_BYTES = 1024 * 1024 * 1024;
const MAX_WRITTEN_BYTES = 128 * 1024 * 1024;
const LIMITS = {
  maxHeaders: MAX_HEADERS,
  maxScannedBytes: MAX_SCANNED_BYTES,
  maxWrittenBytes: MAX_WRITTEN_BYTES,
};

/**
 * The tree files the CLI reads itself, written whether or not the manifest
 * lists them: the manifest, `SKILLS_VERSION` (the release check, the manifest's
 * `skillsVersion` check), the optional `MIN_CLI` handshake, and
 * `.claude/settings.json` (hook-wiring reads it even when it is not listed).
 * Nothing else unlisted is ever written.
 */
export const CLONE_READ_FILES: readonly string[] = [
  MANIFEST_FILE,
  SKILLS_VERSION_FILE,
  MIN_CLI_FILE,
  CLAUDE_SETTINGS_FILE,
];

// ---------------------------------------------------------------------------
// Temp-clone lifecycle backstop — a net under each caller's `finally`, never a
// replacement. Two exits never reach a `finally`: `process.exit()` (clack exits
// 0 on a Ctrl-C keypress while a spinner holds stdin raw — exactly the clone
// window) and a fatal signal (lib/fatal-signal.ts). Registered dirs are removed
// synchronously, because an `exit` listener may not await.
// ---------------------------------------------------------------------------

/** Clone dirs this process currently owns. Empty once every caller has disposed. */
const liveClones = new Set<string>();
let handlersInstalled = false;

/** A handler must never throw — a failure here would replace the real exit reason. */
function rmQuiet(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

function installCleanupHandlers(): void {
  // Once-only: a listener per fetchRepo call would trip
  // MaxListenersExceededWarning.
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on('exit', () => {
    for (const dir of liveClones) rmQuiet(dir);
  });

  // fatal-signal.ts re-raises afterwards, so the exit status stays truthful.
  onFatalSignal(() => {
    for (const dir of liveClones) rmQuiet(dir);
    liveClones.clear();
  });
}

export interface FetchedRepo {
  // THE CLONE INVARIANT: the tree holds only regular files and directories,
  // created by this process in a private `mkdtemp` dir, and only the files the
  // manifest lists plus CLONE_READ_FILES (tar-extract.ts selects, then admits a
  // regular file only; this module is the only producer, enforced by the
  // clone-producer rule in eslint.config.mjs). Clone-side readers skip
  // symlink/FIFO checks but keep type checks. Every DESTINATION guard is
  // separate and stays.
  dir: string;
  // The commit recorded as `commit`: the COMMIT_RE-validated SHA the tarball
  // was fetched at, or `null` when it could not be resolved and the fetch
  // floated REPO_BRANCH (LIMITS.md §3b). The same value is the URL segment, so
  // the record cannot lie.
  sha: string | null;
  // What was fetched: a verified release (SKILLS_VERSION checked against its
  // tag) or the tip of `main`.
  source: InstallSource;
  cleanup: () => void;
}

/**
 * Download pharn-oss into a fresh temp directory, PINNED to one resolved commit
 * SHA — the same value is the codeload URL segment and the recorded `commit`,
 * so provenance matches the bytes. The caller records `sha`, then calls
 * cleanup().
 *
 * `source` (lib/release.ts) is REQUIRED, so a forgotten argument cannot mean
 * "the unverified tip". A release is downloaded at its tag's commit and refused
 * unless its SKILLS_VERSION equals the tag; it never floats. Only `main`
 * resolves the tip here, floating `refs/heads/<REPO_BRANCH>` when that fails
 * (`sha` null). Provenance is by-SHA, NOT cryptographic (LIMITS.md §1b).
 *
 * Network floor: `redirect: 'error'`, deadlines and body caps; path floor:
 * lib/tar-extract.ts, through extractPharnArchive. No `git` binary, no tarball
 * cache.
 */
export async function fetchRepo(source: InstallSource): Promise<FetchedRepo> {
  const sha = source.kind === 'release' ? source.sha : await fetchCommitSha();
  try {
    return await fetchAt(source, sha);
  } catch (err) {
    // Re-thrown unchanged; a refused archive is noted with the ref, so the
    // command can say which archive and what to try (lib/archive-refusal.ts).
    noteArchiveRefusal(err, source, sha);
    throw err;
  }
}

// The download + extract half, at a resolved (or, for `main` only, null) SHA.
async function fetchAt(
  source: InstallSource,
  rawSha: string | null,
): Promise<FetchedRepo> {
  // The network-derived sha must be a full 40-hex SHA before it becomes a URL
  // segment or a recorded `commit` — one boundary guard for every sink.
  const sha =
    rawSha === null ? null : assertSafeString(rawSha, 'commit SHA', COMMIT_RE);
  // Pin to the resolved SHA; else float the branch (LIMITS.md §3b).
  const ref = sha ?? `refs/heads/${REPO_BRANCH}`;
  installCleanupHandlers();
  const dir = mkdtempSync(join(tmpdir(), 'pharn-'));
  liveClones.add(dir);
  try {
    const archive = await downloadArchive(ref);
    await extractPharnArchive(archive, dir, (tree) => {
      // A release's tree must BE the version its tag names, or `update`'s
      // version compare would lie. Refused inside this try, so the tree is
      // removed.
      if (source.kind !== 'release') return;
      const found = readSkillsVersion(tree);
      if (found !== source.version) {
        throw new ManifestValidationError(
          `Release ${source.tag} (${source.sha}) ships ${SKILLS_VERSION_FILE} ${found}, not ${source.version}; refusing to install a release whose content does not match its tag.`,
        );
      }
    });
  } catch (err) {
    // Extraction is not transactional, so a partially-written tree must never
    // be returned. Callers treat a fetchRepo throw as fatal.
    liveClones.delete(dir);
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return {
    dir,
    sha,
    source,
    cleanup: () => {
      // Deregister first, so a later handler never removes a path this
      // process no longer owns.
      liveClones.delete(dir);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Unpack a pharn-oss `.tar.gz` into `dir` (an empty directory this module
 * created) and return its validated manifest. Two passes over the same bytes:
 *
 *   1. write only CLONE_READ_FILES; run `checkTree` (the release check);
 *      validate pharn-install.json through the one parser (a tree without one
 *      is older than pharn-oss 7.21.0 and refused);
 *   2. write only the paths the manifest lists, then hold every listed file to
 *      its raw sha256, so a listed file that is missing (a pax record renamed
 *      it) or altered refuses the tree before any command can read it.
 *
 * Every other archive entry is skipped unwritten. Takes the archive's bytes,
 * never a URL, so a local file can be checked with no network. Throws on any
 * refusal; extraction is not transactional, so the caller removes `dir`.
 */
export async function extractPharnArchive(
  archive: Buffer,
  dir: string,
  checkTree?: (dir: string) => void,
): Promise<UpstreamManifest> {
  const first = await extractTarGz(archive, dir, {
    select: new Set(CLONE_READ_FILES),
    limits: LIMITS,
  });
  checkTree?.(dir);
  const manifest = readUpstreamManifest(dir);
  await extractTarGz(archive, dir, {
    select: new Set(
      manifest.files.map((f) => f.path).filter((p) => !first.written.has(p)),
    ),
    limits: { ...LIMITS, maxWrittenBytes: MAX_WRITTEN_BYTES - first.bytes },
    root: first.root,
  });
  verifyUpstreamManifest(dir, manifest);
  return manifest;
}

/**
 * Download the repo tarball at `ref` into memory, bounded on both time and
 * size (`fetchCapped`; the decompressed size is bounded by the extract).
 * `ref` is either a COMMIT_RE-validated SHA or the literal
 * `refs/heads/<branch>` — never user input.
 */
async function downloadArchive(ref: string): Promise<Buffer> {
  const url = `${CODELOAD}/${REPO}/tar.gz/${ref}`;
  let got: CappedResponse;
  try {
    got = await fetchCapped(url, {
      maxBytes: MAX_ARCHIVE_BYTES,
      ms: CLONE_TIMEOUT_MS,
    });
  } catch (err) {
    // A transport failure surfaces as the runtime's own error: the callers
    // already prefix "Could not reach <repo>:", and PHARN_DEBUG dumps it.
    const capped = err as FetchCappedError;
    if (capped.kind === 'unreachable') throw capped.cause;
    throw new Error(
      capped.kind === 'timeout'
        ? `Timed out downloading ${url} after ${CLONE_TIMEOUT_MS / 1000}s.`
        : `Refusing ${url}: archive exceeds ${MAX_ARCHIVE_BYTES} bytes.`,
      { cause: err },
    );
  }
  if (!got.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${got.status}`);
  }
  if (got.body.byteLength === 0) {
    throw new Error(`Failed to download ${url}: empty response body`);
  }
  return got.body;
}

/**
 * Best-effort: resolve the default branch's commit SHA, or null on any failure
 * (rate limit, offline, the deadline, a body over `MAX_SHA_BYTES`, a body that
 * is not one whitespace-free token) — the LIMITS §3b float. Asks for the bare
 * id (`application/vnd.github.sha`). A single token that is not a SHA is
 * RETURNED, so fetchAt's COMMIT_RE check refuses it loudly instead of a catch
 * here swallowing it to null. A null SHA is not an exit — the command carries
 * on — which is why fetchCapped releasing every unread body matters here.
 */
export async function fetchCommitSha(): Promise<string | null> {
  // The FULL branch ref, so a tag named like the branch cannot answer for it.
  const url = `${API}/repos/${REPO}/commits/refs/heads/${REPO_BRANCH}`;
  try {
    const got = await fetchCapped(url, {
      accept: 'application/vnd.github.sha',
      maxBytes: MAX_SHA_BYTES,
      ms: FETCH_TIMEOUT_MS,
    });
    if (!got.ok) return null;
    const text = got.body.toString('utf8').trim();
    return /^\S+$/.test(text) ? text : null;
  } catch {
    return null;
  }
}
