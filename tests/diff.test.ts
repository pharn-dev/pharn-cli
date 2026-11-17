import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { sealRepo } from './support/harness.js';
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
    write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    write(join(repo, 'pharn/pharn-review/n-plus-one/n-plus-one.md'), 'N');
    write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
    write(join(repo, '.claude/commands/pharn-dev-plan.md'), 'DEV');
    write(join(repo, '.claude/hooks/enforce.cjs'), 'hook');
    write(join(repo, '.claude/hooks/enforce.test.cjs'), 'HOOKTEST');
    write(join(repo, '.claude/settings.json'), '{"a":1}');
    write(join(repo, 'pharn/CONSTITUTION.md'), 'C');
    write(join(repo, 'pharn/pharn-contracts/finding-shape.md'), 'fs');
    write(join(repo, 'pharn/floor/validate.mjs'), 'floor');
    write(join(repo, 'pharn/floor/validate.test.mjs'), 'FLOORTEST');
  }

  // The exact PHARN-owned set installCapabilities would have written (settings
  // excluded — user-owned; dev-only + test files never copied).
  function scaffoldMatchingProject(proj: string): void {
    write(join(proj, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'), 'A');
    write(join(proj, 'pharn/pharn-review/n-plus-one/n-plus-one.md'), 'N');
    write(join(proj, '.claude/commands/pharn-plan.md'), 'plan');
    write(join(proj, '.claude/hooks/enforce.cjs'), 'hook');
    write(join(proj, 'pharn/CONSTITUTION.md'), 'C');
    write(join(proj, 'pharn/pharn-contracts/finding-shape.md'), 'fs');
    write(join(proj, 'pharn/floor/validate.mjs'), 'floor');
  }

  it('reports all ok when the project matches (settings.json + dev-only excluded)', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldClone(repo);
    scaffoldMatchingProject(proj);
    // A different settings.json must be ignored (user-owned).
    write(join(proj, '.claude/settings.json'), '{"user":true}');

    const r = diffInstalledCapabilities({
      repoDir: sealRepo(repo),
      projectRoot: proj,
      capabilities: caps,
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
    write(join(proj, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'), 'A-EDITED');
    rmSync(join(proj, 'pharn/pharn-review/n-plus-one/n-plus-one.md'));
    write(join(proj, 'pharn/CONSTITUTION.md'), 'C-EDITED'); // modified doc

    const r = diffInstalledCapabilities({
      repoDir: sealRepo(repo),
      projectRoot: proj,
      capabilities: caps,
    });
    expect(r.modified).toContain('pharn/pharn-pipeline/grillers/a11y/a11y.md');
    expect(r.modified).toContain('pharn/CONSTITUTION.md');
    expect(r.missing).toEqual(['pharn/pharn-review/n-plus-one/n-plus-one.md']);
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
      repoDir: sealRepo(repo),
      projectRoot: proj,
      capabilities: caps,
    });
    expect(r.missing).toEqual([]);
    expect(r.modified).toEqual([]);
    // a11y, n-plus-one, pharn-plan, enforce.cjs, CONSTITUTION, contract, floor.
    expect(r.okCount).toBe(7);

    // An edited pharn/ file is flagged AT its pharn/ path — proving the expected
    // set used the pharn paths, not the flat ones.
    write(join(proj, 'pharn/pharn-review/n-plus-one/n-plus-one.md'), 'N-EDIT');
    const r2 = diffInstalledCapabilities({
      repoDir: sealRepo(repo),
      projectRoot: proj,
      capabilities: caps,
    });
    expect(r2.modified).toContain(
      'pharn/pharn-review/n-plus-one/n-plus-one.md',
    );
  });

  // The point of putting pharn-core in the install manifest: `status` compares it
  // like any other fixed surface, so an install that predates the surface — or a
  // user who deleted it — is REPORTED instead of silently diverging. This is what
  // makes `status --strict` exit 1 for a missing seam-resolver.
  it('reports a deleted pharn/pharn-core file as missing (status drift)', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    write(join(repo, 'pharn/pharn-contracts/finding-shape.md'), 'fs');
    write(join(repo, 'pharn/pharn-core/seam-resolver/seam-resolver.md'), 'sr');
    write(join(proj, 'pharn/pharn-contracts/finding-shape.md'), 'fs');
    // The project does NOT have the core file (a pre-surface install).

    const r = diffInstalledCapabilities({
      repoDir: sealRepo(repo),
      projectRoot: proj,
      capabilities: [],
    });
    expect(r.missing).toContain(
      'pharn/pharn-core/seam-resolver/seam-resolver.md',
    );
    expect(r.modified).toEqual([]);

    // Present but locally edited → modified, not missing (the other arm).
    write(
      join(proj, 'pharn/pharn-core/seam-resolver/seam-resolver.md'),
      'sr-EDITED',
    );
    const r2 = diffInstalledCapabilities({
      repoDir: sealRepo(repo),
      projectRoot: proj,
      capabilities: [],
    });
    expect(r2.missing).toEqual([]);
    expect(r2.modified).toEqual([
      'pharn/pharn-core/seam-resolver/seam-resolver.md',
    ]);
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
        repoDir: sealRepo(repo),
        projectRoot: proj,
        capabilities: caps,
      });
    // The 7-file matching set, minus the one path under test: what must STILL
    // compare cleanly while the sabotaged path is reported.
    const REST = 6;

    it('a DIRECTORY at an expected path is reported — it no longer collapses the run', () => {
      // The live evidence: `mkdir` over pharn/CONSTITUTION.md made readFileSync
      // throw EISDIR, status print a raw errno naming no file, and the drift
      // report for every OTHER file vanish.
      const { repo, proj } = fixture();
      rmSync(join(proj, 'pharn/CONSTITUTION.md'));
      mkdirSync(join(proj, 'pharn/CONSTITUTION.md'), { recursive: true });

      expect(() => run(repo, proj)).not.toThrow();
      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual(['pharn/CONSTITUTION.md']);
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
      rmSync(join(proj, 'pharn/CONSTITUTION.md'));
      symlinkSync(
        join(proj, 'elsewhere.md'),
        join(proj, 'pharn/CONSTITUTION.md'),
      );

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual(['pharn/CONSTITUTION.md']);
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
      rmSync(join(proj, 'pharn/CONSTITUTION.md'));
      symlinkSync(
        join(proj, 'identical-copy.md'),
        join(proj, 'pharn/CONSTITUTION.md'),
      );

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual(['pharn/CONSTITUTION.md']);
      expect(r.unreadable[0]!.reason).toMatch(/symlink/);
      expect(r.okCount).toBe(REST); // NOT REST + 1
      expect(r.modified).toEqual([]);
      expect(r.missing).toEqual([]);
    });

    it('a DANGLING symlink → unreadable, not `missing`', () => {
      // existsSync follows the link and returns false, so the old report said
      // the file was absent when the truth is a link squats on the path.
      const { repo, proj } = fixture();
      rmSync(join(proj, 'pharn/CONSTITUTION.md'));
      symlinkSync(
        join(proj, 'ghost-target.md'),
        join(proj, 'pharn/CONSTITUTION.md'),
      );

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual(['pharn/CONSTITUTION.md']);
      expect(r.unreadable[0]!.reason).toMatch(/symlink/);
      expect(r.missing).toEqual([]);
      expect(r.okCount).toBe(REST);
    });

    it('a file under a symlinked PARENT → unreadable, never counted ok', () => {
      // The read-side twin of tests/apply-update.test.ts's parent case, and the
      // one that made diff.ts's "the read and the write can never disagree"
      // false: status hashed THROUGH the link, found the upstream bytes, and
      // counted the file ok — blessing a directory that lives outside the
      // install and can be re-pointed tomorrow. `update` meanwhile planned a
      // write and aborted mid-run on the write-side walk.
      const { repo, proj } = fixture();
      const dir = join(proj, 'pharn/pharn-pipeline/grillers/a11y');
      renameSync(dir, join(proj, 'a11y-moved'));
      symlinkSync(join(proj, 'a11y-moved'), dir);

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual([
        'pharn/pharn-pipeline/grillers/a11y/a11y.md',
      ]);
      expect(r.unreadable[0]!.reason).toMatch(/symlink/);
      // okCount is asserted, not just membership: counting it would leave every
      // other assertion here satisfied.
      expect(r.okCount).toBe(REST); // NOT REST + 1
      expect(r.modified).toEqual([]);
      expect(r.missing).toEqual([]);
    });

    it('a path whose PARENT is a regular file (ENOTDIR) → unreadable, not `missing`', () => {
      // existsSync returns false without throwing here too, so this read as
      // "absent" when the truth is the path cannot exist.
      const { repo, proj } = fixture();
      rmSync(join(proj, 'pharn/pharn-pipeline/grillers/a11y'), {
        recursive: true,
      });
      write(
        join(proj, 'pharn/pharn-pipeline/grillers/a11y'),
        'a file where a directory belongs',
      );

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual([
        'pharn/pharn-pipeline/grillers/a11y/a11y.md',
      ]);
      expect(r.unreadable[0]!.reason).toBeTruthy();
      expect(r.missing).toEqual([]);
      expect(r.okCount).toBe(REST);
    });

    it('sorts `unreadable` by rel, independent of manifest order (P5)', () => {
      // The sort is the diff's own, never the manifest's iteration order.
      const { repo, proj } = fixture();
      for (const rel of [
        'pharn/pharn-pipeline/grillers/a11y/a11y.md',
        'pharn/CONSTITUTION.md',
      ]) {
        rmSync(join(proj, rel));
        mkdirSync(join(proj, rel), { recursive: true });
      }

      const r = run(repo, proj);

      expect(r.unreadable.map((u) => u.rel)).toEqual([
        'pharn/CONSTITUTION.md',
        'pharn/pharn-pipeline/grillers/a11y/a11y.md',
      ]);
    });
  });

  // F-16: a project committed and re-checked-out with core.autocrlf=true holds
  // every installed text file with CRLF line endings. That is not drift.
  describe('line endings (CRLF vs LF in text files)', () => {
    // Multi-line bodies, so there ARE line endings to convert.
    const BODIES: [string, string][] = [
      [
        'pharn/pharn-pipeline/grillers/a11y/a11y.md',
        '# a11y\n\nask about focus\n',
      ],
      [
        'pharn/pharn-review/n-plus-one/n-plus-one.md',
        '# n+1\nlook for loops\n',
      ],
      ['.claude/commands/pharn-plan.md', '---\nrole: skill\n---\nplan\n'],
      ['.claude/hooks/enforce.cjs', "'use strict';\nmodule.exports = 1;\n"],
      ['pharn/CONSTITUTION.md', '# C\n\nP0\nP1\n'],
      ['pharn/pharn-contracts/finding-shape.md', '# finding\nshape\n'],
      ['pharn/floor/validate.mjs', 'export {};\nconsole.log(1);\n'],
    ];

    function scaffold(transform: (lf: string) => string): {
      repo: string;
      proj: string;
    } {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      scaffoldClone(repo);
      for (const [rel, body] of BODIES) {
        write(join(repo, rel), body);
        write(join(proj, rel), transform(body));
      }
      return { repo, proj };
    }

    const run = (repo: string, proj: string) =>
      diffInstalledCapabilities({
        repoDir: sealRepo(repo),
        projectRoot: proj,
        capabilities: caps,
      });

    it('a CRLF copy of every expected file is all ok — nothing modified', () => {
      const { repo, proj } = scaffold((lf) => lf.replace(/\n/g, '\r\n'));
      expect(
        readFileSync(join(proj, 'pharn/CONSTITUTION.md'), 'utf8'),
      ).toContain('\r\n');
      const r = run(repo, proj);
      expect(r.modified).toEqual([]);
      expect(r.missing).toEqual([]);
      expect(r.okCount).toBe(BODIES.length);
    });

    it('mixed endings are ok too', () => {
      // Only the FIRST line ending becomes CRLF, so the file mixes both.
      const { repo, proj } = scaffold((lf) => {
        const i = lf.indexOf('\n');
        return `${lf.slice(0, i)}\r\n${lf.slice(i + 1)}`;
      });
      expect(run(repo, proj).modified).toEqual([]);
    });

    it('a real edit in a CRLF file is still modified', () => {
      const { repo, proj } = scaffold((lf) => lf.replace(/\n/g, '\r\n'));
      write(
        join(proj, 'pharn/CONSTITUTION.md'),
        '# C\r\n\r\nP0 EDITED\r\nP1\r\n',
      );
      const r = run(repo, proj);
      expect(r.modified).toEqual(['pharn/CONSTITUTION.md']);
      expect(r.okCount).toBe(BODIES.length - 1);
    });

    it('a binary file (NUL in its first bytes) is compared byte-for-byte', () => {
      const { repo, proj } = scaffold((lf) => lf);
      write(join(repo, 'pharn/CONSTITUTION.md'), '\0bin\nary\n');
      write(join(proj, 'pharn/CONSTITUTION.md'), '\0bin\r\nary\r\n');
      expect(run(repo, proj).modified).toEqual(['pharn/CONSTITUTION.md']);
    });

    // GRILL P1: the real phenomenon, not hand-written CRLF. git converts LF →
    // CRLF on checkout under core.autocrlf=true on every platform (Linux
    // included), so this exercises the git half of F-16. It is still NOT a
    // Windows run.
    const hasGit = (() => {
      try {
        execFileSync('git', ['--version'], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    })();

    it.skipIf(!hasGit)(
      'a real `git -c core.autocrlf=true` checkout of the project reads as no drift',
      () => {
        const { repo, proj } = scaffold((lf) => lf);
        const git = (...args: string[]): void => {
          execFileSync(
            'git',
            [
              '-c',
              'user.name=pharn-test',
              '-c',
              'user.email=pharn-test@example.invalid',
              '-c',
              'commit.gpgsign=false',
              '-c',
              'core.safecrlf=false',
              ...args,
            ],
            {
              cwd: proj,
              stdio: 'ignore',
              env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: proj },
            },
          );
        };
        git('init', '-q');
        git('-c', 'core.autocrlf=false', 'add', '-A');
        git('-c', 'core.autocrlf=false', 'commit', '-q', '-m', 'install');
        for (const [rel] of BODIES) rmSync(join(proj, rel));
        git('-c', 'core.autocrlf=true', 'checkout', '--', '.');

        // The round trip really converted (otherwise this test is vacuous).
        for (const [rel] of BODIES) {
          expect(readFileSync(join(proj, rel), 'utf8')).toContain('\r\n');
        }
        const r = run(repo, proj);
        expect(r.modified).toEqual([]);
        expect(r.missing).toEqual([]);
        expect(r.okCount).toBe(BODIES.length);
      },
    );
  });
});
