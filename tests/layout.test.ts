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
    // Resolved for interface uniformity; no flat clone upstream ships this dir,
    // so the copy/mirror sites see existsSync false and no-op (see constants.ts).
    expect(p.core).toBe('pharn-core');
    expect(p.docs).toEqual([
      'CONSTITUTION.md',
      'ARCHITECTURE.md',
      'THREAT-MODEL.md',
      'LIMITS.md',
    ]);
    // The ONE source≠dest mapping: upstream's LICENSE must never land on the
    // user's own root LICENSE, so the flat dest is unmistakably pharn's.
    expect(p.license).toEqual({ from: 'LICENSE', to: 'PHARN-LICENSE' });
  });

  it('pharn resolves every runtime surface under pharn/, but the docs keep a per-DOC prefix', () => {
    const p = layoutPaths('pharn');
    expect(p.layout).toBe('pharn');
    expect(p.grillers).toBe('pharn/pharn-pipeline/grillers');
    expect(p.lenses).toBe('pharn/pharn-review');
    expect(p.contracts).toBe('pharn/pharn-contracts');
    expect(p.floor).toBe('pharn/floor');
    // The pharn-core surface upstream actually ships (seam-resolver + its evals).
    expect(p.core).toBe('pharn/pharn-core');
    // The same FOUR documents as flat, but the prefix is per-DOC. pharn-oss's
    // relocation moved CONSTITUTION + ARCHITECTURE under pharn/ and left
    // THREAT-MODEL + LIMITS at the repo ROOT, and the install mirrors wherever
    // upstream keeps each one. Measured over the files one install copies: 108
    // of them cite these docs, `THREAT-MODEL.md` bare 118x and pharn/-prefixed
    // 0x, `LIMITS.md` bare 68x and prefixed 0x — while the two relocated docs
    // are cited WITH the prefix (239x / 54x). Upstream's own
    // protect-trusted-paths.cjs DEFAULT_PROTECTED spells them the same way.
    expect(p.docs).toEqual([
      'pharn/CONSTITUTION.md',
      'pharn/ARCHITECTURE.md',
      'THREAT-MODEL.md',
      'LIMITS.md',
    ]);
    // The dead paths are not resurrected: `pharn/THREAT-MODEL.md` and
    // `pharn/LIMITS.md` have never existed in pharn-oss, so every install
    // silently dropped both docs while both readers' existence guards passed.
    expect(p.docs).not.toContain('pharn/THREAT-MODEL.md');
    expect(p.docs).not.toContain('pharn/LIMITS.md');
    // Both layouts carry the same four BASENAMES — only the prefixes differ.
    expect(p.docs.map((d) => d.split('/').pop())).toEqual(
      layoutPaths('flat').docs.map((d) => d.split('/').pop()),
    );
    expect(p.license).toEqual({ from: 'LICENSE', to: 'pharn/LICENSE' });
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
