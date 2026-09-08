import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  fetchRemoteSkillsVersion,
  readMinCli,
  readSkillsVersion,
} from '../src/lib/skills-version.js';
import { ManifestValidationError } from '../src/lib/validate.js';

// A REAL `Response`, not an object literal. `fetchRemoteSkillsVersion` streams
// `res.body` chunk by chunk, so a fake without a genuine `ReadableStream` cannot
// exercise the implementation at all — and one that reports a truthful, tiny
// `content-length` (the old helper did) can never reach either cap branch.
// `content-length` is set from the payload's BYTE length, which is what a real
// server sends and what the advisory fast-fail reads.
function fakeResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-length': String(new TextEncoder().encode(body).byteLength),
    },
  });
}

describe('readSkillsVersion', () => {
  const tmp = useTmpDir();

  it('reads and trims a valid SKILLS_VERSION', () => {
    writeFileSync(join(tmp.path(), 'SKILLS_VERSION'), '1.0.0\n');
    expect(readSkillsVersion(tmp.path())).toBe('1.0.0');
  });

  it('throws when the file is missing', () => {
    expect(() => readSkillsVersion(tmp.path())).toThrow(
      ManifestValidationError,
    );
  });

  it('throws on a non-semver value (P2 validation)', () => {
    writeFileSync(join(tmp.path(), 'SKILLS_VERSION'), 'not-a-version');
    expect(() => readSkillsVersion(tmp.path())).toThrow(/invalid format/);
  });
});

// ---------------------------------------------------------------------------
// readMinCli - the OPTIONAL upstream minimum-CLI handshake file, read from the
// clone beside SKILLS_VERSION. It deliberately does NOT mirror readSkillsVersion's
// throw: SKILLS_VERSION is required (a missing one is an upstream packaging bug),
// while MIN_CLI is optional, so "no constraint" is already a legal state. A throw
// here would become exit(1) in init/add/update, so one upstream typo in a one-line
// file would brick the whole released fleet - the exact outage the handshake exists
// to prevent. Tolerate-and-report instead: no constraint, plus a named warning.
// ---------------------------------------------------------------------------

describe('readMinCli', () => {
  const tmp = useTmpDir();

  it('absent file -> no constraint, and SILENT (upstream ships none today)', () => {
    expect(readMinCli(tmp.path())).toEqual({ version: null, warning: null });
  });

  it('reads and trims a well-formed value', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), '0.9.0\n');
    expect(readMinCli(tmp.path())).toEqual({ version: '0.9.0', warning: null });
  });

  it('accepts a prerelease value (VERSION_RE admits a trailing suffix)', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), '1.2.3-rc.1\n');
    expect(readMinCli(tmp.path()).version).toBe('1.2.3-rc.1');
  });

  it('malformed value -> no constraint PLUS a named warning, never a throw', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), 'not-a-version\n');
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning).toContain('MIN_CLI');
  });

  it('empty value -> no constraint plus a warning', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), '   \n');
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning).not.toBeNull();
  });

  it('unreadable (a directory at the path) -> no constraint plus a warning', () => {
    mkdirSync(join(tmp.path(), 'MIN_CLI'), { recursive: true });
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning).not.toBeNull();
  });

  it('never echoes untrusted bytes into the warning (P2)', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), 'x'.repeat(4000));
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning!.length).toBeLessThan(400);
  });

  // The bytes come from an untrusted clone, so the size is checked BEFORE the
  // read — a file too large to be a version is never slurped into a string.
  it('refuses to READ an oversized MIN_CLI, and still imposes no constraint', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), 'x'.repeat(2048));
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning).toContain('too large');
  });

  it('a version at the size boundary still reads normally', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), '1.2.3\n');
    expect(readMinCli(tmp.path()).version).toBe('1.2.3');
  });
});

describe('fetchRemoteSkillsVersion', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches and validates the remote version', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse('1.2.3\n'));
    await expect(fetchRemoteSkillsVersion()).resolves.toBe('1.2.3');
  });

  it('uses redirect:error and an abort signal (network guards)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(fakeResponse('1.0.0'));
    await fetchRemoteSkillsVersion();
    const opts = spy.mock.calls[0]![1]!;
    expect(opts.redirect).toBe('error');
    expect(opts.signal).toBeDefined();
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse('nope', 404));
    await expect(fetchRemoteSkillsVersion()).rejects.toThrow(/fetch failed/);
  });

  it('throws on an invalid remote value', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse('garbage!!'));
    await expect(fetchRemoteSkillsVersion()).rejects.toThrow(
      ManifestValidationError,
    );
  });

  // -------------------------------------------------------------------------
  // The 256KB body cap. Both branches were untestable before the streaming
  // rewrite (the old helper always declared a truthful, tiny content-length),
  // and the coverage thresholds in vitest.config.ts are GLOBAL — so deleting
  // the cap outright would not have turned CI red. These two cases are what
  // make it un-deletable.
  // -------------------------------------------------------------------------

  it('rejects an honestly-declared oversize WITHOUT reading the body', async () => {
    // The body is already errored, so touching it surfaces THIS message instead
    // of the cap error. That makes the `/too large/` assertion below its own
    // proof that the body was never read — no spy, no flag. (Both obvious
    // alternatives fail silently: `Response.prototype.body` is a prototype
    // getter, and a ReadableStream's `start` runs at construction, not at read.)
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error('body must not be read'));
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, {
        headers: { 'content-length': String(300 * 1024) },
      }),
    );
    await expect(fetchRemoteSkillsVersion()).rejects.toThrow(/too large/);
  });

  it('rejects an oversized chunked body by BYTE count, with no content-length', async () => {
    // Multi-byte is load-bearing, not stylistic. An ASCII body over the cap was
    // already rejected before the fix by the post-read `text.length` check, so
    // it would pin nothing. This payload is 100,000 UTF-16 code units but
    // 300,000 bytes: pre-fix it slipped past BOTH caps (a constructed stream
    // sends no content-length, and `Number(null) === 0` passes the fast-fail)
    // and died downstream in assertSafeString as /invalid format/ — a
    // rejection, but the wrong one, after the whole body was buffered.
    const payload = new TextEncoder().encode('\u4e00'.repeat(100_000));
    expect(payload.byteLength).toBeGreaterThan(256 * 1024);
    expect('\u4e00'.repeat(100_000).length).toBeLessThan(256 * 1024);
    const res = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(payload);
          c.close();
        },
      }),
    );
    expect(res.headers.get('content-length')).toBeNull();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);
    await expect(fetchRemoteSkillsVersion()).rejects.toThrow(/too large/);
  });

  it('reassembles a body that arrives in several chunks', async () => {
    // The success path above sends one chunk, so nothing else exercises the
    // offset accumulation in the merge loop — an off-by-one there would corrupt
    // the version silently rather than fail loudly. Decoding once over the
    // merged bytes (rather than per chunk) is also what makes a multi-byte
    // character split across a chunk boundary safe by construction.
    const encoder = new TextEncoder();
    const res = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          for (const part of ['1.', '2', '.3\n'])
            c.enqueue(encoder.encode(part));
          c.close();
        },
      }),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);
    await expect(fetchRemoteSkillsVersion()).resolves.toBe('1.2.3');
  });

  it('treats a bodyless response as empty, and rejects it as an invalid version', async () => {
    // `new Response(null)` has a null `body`, which the streaming reader must
    // handle rather than dereference. The outcome is the one `res.text()` gave:
    // empty text, refused by VERSION_RE — never a silent "no version".
    const res = new Response(null, { status: 204 });
    expect(res.body).toBeNull();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);
    await expect(fetchRemoteSkillsVersion()).rejects.toThrow(
      ManifestValidationError,
    );
  });

  // -------------------------------------------------------------------------
  // The 8s timeout. What this pins is pharn's half: the abort timer is still
  // ARMED while the body is being read. Move `clearTimeout` back in front of
  // the read and this case stops rejecting and hangs to vitest's own timeout.
  //
  // The half it does NOT pin, stated rather than implied: that undici wires the
  // request signal into a real response body stream. The mock supplies that
  // wiring here; asserting it for real would be asserting Node's behaviour, not
  // pharn's. A hand-constructed ReadableStream is connected to no
  // AbortController, so a fake body that merely never closes leaves
  // `reader.read()` pending forever and proves nothing.
  // -------------------------------------------------------------------------

  it('keeps the abort timer armed through the BODY read, not just the headers', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url, opts) =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                opts!.signal!.addEventListener('abort', () =>
                  c.error(
                    new DOMException(
                      'This operation was aborted',
                      'AbortError',
                    ),
                  ),
                );
              },
            }),
          ),
      );
      const pending = fetchRemoteSkillsVersion();
      const rejects = expect(pending).rejects.toThrow(/abort/i);
      await vi.advanceTimersByTimeAsync(8000);
      await rejects;
    } finally {
      vi.useRealTimers();
    }
  });
});
