import {
  MEASURED_DEGIT_RANGE,
  type DegitProxyRead,
  type ProxyNotice,
} from './proxy-env.js';

/**
 * Presentation for the degit proxy notice. Separated from ./proxy-env.ts because
 * the two change for different reasons (P3): this file changes when wording does,
 * that one when degit's measured behavior does.
 */

const LOWER = 'https_proxy';

/**
 * Cap on the rendered proxy value. `new URL()` already neutralizes the spoofing
 * shapes that matter — a control character in the path is percent-encoded, one
 * in the host throws — so this bounds terminal FLOODING rather than injection:
 * the environment is attacker-influencable and a multi-kilobyte value should not
 * scroll a user's install away.
 */
const MAX_RENDERED = 120;

/**
 * Render a proxy value safe to print. `https_proxy` conventionally carries
 * inline credentials (`http://user:pass@host:3128`), and that hazard is also why
 * the value is NEVER recorded in `pharn.config.json` — that file is written to
 * the project root and git-committed, so recording it would commit the user's
 * proxy credentials into their repository.
 *
 * Userinfo collapses to `***`. An unparseable value degrades to the fixed
 * literal `(set)` rather than echoing raw bytes, so hostile content cannot be
 * echoed verbatim to spoof pharn's own output.
 */
export function redactProxyUrl(value: string): string {
  let url;
  try {
    url = new URL(value);
  } catch {
    return '(set)';
  }
  const auth = url.username !== '' || url.password !== '' ? '***@' : '';
  const path = url.pathname === '/' ? '' : url.pathname;
  const rendered = `${url.protocol}//${auth}${url.host}${path}`;
  return rendered.length > MAX_RENDERED
    ? `${rendered.slice(0, MAX_RENDERED)}…`
    : rendered;
}

/** How to name the installed degit when it is not one pharn measured. */
function installedLabel(read: DegitProxyRead): string {
  return read.version === null
    ? 'the installed version could not be read'
    : `the installed degit is ${read.version}`;
}

/**
 * The user-facing line for a notice.
 *
 * Two wording rules carry the honesty of this feature, and both are load-bearing:
 *
 * 1. "may be routed", never "was routed". degit's download helper returns early
 *    on `FILE_EXISTS` when the SHA-named tarball is already in its shared cache,
 *    and two of its tar failures fall back to a spawned `git clone` that never
 *    receives the proxy. "A proxy was in effect" is NOT derivable from the
 *    environment — only "degit will read this value" is.
 * 2. The CONFIDENT `ignored` wording fires only when `read.measured` — i.e. the
 *    installed degit is one whose lowercase-only read pharn actually verified.
 *    On any other version the message hedges and names both the measured range
 *    and what is installed. pharn declares a RANGE (`^3.6.1`) and ships no
 *    lockfile, so without this gate the confident sentence would be asserted
 *    over an unmeasured dependency.
 *
 * Neither branch echoes an unredacted value, and the `ignored` branch echoes no
 * value at all — a non-lowercase spelling is exactly as credential-bearing as
 * its lowercase twin. The variable NAME it does echo is safe by construction
 * (see `ProxyNotice`).
 */
export function proxyNoticeMessage(
  notice: ProxyNotice,
  read: DegitProxyRead,
): string {
  if (notice.kind === 'ignored') {
    return read.measured
      ? `${notice.name} is set, but degit ${read.version} reads only the lowercase ${LOWER} — the PHARN clone will connect DIRECTLY. Set ${LOWER} to the same value if you meant to proxy it.`
      : `${notice.name} is set, and the PHARN clone will probably ignore it: every degit pharn has measured (${MEASURED_DEGIT_RANGE}) reads only the lowercase ${LOWER}, but ${installedLabel(read)}. Set ${LOWER} to the same value to be sure.`;
  }

  const caveat = read.measured
    ? ''
    : ` Measured on degit ${MEASURED_DEGIT_RANGE}; ${installedLabel(read)}.`;
  return `The PHARN clone may be routed through ${redactProxyUrl(notice.value)} (${LOWER}). It reads no no_proxy/NO_PROXY, so proxy exclusions do not apply to it.${caveat}`;
}
