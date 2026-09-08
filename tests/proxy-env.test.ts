import { describe, expect, it } from 'vitest';
import { detectProxyNotice } from '../src/lib/proxy-env.js';

// detectProxyNotice is pure over an injected env record — it never reads
// process.env — so every row here runs identically on any host.
//
// The contract it encodes is now a flat one: pharn's network calls go through
// Node's global fetch, which reads NO proxy environment variable, on any
// platform. So the only question is "is a proxy configured?", and the answer no
// longer depends on the spelling or the OS. The previous version of this file
// pinned degit's lowercase-only read and the win32 case-insensitivity that made
// one spelling work and another not; with degit retired, none of them work, and
// those distinctions were deleted rather than kept as decoration.

describe('detectProxyNotice', () => {
  it('is silent when nothing is set', () => {
    expect(detectProxyNotice({})).toBeNull();
  });

  it('is silent for an empty value — an empty string is not a setting', () => {
    expect(detectProxyNotice({ https_proxy: '' })).toBeNull();
    expect(detectProxyNotice({ HTTPS_PROXY: '' })).toBeNull();
  });

  it.each([
    ['https_proxy', 'https_proxy'],
    ['HTTPS_PROXY', 'HTTPS_PROXY'],
    ['Https_Proxy', 'Https_Proxy'],
    ['HTTPS_proxy', 'HTTPS_proxy'],
  ])('reports %s — every spelling is equally unread', (name) => {
    const notice = detectProxyNotice({ [name]: 'http://proxy:3128' });
    expect(notice).toEqual({ name, value: 'http://proxy:3128' });
  });

  it('ignores unrelated variables', () => {
    expect(
      detectProxyNotice({ HTTP_PROXY: 'http://p:1', NO_PROXY: 'x', PATH: '/' }),
    ).toBeNull();
  });

  it('prefers HTTPS_PROXY when several spellings are set', () => {
    // Deterministic (P5): without a fixed preference the answer would depend on
    // the env object's key insertion order, which no caller should rely on.
    const notice = detectProxyNotice({
      zttps_proxy: 'http://z:1',
      https_proxy: 'http://lower:1',
      HTTPS_PROXY: 'http://upper:1',
    });
    expect(notice?.name).toBe('HTTPS_PROXY');
  });

  it('falls back to sorted order when HTTPS_PROXY is absent', () => {
    const notice = detectProxyNotice({
      https_proxy: 'http://lower:1',
      Https_Proxy: 'http://mixed:1',
    });
    expect(notice?.name).toBe('Https_Proxy'); // 'H' sorts before 'h'
  });

  it('skips an empty variant in favour of a set one', () => {
    const notice = detectProxyNotice({
      HTTPS_PROXY: '',
      https_proxy: 'http://real:1',
    });
    expect(notice?.name).toBe('https_proxy');
  });
});
