import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectArchetypesFromProject,
  scanFileTreeSignals,
} from '../src/lib/detect-archetype.js';
import type { ArchetypeDetection } from '../src/lib/detect-archetype.js';
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

  // Decision #2: .sql / migrations/ map to no archetype and must contribute
  // nothing (pinned so a future `db` archetype is a deliberate edit).
  it('.sql files and a migrations/ dir contribute nothing → lib', () => {
    touch(tmp.path(), 'db/schema.sql');
    touch(tmp.path(), 'migrations/001_init.sql');
    expect(detectArchetypesFromProject(tmp.path())).toEqual({
      archetypes: ['lib'],
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
