import { describe, expect, it } from 'vitest';
import { compareVersionCore } from '../src/lib/semver.js';

// ---------------------------------------------------------------------------
// The version ordering primitive behind the MIN_CLI handshake. Pure, total, and
// deliberately NARROW: it compares the three-part numeric core and nothing else.
// The prerelease case is the one that matters — VERSION_RE admits a trailing
// `-suffix`, and PHARN_VERSION (read straight from package.json) may carry one,
// so a naive three-part numeric split would mangle `1.2.3-rc.1` into NaN and
// silently refuse (or silently allow) every install.
// ---------------------------------------------------------------------------

describe('compareVersionCore', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersionCore('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersionCore('1.9.9', '2.0.0')).toBe(-1);
    expect(compareVersionCore('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersionCore('1.1.2', '1.1.3')).toBe(-1);
  });

  it('compares NUMERICALLY, not lexically (0.10.0 > 0.9.0)', () => {
    expect(compareVersionCore('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersionCore('0.9.0', '0.10.0')).toBe(-1);
    expect(compareVersionCore('1.0.10', '1.0.9')).toBe(1);
  });

  it('reports equality for identical versions', () => {
    expect(compareVersionCore('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersionCore('0.0.0', '0.0.0')).toBe(0);
  });

  // The explicit prerelease rule: the numeric core is the WHOLE comparison, so a
  // prerelease is EQUAL to its release and refuses in neither direction.
  it('treats a prerelease as equal to its release (both directions)', () => {
    expect(compareVersionCore('1.2.3-rc.1', '1.2.3')).toBe(0);
    expect(compareVersionCore('1.2.3', '1.2.3-rc.1')).toBe(0);
    expect(compareVersionCore('1.2.3-rc.1', '1.2.3-rc.2')).toBe(0);
  });

  it('still orders across cores when one side is a prerelease', () => {
    expect(compareVersionCore('1.3.0-rc.1', '1.2.9')).toBe(1);
    expect(compareVersionCore('1.2.9', '1.3.0-rc.1')).toBe(-1);
  });

  // Total, never throwing: an unparseable side yields null, and the caller reads
  // that as "no constraint" — the fail-open direction is deliberate here, because
  // a throw would brick every command (see min-cli-gate.test.ts).
  it('returns null when either side is not a three-part numeric core', () => {
    expect(compareVersionCore('not-a-version', '1.2.3')).toBeNull();
    expect(compareVersionCore('1.2.3', '1.2')).toBeNull();
    expect(compareVersionCore('1.2.3.4', '1.2.3')).toBeNull();
    expect(compareVersionCore('', '1.2.3')).toBeNull();
    expect(compareVersionCore('v1.2.3', '1.2.3')).toBeNull();
  });

  it('rejects a leading-plus / whitespace-padded value rather than coercing it', () => {
    expect(compareVersionCore(' 1.2.3', '1.2.3')).toBeNull();
    expect(compareVersionCore('1.2.3 ', '1.2.3')).toBeNull();
    expect(compareVersionCore('+1.2.3', '1.2.3')).toBeNull();
  });
});
