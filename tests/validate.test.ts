import { describe, expect, it } from 'vitest';
import {
  ManifestValidationError,
  MODULE_NAME_RE,
  INSTALL_PATH_RE,
  assertSafeString,
  assertNoDotDot,
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
