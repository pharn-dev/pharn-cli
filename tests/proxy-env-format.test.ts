import { describe, expect, it } from 'vitest';
import {
  proxyNoticeMessage,
  redactProxyUrl,
} from '../src/lib/proxy-env-format.js';
const PROXY = 'http://proxy.internal:3128';

describe('redactProxyUrl', () => {
  // https_proxy conventionally carries inline credentials. This is the same
  // hazard that keeps the value out of pharn.config.json entirely (that file is
  // git-committed) — here it must not reach the terminal either.
  it('collapses userinfo to *** and does not leak the secret', () => {
    const rendered = redactProxyUrl('http://user:s3cret@proxy.internal:3128');

    expect(rendered).toBe('http://***@proxy.internal:3128');
    expect(rendered).not.toContain('s3cret');
    expect(rendered).not.toContain('user');
  });

  it('redacts a username with no password', () => {
    expect(redactProxyUrl('http://user@proxy.internal:3128')).toBe(
      'http://***@proxy.internal:3128',
    );
  });

  it('leaves a credential-free URL readable', () => {
    expect(redactProxyUrl(PROXY)).toBe(PROXY);
  });

  // An unparseable value degrades to a fixed literal rather than echoing raw
  // bytes — the environment is attacker-influencable, so hostile content (an
  // ANSI escape plus a fabricated error line) must never be echoed verbatim to
  // spoof pharn's own output.
  it('degrades an unparseable value to (set) without echoing it', () => {
    const esc = String.fromCharCode(27);
    const rendered = redactProxyUrl(
      `not a url ${esc}[31mFATAL: install failed`,
    );

    expect(rendered).toBe('(set)');
    expect(rendered).not.toContain('FATAL');
    expect(rendered).not.toContain(esc);
  });

  // A control character inside an otherwise-parseable URL is neutralized by
  // URL parsing rather than by a hand-rolled filter.
  it('never emits a control character from a parseable value', () => {
    const esc = String.fromCharCode(27);
    const rendered = redactProxyUrl(`http://proxy.internal/${esc}[31m`);

    expect(rendered).not.toContain(esc);
  });

  it('bounds a pathological value rather than flooding the terminal', () => {
    const rendered = redactProxyUrl(
      `http://proxy.internal/${'a'.repeat(5000)}`,
    );

    expect(rendered.length).toBeLessThanOrEqual(121);
    expect(rendered.endsWith('…')).toBe(true);
  });
});

describe('proxyNoticeMessage', () => {
  // One message now, because there is one situation. The old file had two
  // branches and three confidence levels, all of them about a dependency that
  // read `https_proxy` itself and only in lowercase. pharn's fetches read no
  // proxy variable at all, so there is nothing left to classify and no
  // dependency version to gate the claim on.

  it('names the variable it found, so the user can see pharn read it', () => {
    expect(
      proxyNoticeMessage({
        name: 'HtTpS_PrOxY',
        value: PROXY,
        envProxy: 'unsupported',
      }),
    ).toContain('HtTpS_PrOxY');
  });

  it('states the mechanism, not just the symptom', () => {
    // A user in a network that blocks direct egress otherwise sees only a
    // timeout. Naming fetch's behavior is what separates "known limitation"
    // from "outage".
    const message = proxyNoticeMessage({
      name: 'HTTPS_PROXY',
      value: PROXY,
      envProxy: 'unsupported',
    });

    expect(message).toContain('fetch');
    expect(message).toContain('no proxy environment variable');
    expect(message).toContain('DIRECTLY');
  });

  it('makes no claim that depends on a platform or a dependency version', () => {
    const message = proxyNoticeMessage({
      name: 'HTTPS_PROXY',
      value: PROXY,
      envProxy: 'unsupported',
    });

    expect(message).not.toContain('degit');
    // Honest since PHARN-12: fetch ignores proxy variables BY DEFAULT — not on
    // "any platform" regardless of options.
    expect(message).toContain('by default');
  });

  it('points at the documented limit rather than implying a bug', () => {
    expect(
      proxyNoticeMessage({
        name: 'HTTPS_PROXY',
        value: PROXY,
        envProxy: 'unsupported',
      }),
    ).toContain('LIMITS.md');
  });

  it('renders the value redacted', () => {
    const message = proxyNoticeMessage({
      name: 'https_proxy',
      value: 'http://user:s3cret@proxy.internal:3128',
      envProxy: 'unsupported',
    });

    expect(message).toContain('***');
    expect(message).not.toContain('s3cret');
  });
});

describe('proxyNoticeMessage — the three env-proxy states (PHARN-12)', () => {
  const notice = (envProxy: 'on' | 'available' | 'unsupported') => ({
    name: 'HTTPS_PROXY',
    value: PROXY,
    envProxy,
  });

  it('on: says the downloads DO go through the proxy, and never "will not use it"', () => {
    const m = proxyNoticeMessage(notice('on'));
    expect(m).toContain('go through that proxy');
    expect(m).not.toContain('will not use it');
  });

  it('available: keeps the warning and names the opt-in', () => {
    const m = proxyNoticeMessage(notice('available'));
    expect(m).toContain('will not use it');
    expect(m).toContain('NODE_USE_ENV_PROXY=1');
  });

  it('unsupported: says this Node cannot, and that a newer one can', () => {
    const m = proxyNoticeMessage(notice('unsupported'));
    expect(m).toContain('will not use it');
    expect(m).toContain('no NODE_USE_ENV_PROXY support');
  });
});
