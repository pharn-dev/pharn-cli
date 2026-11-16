import { withDeadline } from './deadline.js';

// ---------------------------------------------------------------------------
// The one bounded GET. Every network read pharn makes (the release and commit
// resolves, the SKILLS_VERSION check, the tarball) goes through `fetchCapped`,
// so the network floor is stated once: `redirect: 'error'`, a deadline over the
// fetch AND the body read, and a byte cap counted on the wire as the body
// streams (not `res.text()` plus a length check, which buffers everything
// first and counts UTF-16 units).
//
// The deadline is `withDeadline`, not a bare abort timer: only `init` and
// `update` enforce the Node floor, so `add`, `status`, `list` and `remove` can
// still run on a Node whose undici may never forward the abort into the body
// (lib/deadline.ts). For the same reason the reader is cancelled from our own
// signal, which releases the socket at the deadline either way.
//
// A non-2xx is returned, its body released (an unread body holds its socket,
// and with it the process). Every other way the read stops is one
// `FetchCappedError`, whose `kind` lets each caller word it.
// ---------------------------------------------------------------------------

/** The REST API version pinned on every request that names a media type. */
const GITHUB_API_VERSION = '2022-11-28';

export interface FetchCappedOptions {
  // A GitHub REST media type; when set, the API version header is sent too.
  accept?: string;
  // The body is refused the first time its byte count exceeds this.
  maxBytes: number;
  // The deadline over the request AND the body read, in milliseconds.
  ms: number;
}

/** A 2xx with its body bytes (empty when bodyless), or a bare non-2xx status. */
export type CappedResponse =
  { ok: true; status: number; body: Buffer } | { ok: false; status: number };

export type FetchFailure = 'unreachable' | 'timeout' | 'too-large';

/**
 * Why a capped read stopped. `reason` is the part after the URL, for a caller
 * that names the URL itself; `message` is complete on its own.
 */
export class FetchCappedError extends Error {
  constructor(
    readonly kind: FetchFailure,
    readonly url: string,
    readonly reason: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'FetchCappedError';
  }
}

/**
 * GET `url` under the network floor. Resolves with the body of a 2xx or the
 * status of anything else; rejects only with a {@link FetchCappedError}.
 */
export async function fetchCapped(
  url: string,
  { accept, maxBytes, ms }: FetchCappedOptions,
): Promise<CappedResponse> {
  const timeout = `timed out after ${ms / 1000}s`;
  return withDeadline(
    ms,
    () =>
      new FetchCappedError(
        'timeout',
        url,
        timeout,
        `Could not reach ${url}: This operation was aborted (${timeout})`,
      ),
    async (signal) => {
      // Annotated, so the compiler treats a call as the throw it is.
      const unreachable: (err: unknown) => never = rethrowUnreachable(url);
      let res: Response;
      try {
        res = await fetch(url, {
          redirect: 'error',
          signal,
          ...(accept === undefined
            ? {}
            : {
                headers: {
                  Accept: accept,
                  'X-GitHub-Api-Version': GITHUB_API_VERSION,
                },
              }),
        });
      } catch (err) {
        unreachable(err);
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, status: res.status };
      }
      const tooLarge = (): FetchCappedError =>
        new FetchCappedError(
          'too-large',
          url,
          `answered with more than ${maxBytes} bytes`,
          `${url} answered with more than ${maxBytes} bytes`,
        );
      // ADVISORY: `content-length` is the remote's own claim (absent when
      // chunked, free to lie), so it only refuses an honestly declared
      // oversize before a byte is read. The streamed count below is the cap.
      const declared = Number(res.headers?.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await res.body?.cancel().catch(() => undefined);
        throw tooLarge();
      }
      if (!res.body)
        return { ok: true, status: res.status, body: Buffer.alloc(0) };
      const reader = res.body.getReader();
      const cancel = (): void => {
        reader.cancel().catch(() => undefined);
      };
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, { once: true });
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read().catch(unreachable);
          if (done) break;
          total += value.byteLength;
          // At most one runtime-sized chunk past the cap is ever held.
          if (total > maxBytes) {
            cancel();
            throw tooLarge();
          }
          chunks.push(value);
        }
      } finally {
        signal.removeEventListener('abort', cancel);
      }
      return { ok: true, status: res.status, body: Buffer.concat(chunks) };
    },
  );
}

/**
 * Offline, undici rejects with a bare `TypeError: fetch failed` (the diagnosis
 * hides in `err.cause`) and an abort with `This operation was aborted`; neither
 * names a host. The original rides as `cause` for `PHARN_DEBUG=1`.
 */
function rethrowUnreachable(url: string): (err: unknown) => never {
  return (err) => {
    const message = err instanceof Error ? err.message : String(err);
    const inner = err instanceof Error ? err.cause : undefined;
    const cause =
      inner === undefined
        ? ''
        : ` (${inner instanceof Error ? inner.message : String(inner)})`;
    const reason = `${message}${cause}`;
    throw new FetchCappedError(
      'unreachable',
      url,
      reason,
      `Could not reach ${url}: ${reason}`,
      { cause: err },
    );
  };
}
