import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPO } from '../src/lib/constants.js';
import {
  channelOf,
  ReleaseResolveError,
  resolveSource,
  sourceDescription,
  sourceLabel,
} from '../src/lib/release.js';

// ---------------------------------------------------------------------------
// The verified-release resolver. The default channel installs the tip of
// pharn-oss main; `--ref latest` installs the newest pharn-oss GitHub release
// (created only after post-merge CI passed), and when that release cannot be
// resolved the command REFUSES and names `--ref main` — it never floats to the
// tip on its own.
// ---------------------------------------------------------------------------

const SHA = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
const RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const shaUrl = (tag: string) =>
  `https://api.github.com/repos/${REPO}/commits/${tag}`;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

/** Answer exactly the two URLs the resolver may request, and nothing else. */
function stub(
  release: Response | (() => Response),
  sha: Response | (() => Response) = new Response(SHA),
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string) => {
    if (url === RELEASE_URL)
      return typeof release === 'function' ? release() : release;
    if (url.startsWith(shaUrl('')))
      return typeof sha === 'function' ? sha() : sha;
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('resolveSource', () => {
  it('`main` makes no request at all — fetchRepo resolves the tip', async () => {
    const mock = stub(json({}));
    await expect(resolveSource('main')).resolves.toEqual({ kind: 'main' });
    expect(mock).not.toHaveBeenCalled();
  });

  it('`latest` resolves the newest release to its tag, version and commit', async () => {
    const mock = stub(
      json({ tag_name: 'v6.54.1', draft: false, prerelease: false }),
    );

    await expect(resolveSource('latest')).resolves.toEqual({
      kind: 'release',
      tag: 'v6.54.1',
      version: '6.54.1',
      sha: SHA,
    });

    expect(mock.mock.calls.map((c) => c[0])).toEqual([
      RELEASE_URL,
      shaUrl('v6.54.1'),
    ]);
  });

  it('sends the network floor on both requests: redirect:error, a signal, an Accept', async () => {
    const mock = stub(json({ tag_name: 'v1.0.0' }));
    await resolveSource('latest');
    const [release, sha] = mock.mock.calls.map((c) => c[1] as RequestInit);
    for (const init of [release!, sha!]) {
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeDefined();
    }
    expect((sha!.headers as Record<string, string>).Accept).toBe(
      'application/vnd.github.sha',
    );
  });

  it('trims the bare SHA the sha media type answers with', async () => {
    stub(json({ tag_name: 'v1.0.0' }), new Response(`${SHA}\n`));
    await expect(resolveSource('latest')).resolves.toMatchObject({ sha: SHA });
  });

  describe('FAILS CLOSED, naming --ref main — never a fallback to the tip', () => {
    async function refusal(): Promise<string> {
      const err = await resolveSource('latest').then(
        () => {
          throw new Error('resolved, but should have refused');
        },
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ReleaseResolveError);
      const message = (err as Error).message;
      expect(message).toContain('--ref main');
      return message;
    }

    it('when no release has been published (404)', async () => {
      stub(json({ message: 'Not Found' }, 404));
      expect(await refusal()).toContain('has published no release yet');
    });

    it.each([403, 429])(
      'when GitHub rate-limits the request (%i), saying so',
      async (status) => {
        stub(json({ message: 'rate limit' }, status));
        expect(await refusal()).toContain('60 requests an hour');
      },
    );

    it('on any other non-2xx', async () => {
      stub(json({}, 500));
      expect(await refusal()).toContain('HTTP 500');
    });

    it('when the API is unreachable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('fetch failed');
        }),
      );
      const message = await refusal();
      expect(message).toContain('could not reach');
      expect(message).toContain('fetch failed');
    });

    it('at the 8s deadline, even when the abort never reaches the body', async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          status: 200,
          body: new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode('{'));
            },
          }),
        })),
      );
      const pending = resolveSource('latest');
      const rejects = expect(pending).rejects.toThrow(/timed out after 8s/);
      await vi.advanceTimersByTimeAsync(8000);
      await rejects;
    });

    it('when the body is not JSON', async () => {
      stub(new Response('<html>'));
      expect(await refusal()).toContain('did not answer with JSON');
    });

    it('when the body is not a release object', async () => {
      stub(json(['v1.0.0']));
      expect(await refusal()).toContain('release object');
    });

    it('when the body exceeds the cap', async () => {
      stub(new Response('x'.repeat(1024 * 1024 + 1)));
      expect(await refusal()).toContain('more than');
    });

    it.each([
      ['a prerelease tag', 'v1.2.3-rc.1'],
      ['a tag without the v', '1.2.3'],
      ['a two-part tag', 'v1.2'],
      ['a padded tag', ' v1.2.3'],
      ['a path-shaped tag', 'v1.2.3/../../x'],
    ])('when the tag is %s', async (_label, tag) => {
      stub(json({ tag_name: tag }));
      expect(await refusal()).toContain('is not a plain vX.Y.Z version');
    });

    it('when the tag is missing', async () => {
      stub(json({ name: 'no tag' }));
      expect(await refusal()).toContain('(missing)');
    });

    // The tag is untrusted text that is DISPLAYED: no terminal control
    // character may reach the message.
    it('strips control characters from a hostile tag before displaying it', async () => {
      stub(json({ tag_name: 'v1.2.3\u001b]52;c;QQ==\u0007' }));
      const message = await refusal();
      expect(message).not.toContain('\u001b');
      expect(message).not.toContain('\u0007');
    });

    it.each([
      ['draft', { draft: true }],
      ['prerelease', { prerelease: true }],
    ])('when the release is marked %s', async (label, flags) => {
      stub(json({ tag_name: 'v1.0.0', ...flags }));
      expect(await refusal()).toContain(`marked ${label}`);
    });

    it('when the tag cannot be resolved to a commit', async () => {
      stub(json({ tag_name: 'v1.0.0' }), json({}, 422));
      expect(await refusal()).toContain('could not resolve v1.0.0 to a commit');
    });

    it('when the commit id is malformed', async () => {
      stub(json({ tag_name: 'v1.0.0' }), new Response('not-a-sha'));
      expect(await refusal()).toContain('did not answer with a commit id');
    });

    it('releases the body of a non-2xx instead of leaving it streaming', async () => {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('{}'));
        },
        cancel() {
          cancelled = true;
        },
      });
      stub(new Response(body, { status: 503 }));
      await refusal();
      expect(cancelled).toBe(true);
    });
  });
});

describe('channelOf', () => {
  it('follows verified releases only for the literal "latest"', () => {
    expect(channelOf({ ref: 'latest' })).toBe('latest');
  });

  it.each([undefined, 'main', 'Latest', '', 1, null])(
    'otherwise follows main (%j)',
    (ref) => {
      expect(channelOf({ ref })).toBe('main');
    },
  );
});

describe('labels', () => {
  const release = {
    kind: 'release' as const,
    tag: 'v6.54.1',
    version: '6.54.1',
    sha: SHA,
  };

  it('names the release or main in the source label', () => {
    expect(sourceLabel(release)).toBe(`${REPO}@v6.54.1`);
    expect(sourceLabel({ kind: 'main' })).toBe(`${REPO}@main`);
  });

  it('says which source is a verified release and which is the tip', () => {
    expect(sourceDescription(release)).toBe('verified release v6.54.1');
    expect(sourceDescription({ kind: 'main' })).toBe('main (tip)');
  });
});
