import { describe, expect, it } from 'vitest';
import { olderCliWarning } from '../src/lib/older-cli.js';

// The pure half of the older-CLI warning: `olderCliWarning(recorded, running)`.
// The command suites (tests/commands/older-cli.test.ts) prove where it prints.

describe('olderCliWarning: when it warns', () => {
  it('warns when this CLI is one minor behind, naming both versions and the upgrade', () => {
    const warning = olderCliWarning('0.20.0', '0.19.3');
    expect(warning).toBe(
      "pharn.config.json was written by pharn 0.20.0; this is pharn 0.19.3. Upgrade pharn (`npm install -g @pharn-dev/pharn@latest`, or run `npx @pharn-dev/pharn@latest`) so teammates on different versions don't undo each other's changes. Continuing.",
    );
  });

  it('warns when this CLI is a major behind, whatever its minor', () => {
    expect(olderCliWarning('1.0.0', '0.25.4')).toContain(
      'written by pharn 1.0.0; this is pharn 0.25.4',
    );
  });

  it('compares minors as numbers, not text: 0.10 is newer than 0.9', () => {
    expect(olderCliWarning('0.10.0', '0.9.7')).not.toBeNull();
    expect(olderCliWarning('0.9.7', '0.10.0')).toBeNull();
  });

  it('a prerelease config counts at its major.minor and is printed as recorded', () => {
    expect(olderCliWarning('0.21.0-rc.1', '0.20.9')).toContain(
      'written by pharn 0.21.0-rc.1; this is pharn 0.20.9',
    );
  });

  it('caps a long prerelease suffix where it is printed', () => {
    const long = `0.21.0-${'a'.repeat(200)}`;
    const warning = olderCliWarning(long, '0.20.0') ?? '';
    expect(warning).toContain('…; this is pharn 0.20.0');
    expect(warning).not.toContain('a'.repeat(100));
  });
});

describe('olderCliWarning: when it stays quiet', () => {
  it.each([
    ['equal versions', '0.20.0', '0.20.0'],
    ['a newer patch only', '0.20.5', '0.20.0'],
    ['this CLI a minor ahead', '0.20.0', '0.21.0'],
    ['this CLI a major ahead', '0.99.0', '1.0.0'],
    ['a prerelease of the same minor (config)', '0.21.0-rc.1', '0.21.0'],
    ['a prerelease of the same minor (CLI)', '0.21.0', '0.21.0-beta.2'],
  ])('%s', (_label, recorded, running) => {
    expect(olderCliWarning(recorded, running)).toBeNull();
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['a number', 0.21],
    ['an empty string', ''],
    ['two parts', '0.21'],
    ['a v prefix', 'v0.21.0'],
    ['a wildcard', '0.21.x'],
    ['four parts', '0.21.0.1'],
    ['an escape sequence', '0.21.0\u001b[2J'],
    ['an object', { major: 9 }],
  ])('a pharnVersion that is %s', (_label, recorded) => {
    expect(olderCliWarning(recorded, '0.19.0')).toBeNull();
  });

  it('an unparseable running version never warns', () => {
    expect(olderCliWarning('9.0.0', 'dev')).toBeNull();
  });
});
