import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPO, REPO_BRANCH } from '../src/lib/constants.js';
import { ManifestValidationError } from '../src/lib/validate.js';

const { fetchRepo, fetchCommitSha } = await import('../src/lib/repo.js');

// A real 40-char lowercase-hex commit SHA (the SHA-1 of the empty blob) — the
// form fetchRepo validates against COMMIT_RE before it fetches or records it.
const VALID_SHA = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';

/** The one URL fetchCommitSha builds — the stub answers this and nothing else. */
const RESOLVE_URL = `https://api.github.com/repos/${REPO}/commits/${REPO_BRANCH}`;

// ---------------------------------------------------------------------------
// A real gzipped ustar archive, shaped like codeload's: a leading
// pax_global_header, a single `pharn-oss-<sha>/` root, then content. The old
// test mocked the whole clone dependency, so it proved nothing about the bytes;
// these stubs go through the actual download + extract path.
// ---------------------------------------------------------------------------

const BLOCK = 512;

function tarHeader(name: string, type: string, size: number): Buffer {
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, 100, 'latin1');
  block.write('000644 \0', 100, 8, 'latin1');
  block.write('000000 \0', 108, 8, 'latin1');
  block.write('000000 \0', 116, 8, 'latin1');
  block.write(size.toString(8).padStart(11, '0') + ' ', 124, 12, 'latin1');
  block.write('00000000000 ', 136, 12, 'latin1');
  block.write('        ', 148, 8, 'latin1');
  block.write(type, 156, 1, 'latin1');
  block.write('ustar\0', 257, 6, 'latin1');
  block.write('00', 263, 2, 'latin1');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1');
  return block;
}

function entry(name: string, type: string, data = ''): Buffer {
  const bytes = Buffer.from(data, 'utf8');
  const parts = [tarHeader(name, type, bytes.length)];
  if (bytes.length > 0) {
    const padded = Buffer.alloc(Math.ceil(bytes.length / BLOCK) * BLOCK);
    bytes.copy(padded);
    parts.push(padded);
  }
  return Buffer.concat(parts);
}

function archive(sha: string): Buffer {
  return gzipSync(
    Buffer.concat([
      entry('pax_global_header', 'g', `52 comment=${sha}\n`),
      entry(`pharn-oss-${sha.slice(0, 7)}/`, '5'),
      entry(`pharn-oss-${sha.slice(0, 7)}/SKILLS_VERSION`, '0', '1.0.0\n'),
      Buffer.alloc(BLOCK * 2),
    ]),
  );
}

/** A Response-alike whose body streams `bytes` in small chunks. */
function tarResponse(bytes: Buffer, chunkSize = 64): unknown {
  return {
    ok: true,
    status: 200,
    body: (async function* () {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        yield bytes.subarray(i, i + chunkSize);
      }
    })(),
  };
}

// A failed fetch must leave NO temp dir behind: extraction is not
// transactional, so a partially-written tree is never returned and fetchRepo's
// catch is the only place that can remove it.
//
// Asserting that means owning the directory fetchRepo creates into. Scanning
// the real os.tmpdir() for `pharn-*` would be flaky by construction — vitest
// runs test files in parallel and several of them (helpers' useTmpDir included)
// create `pharn-`-prefixed dirs there. Instead each test gets its own TMPDIR,
// which os.tmpdir() reads at call time, so the only `pharn-*` entries inside it
// are the ones fetchRepo just made.
let sandbox = '';
const realTmp = {
  TMPDIR: process.env.TMPDIR,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
};

function leftoverTempDirs(): string[] {
  return readdirSync(sandbox).filter((name) => name.startsWith('pharn-'));
}

describe('fetchRepo', () => {
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pharn-repo-sandbox-'));
    process.env.TMPDIR = sandbox;
    process.env.TEMP = sandbox;
    process.env.TMP = sandbox;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(realTmp)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(sandbox, { recursive: true, force: true });
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * Stub both calls fetchRepo makes: the REST resolve, then the codeload
   * download. Returns the mock so a test can assert the URLs — one resolve and
   * one download, in that order, and never a second resolve.
   */
  function stubFetches(
    sha: string | null,
    body: unknown = tarResponse(archive(VALID_SHA)),
  ): ReturnType<typeof vi.fn> {
    const mock = vi.fn(async (url: string) => {
      // Exact match, not a prefix: `startsWith('https://api.github.com')` also
      // matches `https://api.github.com.example.invalid/...`, so the stub would
      // answer for a host the code should never have contacted — and the test
      // would keep passing if the resolve URL drifted. Comparing the whole
      // string makes this an assertion about the resolve URL too.
      if (url === RESOLVE_URL) {
        return sha === null
          ? { ok: false, json: async () => ({}) }
          : { ok: true, json: async () => ({ sha }) };
      }
      return body;
    });
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  it('downloads the tarball at the resolved SHA and records it (recorded == fetched)', async () => {
    const mock = stubFetches(VALID_SHA);
    const repo = await fetchRepo();

    // Exactly two requests: resolve, then download. The old implementation paid
    // for the ref to be resolved a SECOND time inside the clone dependency.
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1]![0]).toBe(
      `https://codeload.github.com/${REPO}/tar.gz/${VALID_SHA}`,
    );
    // The SAME value is the URL segment and the recorded provenance.
    expect(repo.sha).toBe(VALID_SHA);
    // ...and the tree really landed, stripped of its root component.
    expect(readFileSync(join(repo.dir, 'SKILLS_VERSION'), 'utf8')).toBe(
      '1.0.0\n',
    );

    repo.cleanup();
    expect(existsSync(repo.dir)).toBe(false);
  });

  it('sends the network floor on the download: redirect:error and an abort signal', async () => {
    const mock = stubFetches(VALID_SHA);
    const repo = await fetchRepo();
    const init = mock.mock.calls[1]![1] as RequestInit;
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeDefined();
    repo.cleanup();
  });

  it('falls back to refs/heads/<branch> and records sha:null when unresolved (LIMITS §3b)', async () => {
    const mock = stubFetches(null);
    const repo = await fetchRepo();

    expect(mock.mock.calls[1]![0]).toBe(
      `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${REPO_BRANCH}`,
    );
    expect(repo.sha).toBeNull();
    repo.cleanup();
  });

  it('rejects a malformed (non-40-hex) sha before any download or temp dir (P2)', async () => {
    const mock = stubFetches('deadbeefcafe'); // 12 hex chars, not a full SHA
    await expect(fetchRepo()).rejects.toThrow(ManifestValidationError);
    // Boundary reject: only the resolve happened — nothing was downloaded.
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('removes the temp dir and rethrows on a non-200 download', async () => {
    stubFetches(VALID_SHA, { ok: false, status: 404 });
    await expect(fetchRepo()).rejects.toThrow(/HTTP 404/);
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('removes the temp dir and rethrows when the archive will not extract', async () => {
    stubFetches(VALID_SHA, tarResponse(Buffer.from('not a gzip stream')));
    await expect(fetchRepo()).rejects.toThrow();
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('removes the temp dir and rethrows when the body has no stream', async () => {
    stubFetches(VALID_SHA, { ok: true, status: 200, body: null });
    await expect(fetchRepo()).rejects.toThrow(/empty response body/);
    expect(leftoverTempDirs()).toEqual([]);
  });
});

describe('fetchCommitSha', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(impl: () => unknown): void {
    vi.stubGlobal('fetch', vi.fn(impl));
  }

  it('returns the sha on a successful response', async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ sha: 'abc123' }) }));
    expect(await fetchCommitSha()).toBe('abc123');
  });

  it('returns null on a non-ok response', async () => {
    stubFetch(() => ({ ok: false, json: async () => ({}) }));
    expect(await fetchCommitSha()).toBeNull();
  });

  it('returns null when the sha is not a string', async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ sha: 42 }) }));
    expect(await fetchCommitSha()).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    stubFetch(() => {
      throw new Error('offline');
    });
    expect(await fetchCommitSha()).toBeNull();
  });
});
