import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { configLayout, detectLayout, layoutPaths } from '../src/lib/layout.js';
import type { PharnConfig } from '../src/types.js';

describe('detectLayout', () => {
  const tmp = useTmpDir();

  it('returns pharn when the clone has the pharn/pharn-contracts marker', () => {
    const root = tmp.path();
    mkdirSync(join(root, 'pharn/pharn-contracts'), { recursive: true });
    expect(detectLayout(root)).toBe('pharn');
  });

  it('returns flat when contracts live at the root (the legacy layout)', () => {
    const root = tmp.path();
    mkdirSync(join(root, 'pharn-contracts'), { recursive: true });
    expect(detectLayout(root)).toBe('flat');
  });

  it('returns flat for a bare pharn/ dir without the marker (no false positive)', () => {
    const root = tmp.path();
    mkdirSync(join(root, 'pharn'), { recursive: true });
    expect(detectLayout(root)).toBe('flat');
  });

  it('returns flat for an empty dir (safe legacy default)', () => {
    expect(detectLayout(tmp.path())).toBe('flat');
  });
});

describe('layoutPaths', () => {
  it('flat resolves to the root paths incl. all 4 trusted docs', () => {
    const p = layoutPaths('flat');
    expect(p.layout).toBe('flat');
    expect(p.grillers).toBe('pharn-pipeline/grillers');
    expect(p.lenses).toBe('pharn-review');
    expect(p.contracts).toBe('pharn-contracts');
    expect(p.floor).toBe('.dev/floor');
    expect(p.docs).toEqual([
      'CONSTITUTION.md',
      'ARCHITECTURE.md',
      'THREAT-MODEL.md',
      'LIMITS.md',
    ]);
  });

  it('pharn resolves under pharn/ and drops THREAT-MODEL/LIMITS from the docs set', () => {
    const p = layoutPaths('pharn');
    expect(p.layout).toBe('pharn');
    expect(p.grillers).toBe('pharn/pharn-pipeline/grillers');
    expect(p.lenses).toBe('pharn/pharn-review');
    expect(p.contracts).toBe('pharn/pharn-contracts');
    expect(p.floor).toBe('pharn/floor');
    expect(p.docs).toEqual(['pharn/CONSTITUTION.md', 'pharn/ARCHITECTURE.md']);
  });
});

describe('configLayout', () => {
  const base: PharnConfig = {
    pharnVersion: '0',
    skillsVersion: '0',
    repo: 'x',
    commit: null,
    modules: [],
    installedAt: 'now',
  };

  it('reads pharn when recorded', () => {
    expect(configLayout({ ...base, layout: 'pharn' })).toBe('pharn');
  });

  it('reads flat when recorded', () => {
    expect(configLayout({ ...base, layout: 'flat' })).toBe('flat');
  });

  it('defaults to flat when absent (legacy config, P7)', () => {
    expect(configLayout(base)).toBe('flat');
  });
});
