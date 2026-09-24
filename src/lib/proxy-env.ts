/**
 * What a proxy set in the environment means for THIS run — the logic half
 * (detection). Message strings live in ./proxy-env-format.ts, which changes for
 * wording reasons while this file changes only when the transport does (P3,
 * mirroring model-routing.ts / model-routing-format.ts).
 *
 * The answer is now simple, and simpler than it used to be. pharn fetches
 * everything — the SHA resolve, the repo tarball, `SKILLS_VERSION` — through
 * Node's global `fetch`, and **Node's fetch does not read proxy environment
 * variables at all.** Not `https_proxy`, not `HTTPS_PROXY`, not `no_proxy`, on
 * any platform. So a user with a proxy configured is not partially proxied or
 * proxied-on-one-platform: they are not proxied, and every pharn network call
 * attempts direct egress.
 *
 * That is a real limit (LIMITS.md §3a), and it is worth a warning rather than a
 * silent failure: in a network where direct egress is blocked, the visible
 * symptom is a timeout with nothing pointing at the cause. Telling the user
 * their proxy is configured and unused turns a mystery into a known limitation.
 *
 * HISTORY, because the shape of this module still reflects it: the previous
 * clone path went through degit, which read `process.env.https_proxy` itself —
 * only that lowercase spelling, and never `no_proxy`. So the notice used to
 * classify (proxied vs. ignored-because-misspelled) and to gate its confidence
 * on the installed degit version. With degit retired there is no dependency
 * whose behavior needs measuring, and nothing reads any spelling, so the
 * classification and the version gate are both gone. What remains is the
 * detection and the redaction — the two parts that were about the USER's
 * environment rather than the dependency's quirks.
 */

/** The lowercase name every variant is compared against. */
const LOWER = 'https_proxy';
/** The uppercase spelling users reach for — preferred when several are set. */
const UPPER = 'HTTPS_PROXY';

/**
 * A proxy is configured and pharn will not use it. `name` is the variable
 * actually found — safe to print by construction, since only a key whose
 * lowercase equals `https_proxy` can reach it (one of 2^11 ASCII spellings; it
 * cannot carry a control character). `value` is raw and MUST be rendered through
 * `redactProxyUrl`, never echoed.
 */
export interface ProxyNotice {
  name: string;
  value: string;
  /**
   * Whether Node's fetch will actually use the proxy (PHARN-12). Node's fetch
   * reads no proxy variable BY DEFAULT, but recent Node versions route it
   * through the proxy when `NODE_USE_ENV_PROXY=1` or `--use-env-proxy` is set:
   * - `on`          — supported and turned on: pharn's downloads use the proxy;
   * - `available`   — supported but off: setting `NODE_USE_ENV_PROXY=1` would;
   * - `unsupported` — this Node has no such option (e.g. Node 20).
   */
  envProxy: 'on' | 'available' | 'unsupported';
}

/** What the running Node supports and was started with — injectable for tests. */
export interface ProxyRuntime {
  /** Does this Node know `--use-env-proxy`? */
  supportsEnvProxy: boolean;
  /** Node's own flags (`process.execArgv`). */
  execArgv: readonly string[];
}

const ENV_PROXY_FLAG = '--use-env-proxy';

/** The running process, read once per call. */
export function currentProxyRuntime(): ProxyRuntime {
  return {
    // A membership test the runtime answers itself: Node lists every option it
    // accepts, so there is no version table to keep up to date (P5).
    supportsEnvProxy: process.allowedNodeEnvironmentFlags.has(ENV_PROXY_FLAG),
    execArgv: process.execArgv,
  };
}

/** `--use-env-proxy` as a whole token (bare or `=value`), never a substring. */
function hasFlagToken(tokens: readonly string[]): boolean {
  return tokens.some(
    (t) => t === ENV_PROXY_FLAG || t.startsWith(`${ENV_PROXY_FLAG}=`),
  );
}

function envProxyState(
  env: Record<string, string | undefined>,
  runtime: ProxyRuntime,
): ProxyNotice['envProxy'] {
  if (!runtime.supportsEnvProxy) return 'unsupported';
  const on =
    env.NODE_USE_ENV_PROXY === '1' ||
    hasFlagToken(runtime.execArgv) ||
    hasFlagToken((env.NODE_OPTIONS ?? '').split(/\s+/));
  return on ? 'on' : 'available';
}

/** Present AND non-empty. An empty string is not a proxy setting. */
function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * Every key that case-insensitively spells `https_proxy` and has a non-empty
 * value, in a DETERMINISTIC order (P5): `HTTPS_PROXY` first when present, then
 * the rest sorted. Without the sort the answer would depend on env insertion
 * order, which is not a property any caller should depend on.
 */
function proxyVariantKeys(env: Record<string, string | undefined>): string[] {
  const keys = Object.keys(env)
    .filter((key) => key.toLowerCase() === LOWER && isSet(env[key]))
    .sort();
  return keys.includes(UPPER)
    ? [UPPER, ...keys.filter((k) => k !== UPPER)]
    : keys;
}

/**
 * Report a configured proxy, or `null` when none is set.
 *
 * Deterministic presence test (P5) over `env`, with no classification and no
 * I/O. Pure: `env` is a parameter, never read from `process.*`, so every row is
 * exercisable from a test on any host. No `platform` argument any more — the
 * old one existed only because Node's `process.env` is case-insensitive on
 * win32 and degit's read was case-sensitive, a distinction that mattered when
 * one spelling worked and another did not. None of them work now, so the
 * platform cannot change the answer.
 *
 * The terminal case is `null` — SILENCE — the complete and correct answer when
 * nothing is set, not a degraded fallback.
 */
export function detectProxyNotice(
  env: Record<string, string | undefined>,
  runtime: ProxyRuntime = currentProxyRuntime(),
): ProxyNotice | null {
  const name = proxyVariantKeys(env)[0];
  if (name === undefined) return null;
  const value = env[name];
  return isSet(value)
    ? { name, value, envProxy: envProxyState(env, runtime) }
    : null;
}
