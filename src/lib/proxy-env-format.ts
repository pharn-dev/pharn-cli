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
 * One message, because there is now one situation: a proxy is configured and
 * pharn's network calls will not use it.
 *
 * It states the mechanism (Node's fetch reads no proxy environment variable)
 * rather than only the symptom, so a user in a network that blocks direct egress
 * can tell this apart from an outage — and it names the variable it found, so
 * they can see pharn read the environment correctly and still cannot use it.
 */
export function proxyNoticeMessage(notice: ProxyNotice): string {
  return `${notice.name} is set (${redactProxyUrl(notice.value)}), but pharn will not use it: its network calls go through Node's global fetch, which reads no proxy environment variable on any platform. The download connects DIRECTLY, and fails if direct egress is blocked (LIMITS.md §3a).`;
}
