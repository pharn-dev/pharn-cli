import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectArchetypesFromProject } from '../src/lib/detect-archetype.js';
import type { ArchetypeDetection } from '../src/lib/detect-archetype.js';
import { useTmpDir } from './helpers.js';

// Write a package.json (the given value, serialized) into `dir`.
function writePkg(dir: string, pkg: unknown): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
}

describe('detectArchetypesFromProject', () => {
  // A fresh empty tmp dir per test (beforeEach), so the "missing package.json"
  // case is simply a test that writes nothing.
  const tmp = useTmpDir();

  // A found package.json → packageJsonFound: true; archetypes per its deps.
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

  // The finding this increment resolves: a MISSING package.json is
  // packageJsonFound: false — distinct from a found-but-frameworkless project
  // (packageJsonFound: true, above), even though both carry archetypes ['lib'].
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
