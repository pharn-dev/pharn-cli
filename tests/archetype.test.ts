import { describe, expect, it } from 'vitest';
import {
  archetypesFromSignals,
  detectArchetypes,
  mergeSignals,
  packageSignals,
} from '../src/lib/archetype.js';
import type {
  ArchetypeSignals,
  ProjectPackages,
} from '../src/lib/archetype.js';
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
      // archetype-enum-align: prisma now contributes `backend` (DB folds onto
      // the backend archetype), so a Next app with Prisma is ssr + backend.
      'next + prisma → ssr + backend (DB folds onto backend)',
      deps('next', 'prisma'),
      ['ssr', 'backend'],
    ],
    ['prisma → backend (DB folds onto backend)', deps('prisma'), ['backend']],
    ['@prisma/client → backend', deps('@prisma/client'), ['backend']],
    ['drizzle-orm → backend', deps('drizzle-orm'), ['backend']],
    // react (spa) + prisma (backend) → both, in ARCHETYPE_ORDER (backend, spa).
    [
      'react + prisma → backend + spa',
      deps('react', 'prisma'),
      ['backend', 'spa'],
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

// The pure signal pivot: package.json names → raw signals; the archetype rule
// applied once over (merged) signals; the field-wise OR. These are what make the
// two-source merge in detect-archetype.ts correct (the SSR suppression is applied
// once, over merged signals, not per source).
describe('packageSignals', () => {
  it.each<[string, ProjectPackages, ArchetypeSignals]>([
    [
      'next → ssr signal',
      deps('next'),
      { ssr: true, backend: false, clientUi: false },
    ],
    [
      'express → backend signal',
      deps('express'),
      { ssr: false, backend: true, clientUi: false },
    ],
    [
      'react → clientUi signal (ungated — NOT yet spa)',
      deps('react'),
      { ssr: false, backend: false, clientUi: true },
    ],
    [
      'next + react → ssr AND clientUi (suppression happens later)',
      deps('next', 'react'),
      { ssr: true, backend: false, clientUi: true },
    ],
    [
      'no framework → all false',
      deps('lodash'),
      { ssr: false, backend: false, clientUi: false },
    ],
  ])('%s', (_label, pkg, expected) => {
    expect(packageSignals(pkg)).toEqual(expected);
  });

  it('reads devDependencies too', () => {
    expect(packageSignals({ devDependencies: { next: '15' } })).toEqual({
      ssr: true,
      backend: false,
      clientUi: false,
    });
  });
});

describe('archetypesFromSignals', () => {
  it.each<[string, ArchetypeSignals, Archetype[]]>([
    [
      'clientUi only → spa',
      { ssr: false, backend: false, clientUi: true },
      ['spa'],
    ],
    // The single suppression point: clientUi is dropped when ssr is present,
    // regardless of which source contributed each — this is the whole reason the
    // merge is signals-then-rule, not union-of-sets.
    [
      'clientUi + ssr → ssr only (spa suppressed)',
      { ssr: true, backend: false, clientUi: true },
      ['ssr'],
    ],
    [
      'backend + clientUi → backend + spa',
      { ssr: false, backend: true, clientUi: true },
      ['backend', 'spa'],
    ],
    [
      'ssr + backend + clientUi → ssr + backend',
      { ssr: true, backend: true, clientUi: true },
      ['ssr', 'backend'],
    ],
    [
      'all false → lib',
      { ssr: false, backend: false, clientUi: false },
      ['lib'],
    ],
  ])('%s', (_label, sig, expected) => {
    expect(archetypesFromSignals(sig)).toEqual(expected);
  });
});

describe('mergeSignals', () => {
  it('is a field-wise OR of two signal sets', () => {
    expect(
      mergeSignals(
        { ssr: false, backend: false, clientUi: true },
        { ssr: true, backend: false, clientUi: false },
      ),
    ).toEqual({ ssr: true, backend: false, clientUi: true });
  });

  it('is idempotent and order-independent', () => {
    const a: ArchetypeSignals = { ssr: true, backend: false, clientUi: true };
    const b: ArchetypeSignals = { ssr: false, backend: true, clientUi: false };
    expect(mergeSignals(a, b)).toEqual(mergeSignals(b, a));
    expect(mergeSignals(a, a)).toEqual(a);
  });
});
