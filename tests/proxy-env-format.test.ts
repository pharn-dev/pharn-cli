import { describe, expect, it } from 'vitest';
import {
  proxyNoticeMessage,
  redactProxyUrl,
} from '../src/lib/proxy-env-format.js';
import type { DegitProxyRead } from '../src/lib/proxy-env.js';

const PROXY = 'http://proxy.internal:3128';
const MEASURED: DegitProxyRead = { version: '3.8.0', measured: true };
const UNMEASURED: DegitProxyRead = { version: '3.9.0', measured: false };
const UNREADABLE: DegitProxyRead = { version: null, measured: false };

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

describe('proxyNoticeMessage - ignored branch', () => {
  // On a version pharn actually measured, the negative assertion is earned and
  // stated plainly, naming the version it rests on.
  it('is confident on a measured degit and cites the version', () => {
    const message = proxyNoticeMessage(
      { kind: 'ignored', name: 'HTTPS_PROXY' },
      MEASURED,
    );

    expect(message).toContain('HTTPS_PROXY');
    expect(message).toContain('https_proxy');
    expect(message).toContain('3.8.0');
    expect(message).toContain('will connect DIRECTLY');
  });

  // The whole point of the version gate: pharn declares a RANGE and ships no
  // lockfile, so on a version nobody measured the confident sentence must not
  // be asserted.
  it('hedges on an unmeasured degit and names both versions', () => {
    const message = proxyNoticeMessage(
      { kind: 'ignored', name: 'HTTPS_PROXY' },
      UNMEASURED,
    );

    expect(message).not.toContain('will connect DIRECTLY');
    expect(message).toContain('probably ignore it');
    expect(message).toContain('3.6.1-3.8.0');
    expect(message).toContain('3.9.0');
  });

  it('hedges when the installed version cannot be read at all', () => {
    const message = proxyNoticeMessage(
      { kind: 'ignored', name: 'HTTPS_PROXY' },
      UNREADABLE,
    );

    expect(message).not.toContain('will connect DIRECTLY');
    expect(message).toContain('could not be read');
  });

  // The variable actually found is what gets named, so the advice points at the
  // user's real environment rather than an assumed spelling.
  it('names the variant actually found', () => {
    const message = proxyNoticeMessage(
      { kind: 'ignored', name: 'HtTpS_PrOxY' },
      MEASURED,
    );

    expect(message).toContain('HtTpS_PrOxY');
  });

  // A non-lowercase spelling is exactly as credential-bearing as its lowercase
  // twin, so this branch echoes no value at all.
  it('echoes no value on the ignored branch', () => {
    expect(
      proxyNoticeMessage({ kind: 'ignored', name: 'HTTPS_PROXY' }, MEASURED),
    ).not.toContain('proxy.internal');
  });
});

describe('proxyNoticeMessage - active branch', () => {
  // "may be routed", never "was routed" — degit's download helper returns early
  // when the SHA-named tarball is already cached, and a tar failure falls back
  // to a spawned `git clone` that never receives the proxy. What ran is not
  // derivable from the environment; only what degit WILL READ is.
  it('says the clone MAY be routed, never that it was', () => {
    const message = proxyNoticeMessage(
      { kind: 'active', value: PROXY },
      MEASURED,
    );

    expect(message).toContain('may be routed');
    expect(message).not.toContain('was routed');
    expect(message).toContain(PROXY);
  });

  // degit's bundle contains no no_proxy read at all, so an exclusion list the
  // user believes is in force does not apply to the clone.
  it('warns that no_proxy exclusions do not apply', () => {
    expect(
      proxyNoticeMessage({ kind: 'active', value: PROXY }, MEASURED),
    ).toContain('no_proxy');
  });

  it('renders the value redacted', () => {
    const message = proxyNoticeMessage(
      { kind: 'active', value: 'http://user:s3cret@proxy.internal:3128' },
      MEASURED,
    );

    expect(message).toContain('***');
    expect(message).not.toContain('s3cret');
  });

  // The active claim is version-dependent too, so an unmeasured degit earns a
  // caveat here as well — just a softer one, since the positive read has held
  // in every version measured.
  it('appends a version caveat on an unmeasured degit', () => {
    const message = proxyNoticeMessage(
      { kind: 'active', value: PROXY },
      UNMEASURED,
    );

    expect(message).toContain('3.6.1-3.8.0');
    expect(message).toContain('3.9.0');
  });

  it('appends no caveat on a measured degit', () => {
    expect(
      proxyNoticeMessage({ kind: 'active', value: PROXY }, MEASURED),
    ).not.toContain('Measured on degit');
  });
});
