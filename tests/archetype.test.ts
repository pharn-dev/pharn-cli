import { describe, expect, it } from 'vitest';
import {
  archetypesFromSignals,
  classifyEntry,
  detectArchetypes,
  evidenceFor,
  isBaseDir,
  isNextConfigName,
  mergeSignals,
  packageFacts,
  packageSignals,
  parseArchetypeList,
  recordedArchetypes,
} from '../src/lib/archetype.js';
import type {
  ArchetypeSignals,
  ClassifyContext,
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
// classifyEntry (P3). Path-context scoping (archetype-path-context): a name
// alone never decides; the lowercased ancestor `segments` scope each structural
// signal. Detection precision (detection-precision-archetype-override): the
// Next-specific rules additionally need a router root of the entry's BASE and
// Next evidence for that base (`nextBase`), and the language-agnostic backend
// signals (root `api/`, `migrations/`, DB-located `.sql`) need a root
// package.json (`jsProject`). `ctx` is what the walk knows about the entry's
// surroundings; this table pins every gate in both directions.
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

  // A JS project whose root is a Next app.
  const NEXT: ClassifyContext = {
    jsProject: true,
    baseDepth: 0,
    nextBase: true,
  };
  // A JS project with no Next evidence at the root.
  const JS: ClassifyContext = {
    jsProject: true,
    baseDepth: 0,
    nextBase: false,
  };
  // No usable package.json, no Next evidence.
  const BARE: ClassifyContext = {
    jsProject: false,
    baseDepth: 0,
    nextBase: false,
  };
  // No package.json, but a root next.config.* (Next evidence from the tree).
  const NEXT_CONFIG_ONLY: ClassifyContext = {
    jsProject: false,
    baseDepth: 0,
    nextBase: true,
  };
  // Inside a workspace package (apps/<x>, packages/<x>) that has a next.config.*.
  const WS_NEXT: ClassifyContext = {
    jsProject: true,
    baseDepth: 2,
    nextBase: true,
  };

  it.each<
    [string, string, boolean, string[], ClassifyContext, ArchetypeSignals]
  >([
    // api/ dir under a Next router root of the base — needs nextBase.
    ['pages/api + Next → backend', 'api', true, ['pages'], NEXT, BACKEND],
    ['app/api + Next → backend', 'api', true, ['app'], NEXT, BACKEND],
    [
      'src/app/api + Next → backend',
      'api',
      true,
      ['src', 'app'],
      NEXT,
      BACKEND,
    ],
    [
      'src/pages/api + Next → backend',
      'api',
      true,
      ['src', 'pages'],
      NEXT,
      BACKEND,
    ],
    ['app/api, no Next evidence → none', 'api', true, ['app'], JS, NONE],
    [
      'src/app/api (Angular/RTK), no Next → none',
      'api',
      true,
      ['src', 'app'],
      JS,
      NONE,
    ],
    [
      'pages/api, no Next, no manifest → none',
      'api',
      true,
      ['pages'],
      BARE,
      NONE,
    ],
    [
      'pages/api + root next.config only → backend',
      'api',
      true,
      ['pages'],
      NEXT_CONFIG_ONLY,
      BACKEND,
    ],
    [
      'docs/pages/api (not a router root) + Next → none',
      'api',
      true,
      ['docs', 'pages'],
      NEXT,
      NONE,
    ],
    [
      'app/dashboard/api (parent not a router root) → none',
      'api',
      true,
      ['app', 'dashboard'],
      NEXT,
      NONE,
    ],
    [
      'src/features/app/api (not a router root) → none',
      'api',
      true,
      ['src', 'features', 'app'],
      NEXT,
      NONE,
    ],
    ['nested src/api → none', 'api', true, ['src'], NEXT, NONE],
    [
      'apps/web/app/api in a Next workspace package → backend',
      'api',
      true,
      ['apps', 'web', 'app'],
      WS_NEXT,
      BACKEND,
    ],
    [
      'apps/web/app/api, package without Next → none',
      'api',
      true,
      ['apps', 'web', 'app'],
      { ...WS_NEXT, nextBase: false },
      NONE,
    ],

    // Root api/ dir — needs a root package.json.
    ['top-level api/ in a JS project → backend', 'api', true, [], JS, BACKEND],
    [
      'API uppercase, top-level, JS → backend (case-insensitive)',
      'API',
      true,
      [],
      JS,
      BACKEND,
    ],
    [
      'top-level api/, no package.json (Go api/ specs) → none',
      'api',
      true,
      [],
      BARE,
      NONE,
    ],

    // migrations/ dir: top-level | under a DB ancestor — needs a root package.json.
    [
      'top-level migrations/, JS → backend',
      'migrations',
      true,
      [],
      JS,
      BACKEND,
    ],
    [
      'prisma/migrations, JS → backend',
      'migrations',
      true,
      ['prisma'],
      JS,
      BACKEND,
    ],
    [
      'top-level migrations/, no package.json (Flask/golang-migrate) → none',
      'migrations',
      true,
      [],
      BARE,
      NONE,
    ],
    [
      'database/migrations, no package.json (Laravel) → none',
      'migrations',
      true,
      ['database'],
      BARE,
      NONE,
    ],
    [
      'deep non-DB src/state/migrations → none',
      'migrations',
      true,
      ['src', 'state'],
      JS,
      NONE,
    ],
    ['a plain dir → none', 'components', true, ['src'], NEXT, NONE],

    // route.* under an app/ router root of the base — needs nextBase.
    [
      'app/route.ts + Next → backend',
      'route.ts',
      false,
      ['app'],
      NEXT,
      BACKEND,
    ],
    [
      'src/app/users/route.ts + Next → backend',
      'route.ts',
      false,
      ['src', 'app', 'users'],
      NEXT,
      BACKEND,
    ],
    [
      'route.js under app + Next → backend',
      'route.js',
      false,
      ['app'],
      NEXT,
      BACKEND,
    ],
    [
      'route.mjs under app + Next → backend',
      'route.mjs',
      false,
      ['app'],
      NEXT,
      BACKEND,
    ],
    [
      'route.tsx under app + Next → backend (and, being .tsx, clientUi)',
      'route.tsx',
      false,
      ['app'],
      NEXT,
      { ssr: false, backend: true, clientUi: true },
    ],
    [
      'ROUTE.TS under App/API + root next.config only → backend',
      'ROUTE.TS',
      false,
      ['app', 'api'],
      NEXT_CONFIG_ONLY,
      BACKEND,
    ],
    [
      'Vue src/app/router/route.ts, no Next → none',
      'route.ts',
      false,
      ['src', 'app', 'router'],
      JS,
      NONE,
    ],
    [
      'app/api/route.ts, no package.json, no Next → none',
      'route.ts',
      false,
      ['app', 'api'],
      BARE,
      NONE,
    ],
    [
      'pages/route.ts (pages is not an App Router root) + Next → none',
      'route.ts',
      false,
      ['pages'],
      NEXT,
      NONE,
    ],
    [
      'lib/app/route.ts (not a router root) + Next → none',
      'route.ts',
      false,
      ['lib', 'app'],
      NEXT,
      NONE,
    ],
    [
      'client router src/router/route.ts → none',
      'route.ts',
      false,
      ['src', 'router'],
      NEXT,
      NONE,
    ],
    [
      'apps/web/app/x/route.ts in a Next workspace package → backend',
      'route.ts',
      false,
      ['apps', 'web', 'app', 'x'],
      WS_NEXT,
      BACKEND,
    ],
    [
      'apps/web/route.ts (not under app/) → none',
      'route.ts',
      false,
      ['apps', 'web'],
      WS_NEXT,
      NONE,
    ],

    // .sql inside a DB location — needs a root package.json.
    ['db/seed.sql, JS → backend', 'seed.sql', false, ['db'], JS, BACKEND],
    [
      'deep server/db/schema.sql, JS → backend',
      'schema.sql',
      false,
      ['server', 'db'],
      JS,
      BACKEND,
    ],
    [
      'db/structure.sql, no package.json (Rails) → none',
      'structure.sql',
      false,
      ['db'],
      BARE,
      NONE,
    ],
    [
      'migrations/001.up.sql, no package.json (golang-migrate) → none',
      '001.up.sql',
      false,
      ['migrations'],
      BARE,
      NONE,
    ],
    ['root seed.sql → none', 'seed.sql', false, [], JS, NONE],
    [
      'non-DB fixtures/seed.sql → none',
      'seed.sql',
      false,
      ['fixtures'],
      JS,
      NONE,
    ],

    // ssr — next.config.* only directly in a base (root, apps/<x>, packages/<x>).
    ['root next.config.mjs → ssr', 'next.config.mjs', false, [], BARE, SSR],
    [
      'root Next.Config.JS → ssr (case-insensitive)',
      'Next.Config.JS',
      false,
      [],
      BARE,
      SSR,
    ],
    [
      'apps/web/next.config.js → ssr',
      'next.config.js',
      false,
      ['apps', 'web'],
      JS,
      SSR,
    ],
    [
      'packages/site/next.config.ts → ssr',
      'next.config.ts',
      false,
      ['packages', 'site'],
      JS,
      SSR,
    ],
    [
      'website/next.config.js (docs site) → none',
      'next.config.js',
      false,
      ['website'],
      JS,
      NONE,
    ],
    [
      'src/next.config.js → none (Next never reads it there)',
      'next.config.js',
      false,
      ['src'],
      JS,
      NONE,
    ],
    [
      'apps/next.config.js (the container itself) → none',
      'next.config.js',
      false,
      ['apps'],
      JS,
      NONE,
    ],
    [
      'apps/web/nested/next.config.js → none',
      'next.config.js',
      false,
      ['apps', 'web', 'nested'],
      JS,
      NONE,
    ],
    [
      'examples/demo/next.config.js → none (not a workspace container)',
      'next.config.js',
      false,
      ['examples', 'demo'],
      JS,
      NONE,
    ],

    // .tsx/.jsx client-UI, excluding test trees / email templates — ungated.
    ['src/App.tsx → clientUi', 'App.tsx', false, ['src'], BARE, CLIENT],
    ['root Button.jsx → clientUi', 'Button.jsx', false, [], BARE, CLIENT],
    [
      'Widget.TSX under components → clientUi (case-insensitive)',
      'Widget.TSX',
      false,
      ['components'],
      BARE,
      CLIENT,
    ],
    [
      'emails/Welcome.tsx → none (email template)',
      'Welcome.tsx',
      false,
      ['emails'],
      JS,
      NONE,
    ],
    [
      'tests/Example.tsx → none (test tree)',
      'Example.tsx',
      false,
      ['tests'],
      JS,
      NONE,
    ],
    [
      'co-located Button.test.tsx → none (fixture)',
      'Button.test.tsx',
      false,
      ['src'],
      JS,
      NONE,
    ],
    [
      'widget.spec.jsx → none (fixture)',
      'widget.spec.jsx',
      false,
      [],
      JS,
      NONE,
    ],
  ])('%s', (_label, name, isDir, segments, ctx, expected) => {
    expect(classifyEntry(name, isDir, segments, ctx)).toEqual(expected);
  });
});

describe('isBaseDir', () => {
  it.each<[string[], boolean]>([
    [[], true],
    [['apps', 'web'], true],
    [['packages', 'ui'], true],
    [['apps'], false],
    [['packages'], false],
    [['apps', 'web', 'src'], false],
    [['examples', 'demo'], false],
    [['src'], false],
  ])('%j → %s', (segments, expected) => {
    expect(isBaseDir(segments)).toBe(expected);
  });
});

describe('isNextConfigName', () => {
  it.each<[string, boolean]>([
    ['next.config.js', true],
    ['next.config.mjs', true],
    ['Next.Config.TS', true],
    ['next.config', false],
    ['next-config.js', false],
    ['my.next.config.js', false],
  ])('%s → %s', (name, expected) => {
    expect(isNextConfigName(name)).toBe(expected);
  });
});

// packageFacts: the evidence-carrying sibling of packageSignals. Its `signals`
// are packageSignals' output byte-for-byte; `evidence` names the FIRST allowlist
// member present, in allowlist order (never the manifest's key order), so the
// same project always cites the same dependency.
describe('packageFacts', () => {
  it('signals equal packageSignals for the same manifest', () => {
    const pkg = deps('react', 'express', 'next');
    expect(packageFacts(pkg).signals).toEqual(packageSignals(pkg));
  });

  it('cites the first allowlist member present, independent of key order', () => {
    const a = packageFacts(deps('hono', 'express', 'react', 'vue'));
    const b = packageFacts(deps('vue', 'react', 'express', 'hono'));
    expect(a.evidence).toEqual({ backend: 'express', clientUi: 'react' });
    expect(b.evidence).toEqual(a.evidence);
  });

  it('reports the next dependency (the root base Next evidence)', () => {
    expect(packageFacts(deps('next')).nextDependency).toBe(true);
    expect(packageFacts(deps('nuxt')).nextDependency).toBe(false);
    expect(packageFacts(deps('nuxt')).evidence).toEqual({ ssr: 'nuxt' });
  });

  it('a manifest with no framework → no signals, no evidence', () => {
    const facts = packageFacts({ devDependencies: { typescript: '5' } });
    expect(facts.signals).toEqual({
      ssr: false,
      backend: false,
      clientUi: false,
    });
    expect(facts.evidence).toEqual({});
    expect(facts.nextDependency).toBe(false);
  });
});

// The per-archetype evidence the install summary prints. Dependency evidence
// wins over path evidence for the same signal (package.json is read first);
// `spa` cites the client-UI trigger; `lib` cites nothing.
describe('evidenceFor', () => {
  it('one entry per archetype, dependency before path', () => {
    expect(
      evidenceFor(
        ['ssr', 'backend'],
        { ssr: 'next' },
        { ssr: 'next.config.js', backend: 'app/api/x/route.ts' },
      ),
    ).toEqual([
      { archetype: 'ssr', source: 'dependency', name: 'next' },
      { archetype: 'backend', source: 'path', path: 'app/api/x/route.ts' },
    ]);
  });

  it('spa cites the client-UI trigger', () => {
    expect(evidenceFor(['spa'], {}, { clientUi: 'src/App.tsx' })).toEqual([
      { archetype: 'spa', source: 'path', path: 'src/App.tsx' },
    ]);
  });

  it('lib cites nothing', () => {
    expect(evidenceFor(['lib'], {}, {})).toEqual([
      { archetype: 'lib', source: 'none' },
    ]);
  });
});

// The `--archetype` grammar (P5: exact membership or refuse). Shared by the
// dispatch's refusal and nothing else.
describe('parseArchetypeList', () => {
  it.each<[string, Archetype[]]>([
    ['ssr', ['ssr']],
    ['backend', ['backend']],
    ['spa', ['spa']],
    ['lib', ['lib']],
    ['spa,backend', ['backend', 'spa']],
    ['spa,backend,ssr', ['ssr', 'backend', 'spa']],
  ])('accepts %j → %j (canonical order)', (value, expected) => {
    expect(parseArchetypeList(value)).toEqual(expected);
  });

  it.each([
    '',
    ',',
    'backend,',
    ',backend',
    'backend,,spa',
    'backend,backend',
    'Backend',
    'BACKEND',
    'backend, spa',
    ' backend',
    'bogus',
    'universal',
    'lib,backend',
    'spa,lib',
    'lib,lib',
    '__proto__',
    'toString',
  ])('refuses %j', (value) => {
    expect(parseArchetypeList(value)).toBeNull();
  });
});

// The replaced config's `archetypes`, read for DISPLAY only (the "previously
// recorded" line). Hand-editable, so anything but an array of canonical members
// is no list at all — never sanitized text.
describe('recordedArchetypes', () => {
  it('an array of canonical members → that set, in canonical order', () => {
    expect(recordedArchetypes(['spa', 'ssr'])).toEqual(['ssr', 'spa']);
    expect(recordedArchetypes(['lib'])).toEqual(['lib']);
  });

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['a string', 'ssr'],
    ['an empty array', []],
    ['a non-member', ['ssr', 'bogus']],
    ['an ESC-carrying string', ['ssr\u001b[2J']],
    ['a number', [1]],
    ['an object', { 0: 'ssr' }],
  ])('%s → null', (_label, value) => {
    expect(recordedArchetypes(value)).toBeNull();
  });
});
