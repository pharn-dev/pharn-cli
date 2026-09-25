/**
 * What a proxy set in the environment means for THIS run — the logic half
 * (detection). Message strings live in ./proxy-env-format.ts, which changes for
 * wording reasons while this file changes only when the transport does (P3,
 * mirroring model-config.ts / model-config-format.ts).
 *
 * pharn fetches everything — the SHA resolve, the repo tarball,
 * `SKILLS_VERSION` — through Node's global `fetch`. By DEFAULT that fetch reads
 * no proxy environment variable at all, so a user with a proxy configured
 * connects directly, and in a network that blocks direct egress the visible
 * symptom is a timeout with nothing pointing at the cause (LIMITS.md §3a).
 * Recent Nodes can opt in (`NODE_USE_ENV_PROXY=1` / `--use-env-proxy`), which
 * is why the notice has to say, before the fetch, which case applies.
 *
 * Every rule below was MEASURED (PHARN-12's first version was inferred, and was
 * wrong on four counts): a local proxy logging CONNECTs, a client `fetch`ing an
 * https URL under `env -i`, on the official 20.20.2, 21.7.3, 22.20.0, 22.21.0,
 * 22.22.2, 23.11.1, 24.0.0, 24.4.1 and 24.5.0 binaries.
 *
 * - WHICH VARIABLE: undici's own lookup, `https_proxy ?? HTTPS_PROXY`, then
 *   `http_proxy ?? HTTP_PROXY` for an https URL whose pair gave nothing. `??`,
 *   not "first non-empty": a PRESENT empty `https_proxy` shadows `HTTPS_PROXY`.
 *   Exact spellings only on POSIX — `Https_Proxy` is never read.
 * - WHETHER IT IS USED: where Node knows `--use-env-proxy` (22.21+, 24.5+), the
 *   last `--use-env-proxy` / `--no-use-env-proxy` token decides (either `-` or
 *   `_`, NODE_OPTIONS first, then the command line; `=false` still turns it ON),
 *   and with no token only `NODE_USE_ENV_PROXY=1` does. On 24.0–24.4 the flag
 *   does not exist yet, but ANY non-empty `NODE_USE_ENV_PROXY` turns it on.
 *   Everywhere else (20, 21, 22.0–22.20, 23) nothing does.
 *
 * HISTORY: the clone once went through degit, which read `https_proxy` itself;
 * with degit retired, Node's own rules are the only ones that matter.
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
    // A membership test the runtime answers itself: Node lists every option it
    // accepts (P5). The version below is consulted ONLY where this says no.
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
 * The opt-in's state from the flags alone: `true` / `false` from the LAST flag
 * token, `null` when there is none. NODE_OPTIONS is read first and the command
 * line after it, which is Node's own order. NODE_OPTIONS is split on
 * whitespace; Node also honours double-quoted arguments there, which this does
 * not model — a flag token never contains a space, so no real flag is misread.
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
 * 24.0–24.4: `NODE_USE_ENV_PROXY` already worked there, before the flag
 * existed (24.5). The one version test in this file — only reached when the
 * runtime does not list the flag, so a future Node that does is classified by
 * the membership test, never by this window.
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
 * key — on win32 `process.env` itself is case-insensitive, so a mixed-case key
 * is found there, exactly as Node finds it.
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
 * Sorted, so several such keys give one deterministic answer (P5), never the
 * env object's insertion order.
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
 * Report a configured proxy, or `null` when none is set.
 *
 * Pure: `env` and `runtime` are parameters, never read from `process.*` here, so
 * every measured row is exercisable from a test on any host. The terminal case
 * is `null` — SILENCE — the complete and correct answer when nothing is set.
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
