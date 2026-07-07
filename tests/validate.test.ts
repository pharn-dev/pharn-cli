import { describe, expect, it } from 'vitest';
import {
  ManifestValidationError,
  MODULE_NAME_RE,
  INSTALL_PATH_RE,
  CAPABILITY_NAME_RE,
  COPY_FILENAME_RE,
  assertSafeString,
  assertNoDotDot,
  assertRole,
  assertAppliesToken,
  isPlainObject,
} from '../src/lib/validate.js';

describe('assertSafeString', () => {
  it('rejects a non-string value', () => {
    expect(() => assertSafeString(42, 'x', MODULE_NAME_RE)).toThrow(
      ManifestValidationError,
    );
  });

  it('rejects control characters', () => {
    const withControl = `pharn-${String.fromCharCode(1)}`;
    expect(() => assertSafeString(withControl, 'x', MODULE_NAME_RE)).toThrow(
      /control/,
    );
  });

  it('rejects a value that does not match the pattern', () => {
    expect(() => assertSafeString('Nope', 'x', MODULE_NAME_RE)).toThrow(
      /invalid format/,
    );
  });

  it('returns the value when it is safe', () => {
    expect(assertSafeString('pharn-core', 'x', MODULE_NAME_RE)).toBe(
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

describe('INSTALL_PATH_RE', () => {
  it('accepts relative paths, single segments, and a trailing slash', () => {
    for (const p of [
      'templates/memory-bank',
      'skills/',
      'commands',
      'pharn-skills-orm/skills/prisma',
    ]) {
      expect(INSTALL_PATH_RE.test(p)).toBe(true);
    }
  });

  it('rejects leading slashes, empty segments, and a bare slash', () => {
    for (const p of ['/etc/x', '//foo', 'a//b', '/']) {
      expect(INSTALL_PATH_RE.test(p)).toBe(false);
    }
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
