import { describe, expect, it } from 'vitest';
import { parseCapabilityArg } from '../src/lib/capability-address.js';

describe('parseCapabilityArg', () => {
  it('parses a bare name (no role filter)', () => {
    expect(parseCapabilityArg('a11y')).toEqual({ name: 'a11y' });
  });

  it('parses role:name for each role', () => {
    expect(parseCapabilityArg('lens:n-plus-one')).toEqual({
      name: 'n-plus-one',
      role: 'lens',
    });
    expect(parseCapabilityArg('griller:a11y')).toEqual({
      name: 'a11y',
      role: 'griller',
    });
  });

  it('reports an unknown role before the colon (P5 — not a guess)', () => {
    const r = parseCapabilityArg('auditor:x');
    expect(r.name).toBe('x');
    expect(r.role).toBeUndefined();
    expect(r.error).toMatch(/Unknown role/);
  });
});
