import { type ProxyNotice } from './proxy-env.js';

/**
 * Presentation for the proxy notice. Separated from ./proxy-env.ts because the
 * two change for different reasons (P3): this file changes when wording does,
 * that one when the transport's proxy behavior does.
 */

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

/**
 * The notice for a configured proxy, in one of three TRUE forms (PHARN-12).
 * Node's fetch ignores proxy variables by default — which the old single
 * message stated as absolute ("pharn will not use it") — but recent Node
 * versions honour them when `NODE_USE_ENV_PROXY=1` / `--use-env-proxy` is set,
 * so that message was false for users who had opted in and hid the one
 * workaround from users who had not.
 */
export function proxyNoticeMessage(notice: ProxyNotice): string {
  const shown = `${notice.name} is set (${redactProxyUrl(notice.value)})`;
  if (notice.envProxy === 'on') {
    return `${shown} and NODE_USE_ENV_PROXY / --use-env-proxy is on, so pharn's downloads go through that proxy (Node's fetch then also honours NO_PROXY).`;
  }
  const base = `${shown}, but pharn will not use it: its network calls go through Node's global fetch, which reads no proxy environment variable by default. The download connects DIRECTLY, and fails if direct egress is blocked (LIMITS.md §3a).`;
  return notice.envProxy === 'available'
    ? `${base} This Node can route fetch through the proxy — re-run with NODE_USE_ENV_PROXY=1 set.`
    : `${base} This Node (${process.version}) has no NODE_USE_ENV_PROXY support; a newer Node release does.`;
}
