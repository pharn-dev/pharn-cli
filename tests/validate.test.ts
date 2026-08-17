import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ManifestValidationError,
  CAPABILITY_NAME_RE,
  COPY_FILENAME_RE,
  COMMIT_RE,
  assertSafeString,
  assertNoDotDot,
  assertRole,
  assertAppliesToken,
  isPlainObject,
  safeJoin,
} from '../src/lib/validate.js';

// These four pin `assertSafeString`'s own behavior (the reject/pass ladder); the
// pattern is a prop, so they are written against a LIVE regex — CAPABILITY_NAME_RE,
// the one the archetype install actually validates fetched names with.
describe('assertSafeString', () => {
  it('rejects a non-string value', () => {
    expect(() => assertSafeString(42, 'x', CAPABILITY_NAME_RE)).toThrow(
      ManifestValidationError,
    );
  });

  it('rejects control characters', () => {
    const withControl = `pharn-${String.fromCharCode(1)}`;
    expect(() =>
      assertSafeString(withControl, 'x', CAPABILITY_NAME_RE),
    ).toThrow(/control/);
  });

  it('rejects a value that does not match the pattern', () => {
    expect(() => assertSafeString('Nope', 'x', CAPABILITY_NAME_RE)).toThrow(
      /invalid format/,
    );
  });

  it('returns the value when it is safe', () => {
    expect(assertSafeString('pharn-core', 'x', CAPABILITY_NAME_RE)).toBe(
      'pharn-core',
    );
  });
});

describe('assertNoDotDot', () => {
  it('throws when the value contains ..', () => {
    expect(() => assertNoDotDot('a/../b', 'x')).toThrow(
      ManifestValidationError,
    );
  });

  it('passes a clean value', () => {
    expect(() => assertNoDotDot('a/b', 'x')).not.toThrow();
  });
});

describe('isPlainObject', () => {
  it('accepts a plain object and rejects arrays/null/primitives', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });
});

describe('CAPABILITY_NAME_RE', () => {
  it('accepts lowercase hyphenated capability names', () => {
    for (const n of ['a11y', 'security', 'n-plus-one', 'copy-paste-drift']) {
      expect(CAPABILITY_NAME_RE.test(n)).toBe(true);
    }
  });

  it('rejects uppercase, underscores, leading/trailing/double hyphens, dots', () => {
    for (const n of ['Bad', 'bad_name', '-x', 'x-', 'a--b', 'a.b', '..']) {
      expect(CAPABILITY_NAME_RE.test(n)).toBe(false);
    }
  });
});

describe('COPY_FILENAME_RE', () => {
  it('accepts product command / hook / floor filenames', () => {
    for (const n of [
      'pharn-plan.md',
      'set-writes-scope.cjs',
      'validate.mjs',
      'map.json',
    ]) {
      expect(COPY_FILENAME_RE.test(n)).toBe(true);
    }
  });

  it('rejects traversal, unexpected extensions, and empty names', () => {
    for (const n of ['../evil.md', 'x.sh', 'a..b.md', '.env']) {
      expect(COPY_FILENAME_RE.test(n)).toBe(false);
    }
  });
});

// COMMIT_RE gates the network-derived provenance sha (src/lib/repo.ts, fetchRepo)
// before it is used as a degit ref or written to pharn.config.json `commit` (P2).
// The full 40-hex form is the only accepted shape; null (degraded mode) is handled
// by the caller's null-guard, not here.
describe('COMMIT_RE', () => {
  it('accepts a full 40-char lowercase hex sha', () => {
    for (const s of [
      'da39a3ee5e6b4b0d3255bfef95601890afd80709',
      '0123456789abcdef0123456789abcdef01234567',
      'a'.repeat(40),
    ]) {
      expect(COMMIT_RE.test(s)).toBe(true);
    }
  });

  it('rejects short, over-length, uppercase, non-hex, and empty shas', () => {
    for (const s of [
      'deadbeefcafe', // too short (12)
      'a'.repeat(39), // 39 chars
      'a'.repeat(41), // 41 chars
      'A'.repeat(40), // uppercase
      'g'.repeat(40), // non-hex letter
      '', // empty
    ]) {
      expect(COMMIT_RE.test(s)).toBe(false);
    }
  });

  it('is enforced by assertSafeString (same failure style as the other validators)', () => {
    expect(
      assertSafeString(
        'da39a3ee5e6b4b0d3255bfef95601890afd80709',
        'commit SHA',
        COMMIT_RE,
      ),
    ).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(() =>
      assertSafeString('deadbeefcafe', 'commit SHA', COMMIT_RE),
    ).toThrow(/invalid format/);
  });
});

describe('assertRole', () => {
  it('returns griller/lens unchanged', () => {
    expect(assertRole('griller', 'x')).toBe('griller');
    expect(assertRole('lens', 'x')).toBe('lens');
  });

  it('throws (naming the capability) on any other role', () => {
    expect(() => assertRole('auditor', 'a11y')).toThrow(/a11y/);
    expect(() => assertRole(42, 'a11y')).toThrow(ManifestValidationError);
  });
});

describe('assertAppliesToken', () => {
  it('accepts universal and every archetype', () => {
    for (const t of ['universal', 'ssr', 'backend', 'spa', 'lib'] as const) {
      expect(assertAppliesToken(t, 'x')).toBe(t);
    }
  });

  it('throws on an unknown token', () => {
    expect(() => assertAppliesToken('mobile', 'a11y')).toThrow(/a11y/);
  });
});

// safeJoin is the lexical path-containment floor shared by the archetype install
// (install-capabilities.ts), the drift check (diff.ts), and remove.ts — the last
// non-capability copy path (install-modules.ts) was deleted, so this is where the
// escape invariant is demonstrated directly (P1/P2).
describe('safeJoin (path containment)', () => {
  const base = resolve('/tmp/pharn-base');

  it('returns the joined path for an in-base relative path', () => {
    expect(safeJoin(base, 'a/b')).toBe(resolve(base, 'a/b'));
    expect(safeJoin(base, '.')).toBe(base);
  });

  it('throws on `..` traversal that escapes the base', () => {
    expect(() => safeJoin(base, '../evil')).toThrow(ManifestValidationError);
    expect(() => safeJoin(base, 'a/../../evil')).toThrow(/escape/);
  });

  it('throws on an absolute path outside the base', () => {
    expect(() => safeJoin(base, '/etc/passwd')).toThrow(
      ManifestValidationError,
    );
  });

  it('rejects a sibling dir sharing the base prefix (the + sep guard)', () => {
    // resolve(base, '../pharn-base-evil') lexically startsWith the base string
    // but is NOT under base/ — the `root + sep` check must still reject it.
    expect(() => safeJoin(base, '../pharn-base-evil')).toThrow(/escape/);
  });
});
