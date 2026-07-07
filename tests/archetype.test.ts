import { describe, expect, it } from 'vitest';
import { detectArchetypes } from '../src/lib/archetype.js';
import type { ProjectPackages } from '../src/lib/archetype.js';
import type { Archetype } from '../src/types.js';

// Build a package.json with the given names as dependencies.
function deps(...names: string[]): ProjectPackages {
  return {
    dependencies: Object.fromEntries(names.map((n) => [n, '1.0.0'])),
  };
}

describe('detectArchetypes', () => {
  it.each<[string, ProjectPackages, Archetype[]]>([
    ['next → ssr', deps('next'), ['ssr']],
    ['express only → backend', deps('express'), ['backend']],
    ['react + bundler → spa', deps('react', 'vite'), ['spa']],
    ['bare react → spa', deps('react'), ['spa']],
    [
      'next + react → ssr (meta-framework wins, not spa)',
      deps('next', 'react'),
      ['ssr'],
    ],
    [
      'next + express → ssr + backend',
      deps('next', 'express'),
      ['ssr', 'backend'],
    ],
    [
      'next + prisma + drizzle → ssr (libs add no archetype)',
      deps('next', 'prisma'),
      ['ssr'],
    ],
    ['no framework → lib', deps('lodash'), ['lib']],
    ['empty package.json → lib', {}, ['lib']],
  ])('%s', (_label, pkg, expected) => {
    expect(detectArchetypes(pkg)).toEqual(expected);
  });

  it('reads frameworks from devDependencies too (deps ∪ devDeps)', () => {
    // next only in devDependencies → still ssr
    expect(detectArchetypes({ devDependencies: { next: '15.0.0' } })).toEqual([
      'ssr',
    ]);
    // react (dep) + express (devDep) → both archetypes, in fixed order
    expect(
      detectArchetypes({
        dependencies: { react: '18.0.0' },
        devDependencies: { express: '4.0.0' },
      }),
    ).toEqual(['backend', 'spa']);
  });

  it('returns archetypes in the fixed enum order regardless of input order', () => {
    // express listed before next in the input; output is still ssr, then backend
    expect(detectArchetypes(deps('express', 'next'))).toEqual([
      'ssr',
      'backend',
    ]);
  });

  it('is deterministic — the same input yields the same result', () => {
    const pkg = deps('next', 'express', 'react');
    expect(detectArchetypes(pkg)).toEqual(detectArchetypes(pkg));
  });
});
