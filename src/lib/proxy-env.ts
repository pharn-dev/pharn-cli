/**
 * What a proxy set in the environment means for THIS run — detection only;
 * message strings live in ./proxy-env-format.ts.
 *
 * pharn fetches everything through Node's global `fetch`, which by DEFAULT
 * reads no proxy variable: a configured proxy is bypassed, and where direct
 * egress is blocked the symptom is a bare timeout (LIMITS.md §3a). Recent Nodes
 * can opt in, so the notice says, before the fetch, which case applies.
 *
 * The rules were measured on official Node binaries from 20 to 24.5 (pinned
 * by tests/proxy-env.test.ts):
 * - WHICH VARIABLE: undici's lookup, `https_proxy ?? HTTPS_PROXY`, then
 *   `http_proxy ?? HTTP_PROXY` when that pair gave nothing. `??`, not "first
 *   non-empty": a PRESENT empty `https_proxy` shadows `HTTPS_PROXY`. Exact
 *   spellings only on POSIX — `Https_Proxy` is never read.
 * - WHETHER IT IS USED: where Node knows `--use-env-proxy` (22.21+, 24.5+), the
 *   last `--use-env-proxy` / `--no-use-env-proxy` token decides (`-` or `_`,
 *   NODE_OPTIONS first, then the command line; `=false` still turns it ON), and
 *   with no token only `NODE_USE_ENV_PROXY=1` does. On 24.0–24.4 ANY non-empty
 *   `NODE_USE_ENV_PROXY` turns it on. Everywhere else nothing does.
 */

/** The spellings Node reads, in undici's lookup order (https pair first). */
const HTTPS_VARS = ['https_proxy', 'HTTPS_PROXY'] as const;
const HTTP_VARS = ['http_proxy', 'HTTP_PROXY'] as const;
const READ_SPELLINGS: ReadonlySet<string> = new Set([
  ...HTTPS_VARS,
  ...HTTP_VARS,
]);

/**
 * A proxy variable is set. `name` is safe to print by construction: it is one
 * of the four spellings Node reads, or a key that case-folds to one of them —
 * ASCII letters and `_` only, so it cannot carry a control character. `value`
 * is raw and MUST be rendered through `redactProxyUrl`, never echoed.
 */
export interface ProxyNotice {
  name: string;
  value: string;
  /**
   * Whether Node's fetch will actually use it:
   * - `on`               — this Node routes fetch through it: pharn's downloads do;
   * - `available`        — this Node could, but the opt-in is off;
   * - `unsupported`      — this Node has no opt-in at all;
   * - `ignored-spelling` — Node never reads this spelling (e.g. `Https_Proxy`).
   */
  envProxy: 'on' | 'available' | 'unsupported' | 'ignored-spelling';
  /** `available` because a `--no-use-env-proxy` token turned it off. */
  optedOut?: true;
}

/** What the running Node supports and was started with — injectable for tests. */
export interface ProxyRuntime {
  /** Does this Node know `--use-env-proxy`? */
  supportsEnvProxy: boolean;
  /** Node's own flags (`process.execArgv`). */
  execArgv: readonly string[];
  /** `process.versions.node`, e.g. `24.4.1`. */
  nodeVersion: string;
}

/** The running process, read once per call. */
export function currentProxyRuntime(): ProxyRuntime {
  return {
    // Node lists every option it accepts; the version below is consulted ONLY
    // where this says no.
    supportsEnvProxy:
      process.allowedNodeEnvironmentFlags.has('--use-env-proxy'),
    execArgv: process.execArgv,
    nodeVersion: process.versions.node,
  };
}

/**
 * `--use-env-proxy` / `--no-use-env-proxy`, with `-` or `_`, as a WHOLE token
 * (bare or `=value`), never a substring. Group 1 is set for the negation.
 */
const FLAG_RE = /^--(no[-_])?use[-_]env[-_]proxy(?:=.*)?$/;

/**
 * The opt-in's state from the flags alone: the LAST flag token, or `null`.
 * NODE_OPTIONS first, then the command line (Node's order). NODE_OPTIONS is
 * split on whitespace; Node's double-quoting there is not modelled, but a flag
 * token never contains a space.
 */
function lastFlag(
  env: Record<string, string | undefined>,
  execArgv: readonly string[],
): boolean | null {
  let state: boolean | null = null;
  for (const token of [...(env.NODE_OPTIONS ?? '').split(/\s+/), ...execArgv]) {
    const m = FLAG_RE.exec(token);
    if (m) state = m[1] === undefined;
  }
  return state;
}

/**
 * 24.0–24.4: `NODE_USE_ENV_PROXY` worked before the flag existed (24.5). Only
 * reached when the runtime does not list the flag.
 */
function isEarly24(nodeVersion: string): boolean {
  const [major, minor] = nodeVersion.split('.').map(Number);
  return major === 24 && minor !== undefined && minor <= 4;
}

function envProxyState(
  env: Record<string, string | undefined>,
  runtime: ProxyRuntime,
): Pick<ProxyNotice, 'envProxy' | 'optedOut'> {
  if (runtime.supportsEnvProxy) {
    const flag = lastFlag(env, runtime.execArgv);
    if (flag === false) return { envProxy: 'available', optedOut: true };
    return {
      envProxy:
        flag === true || env.NODE_USE_ENV_PROXY === '1' ? 'on' : 'available',
    };
  }
  if (isEarly24(runtime.nodeVersion)) {
    return { envProxy: isSet(env.NODE_USE_ENV_PROXY) ? 'on' : 'available' };
  }
  return { envProxy: 'unsupported' };
}

/** Present AND non-empty. An empty string is not a proxy setting. */
function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/** undici's `a ?? b`: the first PRESENT spelling, even if its value is empty. */
function firstPresent(
  env: Record<string, string | undefined>,
  names: readonly string[],
): { name: string; value: string } | null {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined) return { name, value };
  }
  return null;
}

/**
 * The variable Node's fetch would use for an https URL, or `null`. By exact
 * key (on win32 `process.env` itself is case-insensitive, as Node finds it).
 */
function readVariable(
  env: Record<string, string | undefined>,
): { name: string; value: string } | null {
  const https = firstPresent(env, HTTPS_VARS);
  if (https !== null && https.value !== '') return https;
  const http = firstPresent(env, HTTP_VARS);
  return http !== null && http.value !== '' ? http : null;
}

/**
 * A set key that only CASE-FOLDS to a spelling Node reads (`Https_Proxy`).
 * Sorted, so several such keys give one deterministic answer.
 */
function ignoredSpelling(
  env: Record<string, string | undefined>,
): { name: string; value: string } | null {
  const name = Object.keys(env)
    .filter(
      (key) =>
        !READ_SPELLINGS.has(key) &&
        READ_SPELLINGS.has(key.toLowerCase()) &&
        isSet(env[key]),
    )
    .sort()[0];
  return name === undefined ? null : { name, value: env[name]! };
}

/**
 * Report a configured proxy, or `null` (silence) when none is set. Pure:
 * `env` and `runtime` are parameters, so every measured row is testable.
 */
export function detectProxyNotice(
  env: Record<string, string | undefined>,
  runtime: ProxyRuntime = currentProxyRuntime(),
): ProxyNotice | null {
  const read = readVariable(env);
  if (read !== null) return { ...read, ...envProxyState(env, runtime) };
  const ignored = ignoredSpelling(env);
  return ignored === null ? null : { ...ignored, envProxy: 'ignored-spelling' };
}
