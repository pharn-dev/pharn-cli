import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchCappedError, fetchCapped } from '../src/lib/fetch-capped.js';

// ---------------------------------------------------------------------------
// The one bounded GET every network read goes through (release resolve,
// commit resolve, SKILLS_VERSION, the tarball). What it owes each caller:
// `redirect: 'error'`, a deadline that answers on its own, and a byte cap
// counted on the wire — plus a released socket on every path that stops early.
// ---------------------------------------------------------------------------

const URL = 'https://example.invalid/thing';

/** A body whose cancellation is observable, optionally never closing. */
function observedBody(
  chunks: Uint8Array[],
  { hang = false } = {},
): { body: ReadableStream<Uint8Array>; cancelled: () => boolean } {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      if (!hang) c.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { body, cancelled: () => cancelled };
}

function stubFetch(answer: () => unknown): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => answer());
  vi.stubGlobal('fetch', mock);
  return mock;
}

const rejection = async (p: Promise<unknown>): Promise<FetchCappedError> =>
  (await p.catch((e: unknown) => e)) as FetchCappedError;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchCapped', () => {
  it('sends redirect:error and a signal, and returns the body bytes', async () => {
    const mock = stubFetch(() => new Response('hello'));
    const got = await fetchCapped(URL, { maxBytes: 100, ms: 1000 });
    expect(got).toEqual({ ok: true, status: 200, body: Buffer.from('hello') });
    const init = mock.mock.calls[0]![1] as RequestInit;
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toBeUndefined();
  });

  it('sends the Accept media type and the GitHub API version when asked', async () => {
    const mock = stubFetch(() => new Response('x'));
    await fetchCapped(URL, {
      accept: 'application/vnd.github.sha',
      maxBytes: 10,
      ms: 1000,
    });
    const headers = (mock.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers.Accept).toBe('application/vnd.github.sha');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('reassembles a body that arrives in several chunks', async () => {
    const enc = new TextEncoder();
    const { body } = observedBody(['1.', '2', '.3'].map((s) => enc.encode(s)));
    stubFetch(() => new Response(body));
    const got = await fetchCapped(URL, { maxBytes: 100, ms: 1000 });
    expect(got.ok && got.body.toString('utf8')).toBe('1.2.3');
  });

  it('reads a body of exactly maxBytes', async () => {
    stubFetch(() => new Response('x'.repeat(16)));
    const got = await fetchCapped(URL, { maxBytes: 16, ms: 1000 });
    expect(got.ok && got.body.byteLength).toBe(16);
  });

  it('reads a bodyless 2xx as empty bytes', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    expect(await fetchCapped(URL, { maxBytes: 16, ms: 1000 })).toEqual({
      ok: true,
      status: 204,
      body: Buffer.alloc(0),
    });
  });

  describe('the byte cap', () => {
    it('refuses a body over the cap by BYTES, and cancels the read', async () => {
      // 6 characters, 18 bytes: a UTF-16 length check would let it through.
      const payload = new TextEncoder().encode('一'.repeat(6));
      const { body, cancelled } = observedBody([payload], { hang: true });
      stubFetch(() => ({ ok: true, status: 200, body }));
      const err = await rejection(fetchCapped(URL, { maxBytes: 16, ms: 1000 }));
      expect(err).toBeInstanceOf(FetchCappedError);
      expect(err.kind).toBe('too-large');
      expect(err.message).toBe(`${URL} answered with more than 16 bytes`);
      expect(cancelled()).toBe(true);
    });

    it('stops pulling just past the cap, not after an unbounded read', async () => {
      let sent = 0;
      const chunk = new Uint8Array(512);
      const body = new ReadableStream<Uint8Array>({
        pull(c) {
          sent += chunk.byteLength;
          c.enqueue(chunk);
        },
      });
      stubFetch(() => ({ ok: true, status: 200, body }));
      const err = await rejection(
        fetchCapped(URL, { maxBytes: 1024, ms: 1000 }),
      );
      expect(err.kind).toBe('too-large');
      expect(sent).toBeLessThanOrEqual(4096);
    });

    it('refuses an honestly-declared oversize without reading the body', async () => {
      // Errored up front: reading it would surface THIS error, not the cap.
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.error(new Error('body must not be read'));
        },
      });
      stubFetch(
        () => new Response(body, { headers: { 'content-length': '17' } }),
      );
      const err = await rejection(fetchCapped(URL, { maxBytes: 16, ms: 1000 }));
      expect(err.kind).toBe('too-large');
    });
  });

  describe('the deadline', () => {
    it('answers at `ms` even when the abort never reaches the body, and cancels it', async () => {
      vi.useFakeTimers();
      const { body, cancelled } = observedBody([new Uint8Array([1])], {
        hang: true,
      });
      stubFetch(() => ({ ok: true, status: 200, body }));
      const pending = rejection(fetchCapped(URL, { maxBytes: 100, ms: 8000 }));
      await vi.advanceTimersByTimeAsync(7999);
      expect(cancelled()).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const err = await pending;
      expect(err.kind).toBe('timeout');
      expect(err.reason).toBe('timed out after 8s');
      expect(err.message).toBe(
        `Could not reach ${URL}: This operation was aborted (timed out after 8s)`,
      );
      expect(cancelled()).toBe(true);
    });

    it('answers at `ms` when the headers never arrive, and aborts the request signal', async () => {
      vi.useFakeTimers();
      let seen: AbortSignal | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: RequestInit) => {
          seen = init.signal!;
          return new Promise<never>(() => undefined);
        }),
      );
      const pending = rejection(fetchCapped(URL, { maxBytes: 100, ms: 500 }));
      await vi.advanceTimersByTimeAsync(500);
      expect((await pending).kind).toBe('timeout');
      expect(seen!.aborted).toBe(true);
    });

    it('leaves no timer behind once the body is read', async () => {
      vi.useFakeTimers();
      stubFetch(() => new Response('ok'));
      await fetchCapped(URL, { maxBytes: 100, ms: 1000 });
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('returns a non-2xx status with no body, and releases that body', async () => {
    const { body, cancelled } = observedBody([new Uint8Array([1])], {
      hang: true,
    });
    stubFetch(() => ({ ok: false, status: 403, body }));
    expect(await fetchCapped(URL, { maxBytes: 100, ms: 1000 })).toEqual({
      ok: false,
      status: 403,
    });
    expect(cancelled()).toBe(true);
  });

  describe('transport failures name the URL and keep the cause', () => {
    it('at the connect, with the cause text undici hides', async () => {
      const original = new TypeError('fetch failed', {
        cause: new Error('getaddrinfo ENOTFOUND example.invalid'),
      });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(original));
      const err = await rejection(
        fetchCapped(URL, { maxBytes: 100, ms: 1000 }),
      );
      expect(err.kind).toBe('unreachable');
      expect(err.reason).toBe(
        'fetch failed (getaddrinfo ENOTFOUND example.invalid)',
      );
      expect(err.message).toBe(`Could not reach ${URL}: ${err.reason}`);
      expect(err.cause).toBe(original);
    });

    it('with a non-Error cause and a non-Error throw', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockRejectedValue(new TypeError('fetch failed', { cause: 'x' })),
      );
      expect(
        (await rejection(fetchCapped(URL, { maxBytes: 9, ms: 1000 }))).reason,
      ).toBe('fetch failed (x)');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue('offline'));
      expect(
        (await rejection(fetchCapped(URL, { maxBytes: 9, ms: 1000 }))).reason,
      ).toBe('offline');
    });

    it('while reading the body', async () => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.error(new DOMException('This operation was aborted', 'AbortError'));
        },
      });
      stubFetch(() => new Response(body));
      const err = await rejection(
        fetchCapped(URL, { maxBytes: 100, ms: 1000 }),
      );
      expect(err.kind).toBe('unreachable');
      expect(err.message).toBe(
        `Could not reach ${URL}: This operation was aborted`,
      );
    });
  });
});
