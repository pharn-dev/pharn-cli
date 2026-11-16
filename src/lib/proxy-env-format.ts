import { type ProxyNotice } from './proxy-env.js';

/** Presentation for the proxy notice; ./proxy-env.ts owns the detection. */

/**
 * Cap on the rendered proxy value. `new URL()` already neutralizes spoofing
 * shapes, so this bounds terminal FLOODING from an attacker-influencable env.
 */
const MAX_RENDERED = 120;

/**
 * Render a proxy value safe to print. Userinfo (`http://user:pass@host`)
 * collapses to `***`, and an unparseable value becomes the literal `(set)`,
 * never raw bytes. Never recorded in the committed `pharn.config.json`.
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
 * The notice for a configured proxy, in one of its true forms: Node's fetch
 * ignores proxy variables by default, honours them once the opt-in is on (on
 * Nodes that have one), and reads only the four exact spellings. Each form
 * names the one change that would alter it. Pinned by
 * tests/proxy-env-format.test.ts.
 */
export function proxyNoticeMessage(notice: ProxyNotice): string {
  const shown = `${notice.name} is set (${redactProxyUrl(notice.value)})`;
  if (notice.envProxy === 'on') {
    return `${shown} and NODE_USE_ENV_PROXY / --use-env-proxy is on, so pharn's downloads go through that proxy (Node's fetch then also honours NO_PROXY).`;
  }
  const direct =
    'The download connects DIRECTLY, and fails if direct egress is blocked (LIMITS.md §3a).';
  if (notice.envProxy === 'ignored-spelling') {
    return `${shown}, but pharn will not use it: Node reads only https_proxy, HTTPS_PROXY, http_proxy and HTTP_PROXY, spelled exactly so. ${direct}`;
  }
  const base = `${shown}, but pharn will not use it: its network calls go through Node's global fetch, which reads no proxy environment variable by default. ${direct}`;
  if (notice.envProxy === 'available') {
    return notice.optedOut
      ? `${base} A --no-use-env-proxy flag (in NODE_OPTIONS or on the command line) turns Node's proxy support off — remove it to route fetch through the proxy.`
      : `${base} This Node can route fetch through the proxy — re-run with NODE_USE_ENV_PROXY=1 set.`;
  }
  return `${base} This Node (${process.version}) cannot route fetch through a proxy; Node 22.21+ and 24+ can, with NODE_USE_ENV_PROXY=1.`;
}
