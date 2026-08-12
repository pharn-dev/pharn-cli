import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SKIP_DIRS,
  detectArchetypesFromProject,
  scanFileTreeSignals,
} from '../src/lib/detect-archetype.js';
import type { ArchetypeDetection } from '../src/lib/detect-archetype.js';
import { classifyEntry } from '../src/lib/archetype.js';
import { useTmpDir } from './helpers.js';

// Write a package.json (the given value, serialized) into `dir`.
function writePkg(dir: string, pkg: unknown): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
}

// Create an (empty) file at `rel` under `dir`, making parent dirs as needed.
function touch(dir: string, rel: string): void {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, '');
}

describe('detectArchetypesFromProject', () => {
  // A fresh empty tmp dir per test (beforeEach), so the "missing package.json"
  // case is simply a test that writes nothing.
  const tmp = useTmpDir();

  // A found package.json (and NO other files) → packageJsonFound: true;
  // archetypes per its deps. These assert the file-tree scan adds nothing when
  // only a package.json is present (backward compatibility).
  it.each<[string, Record<string, unknown>, ArchetypeDetection]>([
    [
      'next → ssr',
      { dependencies: { next: '15' } },
      { archetypes: ['ssr'], packageJsonFound: true },
    ],
    [
      'express only → backend',
      { dependencies: { express: '4' } },
      { archetypes: ['backend'], packageJsonFound: true },
    ],
    // Frontend-only project → spa, never backend.
    [
      'bare react → spa (no backend)',
      { dependencies: { react: '18' } },
      { archetypes: ['spa'], packageJsonFound: true },
    ],
    // Multi-archetype, returned in the fixed ARCHETYPE_ORDER (backend before spa).
    [
      'express + react → backend + spa',
      { dependencies: { express: '4', react: '18' } },
      { archetypes: ['backend', 'spa'], packageJsonFound: true },
    ],
    // Found but frameworkless → ['lib'] with packageJsonFound: TRUE — the key
    // distinction from a MISSING manifest (packageJsonFound: false) below.
    [
      'no framework → lib (found)',
      { dependencies: { lodash: '4' } },
      { archetypes: ['lib'], packageJsonFound: true },
    ],
    [
      'valid, no dependencies → lib (found)',
      { name: 'x', version: '1.0.0' },
      { archetypes: ['lib'], packageJsonFound: true },
    ],
    // A valid object whose `dependencies` is mis-shaped (untrusted input): the
    // object WAS found (true), but no dependency name matches → benign ['lib'].
    [
      'mis-shaped dependencies → lib (found, benign)',
      { dependencies: 'express' },
      { archetypes: ['lib'], packageJsonFound: true },
    ],
  ])('%s', (_label, pkg, expected) => {
    writePkg(tmp.path(), pkg);
    expect(detectArchetypesFromProject(tmp.path())).toEqual(expected);
  });

  it('reads frameworks from devDependencies too (deps ∪ devDeps)', () => {
    writePkg(tmp.path(), { devDependencies: { next: '15' } });
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['ssr'],
      packageJsonFound: true,
    });
  });

  // A MISSING package.json is packageJsonFound: false — distinct from a
  // found-but-frameworkless project (packageJsonFound: true, above). With no
  // file signals either, both carry archetypes ['lib'].
  it('missing package.json → packageJsonFound: false (distinct from frameworkless)', () => {
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  it('malformed package.json → packageJsonFound: false', () => {
    writeFileSync(join(tmp.path(), 'package.json'), '{ not json');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  it('non-object top-level (a JSON array) → packageJsonFound: false', () => {
    writeFileSync(join(tmp.path(), 'package.json'), JSON.stringify([1, 2, 3]));
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  it('is deterministic — the same project yields the same result', () => {
    writePkg(tmp.path(), { dependencies: { next: '15', express: '4' } });
    expect(detectArchetypesFromProject(tmp.path())).toEqual(
      detectArchetypesFromProject(tmp.path()),
    );
  });
});

describe('detectArchetypesFromProject — file-tree scanning', () => {
  const tmp = useTmpDir();

  // The headline case: a project with a .tsx file and NO package.json is
  // detected as `spa` FROM FILES ALONE. Also pins the intentionally-changed
  // coupling: packageJsonFound:false no longer implies archetypes ['lib'].
  it('.tsx present, no package.json → spa (detected from files, found:false)', () => {
    touch(tmp.path(), 'src/App.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  it('.jsx present with a non-framework package.json → spa (found:true)', () => {
    writePkg(tmp.path(), { name: 'x', version: '1.0.0' });
    touch(tmp.path(), 'Button.jsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // Pure-backend tree → backend, NEVER spa (the required inverse of the headline).
  it('api/ dir, no .tsx, no package.json → backend, not spa', () => {
    touch(tmp.path(), 'api/users.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: false,
    });
  });

  it('next.config.js in tree, no next dep → ssr', () => {
    touch(tmp.path(), 'next.config.js');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['ssr'],
      packageJsonFound: false,
    });
  });

  it('app/**/route.ts handler → backend', () => {
    touch(tmp.path(), 'app/users/route.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: false,
    });
  });

  // THE merge-correctness case: package.json react (→ would be spa) + a file-tree
  // ssr signal → merged ssr SUPPRESSES spa → ['ssr'] only. This is what proves
  // the merge is signals-then-rule (decision #3), not union-of-sets (which would
  // wrongly yield ['ssr','spa']).
  it('react dep + next.config in tree → ssr only (spa suppressed by merged signal)', () => {
    writePkg(tmp.path(), { dependencies: { react: '18' } });
    touch(tmp.path(), 'next.config.mjs');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['ssr'],
      packageJsonFound: true,
    });
  });

  it('express dep + .tsx in tree → backend + spa (merge is additive)', () => {
    writePkg(tmp.path(), { dependencies: { express: '4' } });
    touch(tmp.path(), 'web/App.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend', 'spa'],
      packageJsonFound: true,
    });
  });

  // Bounded walk — skip-list. A signal buried in a skipped dir must not count.
  it('.tsx under node_modules/ is skipped → lib', () => {
    touch(tmp.path(), 'node_modules/react-dom/index.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  it('.jsx under dist/ is skipped → lib', () => {
    touch(tmp.path(), 'dist/bundle.jsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // A DB-located `.sql` (db/schema.sql) and a top-level migrations/ dir both map
  // to `backend` — a DB concern folds onto the backend archetype (the enum has no
  // `db` member). archetype-path-context scopes WHERE these count (see the
  // path-context block below); both fixtures here are in-location.
  it('.sql files and a migrations/ dir → backend', () => {
    touch(tmp.path(), 'db/schema.sql');
    touch(tmp.path(), 'migrations/001_init.sql');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: false,
    });
  });

  // archetype-path-context (scopes archetype-enum-align): a lone `.sql` OUTSIDE a
  // DB-location dir is a committed seed/query file, NOT proof of a backend — it no
  // longer fires (was ['backend'] under the earlier "anywhere" rule).
  it('a lone .sql file outside a DB dir → lib (not backend)', () => {
    touch(tmp.path(), 'queries.sql');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // The migrations/ DIR signal in isolation (a non-.sql migration file, so the
  // dir — not a .sql file — is what triggers backend).
  it('a migrations/ dir with a non-.sql migration → backend', () => {
    touch(tmp.path(), 'migrations/001_init.js');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: false,
    });
  });

  // archetype-path-context: a ROOT `.sql` beside a `.tsx` no longer adds backend —
  // the seed file is not in a DB location — so only the client-UI signal survives.
  it('a root .sql file + a .tsx file → spa only (root .sql no longer backend)', () => {
    touch(tmp.path(), 'schema.sql');
    touch(tmp.path(), 'App.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  // Merge preserved with a DB-LOCATED `.sql`: db/schema.sql (backend) + a .tsx
  // (spa) → backend + spa, in ARCHETYPE_ORDER.
  it('a db/ .sql file + a .tsx file → backend + spa', () => {
    touch(tmp.path(), 'db/schema.sql');
    touch(tmp.path(), 'web/App.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend', 'spa'],
      packageJsonFound: false,
    });
  });

  // Merge: a DB signal does NOT suppress ssr — a Next app with migrations is
  // ssr + backend (the SSR suppression only gates the spa signal).
  it('a migrations/ dir + next.config.js → ssr + backend', () => {
    touch(tmp.path(), 'migrations/001_init.sql');
    touch(tmp.path(), 'next.config.js');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['ssr', 'backend'],
      packageJsonFound: false,
    });
  });

  // Case-insensitive name membership (case-insensitive filesystems / odd casing).
  it('matches names case-insensitively (Widget.TSX → spa)', () => {
    touch(tmp.path(), 'Components/Widget.TSX');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  it('is deterministic on a multi-signal tree', () => {
    touch(tmp.path(), 'App.tsx');
    touch(tmp.path(), 'next.config.js');
    mkdirSync(join(tmp.path(), 'api'), { recursive: true });
    // ssr (next.config) + backend (api dir); clientUi suppressed by ssr.
    const expected: ArchetypeDetection = {
      archetypes: ['ssr', 'backend'],
      packageJsonFound: false,
    };
    expect(detectArchetypesFromProject(tmp.path())).toEqual(expected);
    expect(detectArchetypesFromProject(tmp.path())).toEqual(expected);
  });

  // Symlinks are never followed or classified — a symlink whose NAME would match
  // a signal (Danger.tsx) is skipped, so the walk cannot be steered or escape
  // `root` via a symlink (P2). Guarded: skip on platforms that can't symlink.
  it('does not classify or follow a symlink (even a .tsx-named one)', () => {
    let symlinked = false;
    try {
      symlinkSync(
        join(tmp.path(), 'no-such-target'),
        join(tmp.path(), 'Danger.tsx'),
      );
      symlinked = true;
    } catch {
      // no symlink privilege on this platform — property untested here.
    }
    if (!symlinked) return;
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });
});

describe('detectArchetypesFromProject — path-context scoping (archetype-path-context)', () => {
  const tmp = useTmpDir();

  // ---- Rule 1: api/ dir scoped to top-level | pages/api | app/api ----

  // The headline false-positive fix: a nested `src/api/` (client fetch wrappers)
  // is a FRONTEND convention → it must NOT contribute backend. react → spa only.
  it('react dep + src/api/ (client wrappers) → spa only (src/api not backend)', () => {
    writePkg(tmp.path(), { dependencies: { react: '18' } });
    touch(tmp.path(), 'src/api/client.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // src/api/ in isolation (no dep, no other signal) → lib, never backend.
  it('a lone src/api/ dir → lib (nested api is not a backend signal)', () => {
    touch(tmp.path(), 'src/api/users.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // Fable #1 literal (GATE-1 Q3): a REAL express dep makes it backend
  // legitimately; react makes it spa; src/api/ correctly adds nothing.
  it('express + react deps + src/api/ → backend + spa (backend from express)', () => {
    writePkg(tmp.path(), { dependencies: { express: '4', react: '18' } });
    touch(tmp.path(), 'src/api/client.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend', 'spa'],
      packageJsonFound: true,
    });
  });

  // Legit backend api location still fires: Pages-Router `pages/api`.
  it('pages/api/ (Pages Router) → backend', () => {
    touch(tmp.path(), 'pages/api/users.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: false,
    });
  });

  // App-Router `app/api` folder → backend (the api dir whose immediate parent is
  // `app`). A non-route file isolates the api-DIR rule (parent === 'app') from the
  // route.ts rule.
  it('app/api/ (App Router api folder) → backend (parent app)', () => {
    touch(tmp.path(), 'app/api/health.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: false,
    });
  });

  // ---- Rule 3: route.* scoped to an App-Router `app/` ancestor ----

  // A non-Next client router's route.ts (e.g. Vue) → NOT backend. vue → spa only.
  it('vue dep + src/router/route.ts (client router) → spa only (not backend)', () => {
    writePkg(tmp.path(), { dependencies: { vue: '3' } });
    touch(tmp.path(), 'src/router/route.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // An App-Router handler under src/app/** still fires (app ancestor, nested).
  it('src/app/users/route.ts → backend (App-Router ancestor under src/)', () => {
    touch(tmp.path(), 'src/app/users/route.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: false,
    });
  });

  // ---- Rule 4: .sql scoped to a DB-location dir; migrations/ scoped too (Q2) ----

  // A frontend's committed seed.sql at the root → NOT backend. react → spa only.
  it('react dep + root seed.sql → spa only (committed seed is not backend)', () => {
    writePkg(tmp.path(), { dependencies: { react: '18' } });
    touch(tmp.path(), 'seed.sql');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // A DB-located .sql → backend.
  it('db/seed.sql → backend (.sql inside a DB-location dir)', () => {
    touch(tmp.path(), 'db/seed.sql');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: false,
    });
  });

  // GATE-1 Q2: a deep, non-DB migrations/ dir (e.g. client state migrations) →
  // NOT backend. react → spa only.
  it('react dep + src/state/migrations/ (non-DB) → spa only (migrations scoped)', () => {
    writePkg(tmp.path(), { dependencies: { react: '18' } });
    touch(tmp.path(), 'src/state/migrations/v1.ts');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // GATE-1 Q2: a migrations/ dir UNDER a DB-location ancestor (prisma/) → backend.
  it('prisma/migrations/ → backend (migrations under a DB ancestor)', () => {
    touch(tmp.path(), 'prisma/migrations/001_init.sql');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: false,
    });
  });

  // ---- Rule 2: .tsx/.jsx excluded in test trees / email templates ----

  // A backend with react-email templates (emails/*.tsx) must not become spa.
  it('express dep + emails/Welcome.tsx → backend only (email template not spa)', () => {
    writePkg(tmp.path(), { dependencies: { express: '4' } });
    touch(tmp.path(), 'emails/Welcome.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: true,
    });
  });

  // A real component still yields spa (the required inverse).
  it('components/Button.tsx (real component) → spa', () => {
    touch(tmp.path(), 'components/Button.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  // A *.test.tsx fixture alone is not a UI signal (basename regex).
  it('a lone Button.test.tsx fixture → lib (test fixture, not spa)', () => {
    touch(tmp.path(), 'src/Button.test.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // grill #2 coverage: the `.spec.jsx` arm of the fixture regex.
  it('a lone widget.spec.jsx fixture → lib (spec fixture, not spa)', () => {
    touch(tmp.path(), 'widget.spec.jsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // grill #2 coverage: a `.tsx` under a tests/ tree (NON_UI_DIRS member).
  it('a .tsx under tests/ → lib (test tree excluded)', () => {
    touch(tmp.path(), 'tests/Example.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // Determinism holds on a path-scoped multi-signal tree.
  it('is deterministic on a path-scoped tree', () => {
    writePkg(tmp.path(), { dependencies: { react: '18' } });
    touch(tmp.path(), 'src/api/client.ts');
    touch(tmp.path(), 'db/schema.sql');
    touch(tmp.path(), 'emails/Welcome.tsx');
    // react → spa; db/schema.sql → backend; src/api & emails/*.tsx contribute
    // nothing. → backend + spa (ARCHETYPE_ORDER), stable across runs.
    const expected: ArchetypeDetection = {
      archetypes: ['backend', 'spa'],
      packageJsonFound: true,
    };
    expect(detectArchetypesFromProject(tmp.path())).toEqual(expected);
    expect(detectArchetypesFromProject(tmp.path())).toEqual(expected);
  });
});

describe('scanFileTreeSignals', () => {
  const tmp = useTmpDir();

  it('an empty tree → all signals false', () => {
    expect(scanFileTreeSignals(tmp.path())).toEqual({
      ssr: false,
      backend: false,
      clientUi: false,
    });
  });

  it('collects clientUi from a .tsx and backend from an api/ dir', () => {
    touch(tmp.path(), 'src/Page.tsx');
    mkdirSync(join(tmp.path(), 'api'), { recursive: true });
    expect(scanFileTreeSignals(tmp.path())).toEqual({
      ssr: false,
      backend: true,
      clientUi: true,
    });
  });
});

// ---------------------------------------------------------------------------
// SKIP_DIRS — pinned UNIFORMLY over the shipped set, old members and new. These
// iterate the exported production constant rather than a copy, so a member added
// to (or removed from) SKIP_DIRS is covered here the moment it lands and the pins
// cannot drift from the list the walk actually uses.
// ---------------------------------------------------------------------------

const NO_SIGNAL = { ssr: false, backend: false, clientUi: false };

// STRUCTURAL INVARIANT — classification neutrality. `classifyEntry` recognizes
// DIRECTORY names as signals (`api/`, `migrations/` → backend), and the walk
// `continue`s a skipped dir BEFORE classifying it — so adding a signal-bearing
// name to SKIP_DIRS would silently silence a detector. No current member
// collides; this pin is deliberately GENERIC so it fails the day one does.
//
// The three ancestor contexts are the ones that can turn a directory name into a
// signal: the top level and a `pages`/`app` parent (both `api` triggers), and a
// SQL-host ancestor. `['db']` is a member of the module-private SQL_HOST_DIRS in
// archetype.ts ({migrations, db, database, prisma, drizzle, sql}) — the context
// in which `migrations` fires.
describe('SKIP_DIRS — classification neutrality (classifyEntry)', () => {
  const CONTEXTS: ReadonlyArray<[string, readonly string[]]> = [
    ['at the top level', []],
    ['under app/ (an api parent trigger)', ['app']],
    ['under pages/ (the other api parent trigger)', ['pages']],
    ['under db/ (a SQL_HOST_DIRS ancestor — the migrations trigger)', ['db']],
  ];

  describe.each([...SKIP_DIRS])('%s', (dir) => {
    it.each(CONTEXTS)('produces no signal %s', (_label, segments) => {
      expect(classifyEntry(dir, true, segments)).toEqual(NO_SIGNAL);
    });
  });
});

// BEHAVIORAL PIN, per member: a real signal file buried inside the skipped dir
// contributes nothing, while the SAME file outside it does — the paired control
// is what proves the null result is the skip and not an inert fixture.
describe('SKIP_DIRS — a signal inside a skipped dir never counts', () => {
  const tmp = useTmpDir();

  it.each([...SKIP_DIRS])('%s/ is skipped', (dir) => {
    touch(tmp.path(), join(dir, 'Widget.tsx'));
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
    // Paired control: the same basename outside the skipped dir DOES signal.
    touch(tmp.path(), 'src/Widget.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  // The membership test is `SKIP_DIRS.has(name.toLowerCase())`, so the skip must
  // hold for a differently-cased directory too (the file-name analog is pinned by
  // 'matches names case-insensitively (Widget.TSX → spa)' above).
  it.each([...SKIP_DIRS])('%s/ is skipped case-insensitively', (dir) => {
    touch(tmp.path(), join(dir.toUpperCase(), 'Widget.tsx'));
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
    touch(tmp.path(), 'src/Widget.tsx');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });
});
