import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  capabilitySubtree,
  detectLayout,
  isPharnLayout,
  layoutPaths,
} from '../src/lib/layout.js';
import {
  FLAT_LAYOUT_MESSAGE,
  loadArchetypeConfig,
} from '../src/lib/pharn-config.js';
import { CliError } from '../src/lib/cli-error.js';
import { ManifestValidationError } from '../src/lib/validate.js';

// The flat layout was removed in v0.21.0 (docs/contributing.md, "Support
// policy"): a flat clone is refused by detectLayout, a config recorded at it
// by loadArchetypeConfig. Titles that name the old answer are kept (the Test
// job's test-integrity check matches tests by name); each body asserts what
// v0.21.0 does instead.
const FLAT_CLONE = /ships the flat layout .*removed in v0\.21\.0.*--ref main/;

describe('detectLayout', () => {
  const tmp = useTmpDir();

  it('returns pharn when the clone has the pharn/pharn-contracts marker', () => {
    const root = tmp.path();
    mkdirSync(join(root, 'pharn/pharn-contracts'), { recursive: true });
    expect(detectLayout(root)).toBe('pharn');
    expect(isPharnLayout(root)).toBe(true);
  });

  it('returns flat when contracts live at the root (the legacy layout)', () => {
    // v0.21.0: a flat clone is refused, before anything is written.
    const root = tmp.path();
    mkdirSync(join(root, 'pharn-contracts'), { recursive: true });
    expect(isPharnLayout(root)).toBe(false);
    expect(() => detectLayout(root)).toThrow(ManifestValidationError);
    expect(() => detectLayout(root)).toThrow(FLAT_CLONE);
  });

  it('returns flat for a bare pharn/ dir without the marker (no false positive)', () => {
    // v0.21.0: a bare pharn/ is still not the pharn layout, so it is refused.
    const root = tmp.path();
    mkdirSync(join(root, 'pharn'), { recursive: true });
    expect(isPharnLayout(root)).toBe(false);
    expect(() => detectLayout(root)).toThrow(FLAT_CLONE);
  });

  it('returns flat for an empty dir (safe legacy default)', () => {
    // v0.21.0: the safe default is a refusal, never a guessed layout.
    expect(() => detectLayout(tmp.path())).toThrow(FLAT_CLONE);
  });
});

describe('layoutPaths', () => {
  it('flat resolves to the root paths incl. all 4 trusted docs', () => {
    // v0.21.0: there is no flat path set. The one layout keeps every surface
    // under pharn/, and none of them is a root path.
    const p = layoutPaths('pharn');
    expect(p.layout).toBe('pharn');
    const all = [
      p.grillers,
      p.lenses,
      p.contracts,
      p.floor,
      p.core,
      ...p.docs,
      p.license.to,
      p.featuresReadme,
    ];
    for (const path of all) expect(path.startsWith('pharn/')).toBe(true);
    expect(p.docs).not.toContain('THREAT-MODEL.md');
    expect(p.docs).not.toContain('LIMITS.md');
    // The ONE source≠dest mapping: upstream's LICENSE must never land on the
    // user's own root LICENSE.
    expect(p.license).toEqual({ from: 'LICENSE', to: 'pharn/LICENSE' });
  });

  it('pharn resolves every runtime surface under pharn/, the four trusted docs included', () => {
    const p = layoutPaths('pharn');
    expect(p.layout).toBe('pharn');
    expect(p.grillers).toBe('pharn/pharn-pipeline/grillers');
    expect(p.lenses).toBe('pharn/pharn-review');
    expect(p.contracts).toBe('pharn/pharn-contracts');
    expect(p.floor).toBe('pharn/floor');
    // The pharn-core surface upstream actually ships (seam-resolver + its evals).
    expect(p.core).toBe('pharn/pharn-core');
    // The four documents, all under pharn/ — where pharn-oss keeps them from
    // SKILLS_VERSION 7.0.0 on. A pre-7.0 clone's root copies are not
    // installed (the root fallback was removed in v0.21.0).
    expect(p.docs).toEqual([
      'pharn/CONSTITUTION.md',
      'pharn/ARCHITECTURE.md',
      'pharn/THREAT-MODEL.md',
      'pharn/LIMITS.md',
    ]);
    expect(p.license).toEqual({ from: 'LICENSE', to: 'pharn/LICENSE' });
  });
});

// `configLayout` is gone with the flat layout: `loadArchetypeConfig` now
// refuses any config not recorded at `pharn`, so a loaded config is at it.
describe('configLayout', () => {
  const tmp = useTmpDir();
  const writeConfig = (extra: Record<string, unknown>): string => {
    const root = tmp.path();
    writeFileSync(
      join(root, 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '1.0.0',
        commit: null,
        archetypes: ['lib'],
        capabilities: [],
        ...extra,
      }),
    );
    return root;
  };

  it('reads pharn when recorded', () => {
    expect(loadArchetypeConfig(writeConfig({ layout: 'pharn' })).layout).toBe(
      'pharn',
    );
  });

  it('reads flat when recorded', () => {
    // v0.21.0: a recorded flat layout is refused with "re-run `pharn init`".
    const root = writeConfig({ layout: 'flat' });
    expect(() => loadArchetypeConfig(root)).toThrow(CliError);
    expect(() => loadArchetypeConfig(root)).toThrow(FLAT_LAYOUT_MESSAGE);
  });

  it('defaults to flat when absent (legacy config, P7)', () => {
    // v0.21.0: no `layout` key meant flat, so it is refused the same way.
    const root = writeConfig({});
    expect(() => loadArchetypeConfig(root)).toThrow(FLAT_LAYOUT_MESSAGE);
  });
});

// The ONE role → subtree mapping. Six call sites carried their own ternary
// (install-records, install-manifest ×2, install-capabilities, update, remove);
// they all route through this now, so they cannot disagree.
describe('capabilitySubtree', () => {
  it.each([
    ['pharn', 'griller', 'pharn/pharn-pipeline/grillers'],
    ['pharn', 'lens', 'pharn/pharn-review'],
  ] as const)('%s layout, %s → %s', (layout, role, subtree) => {
    expect(capabilitySubtree(layoutPaths(layout), role)).toBe(subtree);
  });
});

// CORE-155: the flat layout was deprecated in v0.20.0 and is removed in
// v0.21.0, so its DEPRECATED note (flatDeprecationLines) is gone: the refusal
// replaces it.
describe('flatDeprecationLines', () => {
  const tmp = useTmpDir();

  it('is null for the pharn layout', () => {
    // A pharn-layout config loads, with nothing said about a deprecation.
    const root = tmp.path();
    writeFileSync(
      join(root, 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '1.0.0',
        commit: null,
        layout: 'pharn',
        archetypes: ['lib'],
        capabilities: [],
      }),
    );
    expect(() => loadArchetypeConfig(root)).not.toThrow();
    expect(FLAT_LAYOUT_MESSAGE).not.toContain('DEPRECATED');
  });

  it('names the removal version and the move for the flat layout', () => {
    expect(FLAT_LAYOUT_MESSAGE).toContain('removed in v0.21.0');
    expect(FLAT_LAYOUT_MESSAGE).toContain('0.20.x is the last pharn');
    expect(FLAT_LAYOUT_MESSAGE).toContain(
      'Re-run `pharn init` to reinstall at the pharn/ layout',
    );
    expect(FLAT_LAYOUT_MESSAGE).toContain('ORPHANED');
  });
});
