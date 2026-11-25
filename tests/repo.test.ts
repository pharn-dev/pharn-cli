import {
  existsSync,
  lstatSync,
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
import { UpstreamManifestError } from '../src/lib/upstream-manifest.js';
import { TarExtractError } from '../src/lib/tar-extract.js';
import { codeloadArchive } from './support/tar-fixture.js';
import {
  MANIFEST,
  manifestTree,
  SECURITY,
  upstreamTree,
  withManifest,
} from './support/harness.js';

const {
  CLONE_READ_FILES,
  extractPharnArchive,
  fetchRepo,
  fetchCommitSha,
  verifyLocalArchive,
} = await import('../src/lib/repo.js');

// A real 40-char lowercase-hex commit SHA (the SHA-1 of the empty blob) — the
// form fetchRepo validates against COMMIT_RE before it fetches or records it.
const VALID_SHA = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';

/**
 * The one URL fetchCommitSha builds — the stub answers this and nothing else.
 * The FULL branch ref, so a tag named like the branch cannot answer for it.
 */
const RESOLVE_URL = `https://api.github.com/repos/${REPO}/commits/refs/heads/${REPO_BRANCH}`;

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

// The smallest tree fetchRepo accepts: a SKILLS_VERSION, the pharn layout's
// marker, and the pharn-install.json that declares them (a tree without one is
// a pharn-oss older than 7.21.0, refused).
const MINIMAL_TREE = withManifest({
  SKILLS_VERSION: '1.0.0\n',
  'pharn/pharn-contracts/finding-shape.md': 'finding shape\n',
});

function archive(sha: string, manifest = true): Buffer {
  const root = `pharn-oss-${sha.slice(0, 7)}`;
  return gzipSync(
    Buffer.concat([
      entry('pax_global_header', 'g', `52 comment=${sha}\n`),
      entry(`${root}/`, '5'),
      entry(`${root}/SKILLS_VERSION`, '0', MINIMAL_TREE.SKILLS_VERSION),
      entry(`${root}/pharn/`, '5'),
      entry(`${root}/pharn/pharn-contracts/`, '5'),
      entry(
        `${root}/pharn/pharn-contracts/finding-shape.md`,
        '0',
        MINIMAL_TREE['pharn/pharn-contracts/finding-shape.md'],
      ),
      ...(manifest
        ? [entry(`${root}/${MANIFEST}`, '0', MINIMAL_TREE[MANIFEST])]
        : []),
      Buffer.alloc(BLOCK * 2),
    ]),
  );
}

/**
 * A real Response carrying `value` as JSON — the shape the commit-SHA resolve
 * gets back. Real, not a `{ json }` stand-in: the resolve reads its body through
 * its own reader (so it can cancel it), and a stand-in without a stream would
 * test a path production never takes.
 */
function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

/**
 * A body stream whose cancellation is OBSERVABLE. "The body was released" must
 * be asserted on the cancel itself — a `null` result says nothing about it,
 * because the old code returned `null` too, with the body still streaming.
 */
function observedBody(
  text: string,
  { hang = false } = {},
): { body: ReadableStream<Uint8Array>; cancelled: () => boolean } {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      if (text) c.enqueue(new TextEncoder().encode(text));
      if (!hang) c.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { body, cancelled: () => cancelled };
}

/** A Response-alike whose body streams `bytes` in small chunks. */
function tarResponse(bytes: Buffer, chunkSize = 64): unknown {
  return {
    ok: true,
    status: 200,
    // A web ReadableStream, the shape `fetch` really returns — the download is
    // read through `getReader()` so it can be cancelled on its own signal.
    body: ReadableStream.from(
      (async function* () {
        for (let i = 0; i < bytes.length; i += chunkSize) {
          yield new Uint8Array(bytes.subarray(i, i + chunkSize));
        }
      })(),
    ),
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
        return sha === null ? jsonResponse({}, 404) : new Response(`${sha}\n`);
      }
      return body;
    });
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  // PHARN-09: a body stream the abort NEVER reaches — the shape undici 6 (Node
  // 20/22) leaves after a GC drops its WeakRef to the caller's signal. The old
  // abort-only timer then left the download hanging indefinitely.
  it('gives up at CLONE_TIMEOUT_MS even when the abort never reaches the body', async () => {
    vi.useFakeTimers();
    try {
      stubFetches(VALID_SHA, {
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array([0x1f])); // one byte, then silence
          },
        }),
      });
      const pending = fetchRepo({ kind: 'main' });
      const rejects = expect(pending).rejects.toThrow(/Timed out downloading/);
      await vi.advanceTimersByTimeAsync(60_000);
      await rejects;
    } finally {
      vi.useRealTimers();
    }
  });

  it('downloads the tarball at the resolved SHA and records it (recorded == fetched)', async () => {
    const mock = stubFetches(VALID_SHA);
    const repo = await fetchRepo({ kind: 'main' });

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
    const repo = await fetchRepo({ kind: 'main' });
    const init = mock.mock.calls[1]![1] as RequestInit;
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeDefined();
    repo.cleanup();
  });

  it('falls back to refs/heads/<branch> and records sha:null when unresolved (LIMITS §3b)', async () => {
    const mock = stubFetches(null);
    const repo = await fetchRepo({ kind: 'main' });

    expect(mock.mock.calls[1]![0]).toBe(
      `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${REPO_BRANCH}`,
    );
    expect(repo.sha).toBeNull();
    repo.cleanup();
  });

  it('rejects a malformed (non-40-hex) sha before any download or temp dir (P2)', async () => {
    const mock = stubFetches('deadbeefcafe'); // 12 hex chars, not a full SHA
    await expect(fetchRepo({ kind: 'main' })).rejects.toThrow(
      ManifestValidationError,
    );
    // Boundary reject: only the resolve happened — nothing was downloaded.
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('removes the temp dir and rethrows on a non-200 download', async () => {
    stubFetches(VALID_SHA, { ok: false, status: 404 });
    await expect(fetchRepo({ kind: 'main' })).rejects.toThrow(/HTTP 404/);
    expect(leftoverTempDirs()).toEqual([]);
  });

  // An error page is a body too, and an unread body holds its socket. The throw
  // is harmless today only because every caller exits 1 on it — a property of
  // the callers, so the release is made here instead.
  it('releases the body of a non-200 download before throwing', async () => {
    const page = observedBody('<html>server error</html>', { hang: true });
    stubFetches(VALID_SHA, { ok: false, status: 500, body: page.body });
    await expect(fetchRepo({ kind: 'main' })).rejects.toThrow(/HTTP 500/);
    expect(page.cancelled()).toBe(true);
  });

  it('removes the temp dir and rethrows when the archive will not extract', async () => {
    stubFetches(VALID_SHA, tarResponse(Buffer.from('not a gzip stream')));
    await expect(fetchRepo({ kind: 'main' })).rejects.toThrow();
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('removes the temp dir and rethrows when the body has no stream', async () => {
    stubFetches(VALID_SHA, { ok: true, status: 200, body: null });
    await expect(fetchRepo({ kind: 'main' })).rejects.toThrow(
      /empty response body/,
    );
    expect(leftoverTempDirs()).toEqual([]);
  });

  // The compressed cap, counted as the body streams (codeload sends no
  // content-length): the read stops just past 32 MiB and the tree is removed.
  it('refuses an archive over the compressed cap, and removes the temp dir', async () => {
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        sent += chunk.byteLength;
        c.enqueue(chunk);
      },
    });
    stubFetches(VALID_SHA, { ok: true, status: 200, body });
    await expect(fetchRepo({ kind: 'main' })).rejects.toThrow(
      /archive exceeds 33554432 bytes/,
    );
    expect(sent).toBeLessThanOrEqual(36 * 1024 * 1024);
    expect(leftoverTempDirs()).toEqual([]);
  });

  // A transport failure stays the runtime's own error, for the caller's
  // "Could not reach <repo>:" prefix and the PHARN_DEBUG dump.
  it('rethrows a transport failure as the runtime raised it', async () => {
    const offline = new TypeError('fetch failed');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === RESOLVE_URL) return new Response(VALID_SHA);
        throw offline;
      }),
    );
    await expect(fetchRepo({ kind: 'main' })).rejects.toBe(offline);
    expect(leftoverTempDirs()).toEqual([]);
  });
});

// A verified release (lib/release.ts) is downloaded at the commit its tag
// resolved to — the tip is never consulted — and its tree must BE the version
// the tag names.
describe('fetchRepo — a verified release', () => {
  const release = (version = '1.0.0', sha = VALID_SHA) => ({
    kind: 'release' as const,
    tag: `v${version}`,
    version,
    sha,
  });

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
    vi.unstubAllGlobals();
  });

  function stubDownload(): ReturnType<typeof vi.fn> {
    const mock = vi.fn(async () => tarResponse(archive(VALID_SHA)));
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  it('downloads at the release commit, never resolving the tip', async () => {
    const mock = stubDownload();
    const repo = await fetchRepo(release());

    // ONE request: the download. No commits/main resolve.
    expect(mock.mock.calls.map((c) => c[0])).toEqual([
      `https://codeload.github.com/${REPO}/tar.gz/${VALID_SHA}`,
    ]);
    expect(repo.sha).toBe(VALID_SHA);
    expect(repo.source).toEqual(release());
    repo.cleanup();
  });

  it('refuses a release whose SKILLS_VERSION is not its tag, and removes the tree', async () => {
    stubDownload();
    // The archive ships SKILLS_VERSION 1.0.0; the tag claims 1.0.1.
    const err = await fetchRepo(release('1.0.1')).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ManifestValidationError);
    expect((err as Error).message).toContain('v1.0.1');
    expect((err as Error).message).toContain('ships SKILLS_VERSION 1.0.0');
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('rejects a malformed release sha before any download or temp dir (P2)', async () => {
    const mock = stubDownload();
    await expect(fetchRepo(release('1.0.0', 'nope'))).rejects.toThrow(
      ManifestValidationError,
    );
    expect(mock).not.toHaveBeenCalled();
    expect(leftoverTempDirs()).toEqual([]);
  });
});

describe('fetchCommitSha', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(impl: () => unknown): void {
    vi.stubGlobal('fetch', vi.fn(impl));
  }

  it('returns the sha on a successful response (bare id, trimmed)', async () => {
    stubFetch(() => new Response(`${VALID_SHA}\n`));
    expect(await fetchCommitSha()).toBe(VALID_SHA);
  });

  // F-21: the bare-id media type, never the full commit object (whose size is
  // set by whatever merged last).
  it('asks for the bare-id media type at the resolve URL', async () => {
    const mock = vi.fn(() => new Response(VALID_SHA));
    vi.stubGlobal('fetch', mock);
    await fetchCommitSha();
    const [url, init] = mock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; redirect: string },
    ];
    expect(url).toBe(RESOLVE_URL);
    expect(init.headers.Accept).toBe('application/vnd.github.sha');
    expect(init.redirect).toBe('error');
  });

  // CORE-169: the branch is asked for by its full ref, never the bare name a
  // same-named TAG could answer. Literal, so it does not lean on RESOLVE_URL.
  it('resolves the branch through refs/heads/, never the bare name', async () => {
    const mock = vi.fn(() => new Response(VALID_SHA));
    vi.stubGlobal('fetch', mock);
    await fetchCommitSha();
    const url = (mock.mock.calls[0] as unknown as [string])[0];
    expect(url).toBe(
      'https://api.github.com/repos/pharn-dev/pharn-oss/commits/refs/heads/main',
    );
    expect(url).not.toBe(
      'https://api.github.com/repos/pharn-dev/pharn-oss/commits/main',
    );
  });

  // F-21: the body used to be read with no cap. Over the cap the read is
  // cancelled and the resolve degrades to null — the same float as any other
  // failed resolve (LIMITS §3b).
  it('returns null and cancels the read when the body exceeds the cap', async () => {
    let cancelled = false;
    let sent = 0;
    const chunk = new TextEncoder().encode('a'.repeat(512));
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        sent += chunk.byteLength;
        c.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    stubFetch(() => ({ ok: true, status: 200, body }));
    expect(await fetchCommitSha()).toBeNull();
    expect(cancelled).toBe(true);
    // Stopped just past the 1 KiB cap, not after an unbounded read.
    expect(sent).toBeLessThanOrEqual(4096);
  });

  it('returns a single non-SHA token for fetchRepo to refuse loudly', async () => {
    stubFetch(() => new Response('not-a-sha'));
    expect(await fetchCommitSha()).toBe('not-a-sha');
  });

  it('returns null on a non-ok response', async () => {
    stubFetch(() => jsonResponse({}, 403));
    expect(await fetchCommitSha()).toBeNull();
  });

  it('returns null on an empty body', async () => {
    stubFetch(() => new Response(''));
    expect(await fetchCommitSha()).toBeNull();
  });

  it('returns null when the body is not a bare id (an HTML page)', async () => {
    stubFetch(() => new Response('<html>rate limited</html>'));
    expect(await fetchCommitSha()).toBeNull();
  });

  // The null is a degraded mode, not an exit: the command carries on and
  // finishes. An error body nobody reads kept its socket — and with it the
  // whole process — alive until the server finished sending, measured at 30 s
  // after `pharn status` had already printed its last line.
  it('releases the body of a non-ok response instead of leaving it streaming', async () => {
    const page = observedBody('{"message":"API rate limit exceeded"', {
      hang: true,
    });
    stubFetch(() => ({ ok: false, status: 403, body: page.body }));
    expect(await fetchCommitSha()).toBeNull();
    expect(page.cancelled()).toBe(true);
  });

  // The 2xx half of the same leak: `res.json()` has no reader pharn can
  // cancel, so a body still streaming at the deadline outlived the command.
  it('cancels a body still streaming at the 8s deadline', async () => {
    vi.useFakeTimers();
    try {
      const body = observedBody('da39a3ee', { hang: true });
      stubFetch(() => ({ ok: true, status: 200, body: body.body }));
      const pending = fetchCommitSha();
      await vi.advanceTimersByTimeAsync(8000);
      expect(await pending).toBeNull();
      expect(body.cancelled()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null when fetch throws', async () => {
    stubFetch(() => {
      throw new Error('offline');
    });
    expect(await fetchCommitSha()).toBeNull();
  });

  // PHARN-09: headers arrived, the JSON body never does and ignores the abort.
  it('returns null at the 8s deadline even when the abort never reaches the body', async () => {
    vi.useFakeTimers();
    try {
      stubFetch(() => ({
        ok: true,
        status: 200,
        // Headers arrived; the body never does, and even a cancel never
        // settles — the answer must come from the deadline alone.
        body: new ReadableStream<Uint8Array>({
          cancel: () => new Promise<never>(() => undefined),
        }),
      }));
      const pending = fetchCommitSha();
      await vi.advanceTimersByTimeAsync(8000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchRepo — a tree that declares pharn-install.json (CORE-194)', () => {
  const release = {
    kind: 'release' as const,
    tag: 'v7.20.0',
    version: '7.20.0',
    sha: VALID_SHA,
  };

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
    vi.unstubAllGlobals();
  });

  const serve = (tree: Record<string, string>): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tarResponse(codeloadArchive(VALID_SHA, tree))),
    );
  };

  it('returns a tree whose every declared file matches its sha256', async () => {
    serve(manifestTree('7.20.0'));
    const repo = await fetchRepo(release);
    expect(readdirSync(repo.dir)).toContain('pharn-install.json');
    repo.cleanup();
  });

  it('refuses a tree whose file differs from its declared sha256, and removes the tree', async () => {
    const tree = manifestTree('7.20.0');
    serve({ ...tree, [SECURITY]: 'tampered after the manifest was written\n' });
    const err = await fetchRepo(release).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamManifestError);
    expect((err as Error).message).toContain(SECURITY);
    expect(leftoverTempDirs()).toEqual([]);
  });

  // A pharn-oss older than 7.21.0 ships no manifest. Whether it arrives as
  // the release the channel resolved or as the tip of main, it is refused
  // inside fetchRepo, and the extracted tree is removed with nothing returned.
  it('refuses a release older than 7.21.0 (no pharn-install.json), and removes the tree', async () => {
    serve(upstreamTree('7.20.0'));
    const err = await fetchRepo(release).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamManifestError);
    expect((err as Error).message).toContain('(SKILLS_VERSION 7.20.0)');
    expect((err as Error).message).toContain('older than 7.21.0');
    expect((err as Error).message).toContain('`--ref main`');
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('refuses a tip of main with no pharn-install.json, and removes the tree', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === RESOLVE_URL
          ? new Response(`${VALID_SHA}\n`)
          : tarResponse(codeloadArchive(VALID_SHA, upstreamTree('7.20.0'))),
      ),
    );
    const err = await fetchRepo({ kind: 'main' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamManifestError);
    expect((err as Error).message).toContain('ships no pharn-install.json');
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('refuses the minimal archive once its manifest is left out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tarResponse(archive(VALID_SHA, false))),
    );
    await expect(
      fetchRepo({ ...release, tag: 'v1.0.0', version: '1.0.0' }),
    ).rejects.toThrow(UpstreamManifestError);
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('refuses a malformed manifest before returning, and removes the tree', async () => {
    serve(
      manifestTree('7.20.0', (m) => {
        m.schemaVersion = 2;
      }),
    );
    await expect(fetchRepo(release)).rejects.toThrow(/schemaVersion 2/);
    expect(leftoverTempDirs()).toEqual([]);
  });
});

// CORE-386: only the paths pharn-install.json lists (plus the files the CLI
// reads itself) are unpacked. pharn-oss v7.25.3–v7.25.5 committed symlinks
// under .claude/skills/, outside the manifest, and every install failed.
describe('fetchRepo — only the listed paths are unpacked (CORE-386)', () => {
  const release = {
    kind: 'release' as const,
    tag: 'v7.20.0',
    version: '7.20.0',
    sha: VALID_SHA,
  };
  const ROOT = `pharn-oss-${VALID_SHA.slice(0, 7)}`;

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
    vi.unstubAllGlobals();
  });

  /** A pax extended-header record, `<len> <kw>=<value>\n` (self-counting). */
  function paxRecord(keyword: string, value: string): string {
    const body = ` ${keyword}=${value}\n`;
    let len = body.length + 1;
    while (String(len).length + body.length !== len)
      len = String(len).length + body.length;
    return `${len}${body}`;
  }

  /**
   * The codeload shape around `tree`, with `odd` entries spliced in right after
   * the root directory and `replace` swapping a tree file's own entry for raw
   * entries (a symlink at a listed path, a pax-renamed file).
   */
  function archiveWith(
    tree: Record<string, string>,
    odd: Buffer[],
    replace: Record<string, Buffer[]> = {},
  ): Buffer {
    const parts = [
      entry('pax_global_header', 'g', `52 comment=${VALID_SHA}\n`),
      entry(`${ROOT}/`, '5'),
      ...odd,
    ];
    for (const rel of Object.keys(tree).sort()) {
      parts.push(
        ...(replace[rel] ?? [entry(`${ROOT}/${rel}`, '0', tree[rel])]),
      );
    }
    parts.push(Buffer.alloc(BLOCK * 2));
    return gzipSync(Buffer.concat(parts));
  }

  const serve = (bytes: Buffer): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tarResponse(bytes, 4096)),
    );
  };

  /** Every regular file under `dir`, relative and sorted. */
  function filesUnder(dir: string): string[] {
    return (readdirSync(dir, { recursive: true }) as string[])
      .filter((rel) => lstatSync(join(dir, rel)).isFile())
      .sort();
  }

  // Each entry v7.25.5 (or a future pharn-oss) could carry outside the list.
  const UNLISTED: Buffer[] = [
    entry(`${ROOT}/.claude/skills/pharn-cli`, '2'), // a symlink
    entry(`${ROOT}/.dev/hard`, '1'), // a hard link
    entry(
      `${ROOT}/PaxHeaders/long`,
      'x',
      paxRecord('path', `${ROOT}/.dev/${'s'.repeat(120)}.md`),
    ),
    entry(`${ROOT}/0123456789abcdef.data`, '0', 'long-named\n'),
    entry(`${ROOT}/.dev/a:b.md`, '0', 'colon\n'),
    entry(`${ROOT}/.dev/notes.md`, '0', 'an unlisted regular file\n'),
  ];

  it('installs past a symlink, hard link, pax header, long and colon name outside the list, writing none of them', async () => {
    const tree = manifestTree('7.20.0');
    serve(archiveWith(tree, UNLISTED));
    const repo = await fetchRepo(release);
    try {
      const listed = (
        JSON.parse(tree[MANIFEST]!) as { files: { path: string }[] }
      ).files.map((f) => f.path);
      const expected = new Set([
        ...listed,
        ...CLONE_READ_FILES.filter((f) => f in tree),
      ]);
      expect(filesUnder(repo.dir)).toEqual([...expected].sort());
      expect(existsSync(join(repo.dir, '.dev'))).toBe(false);
      expect(existsSync(join(repo.dir, '.claude/skills/pharn-cli'))).toBe(
        false,
      );
      expect(existsSync(join(repo.dir, 'PaxHeaders'))).toBe(false);
    } finally {
      repo.cleanup();
    }
  });

  it('refuses a symlink AT a listed path, and removes the tree', async () => {
    serve(
      archiveWith(manifestTree('7.20.0'), [], {
        [SECURITY]: [entry(`${ROOT}/${SECURITY}`, '2')],
      }),
    );
    const err = await fetchRepo(release).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TarExtractError);
    expect((err as Error).message).toMatch(/unsupported type '2'/);
    expect((err as Error).message).toContain(SECURITY);
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('refuses a listed file that follows a pax extended header, and removes the tree', async () => {
    const tree = manifestTree('7.20.0');
    serve(
      archiveWith(tree, [], {
        [SECURITY]: [
          entry(`${ROOT}/PaxHeaders/security.md`, 'x', paxRecord('mtime', '1')),
          entry(`${ROOT}/${SECURITY}`, '0', tree[SECURITY]),
        ],
      }),
    );
    const err = await fetchRepo(release).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TarExtractError);
    expect((err as Error).message).toMatch(
      /unsupported type 'x'.*pax extended header/,
    );
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('fails the hash check when a pax record renamed a listed file away from its ustar name', async () => {
    const tree = manifestTree('7.20.0');
    serve(
      archiveWith(tree, [], {
        [SECURITY]: [
          entry(
            `${ROOT}/PaxHeaders/security.md`,
            'x',
            paxRecord('path', `${ROOT}/${SECURITY}`),
          ),
          entry(`${ROOT}/0123456789abcdef.data`, '0', tree[SECURITY]),
        ],
      }),
    );
    const err = await fetchRepo(release).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamManifestError);
    expect((err as Error).message).toContain(
      `declares ${SECURITY}, which the tree does not ship as a file`,
    );
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('extracts a local archive with no network: the CLI-read files first, then the listed ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('no network in this test');
      }),
    );
    const tree = manifestTree('7.20.0');
    const dir = mkdtempSync(join(sandbox, 'local-'));
    const seen: boolean[] = [];
    const manifest = await extractPharnArchive(
      archiveWith(tree, UNLISTED),
      dir,
      (d) => {
        seen.push(existsSync(join(d, MANIFEST)), existsSync(join(d, SECURITY)));
      },
    );
    // Between the passes the manifest is on disk and no listed file is yet.
    expect(seen).toEqual([true, false]);
    expect(manifest.files.map((f) => f.path)).toContain(SECURITY);
    expect(readFileSync(join(dir, SECURITY), 'utf8')).toBe(tree[SECURITY]);
    expect(existsSync(join(dir, '.dev'))).toBe(false);
    // The tree check is optional (a local file has no tag to hold it to).
    const again = mkdtempSync(join(sandbox, 'local-'));
    await expect(
      extractPharnArchive(archiveWith(tree, UNLISTED), again),
    ).resolves.toMatchObject({ skillsVersion: '7.20.0' });
  });
});

// CORE-387: `pharn verify-archive`'s half in repo.ts — the same extraction in
// a private temp dir that is removed on a pass and on a refusal alike.
describe('verifyLocalArchive (CORE-387)', () => {
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pharn-repo-sandbox-'));
    process.env.TMPDIR = sandbox;
    process.env.TEMP = sandbox;
    process.env.TMP = sandbox;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('no network in this test');
      }),
    );
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(realTmp)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(sandbox, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('returns the manifest and removes its temp dir; checkTree sees the tree after the first pass', async () => {
    const tree = manifestTree('7.20.0');
    const seen: string[] = [];
    const manifest = await verifyLocalArchive(
      codeloadArchive(VALID_SHA, tree),
      (dir) => {
        seen.push(dir);
        expect(existsSync(join(dir, MANIFEST))).toBe(true);
        expect(existsSync(join(dir, SECURITY))).toBe(false);
      },
    );
    expect(manifest.skillsVersion).toBe('7.20.0');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.startsWith(join(sandbox, 'pharn-verify-'))).toBe(true);
    expect(leftoverTempDirs()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('removes its temp dir when the archive is refused, and rethrows the refusal', async () => {
    const tree = manifestTree('7.20.0');
    tree[SECURITY] = 'altered\n';
    const err = await verifyLocalArchive(
      codeloadArchive(VALID_SHA, tree),
      () => undefined,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamManifestError);
    expect(leftoverTempDirs()).toEqual([]);
  });

  it('removes its temp dir when checkTree throws', async () => {
    const err = await verifyLocalArchive(
      codeloadArchive(VALID_SHA, manifestTree('7.20.0')),
      () => {
        throw new ManifestValidationError('stop');
      },
    ).catch((e: unknown) => e);
    expect((err as Error).message).toBe('stop');
    expect(leftoverTempDirs()).toEqual([]);
  });
});
