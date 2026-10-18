import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ECOSYSTEM_DIRS,
  MAX_PACKAGE_JSON_BYTES,
  SKIP_DIRS,
  WALK_LIMITS,
  detectArchetypesFromProject,
  readPackageFacts,
  scanFileTree,
  scanFileTreeSignals,
} from '../src/lib/detect-archetype.js';
import type { ArchetypeDetection } from '../src/lib/detect-archetype.js';

// The archetype verdict without its evidence or the truncation flag (each has
// its own suite below), beside whether package.json was read as usable (the
// manifest boundary, `readPackageFacts`).
type Detected = Pick<ArchetypeDetection, 'archetypes'> & {
  packageJsonFound: boolean;
};
import {
  archetypesFromSignals,
  classifyEntry,
  evidenceFor,
  mergeSignals,
  packageFacts,
} from '../src/lib/archetype.js';
import { useTmpDir } from './helpers.js';

// Write a package.json (the given value, serialized) into `dir`.
function writePkg(dir: string, pkg: unknown): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
}

// Detect, keeping only the archetypes, + whether package.json was usable.
function detect(dir: string): Detected {
  const { archetypes } = detectArchetypesFromProject(dir);
  const { packageJsonFound } = readPackageFacts(dir);
  return { archetypes, packageJsonFound };
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
  it.each<[string, Record<string, unknown>, Detected]>([
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
    expect(detect(tmp.path())).toEqual(expected);
  });

  it('reads frameworks from devDependencies too (deps ∪ devDeps)', () => {
    writePkg(tmp.path(), { devDependencies: { next: '15' } });
    expect(detect(tmp.path())).toEqual({
      archetypes: ['ssr'],
      packageJsonFound: true,
    });
  });

  // A MISSING package.json is packageJsonFound: false — distinct from a
  // found-but-frameworkless project (packageJsonFound: true, above). With no
  // file signals either, both carry archetypes ['lib'].
  it('missing package.json → packageJsonFound: false (distinct from frameworkless)', () => {
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  it('malformed package.json → packageJsonFound: false', () => {
    writeFileSync(join(tmp.path(), 'package.json'), '{ not json');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  it('non-object top-level (a JSON array) → packageJsonFound: false', () => {
    writeFileSync(join(tmp.path(), 'package.json'), JSON.stringify([1, 2, 3]));
    expect(detect(tmp.path())).toEqual({
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

// PHARN-15: the package.json read is ONE bounded descriptor read. Every
// unusable shape yields `packageJsonFound: false` (readPackageFacts) and never
// throws or blocks.
describe('detectArchetypesFromProject — package.json read hardening', () => {
  const tmp = useTmpDir();

  it('strips a UTF-8 BOM (a Next.js manifest still detects ssr)', () => {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      '\uFEFF' + JSON.stringify({ dependencies: { next: '15' } }),
    );
    const result = detectArchetypesFromProject(tmp.path());
    expect(readPackageFacts(tmp.path()).packageJsonFound).toBe(true);
    expect(result.archetypes).toContain('ssr');
  });

  it('treats a manifest over the size cap as not found', () => {
    const pad = ' '.repeat(MAX_PACKAGE_JSON_BYTES);
    writeFileSync(
      join(tmp.path(), 'package.json'),
      `{"dependencies":{"next":"15"}}${pad}`,
    );
    expect(readPackageFacts(tmp.path()).packageJsonFound).toBe(false);
  });

  it('treats a directory at package.json as not found', () => {
    mkdirSync(join(tmp.path(), 'package.json'));
    expect(readPackageFacts(tmp.path()).packageJsonFound).toBe(false);
  });

  it("still follows a symlink to a regular manifest (the user's own project)", () => {
    const real = join(tmp.path(), 'real-package.json');
    writeFileSync(real, JSON.stringify({ dependencies: { next: '15' } }));
    symlinkSync(real, join(tmp.path(), 'package.json'));
    const result = detectArchetypesFromProject(tmp.path());
    expect(readPackageFacts(tmp.path()).packageJsonFound).toBe(true);
    expect(result.archetypes).toContain('ssr');
  });

  it.skipIf(process.platform === 'win32')(
    'does not block on a FIFO at package.json',
    () => {
      execFileSync('mkfifo', [join(tmp.path(), 'package.json')]);
      expect(detectArchetypesFromProject(tmp.path()).archetypes).toEqual([
        'lib',
      ]);
      expect(readPackageFacts(tmp.path()).packageJsonFound).toBe(false);
    },
    5000,
  );

  it.skipIf(process.platform === 'win32')(
    'does not read a device without bound (symlink to /dev/zero)',
    () => {
      symlinkSync('/dev/zero', join(tmp.path(), 'package.json'));
      expect(readPackageFacts(tmp.path()).packageJsonFound).toBe(false);
    },
    5000,
  );
});

// PHARN-15: the uniform SKIP_DIRS pins below iterate the SHIPPED set, so they
// cannot fail when a member is missing. These names are pinned explicitly: a
// UI signal inside any of them is never seen.
describe('SKIP_DIRS — non-JS dependency/build trees', () => {
  const tmp = useTmpDir();

  it.each(['__pycache__', '.yarn'])('%s/ is skipped', (dir) => {
    touch(tmp.path(), `${dir}/x/Page.tsx`);
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(false);
  });
});

// `target`, `vendor`, `venv` and `.venv` are ORDINARY folder names in a JS
// project too — a Next.js route at app/target/route.ts is real source — so each
// is skipped only where it is that ecosystem's tree: beside the build file that
// owns it, or (a virtualenv) holding its pyvenv.cfg. The budget protection
// PHARN-15 added stays for the real trees; a hand-authored folder is scanned.
describe("ECOSYSTEM_DIRS — skipped only where they are that ecosystem's tree", () => {
  const tmp = useTmpDir();

  it.each([
    ['target', 'Cargo.toml'],
    ['target', 'pom.xml'],
    ['target', 'build.sbt'],
    ['vendor', 'go.mod'],
    ['vendor', 'composer.json'],
    ['vendor', 'Gemfile'],
  ])('%s/ beside %s is skipped', (dir, marker) => {
    touch(tmp.path(), marker);
    touch(tmp.path(), `${dir}/x/Page.tsx`);
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(false);
  });

  it.each(['venv', '.venv'])('%s/ holding pyvenv.cfg is skipped', (dir) => {
    touch(tmp.path(), `${dir}/pyvenv.cfg`);
    touch(tmp.path(), `${dir}/x/Page.tsx`);
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(false);
  });

  it.each(['target', 'vendor', 'venv', '.venv'])(
    '%s/ with no marker is scanned like any folder',
    (dir) => {
      touch(tmp.path(), `${dir}/x/Page.tsx`);
      expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(true);
    },
  );

  // THE REPRODUCTION. A Next.js App-Router route under a folder named `target`
  // or `vendor`: the backend signal is structural (`app/**/route.ts`), so no
  // package.json dependency can stand in for it. It went dark.
  it.each(['target', 'vendor'])(
    'detects the route at app/%s/route.ts as backend',
    (dir) => {
      writePkg(tmp.path(), { dependencies: { next: '15' } });
      touch(tmp.path(), `app/${dir}/route.ts`);
      expect(detectArchetypesFromProject(tmp.path()).archetypes).toEqual([
        'ssr',
        'backend',
      ]);
    },
  );

  it('matches the dir name case-insensitively and the marker exactly', () => {
    touch(tmp.path(), 'Cargo.toml');
    touch(tmp.path(), 'TARGET/x/Page.tsx');
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(false);
  });

  it('does not take a differently-cased marker, or a directory, as the marker', () => {
    touch(tmp.path(), 'cargo.toml');
    touch(tmp.path(), 'go.mod/keep');
    touch(tmp.path(), 'target/x/Page.tsx');
    touch(tmp.path(), 'vendor/y/Other.tsx');
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(true);
  });

  it('checks the marker in the SAME directory, at any depth', () => {
    // A nested Rust crate keeps its skip; a sibling marker one level up does
    // not reach into a subfolder.
    touch(tmp.path(), 'crates/core/Cargo.toml');
    touch(tmp.path(), 'crates/core/target/x/Page.tsx');
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(false);
    touch(tmp.path(), 'Cargo.toml');
    touch(tmp.path(), 'web/target/Page.tsx');
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(true);
  });

  it('a marked ecosystem tree costs ZERO budget, like any skipped dir', () => {
    touch(tmp.path(), 'Cargo.toml');
    for (let i = 0; i < 200; i += 1) {
      touch(tmp.path(), `target/debug/f${i}.rlib`);
    }
    touch(tmp.path(), 'src/Page.tsx');
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(true);
  });
});

describe('detectArchetypesFromProject — file-tree scanning', () => {
  const tmp = useTmpDir();

  // The headline case: a project with a .tsx file and NO package.json is
  // detected as `spa` FROM FILES ALONE. Also pins the intentionally-changed
  // coupling: packageJsonFound:false no longer implies archetypes ['lib'].
  it('.tsx present, no package.json → spa (detected from files, found:false)', () => {
    touch(tmp.path(), 'src/App.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  it('.jsx present with a non-framework package.json → spa (found:true)', () => {
    writePkg(tmp.path(), { name: 'x', version: '1.0.0' });
    touch(tmp.path(), 'Button.jsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // Pure-backend tree → backend, NEVER spa (the required inverse of the headline).
  // A root api/ dir is a backend signal in a JS project (a usable package.json).
  it('api/ dir in a JS project, no .tsx → backend, not spa', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'api/users.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: true,
    });
  });

  // detection-precision: with no package.json a root api/ dir is no signal — a
  // Go repo's api/ (OpenAPI specs) is not a backend PHARN's lenses can read.
  it('api/ dir, no package.json → lib (needs JS-ecosystem evidence)', () => {
    touch(tmp.path(), 'api/users.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  it('next.config.js in tree, no next dep → ssr', () => {
    touch(tmp.path(), 'next.config.js');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['ssr'],
      packageJsonFound: false,
    });
  });

  it('app/**/route.ts handler of a Next app → backend', () => {
    writePkg(tmp.path(), { dependencies: { next: '15' } });
    touch(tmp.path(), 'app/users/route.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['ssr', 'backend'],
      packageJsonFound: true,
    });
  });

  // detection-precision: with no Next evidence an app/**/route.ts is not a
  // route handler (a client router's route.ts, a non-JS repo's app/ dir).
  it('app/**/route.ts with no Next evidence → lib', () => {
    touch(tmp.path(), 'app/users/route.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
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
    expect(detect(tmp.path())).toEqual({
      archetypes: ['ssr'],
      packageJsonFound: true,
    });
  });

  it('express dep + .tsx in tree → backend + spa (merge is additive)', () => {
    writePkg(tmp.path(), { dependencies: { express: '4' } });
    touch(tmp.path(), 'web/App.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['backend', 'spa'],
      packageJsonFound: true,
    });
  });

  // Bounded walk — skip-list. A signal buried in a skipped dir must not count.
  it('.tsx under node_modules/ is skipped → lib', () => {
    touch(tmp.path(), 'node_modules/react-dom/index.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  it('.jsx under dist/ is skipped → lib', () => {
    touch(tmp.path(), 'dist/bundle.jsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // A DB-located `.sql` (db/schema.sql) and a top-level migrations/ dir both map
  // to `backend` — a DB concern folds onto the backend archetype (the enum has no
  // `db` member). archetype-path-context scopes WHERE these count (see the
  // path-context block below); both fixtures here are in-location.
  it('.sql files and a migrations/ dir in a JS project → backend', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'db/schema.sql');
    touch(tmp.path(), 'migrations/001_init.sql');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: true,
    });
  });

  // archetype-path-context (scopes archetype-enum-align): a lone `.sql` OUTSIDE a
  // DB-location dir is a committed seed/query file, NOT proof of a backend — it no
  // longer fires (was ['backend'] under the earlier "anywhere" rule).
  it('a lone .sql file outside a DB dir → lib (not backend)', () => {
    touch(tmp.path(), 'queries.sql');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // The migrations/ DIR signal in isolation (a non-.sql migration file, so the
  // dir — not a .sql file — is what triggers backend).
  it('a migrations/ dir with a non-.sql migration → backend', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'migrations/001_init.js');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: true,
    });
  });

  // detection-precision: the same tree with no package.json is a non-JS repo's
  // migrations (Flask-Migrate, golang-migrate, sqlx) → no signal.
  it('migrations/ and db/*.sql with no package.json → lib', () => {
    touch(tmp.path(), 'migrations/001_init.sql');
    touch(tmp.path(), 'db/schema.sql');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // archetype-path-context: a ROOT `.sql` beside a `.tsx` no longer adds backend —
  // the seed file is not in a DB location — so only the client-UI signal survives.
  it('a root .sql file + a .tsx file → spa only (root .sql no longer backend)', () => {
    touch(tmp.path(), 'schema.sql');
    touch(tmp.path(), 'App.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  // Merge preserved with a DB-LOCATED `.sql`: db/schema.sql (backend) + a .tsx
  // (spa) → backend + spa, in ARCHETYPE_ORDER.
  it('a db/ .sql file + a .tsx file → backend + spa', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'db/schema.sql');
    touch(tmp.path(), 'web/App.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['backend', 'spa'],
      packageJsonFound: true,
    });
  });

  // Merge: a DB signal does NOT suppress ssr — a Next app with migrations is
  // ssr + backend (the SSR suppression only gates the spa signal).
  it('a migrations/ dir + next.config.js → ssr + backend', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'migrations/001_init.sql');
    touch(tmp.path(), 'next.config.js');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['ssr', 'backend'],
      packageJsonFound: true,
    });
  });

  // Case-insensitive name membership (case-insensitive filesystems / odd casing).
  it('matches names case-insensitively (Widget.TSX → spa)', () => {
    touch(tmp.path(), 'Components/Widget.TSX');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  it('is deterministic on a multi-signal tree', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'App.tsx');
    touch(tmp.path(), 'next.config.js');
    mkdirSync(join(tmp.path(), 'api'), { recursive: true });
    // ssr (next.config) + backend (api dir); clientUi suppressed by ssr.
    const expected: Detected = {
      archetypes: ['ssr', 'backend'],
      packageJsonFound: true,
    };
    expect(detect(tmp.path())).toEqual(expected);
    expect(detect(tmp.path())).toEqual(expected);
    // Evidence is deterministic too.
    expect(detectArchetypesFromProject(tmp.path()).evidence).toEqual(
      detectArchetypesFromProject(tmp.path()).evidence,
    );
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
    expect(detect(tmp.path())).toEqual({
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
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // src/api/ in isolation (no dep, no other signal) → lib, never backend.
  it('a lone src/api/ dir → lib (nested api is not a backend signal)', () => {
    touch(tmp.path(), 'src/api/users.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // Fable #1 literal (GATE-1 Q3): a REAL express dep makes it backend
  // legitimately; react makes it spa; src/api/ correctly adds nothing.
  it('express + react deps + src/api/ → backend + spa (backend from express)', () => {
    writePkg(tmp.path(), { dependencies: { express: '4', react: '18' } });
    touch(tmp.path(), 'src/api/client.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['backend', 'spa'],
      packageJsonFound: true,
    });
  });

  // Legit backend api location still fires: Pages-Router `pages/api`.
  it('pages/api/ (Pages Router) of a Next app → backend', () => {
    writePkg(tmp.path(), { dependencies: { next: '15' } });
    touch(tmp.path(), 'pages/api/users.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['ssr', 'backend'],
      packageJsonFound: true,
    });
  });

  // App-Router `app/api` folder → backend (the api dir whose immediate parent is
  // `app`). A non-route file isolates the api-DIR rule (parent === 'app') from the
  // route.ts rule.
  it('app/api/ (App Router api folder) of a Next app → backend (parent app)', () => {
    touch(tmp.path(), 'next.config.js');
    touch(tmp.path(), 'app/api/health.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['ssr', 'backend'],
      packageJsonFound: false,
    });
  });

  // ---- Rule 3: route.* scoped to an App-Router `app/` ancestor ----

  // A non-Next client router's route.ts (e.g. Vue) → NOT backend. vue → spa only.
  it('vue dep + src/router/route.ts (client router) → spa only (not backend)', () => {
    writePkg(tmp.path(), { dependencies: { vue: '3' } });
    touch(tmp.path(), 'src/router/route.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // An App-Router handler under src/app/** still fires (app ancestor, nested).
  it('src/app/users/route.ts of a Next app → backend (App-Router root under src/)', () => {
    writePkg(tmp.path(), { dependencies: { next: '15' } });
    touch(tmp.path(), 'src/app/users/route.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['ssr', 'backend'],
      packageJsonFound: true,
    });
  });

  // ---- Rule 4: .sql scoped to a DB-location dir; migrations/ scoped too (Q2) ----

  // A frontend's committed seed.sql at the root → NOT backend. react → spa only.
  it('react dep + root seed.sql → spa only (committed seed is not backend)', () => {
    writePkg(tmp.path(), { dependencies: { react: '18' } });
    touch(tmp.path(), 'seed.sql');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // A DB-located .sql → backend.
  it('db/seed.sql in a JS project → backend (.sql inside a DB-location dir)', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'db/seed.sql');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: true,
    });
  });

  // GATE-1 Q2: a deep, non-DB migrations/ dir (e.g. client state migrations) →
  // NOT backend. react → spa only.
  it('react dep + src/state/migrations/ (non-DB) → spa only (migrations scoped)', () => {
    writePkg(tmp.path(), { dependencies: { react: '18' } });
    touch(tmp.path(), 'src/state/migrations/v1.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  // GATE-1 Q2: a migrations/ dir UNDER a DB-location ancestor (prisma/) → backend.
  it('prisma/migrations/ in a JS project → backend (migrations under a DB ancestor)', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'prisma/migrations/001_init.sql');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: true,
    });
  });

  // ---- Rule 2: .tsx/.jsx excluded in test trees / email templates ----

  // A backend with react-email templates (emails/*.tsx) must not become spa.
  it('express dep + emails/Welcome.tsx → backend only (email template not spa)', () => {
    writePkg(tmp.path(), { dependencies: { express: '4' } });
    touch(tmp.path(), 'emails/Welcome.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['backend'],
      packageJsonFound: true,
    });
  });

  // A real component still yields spa (the required inverse).
  it('components/Button.tsx (real component) → spa', () => {
    touch(tmp.path(), 'components/Button.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  // A *.test.tsx fixture alone is not a UI signal (basename regex).
  it('a lone Button.test.tsx fixture → lib (test fixture, not spa)', () => {
    touch(tmp.path(), 'src/Button.test.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // grill #2 coverage: the `.spec.jsx` arm of the fixture regex.
  it('a lone widget.spec.jsx fixture → lib (spec fixture, not spa)', () => {
    touch(tmp.path(), 'widget.spec.jsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
  });

  // grill #2 coverage: a `.tsx` under a tests/ tree (NON_UI_DIRS member).
  it('a .tsx under tests/ → lib (test tree excluded)', () => {
    touch(tmp.path(), 'tests/Example.tsx');
    expect(detect(tmp.path())).toEqual({
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
    const expected: Detected = {
      archetypes: ['backend', 'spa'],
      packageJsonFound: true,
    };
    expect(detect(tmp.path())).toEqual(expected);
    expect(detect(tmp.path())).toEqual(expected);
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
    expect(
      scanFileTreeSignals(tmp.path(), {
        jsProject: true,
        nextDependency: false,
      }),
    ).toEqual({
      ssr: false,
      backend: true,
      clientUi: true,
    });
  });

  // ---------------------------------------------------------------------------
  // The BOUNDED half of the walk. Its symlink-safety was pinned; its bounds were
  // not — so MAX_DEPTH could have been raised, lowered, or dropped entirely with
  // the suite green. These two pin the boundary from BOTH sides, which is what
  // makes them a bound rather than a direction: a test that only checks "deep
  // enough is not found" passes just as well if the walk stopped at depth 1.
  // ---------------------------------------------------------------------------

  /** `a/a/a/.../Page.tsx` — the file sits at `depth` directories below root. */
  function buryTsxAt(root: string, depth: number): void {
    touch(
      root,
      `${Array.from({ length: depth }, () => 'a').join('/')}/Page.tsx`,
    );
  }

  it('finds a signal at the deepest permitted level (MAX_DEPTH = 24)', () => {
    buryTsxAt(tmp.path(), 24);
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(true);
  });

  it('does not find one past it', () => {
    buryTsxAt(tmp.path(), 25);
    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(false);
  });

  it('a skipped subtree costs ZERO budget, so a real signal is still reached', () => {
    // The load-bearing property the SKIP_DIRS comment claims: a skipped dir
    // `continue`s BEFORE `budget -= 1`, so a fat framework cache cannot exhaust
    // MAX_ENTRIES and truncate the walk before it reaches the project's real
    // source. `.next` sorts before `src`, which is exactly the ordering that
    // made a 55k-file cache turn an `spa` into a frameworkless `lib`.
    //
    // 200 entries, not 50k: what is under test is that the skipped ones are not
    // COUNTED, and a fixture that has to exhaust a real 50k budget to prove it
    // would be measuring the machine, not the rule.
    for (let i = 0; i < 200; i += 1) {
      touch(tmp.path(), `.next/cache/f${i}.js`);
    }
    touch(tmp.path(), 'src/Page.tsx');

    expect(scanFileTreeSignals(tmp.path()).clientUi).toBe(true);
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

  describe.each([...SKIP_DIRS, ...ECOSYSTEM_DIRS.keys()])('%s', (dir) => {
    it.each(CONTEXTS)('produces no signal %s', (_label, segments) => {
      // The most permissive surroundings: a JS project whose root is a Next app.
      expect(
        classifyEntry(dir, true, segments, {
          jsProject: true,
          baseDepth: 0,
          nextBase: true,
        }),
      ).toEqual(NO_SIGNAL);
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
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
    // Paired control: the same basename outside the skipped dir DOES signal.
    touch(tmp.path(), 'src/Widget.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });

  // The membership test is `SKIP_DIRS.has(name.toLowerCase())`, so the skip must
  // hold for a differently-cased directory too (the file-name analog is pinned by
  // 'matches names case-insensitively (Widget.TSX → spa)' above).
  it.each([...SKIP_DIRS])('%s/ is skipped case-insensitively', (dir) => {
    touch(tmp.path(), join(dir.toUpperCase(), 'Widget.tsx'));
    expect(detect(tmp.path())).toEqual({
      archetypes: ['lib'],
      packageJsonFound: false,
    });
    touch(tmp.path(), 'src/Widget.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: false,
    });
  });
});

// detection-precision-archetype-override (F-06). The reviewer's fixtures, each a
// real project shape: the Next-specific rules fire only in a Next base's router
// roots, `next.config.*` only directly in a base, and the language-agnostic
// backend signals only in a JS project. `files` are touched; `pkg` (when given)
// is the root package.json.
describe('detectArchetypesFromProject — precision fixtures (F-06)', () => {
  const tmp = useTmpDir();

  it.each<
    [string, Record<string, unknown> | null, string[], Detected['archetypes']]
  >([
    // Frontends whose src/app/ is NOT a Next App Router.
    [
      'Angular src/app/ with an api/ service folder → spa',
      { dependencies: { '@angular/core': '19' } },
      ['src/app/app.component.ts', 'src/app/api/users.service.ts'],
      ['spa'],
    ],
    [
      'Vite + React + RTK Query src/app/api/ → spa',
      { dependencies: { react: '19', '@reduxjs/toolkit': '2' } },
      ['src/App.tsx', 'src/app/store.ts', 'src/app/api/apiSlice.ts'],
      ['spa'],
    ],
    [
      'Vue src/app/router/route.ts → spa',
      { dependencies: { vue: '3' } },
      ['src/App.vue', 'src/app/router/route.ts'],
      ['spa'],
    ],
    // A docs site inside a library is not the project's framework.
    [
      'lib with a Next docs site in website/ → spa (not ssr)',
      { devDependencies: { tsup: '8', typescript: '5' } },
      ['src/index.ts', 'website/next.config.js', 'website/pages/index.tsx'],
      ['spa'],
    ],
    [
      'lib with docs/pages/api/, no manifest → lib',
      null,
      ['src/index.ts', 'docs/pages/api/search.ts'],
      ['lib'],
    ],
    // Non-JS backends: no package.json → no structural backend signal.
    [
      'Flask-Migrate → lib',
      null,
      [
        'pyproject.toml',
        'app/__init__.py',
        'migrations/env.py',
        'migrations/versions/0001_init.py',
      ],
      ['lib'],
    ],
    [
      'golang-migrate → lib',
      null,
      ['go.mod', 'main.go', 'migrations/001_init.up.sql'],
      ['lib'],
    ],
    [
      'Rust sqlx → lib',
      null,
      ['Cargo.toml', 'src/main.rs', 'migrations/20240101_init.sql'],
      ['lib'],
    ],
    [
      'Rails (grape app/api, db/structure.sql) → lib',
      null,
      ['Gemfile', 'db/structure.sql', 'app/api/v1/users.rb'],
      ['lib'],
    ],
    [
      'Laravel → lib',
      null,
      ['composer.json', 'database/migrations/2024_01_01_create_users.php'],
      ['lib'],
    ],
    [
      'Laravel with a React frontend → spa',
      null,
      [
        'composer.json',
        'database/migrations/2024_01_01_create_users.php',
        'resources/js/app.jsx',
      ],
      ['spa'],
    ],
    // The documented residual: a root package.json (Vite, or only tooling) makes
    // it a JS project, so its migrations count.
    [
      'Laravel WITH a root package.json → backend (documented residual)',
      { devDependencies: { vite: '6', 'laravel-vite-plugin': '1' } },
      ['composer.json', 'database/migrations/2024_01_01_create_users.php'],
      ['backend'],
    ],
    // Genuine Next apps keep both signals.
    [
      'Next App Router (next dep + config) → ssr + backend',
      { dependencies: { next: '15', react: '19' } },
      ['next.config.js', 'app/page.tsx', 'app/api/users/route.ts'],
      ['ssr', 'backend'],
    ],
    [
      'Next under src/app, dep only (no config) → ssr + backend',
      { dependencies: { next: '15' } },
      ['src/app/page.tsx', 'src/app/api/hello/route.ts'],
      ['ssr', 'backend'],
    ],
    [
      'Next Pages Router, config only (no manifest) → ssr + backend',
      null,
      ['next.config.js', 'pages/index.tsx', 'pages/api/users.ts'],
      ['ssr', 'backend'],
    ],
    [
      'Next Pages Router under src/pages → ssr + backend',
      { dependencies: { next: '15' } },
      ['src/pages/index.tsx', 'src/pages/api/users.ts'],
      ['ssr', 'backend'],
    ],
    [
      'upper-case Next.Config.JS + App/API/ROUTE.TS → ssr + backend',
      null,
      ['Next.Config.JS', 'App/API/ROUTE.TS'],
      ['ssr', 'backend'],
    ],
    // Monorepo bases: apps/<x>, packages/<x>.
    [
      'monorepo apps/web Next app → ssr + backend',
      { private: true, devDependencies: { turbo: '2' } },
      ['apps/web/next.config.js', 'apps/web/app/api/x/route.ts'],
      ['ssr', 'backend'],
    ],
    [
      'monorepo packages/web next.config → ssr',
      { private: true, devDependencies: { turbo: '2' } },
      ['packages/web/next.config.js', 'packages/web/app/page.tsx'],
      ['ssr'],
    ],
    [
      'monorepo: an Angular apps/admin beside a Next apps/web adds no backend',
      { private: true, devDependencies: { turbo: '2' } },
      [
        'apps/web/next.config.js',
        'apps/web/app/page.tsx',
        'apps/admin/src/app/api/users.service.ts',
      ],
      ['ssr'],
    ],
    // next.config.* outside a base.
    [
      'src/next.config.js → not ssr',
      { name: 'x' },
      ['src/next.config.js', 'src/App.tsx'],
      ['spa'],
    ],
    [
      'apps/web/nested/next.config.js → not ssr',
      { name: 'x' },
      ['apps/web/nested/next.config.js'],
      ['lib'],
    ],
    // JS backends with no framework dependency keep their structural signals.
    [
      'JS project + migrations/*.sql → backend',
      { name: 'svc' },
      ['migrations/001.sql'],
      ['backend'],
    ],
    [
      'JS project + root api/ (Vercel functions) → backend',
      { name: 'svc' },
      ['api/hello.ts'],
      ['backend'],
    ],
  ])('%s', (_label, pkg, files, archetypes) => {
    if (pkg !== null) writePkg(tmp.path(), pkg);
    for (const f of files) touch(tmp.path(), f);
    expect(detect(tmp.path()).archetypes).toEqual(archetypes);
  });

  // GRILL P5: the base's Next evidence is decided from the names already read,
  // BEFORE its entries are classified — `app/` sorts before `next.config.js`, so
  // a decision made while iterating would miss this route.
  it('decides a base’s Next evidence before classifying app/ (which sorts first)', () => {
    touch(tmp.path(), 'app/api/x/route.ts');
    touch(tmp.path(), 'next.config.mjs');
    expect(detect(tmp.path()).archetypes).toEqual(['ssr', 'backend']);
  });

  it('a symlinked next.config.* is not Next evidence (symlinks are never classified)', () => {
    let symlinked = false;
    try {
      symlinkSync(
        join(tmp.path(), 'no-such-target'),
        join(tmp.path(), 'next.config.js'),
      );
      symlinked = true;
    } catch {
      // no symlink privilege on this platform — property untested here.
    }
    if (!symlinked) return;
    touch(tmp.path(), 'app/api/x/route.ts');
    expect(detect(tmp.path()).archetypes).toEqual(['lib']);
  });
});

// F-17: one piece of evidence per archetype, for the install summary.
describe('detectArchetypesFromProject — evidence', () => {
  const tmp = useTmpDir();

  it('cites a dependency over a path for the same signal', () => {
    writePkg(tmp.path(), { dependencies: { next: '15' } });
    touch(tmp.path(), 'next.config.js');
    touch(tmp.path(), 'src/app/api/hello/route.ts');
    expect(detectArchetypesFromProject(tmp.path()).evidence).toEqual([
      { archetype: 'ssr', source: 'dependency', name: 'next' },
      {
        archetype: 'backend',
        source: 'path',
        // The api/ DIR under the router root is the first trigger (preorder).
        path: 'src/app/api/',
      },
    ]);
  });

  it('cites a path when no dependency raised the signal, in original case', () => {
    touch(tmp.path(), 'Next.Config.JS');
    touch(tmp.path(), 'App/Users/ROUTE.TS');
    expect(detectArchetypesFromProject(tmp.path()).evidence).toEqual([
      { archetype: 'ssr', source: 'path', path: 'Next.Config.JS' },
      { archetype: 'backend', source: 'path', path: 'App/Users/ROUTE.TS' },
    ]);
  });

  // GRILL P1: preorder — a DIRECTORY signal is recorded before the files under
  // it, and the first trigger in sorted order wins.
  it('a directory trigger is cited with a trailing slash, before files under it', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'migrations/001.sql');
    touch(tmp.path(), 'db/schema.sql');
    // `db` sorts before `migrations`; db/ itself is no signal, db/schema.sql is.
    expect(detectArchetypesFromProject(tmp.path()).evidence).toEqual([
      { archetype: 'backend', source: 'path', path: 'db/schema.sql' },
    ]);
  });

  it('migrations/ (the dir) is cited before migrations/001.sql', () => {
    writePkg(tmp.path(), { name: 'x' });
    touch(tmp.path(), 'migrations/001.sql');
    expect(detectArchetypesFromProject(tmp.path()).evidence).toEqual([
      { archetype: 'backend', source: 'path', path: 'migrations/' },
    ]);
  });

  it('spa cites the client-UI trigger; a suppressed spa cites nothing', () => {
    touch(tmp.path(), 'src/App.tsx');
    expect(detectArchetypesFromProject(tmp.path()).evidence).toEqual([
      { archetype: 'spa', source: 'path', path: 'src/App.tsx' },
    ]);
    writePkg(tmp.path(), { dependencies: { next: '15' } });
    expect(detectArchetypesFromProject(tmp.path()).evidence).toEqual([
      { archetype: 'ssr', source: 'dependency', name: 'next' },
    ]);
  });

  it('lib cites nothing', () => {
    expect(detectArchetypesFromProject(tmp.path()).evidence).toEqual([
      { archetype: 'lib', source: 'none' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// F-25: the walk's caps are no longer silent. `truncated` is true exactly when
// a cap stopped the walk at an entry it would have classified, while the
// result could still change. The entry cap is exercised with a small injected
// limit — a fixture that has to exhaust the real 50k budget would be measuring
// the machine, not the rule — and the shipped values are pinned separately.
// ---------------------------------------------------------------------------

/** `a/a/.../<leaf>` — `leaf` sits at `depth` directories below root. */
function buryAt(root: string, depth: number, leaf: string): void {
  touch(root, `${Array.from({ length: depth }, () => 'a').join('/')}/${leaf}`);
}

describe('scanFileTree — truncation (F-25)', () => {
  const tmp = useTmpDir();
  const JS = { jsProject: true, nextDependency: false };
  const limit = (maxEntries: number) => ({
    maxDepth: WALK_LIMITS.maxDepth,
    maxEntries,
  });

  it('pins the shipped bounds', () => {
    expect(WALK_LIMITS).toEqual({ maxDepth: 24, maxEntries: 50_000 });
    expect(Object.isFrozen(WALK_LIMITS)).toBe(true);
  });

  // The finding's shape: entries that sort before src/ spend the budget, so
  // the walk never reaches src/App.tsx and the project reads as `lib`. The
  // result is the same as before; what changed is that it says so.
  it('a budget spent before src/App.tsx → no client UI, truncated', () => {
    for (let i = 0; i < 10; i += 1) touch(tmp.path(), `public/f${i}.png`);
    touch(tmp.path(), 'src/App.tsx');
    const cut = scanFileTree(tmp.path(), JS, limit(5));
    expect(cut.signals.clientUi).toBe(false);
    expect(cut.truncated).toBe(true);
    const full = scanFileTree(tmp.path(), JS);
    expect(full.signals.clientUi).toBe(true);
    expect(full.truncated).toBe(false);
  });

  it('a budget that covers every entry exactly is a complete walk', () => {
    touch(tmp.path(), 'a.txt');
    touch(tmp.path(), 'b.txt');
    expect(scanFileTree(tmp.path(), JS, limit(2)).truncated).toBe(false);
    expect(scanFileTree(tmp.path(), JS, limit(1)).truncated).toBe(true);
  });

  it('entries the walk skips anyway never trip it', () => {
    touch(tmp.path(), 'a.txt');
    touch(tmp.path(), 'node_modules/react/index.js');
    touch(tmp.path(), '.env.local');
    symlinkSync(join(tmp.path(), 'a.txt'), join(tmp.path(), 'z-link'));
    expect(scanFileTree(tmp.path(), JS, limit(1)).truncated).toBe(false);
  });

  it('the depth cap: an entry past MAX_DEPTH → truncated (detection reports it)', () => {
    buryAt(tmp.path(), 25, 'Page.tsx');
    const d = detectArchetypesFromProject(tmp.path());
    expect(d.archetypes).toEqual(['lib']);
    expect(d.truncated).toBe(true);
  });

  it('the depth cap: an entry AT MAX_DEPTH is classified, not truncated', () => {
    buryAt(tmp.path(), 24, 'Page.tsx');
    const d = detectArchetypesFromProject(tmp.path());
    expect(d.archetypes).toEqual(['spa']);
    expect(d.truncated).toBe(false);
  });

  it('the depth cap: an empty directory (or only a symlink) past it is no alarm', () => {
    // The 25th `a` is classified (it sits in a dir at depth 24); its own
    // listing is past the cap, and empty.
    const deep = join(tmp.path(), ...Array.from({ length: 25 }, () => 'a'));
    mkdirSync(deep, { recursive: true });
    expect(scanFileTree(tmp.path()).truncated).toBe(false);
    symlinkSync(tmp.path(), join(deep, 'loop'));
    expect(scanFileTree(tmp.path()).truncated).toBe(false);
  });

  it('the depth cap stops only that directory; the walk goes on', () => {
    buryAt(tmp.path(), 25, 'Deep.tsx');
    touch(tmp.path(), 'src/App.tsx');
    const scan = scanFileTree(tmp.path());
    expect(scan.signals.clientUi).toBe(true);
    expect(scan.truncated).toBe(true);
  });

  it('a normal project walks to the end, not truncated', () => {
    writePkg(tmp.path(), { dependencies: { react: '19' } });
    touch(tmp.path(), 'src/App.tsx');
    touch(tmp.path(), 'src/components/Button.tsx');
    expect(detectArchetypesFromProject(tmp.path()).truncated).toBe(false);
  });
});

// The SETTLED short-circuit: once ssr AND backend hold (package.json merged
// with the tree), nothing more can change the result — spa is suppressed by
// ssr and both archetypes' evidence is fixed — so the walk stops, and a walk
// that settled is never reported as truncated.
describe('scanFileTree — settled short-circuit', () => {
  const tmp = useTmpDir();

  it('package.json alone settles it: no tree read, even with a zero budget', () => {
    touch(tmp.path(), 'src/App.tsx');
    const scan = scanFileTree(
      tmp.path(),
      {
        jsProject: true,
        nextDependency: true,
        packageSignals: { ssr: true, backend: true, clientUi: false },
      },
      { maxDepth: WALK_LIMITS.maxDepth, maxEntries: 0 },
    );
    expect(scan.truncated).toBe(false);
    expect(scan.signals).toEqual({
      ssr: false,
      backend: false,
      clientUi: false,
    });
  });

  it('a project that settles is not truncated, even past a cap', () => {
    writePkg(tmp.path(), { dependencies: { next: '15', express: '4' } });
    buryAt(tmp.path(), 25, 'Page.tsx');
    const d = detectArchetypesFromProject(tmp.path());
    expect(d.archetypes).toEqual(['ssr', 'backend']);
    expect(d.truncated).toBe(false);
  });

  it('a cap that bit BEFORE the tree settled is cleared by the settlement', () => {
    // `a/` (too deep) sorts first; app/x/route.ts and next.config.js then
    // settle ssr + backend.
    buryAt(tmp.path(), 25, 'Page.tsx');
    touch(tmp.path(), 'app/x/route.ts');
    touch(tmp.path(), 'next.config.js');
    const d = detectArchetypesFromProject(tmp.path());
    expect(d.archetypes).toEqual(['ssr', 'backend']);
    expect(d.truncated).toBe(false);
  });

  // The guarantee the short-circuit rests on: the settled walk's archetypes
  // and evidence equal a FULL walk's. ssr comes from package.json only, so a
  // walk given no package signals cannot settle and reads the tree to the end,
  // while detection settles at app/api/ and stops.
  it('a settled result equals the full walk (archetypes and evidence)', () => {
    const manifest = { dependencies: { next: '15' } };
    writePkg(tmp.path(), manifest);
    touch(tmp.path(), 'app/api/hello/route.ts');
    touch(tmp.path(), 'src/App.tsx');
    touch(tmp.path(), 'zzz/migrations/001.sql');
    const settled = detectArchetypesFromProject(tmp.path());

    const pkg = packageFacts(manifest);
    const full = scanFileTree(tmp.path(), {
      jsProject: true,
      nextDependency: true,
    });
    expect(full.signals.clientUi).toBe(true); // the full walk did read on
    const archetypes = archetypesFromSignals(
      mergeSignals(pkg.signals, full.signals),
    );
    expect(settled.archetypes).toEqual(['ssr', 'backend']);
    expect(settled.archetypes).toEqual(archetypes);
    expect(settled.evidence).toEqual(
      evidenceFor(archetypes, pkg.evidence, full.evidence, pkg.devEvidence),
    );
    expect(settled.truncated).toBe(false);
  });
});

// F-27, end to end: devDependencies raise ssr / client UI (cited as
// devDependency) but never backend.
describe('detectArchetypesFromProject — devDependencies (F-27)', () => {
  const tmp = useTmpDir();

  it('a dev-only express (a mock server) beside a server file → not backend', () => {
    writePkg(tmp.path(), {
      dependencies: { react: '19' },
      devDependencies: { express: '4' },
    });
    touch(tmp.path(), 'src/App.tsx');
    touch(tmp.path(), 'mock/server.ts');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['spa'],
      packageJsonFound: true,
    });
  });

  it('a dev-only express WITH a tree backend signal → backend, citing the path', () => {
    writePkg(tmp.path(), { devDependencies: { express: '4' } });
    mkdirSync(join(tmp.path(), 'api'), { recursive: true });
    expect(detectArchetypesFromProject(tmp.path()).evidence).toEqual([
      { archetype: 'backend', source: 'path', path: 'api/' },
    ]);
  });

  it('SvelteKit (framework in devDependencies) cites the devDependency', () => {
    writePkg(tmp.path(), {
      devDependencies: { '@sveltejs/kit': '2', svelte: '5' },
    });
    const d = detectArchetypesFromProject(tmp.path());
    expect(d.archetypes).toEqual(['ssr']);
    expect(d.evidence).toEqual([
      { archetype: 'ssr', source: 'devDependency', name: '@sveltejs/kit' },
    ]);
  });

  it('React Router framework mode (@react-router/dev, a devDependency) → ssr', () => {
    writePkg(tmp.path(), {
      dependencies: { react: '19', 'react-router': '7' },
      devDependencies: { '@react-router/dev': '7' },
    });
    touch(tmp.path(), 'app/root.tsx');
    expect(detect(tmp.path())).toEqual({
      archetypes: ['ssr'],
      packageJsonFound: true,
    });
  });
});
