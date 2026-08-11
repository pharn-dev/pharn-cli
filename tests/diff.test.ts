import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    expect(r.unreadable).toEqual([]);
    // a11y, n-plus-one, pharn-plan, enforce.cjs, CONSTITUTION, contract, floor.
    expect(r.okCount).toBe(7);
  });

  it('flags a modified + a missing file; never expects settings.json/dev-only/test files', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldClone(repo);
    scaffoldMatchingProject(proj);
    // Modify one capability file, remove another expected file. The removal is
    // real: this case named a missing file but only ever REWROTE it with the
    // same bytes, so the `missing` arm went unexercised and the three unreadable
    // cases below that assert "not reported missing" would have been vacuous.
    write(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'A-EDITED');
    rmSync(join(proj, 'pharn-review/n-plus-one/n-plus-one.md'));
    write(join(proj, 'CONSTITUTION.md'), 'C-EDITED'); // modified doc

    const r = diffInstalledCapabilities({
      repoDir: repo,
      projectRoot: proj,
      capabilities: caps,
      layout: 'flat',
    });
    expect(r.modified).toContain('pharn-pipeline/grillers/a11y/a11y.md');
    expect(r.modified).toContain('CONSTITUTION.md');
    expect(r.missing).toEqual(['pharn-review/n-plus-one/n-plus-one.md']);
    expect(r.unreadable).toEqual([]);
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

  // -------------------------------------------------------------------------
  // The `unreadable` partition. Before it, every case below either CRASHED the
  // whole run or was reported as something it was not. `readDiskState` (the
  // classifier `pharn update` already writes against) is what makes the read
  // side and the write side agree; these cases are the read-side twins of
  // tests/apply-update.test.ts's `readDiskState` block.
  // -------------------------------------------------------------------------
  describe('unreadable — paths that exist but cannot be compared', () => {
    // A clone + a matching project, minus the one path each case sabotages.
    function fixture(): { repo: string; proj: string } {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      scaffoldClone(repo);
      scaffoldMatchingProject(proj);
      return { repo, proj };
    }
    const run = (repo: string, proj: string) =>
      diffInstalledCapabilities({
        repoDir: repo,
        projectRoot: proj,
        capabilities: caps,
        layout: 'flat',
      });
    // The 7-file matching set, minus the one path under test: what must STILL
    // compare cleanly while the sabotaged path is reported.
    const REST = 6;

    it('a DIRECTORY at an expected path is reported — it no longer collapses the run', () => {
      // The live evidence: `mkdir` over pharn/CONSTITUTION.md made readFileSync
      // throw EISDIR, status print a raw errno naming no file, and the drift
      // report for every OTHER file vanish.
      const { repo, proj } = fixture();
      rmSync(join(proj, 'CONSTITUTION.md'));
      mkdirSync(join(proj, 'CONSTITUTION.md'), { recursive: true });

      expect(() => run(repo, proj)).not.toThrow();
      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual(['CONSTITUTION.md']);
      expect(r.unreadable[0]!.reason).toBeTruthy();
      // ANTI-COLLAPSE: every other expected file still got compared.
      expect(r.okCount).toBe(REST);
      expect(r.modified).toEqual([]);
      expect(r.missing).toEqual([]);
    });

    it('a symlink to DIFFERENT bytes → unreadable, never `modified`', () => {
      // It used to be read THROUGH and listed under Modified, indistinguishable
      // from a genuine content edit — the reason (a link sits there) erased.
      const { repo, proj } = fixture();
      write(join(proj, 'elsewhere.md'), 'NOT-THE-CONSTITUTION');
      rmSync(join(proj, 'CONSTITUTION.md'));
      symlinkSync(join(proj, 'elsewhere.md'), join(proj, 'CONSTITUTION.md'));

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual(['CONSTITUTION.md']);
      // The reason NAMES the link: that is the whole honesty claim here.
      expect(r.unreadable[0]!.reason).toMatch(/symlink/);
      expect(r.modified).toEqual([]);
      expect(r.okCount).toBe(REST);
    });

    it('a symlink to BYTE-IDENTICAL content → unreadable, and NOT counted ok', () => {
      // The sharpest case: status used to count it ok and never mention it —
      // silently blessing a path that points outside the install and can change
      // under it tomorrow. okCount is asserted, not just membership: counting
      // it would leave every other assertion here satisfied.
      const { repo, proj } = fixture();
      write(join(proj, 'identical-copy.md'), 'C'); // the clone's exact bytes
      rmSync(join(proj, 'CONSTITUTION.md'));
      symlinkSync(
        join(proj, 'identical-copy.md'),
        join(proj, 'CONSTITUTION.md'),
      );

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual(['CONSTITUTION.md']);
      expect(r.unreadable[0]!.reason).toMatch(/symlink/);
      expect(r.okCount).toBe(REST); // NOT REST + 1
      expect(r.modified).toEqual([]);
      expect(r.missing).toEqual([]);
    });

    it('a DANGLING symlink → unreadable, not `missing`', () => {
      // existsSync follows the link and returns false, so the old report said
      // the file was absent when the truth is a link squats on the path.
      const { repo, proj } = fixture();
      rmSync(join(proj, 'CONSTITUTION.md'));
      symlinkSync(join(proj, 'ghost-target.md'), join(proj, 'CONSTITUTION.md'));

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual(['CONSTITUTION.md']);
      expect(r.unreadable[0]!.reason).toMatch(/symlink/);
      expect(r.missing).toEqual([]);
      expect(r.okCount).toBe(REST);
    });

    it('a path whose PARENT is a regular file (ENOTDIR) → unreadable, not `missing`', () => {
      // existsSync returns false without throwing here too, so this read as
      // "absent" when the truth is the path cannot exist.
      const { repo, proj } = fixture();
      rmSync(join(proj, 'pharn-pipeline/grillers/a11y'), { recursive: true });
      write(
        join(proj, 'pharn-pipeline/grillers/a11y'),
        'a file where a directory belongs',
      );

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual([
        'pharn-pipeline/grillers/a11y/a11y.md',
      ]);
      expect(r.unreadable[0]!.reason).toBeTruthy();
      expect(r.missing).toEqual([]);
      expect(r.okCount).toBe(REST);
    });

    it('sorts `unreadable` by rel, independent of manifest order (P5)', () => {
      // The manifest emits capability dirs BEFORE the trusted docs, so these two
      // arrive in the opposite order to the one asserted — the sort is doing
      // real work, not agreeing with iteration order by luck.
      const { repo, proj } = fixture();
      for (const rel of [
        'pharn-pipeline/grillers/a11y/a11y.md',
        'CONSTITUTION.md',
      ]) {
        rmSync(join(proj, rel));
        mkdirSync(join(proj, rel), { recursive: true });
      }

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual([
        'CONSTITUTION.md',
        'pharn-pipeline/grillers/a11y/a11y.md',
      ]);
    });
  });

  // The canonical-hash claim in src/lib/hash.ts ("one canonical implementation
  // so the drift check (status), the install record store, and the update
  // decision can never disagree") names diff.ts by name — and diff.ts forked it
  // anyway with a private sha256 and its own fs reads. That claim was prose;
  // this makes it checked, so the fork cannot quietly return.
  it('owns no disk or hash primitives of its own — every read goes through lib/', () => {
    const here = fileURLToPath(import.meta.url);
    const code = readFileSync(
      join(here, '..', '..', 'src', 'lib', 'diff.ts'),
      'utf8',
    )
      // Comments legitimately NAME these (explaining what moved and why), so
      // strip them: the assertion is about imports and calls, not prose.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/from\s+'node:fs'/);
    expect(code).not.toMatch(/from\s+'node:crypto'/);
    expect(code).not.toMatch(/\b(existsSync|readFileSync|createHash)\b/);
  });
});
