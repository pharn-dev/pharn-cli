import { createRequire } from 'node:module';

/**
 * What degit's proxy handling means for THIS run — the logic half (detection +
 * version membership). Message strings live in ./proxy-env-format.ts, which
 * changes for wording reasons while this file changes only when degit's measured
 * behavior does (P3, mirroring model-routing.ts / model-routing-format.ts).
 *
 * degit's constructor assigns `this.proxy = process.env.https_proxy`
 * UNCONDITIONALLY — there is no `options.proxy ?? …` fallback, which is why
 * src/degit.d.ts declares no `proxy` option and why fetchRepo cannot pass one.
 * The only lever over the clone's transport is the environment variable itself,
 * and only that LOWERCASE spelling is ever read.
 *
 * That single lowercase read is a footgun in BOTH directions, neither of which
 * was previously discoverable from any pharn output:
 *
 *   - a non-lowercase spelling (`HTTPS_PROXY`, the one most tooling honors) set
 *     alone → the clone connects DIRECTLY, silently, on POSIX. Node's
 *     `process.env` is case-INSENSITIVE on win32, so the same environment IS
 *     proxied there, and `engines.node` sets no `os` restriction — both are in
 *     the supported matrix.
 *   - `https_proxy` set → the clone may be interposed by a host pharn never
 *     declared, and degit reads no `no_proxy`, so an exclusion list the user
 *     believes is in force does not apply to it.
 *
 * Why an env read rather than observing degit: the `{code:'PROXY'}` event is
 * emitted through `verboseInfo`, defined `verboseInfo(e){this.verbose&&this.info(e)}`.
 * fetchRepo passes no `verbose`, so that event NEVER fires on pharn's path and an
 * `emitter.on('info', …)` listener would observe nothing. Reading the environment
 * is the only signal available — which is why every claim here is about
 * CONFIGURATION ("degit will read this") and never about the transport that ran.
 */

/** The one lowercase name degit reads. */
const LOWER = 'https_proxy';
/** The uppercase spelling users reach for — preferred when several variants are set. */
const UPPER = 'HTTPS_PROXY';

/**
 * Every published degit version in the range package.json declares (`^3.6.1`),
 * swept for proxy-env behavior. All nine show exactly ONE proxy name in
 * `dist/*.js` — lowercase `https_proxy`, no `no_proxy`/`NO_PROXY`/`ALL_PROXY` —
 * the same unconditional `this.proxy=process.env.https_proxy`, and the same
 * `verboseInfo` gate.
 *
 * This set is the FLOOR under the confident wording (an exact-string membership
 * test, ARCHITECTURE.md §2 primitive 3). It exists because the behavior above is
 * a property of the DEPENDENCY, and pharn does not pin it for consumers: the
 * published package declares the RANGE, ships no lockfile (`files: ["dist"]`),
 * and marks degit `external` in the esbuild bundle — so an install resolves it
 * fresh. Without the gate, `pharn` would assert a measured negative about
 * whatever version npm happened to hand the user.
 *
 * Extend this set only by MEASURING the new version, never by assuming a patch
 * release kept the behavior. An unlisted version is not treated as broken — it
 * is treated as UNVERIFIED, and the notice hedges accordingly.
 */
export const MEASURED_DEGIT_VERSIONS: ReadonlySet<string> = new Set([
  '3.6.1',
  '3.6.2',
  '3.6.3',
  '3.6.4',
  '3.6.5',
  '3.6.6',
  '3.7.0',
  '3.7.1',
  '3.8.0',
]);

/** Human-facing span of MEASURED_DEGIT_VERSIONS, for the hedged message. */
export const MEASURED_DEGIT_RANGE = '3.6.1-3.8.0';

/** Shape of a semver-ish version string, so a garbage read is rejected not echoed. */
const VERSION_LIKE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export type ProxyNotice =
  /**
   * A proxy is set in a spelling degit will not read here, so the clone connects
   * direct. `name` is the variable actually found — safe to print by
   * construction, since only a key whose lowercase equals `https_proxy` can
   * reach it (one of 2^11 ASCII spellings; it cannot carry a control character).
   */
  | { kind: 'ignored'; name: string }
  /** degit WILL read this value. Carries the raw value for redacted rendering. */
  | { kind: 'active'; value: string };

/** What pharn knows about the degit it is about to call. */
export interface DegitProxyRead {
  /** Resolved installed version, or null when it could not be read/validated. */
  version: string | null;
  /** version ∈ MEASURED_DEGIT_VERSIONS — the lowercase-only read was verified for it. */
  measured: boolean;
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
 * Classify the environment against degit's single lowercase read.
 *
 * Deterministic membership/presence test (P5) over `env` and `platform`, with no
 * classification and no I/O. Pure: both are parameters, never read from
 * `process.*`, so every row is exercisable from a test on any host — including
 * the win32 rows on the ubuntu-only CI runner.
 *
 * The win32 branch reproduces Node's case-INSENSITIVE `process.env` lookup over
 * an injected record: the real `process.env` resolves it through its own proxy,
 * but a plain object in a test would not, and modelling it here is what keeps the
 * platform difference testable.
 *
 * The terminal case is `null` — SILENCE — the complete and correct answer when
 * nothing is set, not a degraded fallback.
 */
export function detectProxyNotice(
  env: Record<string, string | undefined>,
  platform: string,
): ProxyNotice | null {
  const variants = proxyVariantKeys(env);

  if (platform === 'win32') {
    // Any spelling resolves, so any variant present means the clone is proxied.
    const key = variants[0];
    const value = key === undefined ? undefined : env[key];
    return isSet(value) ? { kind: 'active', value } : null;
  }

  // Case-sensitive: only the exact lowercase name reaches degit.
  const exact = env[LOWER];
  // Covers the both-set case too — a user who set BOTH spellings IS proxied, so
  // warning that their setting is ignored would be a false alarm.
  if (isSet(exact)) return { kind: 'active', value: exact };

  // Anything else that spells https_proxy is a variable degit will never read.
  const ignored = variants.find((key) => key !== LOWER);
  return ignored === undefined ? null : { kind: 'ignored', name: ignored };
}

/**
 * Read the degit version actually installed, or null.
 *
 * The ONE impure function in this module, isolated so everything above stays
 * unit-testable. degit declares no `exports` field, so the subpath resolves;
 * `createRequire(import.meta.url)` works from the bundled dist because degit is
 * `external` there and therefore present in node_modules at runtime.
 *
 * Every failure mode collapses to null (P5 — the fallback is "unknown", which
 * the caller renders as a hedge, never a guess): the package missing, the
 * subpath unresolvable, the JSON unreadable, or a `version` that is not a
 * plausible version string. The value is validated before use even though it
 * comes from node_modules — it is echoed to a terminal, and an unchecked read is
 * how a surprising string becomes output (P2).
 */
function readDegitVersion(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('degit/package.json') as { version?: unknown };
    return typeof pkg.version === 'string' && VERSION_LIKE.test(pkg.version)
      ? pkg.version
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve what pharn knows about the degit it is about to call: which version is
 * installed, and whether that version's proxy behavior was actually measured.
 *
 * `measured` is the floor under the confident wording — a membership test over
 * MEASURED_DEGIT_VERSIONS, not a judgment.
 */
export function resolveDegitProxyRead(): DegitProxyRead {
  const version = readDegitVersion();
  return {
    version,
    measured: version !== null && MEASURED_DEGIT_VERSIONS.has(version),
  };
}
