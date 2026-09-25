import { describe, expect, it } from 'vitest';
import { detectProxyNotice, type ProxyRuntime } from '../src/lib/proxy-env.js';

// detectProxyNotice is pure over an injected env record and runtime — it never
// reads process.* — so every row here runs identically on any host.
//
// Every row is a MEASUREMENT, not a reading of Node's docs: a local proxy that
// logs CONNECTs, a client `fetch`ing https://example.com under `env -i`, on the
// official 20.20.2, 21.7.3, 22.20.0, 22.21.0, 22.22.2, 23.11.1, 24.0.0, 24.4.1
// and 24.5.0 binaries. The notice must say what that fetch actually does.

/** A Node that knows --use-env-proxy (22.21+, 24.5+). */
const MODERN: ProxyRuntime = {
  supportsEnvProxy: true,
  execArgv: [],
  nodeVersion: '24.5.0',
};
/** 24.0–24.4: the variable works, the flag does not exist yet. */
const EARLY_24: ProxyRuntime = {
  supportsEnvProxy: false,
  execArgv: [],
  nodeVersion: '24.4.1',
};
/** 20.x, 21.x, 22.0–22.20, 23.x: nothing turns it on. */
const NONE: ProxyRuntime = {
  supportsEnvProxy: false,
  execArgv: [],
  nodeVersion: '20.20.2',
};

const P = 'http://proxy:3128';

describe('detectProxyNotice — which variable Node reads', () => {
  it('is silent when nothing is set', () => {
    expect(detectProxyNotice({}, MODERN)).toBeNull();
  });

  it('is silent for an empty value — an empty string is not a setting', () => {
    expect(detectProxyNotice({ https_proxy: '' }, MODERN)).toBeNull();
    expect(detectProxyNotice({ HTTPS_PROXY: '' }, MODERN)).toBeNull();
  });

  it.each(['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY'])(
    'reports %s, a spelling Node reads',
    (name) => {
      expect(detectProxyNotice({ [name]: P }, NONE)).toEqual({
        name,
        value: P,
        envProxy: 'unsupported',
      });
    },
  );

  // Measured: lowercase:18081 + UPPER:18082 → the CONNECT went to 18081.
  it('names the lowercase variable when both cases are set — the one Node uses', () => {
    const notice = detectProxyNotice(
      { https_proxy: 'http://lower:1', HTTPS_PROXY: 'http://upper:1' },
      MODERN,
    );
    expect(notice).toMatchObject({
      name: 'https_proxy',
      value: 'http://lower:1',
    });
  });

  // Measured: with only HTTP_PROXY set and the opt-in on, an https fetch still
  // went through it (undici falls back from the https agent to the http one).
  it('reports HTTP_PROXY alone, because https requests fall back to it', () => {
    expect(detectProxyNotice({ HTTP_PROXY: P }, MODERN)).toMatchObject({
      name: 'HTTP_PROXY',
      envProxy: 'available',
    });
  });

  it('prefers the https pair to the http pair', () => {
    expect(
      detectProxyNotice(
        { HTTPS_PROXY: 'http://s:1', http_proxy: 'http://h:1' },
        MODERN,
      ),
    ).toMatchObject({ name: 'HTTPS_PROXY' });
  });

  // Measured: https_proxy='' with HTTPS_PROXY set → DIRECT; with HTTP_PROXY set
  // as well → through HTTP_PROXY. undici's lookup is `??`, so a PRESENT empty
  // value shadows the next spelling rather than being skipped.
  it('lets an empty https_proxy shadow HTTPS_PROXY, as Node does', () => {
    expect(
      detectProxyNotice({ https_proxy: '', HTTPS_PROXY: 'http://s:1' }, MODERN),
    ).toBeNull();
    expect(
      detectProxyNotice(
        {
          https_proxy: '',
          HTTPS_PROXY: 'http://s:1',
          HTTP_PROXY: 'http://h:1',
        },
        MODERN,
      ),
    ).toMatchObject({ name: 'HTTP_PROXY', value: 'http://h:1' });
  });

  it('ignores unrelated variables', () => {
    expect(detectProxyNotice({ NO_PROXY: 'x', PATH: '/' }, MODERN)).toBeNull();
  });
});

// Measured: `Https_Proxy` with the opt-in on → DIRECT. On POSIX Node reads the
// four exact spellings only. (On win32 `process.env` is case-insensitive, so the
// exact lookups find a mixed-case key there and this branch is never reached.)
describe('detectProxyNotice — a spelling Node never reads', () => {
  it('reports it as ignored, never as proxied', () => {
    expect(
      detectProxyNotice({ Https_Proxy: P, NODE_USE_ENV_PROXY: '1' }, MODERN),
    ).toEqual({ name: 'Https_Proxy', value: P, envProxy: 'ignored-spelling' });
  });

  it('stays silent about it when a spelling Node reads is also set', () => {
    expect(
      detectProxyNotice({ Https_Proxy: 'http://x:1', https_proxy: P }, MODERN),
    ).toMatchObject({ name: 'https_proxy' });
  });

  it('picks deterministically among several (sorted), whatever the insertion order', () => {
    expect(
      detectProxyNotice(
        { hTTPS_PROXY: P, HTTPS_proxy: P, Http_Proxy: P },
        MODERN,
      )?.name,
    ).toBe('HTTPS_proxy');
  });
});

describe('detectProxyNotice — whether fetch uses it (22.21+ / 24.5+)', () => {
  const env = { HTTPS_PROXY: P };

  it.each([
    ['NODE_USE_ENV_PROXY=1', { ...env, NODE_USE_ENV_PROXY: '1' }, [], 'on'],
    // Measured: on 22.22.2 and 24.5.0 only the value `1` counts.
    [
      'NODE_USE_ENV_PROXY=true',
      { ...env, NODE_USE_ENV_PROXY: 'true' },
      [],
      'available',
    ],
    [
      'NODE_USE_ENV_PROXY=0',
      { ...env, NODE_USE_ENV_PROXY: '0' },
      [],
      'available',
    ],
    ['--use-env-proxy on the command line', env, ['--use-env-proxy'], 'on'],
    // Node accepts `_` for `-` in option names; the old check knew only `-`.
    ['--use_env_proxy on the command line', env, ['--use_env_proxy'], 'on'],
    [
      '--use_env_proxy in NODE_OPTIONS',
      { ...env, NODE_OPTIONS: '--max-old-space-size=512 --use_env_proxy' },
      [],
      'on',
    ],
    // Measured: `=false` still turned it ON.
    ['--use-env-proxy=false', env, ['--use-env-proxy=false'], 'on'],
    // Measured: the negation wins over the variable…
    [
      'NODE_USE_ENV_PROXY=1 + --no-use-env-proxy',
      { ...env, NODE_USE_ENV_PROXY: '1' },
      ['--no-use-env-proxy'],
      'available',
    ],
    [
      'NODE_USE_ENV_PROXY=1 + --no-use_env_proxy in NODE_OPTIONS',
      { ...env, NODE_USE_ENV_PROXY: '1', NODE_OPTIONS: '--no-use_env_proxy' },
      [],
      'available',
    ],
    // …and the LAST token wins, the command line after NODE_OPTIONS.
    [
      '--no-… then --use-…',
      env,
      ['--no-use-env-proxy', '--use-env-proxy'],
      'on',
    ],
    [
      '--use-… then --no-…',
      env,
      ['--use-env-proxy', '--no-use-env-proxy'],
      'available',
    ],
    [
      'NODE_OPTIONS on, command line off',
      { ...env, NODE_OPTIONS: '--use-env-proxy' },
      ['--no-use-env-proxy'],
      'available',
    ],
    [
      'NODE_OPTIONS off, command line on',
      { ...env, NODE_OPTIONS: '--no-use-env-proxy' },
      ['--use-env-proxy'],
      'on',
    ],
    [
      'a longer flag that merely starts the same (token, not substring)',
      { ...env, NODE_OPTIONS: '--use-env-proxy-foo' },
      [],
      'available',
    ],
    ['nothing set', env, [], 'available'],
  ])('%s → %s', (_label, e, execArgv, expected) => {
    expect(
      detectProxyNotice(e as Record<string, string>, { ...MODERN, execArgv })
        ?.envProxy,
    ).toBe(expected);
  });

  it('marks a run the user opted out of, so the notice can say why', () => {
    expect(
      detectProxyNotice(
        { ...env, NODE_USE_ENV_PROXY: '1' },
        { ...MODERN, execArgv: ['--no-use-env-proxy'] },
      ),
    ).toMatchObject({ envProxy: 'available', optedOut: true });
  });
});

describe('detectProxyNotice — Nodes without the flag', () => {
  const env = { HTTPS_PROXY: P };

  // Measured on 24.0.0 and 24.4.1: the variable works there although
  // --use-env-proxy does not exist yet — and ANY non-empty value turns it on.
  it.each(['1', 'true', '0'])(
    '24.0–24.4 with NODE_USE_ENV_PROXY=%s → on',
    (value) => {
      expect(
        detectProxyNotice({ ...env, NODE_USE_ENV_PROXY: value }, EARLY_24)
          ?.envProxy,
      ).toBe('on');
    },
  );

  it('24.0–24.4 without it → available (the variable would work)', () => {
    expect(detectProxyNotice(env, EARLY_24)?.envProxy).toBe('available');
  });

  it.each(['20.20.2', '21.7.3', '22.20.0', '23.11.1'])(
    '%s → unsupported, whatever is set',
    (nodeVersion) => {
      expect(
        detectProxyNotice(
          { ...env, NODE_USE_ENV_PROXY: '1', NODE_OPTIONS: '--use-env-proxy' },
          { ...NONE, nodeVersion },
        )?.envProxy,
      ).toBe('unsupported');
    },
  );
});
