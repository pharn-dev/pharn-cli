import { afterEach, describe, expect, it, vi } from 'vitest';
import { showBanner } from '../src/lib/banner.js';

describe('showBanner', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints the logo and a version line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    showBanner();
    // 6 logo rows + 3 blank lines + 1 tagline = 10 console.log calls.
    expect(spy).toHaveBeenCalledTimes(10);
    const printed = spy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain('Audit-grade methodology for Claude Code');
  });
});
