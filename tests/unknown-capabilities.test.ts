import { describe, expect, it } from 'vitest';
import { unknownCapabilitiesWarning } from '../src/lib/unknown-capabilities.js';
import type { UnknownCapability } from '../src/types.js';

// ---------------------------------------------------------------------------
// The ONE renderer for `index.unknown`. Two jobs, both testable without I/O:
//
//  1. P5 - zero unknowns produce ZERO output (null), so a healthy clone stays
//     exactly as quiet as it was before this feature existed.
//  2. P2 - every field it renders is UNTRUSTED upstream text (a capability dir
//     name that may have failed the allowlist, and an error message that
//     interpolates it raw). Collecting these into a list makes them a repeatable
//     terminal-control-sequence vector, so the renderer sanitizes; this suite is
//     what stops a future call site from formatting the list itself.
// ---------------------------------------------------------------------------

// Every control character EXCEPT the newline the multi-line warning joins on.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x09\x0b-\x1f\x7f-\x9f]/;

function unk(over: Partial<UnknownCapability> = {}): UnknownCapability {
  return {
    name: 'backwards-compat',
    role: 'griller',
    subtree: 'pharn-pipeline/grillers',
    reason: 'missing its markdown',
    ...over,
  };
}

describe('unknownCapabilitiesWarning', () => {
  it('returns null for an empty list (zero unknowns -> zero output, P5)', () => {
    expect(unknownCapabilitiesWarning([])).toBeNull();
  });

  it('names every skipped capability with its role, subtree and reason', () => {
    const out = unknownCapabilitiesWarning([
      unk(),
      unk({
        name: 'weird',
        role: 'lens',
        subtree: 'pharn-review',
        reason: 'invalid role',
      }),
    ]);
    expect(out).not.toBeNull();
    expect(out).toContain('backwards-compat');
    expect(out).toContain('pharn-pipeline/grillers');
    expect(out).toContain('missing its markdown');
    expect(out).toContain('weird');
    expect(out).toContain('pharn-review');
    expect(out).toContain('invalid role');
  });

  it('says the skipped capabilities are NOT installed (fail closed, named)', () => {
    const out = unknownCapabilitiesWarning([unk()])!;
    expect(out).toMatch(/not installed|skipped/i);
  });

  it('strips control characters from every untrusted field (P2)', () => {
    const out = unknownCapabilitiesWarning([
      unk({
        name: 'ev\x1bil',
        subtree: 'pharn-review',
        reason: 'bad\x07reason',
      }),
    ])!;
    expect(CONTROL_CHARS_RE.test(out)).toBe(false);
    expect(out).toContain('evil');
    expect(out).toContain('badreason');
  });

  it('caps each rendered field so one huge upstream string cannot flood the terminal', () => {
    const out = unknownCapabilitiesWarning([
      unk({ reason: 'x'.repeat(5000) }),
    ])!;
    expect(out.length).toBeLessThan(1000);
    expect(out).toContain('…');
  });

  it('is deterministic - the same list renders identically (P5)', () => {
    const list = [
      unk(),
      unk({ name: 'other', role: 'lens', subtree: 'pharn-review' }),
    ];
    expect(unknownCapabilitiesWarning(list)).toBe(
      unknownCapabilitiesWarning(list),
    );
  });
});
