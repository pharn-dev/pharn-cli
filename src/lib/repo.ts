import { withDeadline } from './deadline.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, REPO_BRANCH, SKILLS_VERSION_FILE } from './constants.js';
import { onFatalSignal } from './fatal-signal.js';
import { MAX_SHA_BYTES, readCapped } from './release.js';
import type { InstallSource } from './release.js';
import { readSkillsVersion } from './skills-version.js';
import { extractTarGz } from './tar-extract.js';
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
// Caps on both sides of the gunzip: the compressed cap is counted as bytes
// stream (codeload sends no content-length); the decompressed cap bounds a zip
// bomb.
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

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
  // created by this process in a private `mkdtemp` dir (tar-extract.ts's
  // typeflag allowlist; this module is the only producer, enforced by the
  // clone-producer rule in eslint.config.mjs). Clone-side readers skip symlink/FIFO
  // checks but keep type checks. Every DESTINATION guard is separate and stays.
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
 * lib/tar-extract.ts. No `git` binary, no tarball cache.
 */
export async function fetchRepo(source: InstallSource): Promise<FetchedRepo> {
  if (source.kind === 'release') return fetchAt(source, source.sha);
  return fetchAt(source, await fetchCommitSha());
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
    extractTarGz(archive, dir, {
      maxEntries: MAX_ENTRIES,
      maxTotalBytes: MAX_EXTRACTED_BYTES,
    });
    // A release's tree must BE the version its tag names, or `update`'s
    // version compare would lie. Refused inside this try, so the tree is removed.
    if (source.kind === 'release') {
      const found = readSkillsVersion(dir);
      if (found !== source.version) {
        throw new ManifestValidationError(
          `Release ${source.tag} (${source.sha}) ships ${SKILLS_VERSION_FILE} ${found}, not ${source.version}; refusing to install a release whose content does not match its tag.`,
        );
      }
    }
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
 * Download the repo tarball at `ref` into memory, bounded on both time and
 * size. `ref` is either a COMMIT_RE-validated SHA or the literal
 * `refs/heads/<branch>` — never user input.
 */
async function downloadArchive(ref: string): Promise<Buffer> {
  const url = `${CODELOAD}/${REPO}/tar.gz/${ref}`;
  // withDeadline, not a bare abort timer: the abort may never reach the body
  // stream (lib/deadline.ts).
  return withDeadline(
    CLONE_TIMEOUT_MS,
    () =>
      new Error(
        `Timed out downloading ${url} after ${CLONE_TIMEOUT_MS / 1000}s.`,
      ),
    async (signal) => {
      const res = await fetch(url, { redirect: 'error', signal });
      if (!res.ok) {
        // An unread body holds its socket, and with it the process.
        await discardBody(res);
        throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
      }
      if (!res.body) {
        throw new Error(`Failed to download ${url}: empty response body`);
      }
      // An explicit reader, cancelled by OUR listener on OUR signal, so the
      // socket is released at the deadline even when undici drops the abort.
      const reader = res.body.getReader();
      signal.addEventListener('abort', () => {
        reader.cancel().catch(() => undefined);
      });
      const chunks: Buffer[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        total += buf.byteLength;
        if (total > MAX_ARCHIVE_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new Error(
            `Refusing ${url}: archive exceeds ${MAX_ARCHIVE_BYTES} bytes.`,
          );
        }
        chunks.push(buf);
      }
      if (signal.aborted) {
        throw new Error(
          `Timed out downloading ${url} after ${CLONE_TIMEOUT_MS / 1000}s.`,
        );
      }
      return Buffer.concat(chunks);
    },
  );
}

/**
 * Best-effort: resolve the default branch's commit SHA, or null on any failure
 * (rate limit, offline, a body over `MAX_SHA_BYTES`, a body that is not one
 * whitespace-free token) — the LIMITS §3b float. Asks for the bare id
 * (`application/vnd.github.sha`). A single token that is not a SHA is RETURNED,
 * so fetchAt's COMMIT_RE check refuses it loudly instead of a catch here
 * swallowing it to null.
 */
export async function fetchCommitSha(): Promise<string | null> {
  // The FULL branch ref, so a tag named like the branch cannot answer for it.
  const url = `${API}/repos/${REPO}/commits/refs/heads/${REPO_BRANCH}`;
  try {
    // A timeout is one more failure that degrades to `null`.
    return await withDeadline(
      FETCH_TIMEOUT_MS,
      () => new Error(`Timed out resolving ${url}`),
      async (signal) => {
        const res = await fetch(url, {
          redirect: 'error',
          signal,
          headers: {
            Accept: 'application/vnd.github.sha',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        // A null SHA is not an exit — the command carries on — so a body left
        // streaming would keep the process alive after it finished.
        if (!res.ok) {
          await discardBody(res);
          return null;
        }
        const text = (await readCapped(res, signal, MAX_SHA_BYTES, url)).trim();
        return /^\S+$/.test(text) ? text : null;
      },
    );
  } catch {
    return null;
  }
}

/** Release a response body that will not be read. Never throws. */
async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* already errored or locked: there is nothing left to release */
  }
}
