import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareVersionCore } from '../src/lib/semver.js';

// An npm `overrides` entry is invisible: nothing else in CI enforces it, so a
// dependency bump or a regenerated lockfile can drop a package back below its
// patched version with every gate green. For every override in package.json
// (each one closes an advisory on a transitive dev dependency), and for the
// markdown-it floor the lockfile reached without one, every committed lockfile
// entry of that package must meet the lower bound. Reads the lock, not
// node_modules; a prerelease compares equal to its release (src/lib/semver.ts).

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  overrides: Record<string, string>;
};
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, { version?: string }>;
};

const FLOORS: Record<string, string> = {
  ...pkg.overrides,
  // Not an override: markdownlint-cli2 0.24.0 pins it (GHSA-vfgh-jcmw-g37q).
  'markdown-it': '15.0.3',
};

describe('dependency floors', () => {
  it.each(Object.entries(FLOORS))('%s %s', (name, specifier) => {
    // Only the plain forms are modelled; anything else fails, never passes.
    const bound = /^(?:[~^]|>=|=)?(\d+\.\d+\.\d+)$/.exec(specifier)?.[1];
    expect(bound, `unmodelled specifier ${specifier}`).toBeDefined();
    const entries = Object.entries(lock.packages).filter(([key]) =>
      key.match(new RegExp(`(?:^|/)node_modules/${name}$`)),
    );
    expect(entries.length, `no lockfile entry for ${name}`).toBeGreaterThan(0);
    for (const [key, { version }] of entries) {
      const order = compareVersionCore(String(version), bound!);
      expect(order, `${key}@${String(version)}`).not.toBeNull();
      expect(
        order!,
        `${key}@${String(version)} < ${bound}`,
      ).toBeGreaterThanOrEqual(0);
    }
  });
});
