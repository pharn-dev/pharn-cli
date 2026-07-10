import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { diffInstalledCapabilities } from '../src/lib/diff.js';
import type { InstalledCapability } from '../src/types.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('diffInstalledCapabilities', () => {
  const tmp = useTmpDir();

  const caps: InstalledCapability[] = [
    { name: 'a11y', role: 'griller' },
    { name: 'n-plus-one', role: 'lens' },
  ];

  function scaffoldClone(repo: string): void {
    write(join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    write(join(repo, 'pharn-review/n-plus-one/n-plus-one.md'), 'N');
    write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
    write(join(repo, '.claude/commands/pharn-dev-plan.md'), 'DEV');
    write(join(repo, '.claude/hooks/enforce.cjs'), 'hook');
    write(join(repo, '.claude/hooks/enforce.test.cjs'), 'HOOKTEST');
    write(join(repo, '.claude/settings.json'), '{"a":1}');
    write(join(repo, 'CONSTITUTION.md'), 'C');
    write(join(repo, 'pharn-contracts/finding-shape.md'), 'fs');
    write(join(repo, '.dev/floor/validate.mjs'), 'floor');
    write(join(repo, '.dev/floor/validate.test.mjs'), 'FLOORTEST');
  }

  // The exact PHARN-owned set installCapabilities would have written (settings
  // excluded — user-owned; dev-only + test files never copied).
  function scaffoldMatchingProject(proj: string): void {
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    write(join(proj, 'pharn-review/n-plus-one/n-plus-one.md'), 'N');
    write(join(proj, '.claude/commands/pharn-plan.md'), 'plan');
    write(join(proj, '.claude/hooks/enforce.cjs'), 'hook');
    write(join(proj, 'CONSTITUTION.md'), 'C');
    write(join(proj, 'pharn-contracts/finding-shape.md'), 'fs');
    write(join(proj, '.dev/floor/validate.mjs'), 'floor');
  }

  it('reports all ok when the project matches (settings.json + dev-only excluded)', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldClone(repo);
    scaffoldMatchingProject(proj);
    // A different settings.json must be ignored (user-owned).
    write(join(proj, '.claude/settings.json'), '{"user":true}');

    const r = diffInstalledCapabilities({
      repoDir: repo,
      projectRoot: proj,
      capabilities: caps,
      layout: 'flat',
    });
    expect(r.missing).toEqual([]);
    expect(r.modified).toEqual([]);
    // a11y, n-plus-one, pharn-plan, enforce.cjs, CONSTITUTION, contract, floor.
    expect(r.okCount).toBe(7);
  });

  it('flags a modified + a missing file; never expects settings.json/dev-only/test files', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldClone(repo);
    scaffoldMatchingProject(proj);
    // Modify one capability file, remove another expected file.
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A-EDITED');
    write(join(proj, 'pharn-review/n-plus-one/n-plus-one.md'), 'N'); // keep
    write(join(proj, 'CONSTITUTION.md'), 'C-EDITED'); // modified doc

    const r = diffInstalledCapabilities({
      repoDir: repo,
      projectRoot: proj,
      capabilities: caps,
      layout: 'flat',
    });
    expect(r.modified).toContain('pharn-pipeline/grillers/a11y/a11y.md');
    expect(r.modified).toContain('CONSTITUTION.md');
    const paths = [...r.modified, ...r.missing];
    expect(paths).not.toContain('.claude/settings.json');
    expect(paths.some((p) => p.includes('pharn-dev-'))).toBe(false);
    expect(paths.some((p) => p.includes('.test.'))).toBe(false);
  });

  it('mirrors the pharn/ layout when layout is pharn (never the flat paths)', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    // A pharn-layout clone: runtime surfaces under pharn/ (docs = CONSTITUTION +
    // ARCHITECTURE only); .claude/* stays at root in both layouts.
    write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    write(join(repo, 'pharn/pharn-review/n-plus-one/n-plus-one.md'), 'N');
    write(join(repo, 'pharn/CONSTITUTION.md'), 'C');
    write(join(repo, 'pharn/pharn-contracts/finding-shape.md'), 'fs');
    write(join(repo, 'pharn/floor/validate.mjs'), 'floor');
    write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
    write(join(repo, '.claude/hooks/enforce.cjs'), 'hook');
    for (const [rel, body] of [
      ['pharn/pharn-pipeline/grillers/a11y/a11y.md', 'A'],
      ['pharn/pharn-review/n-plus-one/n-plus-one.md', 'N'],
      ['pharn/CONSTITUTION.md', 'C'],
      ['pharn/pharn-contracts/finding-shape.md', 'fs'],
      ['pharn/floor/validate.mjs', 'floor'],
      ['.claude/commands/pharn-plan.md', 'plan'],
      ['.claude/hooks/enforce.cjs', 'hook'],
    ] as const) {
      write(join(proj, rel), body);
    }

    const r = diffInstalledCapabilities({
      repoDir: repo,
      projectRoot: proj,
      capabilities: caps,
      layout: 'pharn',
    });
    expect(r.missing).toEqual([]);
    expect(r.modified).toEqual([]);
    // a11y, n-plus-one, pharn-plan, enforce.cjs, CONSTITUTION, contract, floor.
    expect(r.okCount).toBe(7);

    // An edited pharn/ file is flagged AT its pharn/ path — proving the expected
    // set used the pharn paths, not the flat ones.
    write(join(proj, 'pharn/pharn-review/n-plus-one/n-plus-one.md'), 'N-EDIT');
    const r2 = diffInstalledCapabilities({
      repoDir: repo,
      projectRoot: proj,
      capabilities: caps,
      layout: 'pharn',
    });
    expect(r2.modified).toContain(
      'pharn/pharn-review/n-plus-one/n-plus-one.md',
    );
  });

  it('degrades gracefully (skips, never throws) when the clone lacks the project layout', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldClone(repo); // FLAT clone (e.g. @main before #86 merges)
    scaffoldMatchingProject(proj);
    // Ask for the pharn layout though the clone is flat: every pharn/ capability
    // source is absent in the clone → skipped (the documented @main bound), so no
    // pharn/ path is reported and the call never throws. The layout-invariant
    // .claude/* surfaces still compare.
    const r = diffInstalledCapabilities({
      repoDir: repo,
      projectRoot: proj,
      capabilities: caps,
      layout: 'pharn',
    });
    const all = [...r.missing, ...r.modified];
    expect(all.some((p) => p.startsWith('pharn/'))).toBe(false);
    expect(r.okCount).toBeGreaterThanOrEqual(2);
  });
});
