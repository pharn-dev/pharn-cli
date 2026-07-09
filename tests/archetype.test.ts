import { describe, expect, it } from 'vitest';
import {
  archetypesFromSignals,
  classifyEntry,
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

// classifyEntry — the pure file-tree signal rule, extracted here beside
// packageSignals (P3). Path-context scoping (archetype-path-context): a name
// alone never decides; the lowercased ancestor `segments` scope each structural
// signal. Direct unit coverage of every branch, incl. the app/api parent,
// route.js/.mjs, and a deep DB location.
describe('classifyEntry (file-tree path-context rule)', () => {
  const NONE: ArchetypeSignals = {
    ssr: false,
    backend: false,
    clientUi: false,
  };
  const BACKEND: ArchetypeSignals = {
    ssr: false,
    backend: true,
    clientUi: false,
  };
  const CLIENT: ArchetypeSignals = {
    ssr: false,
    backend: false,
    clientUi: true,
  };
  const SSR: ArchetypeSignals = { ssr: true, backend: false, clientUi: false };

  it.each<[string, string, boolean, string[], ArchetypeSignals]>([
    // Rule 1 — api/ dir: top-level | pages/api | app/api only.
    ['top-level api/ → backend', 'api', true, [], BACKEND],
    ['pages/api → backend', 'api', true, ['pages'], BACKEND],
    ['app/api → backend', 'api', true, ['app'], BACKEND],
    ['nested src/api → none', 'api', true, ['src'], NONE],
    [
      'app/dashboard/api (parent not app/pages) → none',
      'api',
      true,
      ['app', 'dashboard'],
      NONE,
    ],
    [
      'API uppercase, top-level → backend (case-insensitive)',
      'API',
      true,
      [],
      BACKEND,
    ],

    // Rule 4 — migrations/ dir: top-level | under a DB ancestor.
    ['top-level migrations/ → backend', 'migrations', true, [], BACKEND],
    ['prisma/migrations → backend', 'migrations', true, ['prisma'], BACKEND],
    [
      'deep non-DB src/state/migrations → none',
      'migrations',
      true,
      ['src', 'state'],
      NONE,
    ],
    ['a plain dir → none', 'components', true, ['src'], NONE],

    // Rule 3 — route.* under an app/ ancestor (incl. .js/.mjs).
    ['app/route.ts → backend', 'route.ts', false, ['app'], BACKEND],
    [
      'src/app/users/route.ts → backend',
      'route.ts',
      false,
      ['src', 'app', 'users'],
      BACKEND,
    ],
    ['route.js under app → backend', 'route.js', false, ['app'], BACKEND],
    ['route.mjs under app → backend', 'route.mjs', false, ['app'], BACKEND],
    [
      'client router src/router/route.ts → none',
      'route.ts',
      false,
      ['src', 'router'],
      NONE,
    ],

    // Rule 4 — .sql inside a DB location (incl. a deep DB ancestor).
    ['db/seed.sql → backend', 'seed.sql', false, ['db'], BACKEND],
    [
      'deep server/db/schema.sql → backend',
      'schema.sql',
      false,
      ['server', 'db'],
      BACKEND,
    ],
    ['root seed.sql → none', 'seed.sql', false, [], NONE],
    ['non-DB fixtures/seed.sql → none', 'seed.sql', false, ['fixtures'], NONE],

    // ssr — next.config.*
    ['next.config.mjs → ssr', 'next.config.mjs', false, [], SSR],

    // Rule 2 — .tsx/.jsx client-UI, excluding test trees / email templates.
    ['src/App.tsx → clientUi', 'App.tsx', false, ['src'], CLIENT],
    ['root Button.jsx → clientUi', 'Button.jsx', false, [], CLIENT],
    [
      'Widget.TSX under components → clientUi (case-insensitive)',
      'Widget.TSX',
      false,
      ['components'],
      CLIENT,
    ],
    [
      'emails/Welcome.tsx → none (email template)',
      'Welcome.tsx',
      false,
      ['emails'],
      NONE,
    ],
    [
      'tests/Example.tsx → none (test tree)',
      'Example.tsx',
      false,
      ['tests'],
      NONE,
    ],
    [
      'co-located Button.test.tsx → none (fixture)',
      'Button.test.tsx',
      false,
      ['src'],
      NONE,
    ],
    ['widget.spec.jsx → none (fixture)', 'widget.spec.jsx', false, [], NONE],
  ])('%s', (_label, name, isDir, segments, expected) => {
    expect(classifyEntry(name, isDir, segments)).toEqual(expected);
  });
});
