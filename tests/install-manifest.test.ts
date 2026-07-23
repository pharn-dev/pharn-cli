import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  collectExpectedInstallPaths,
  conflictingWriteTargets,
  PHARN_CONFIG_FILE,
} from '../src/lib/install-manifest.js';
import { installCapabilities } from '../src/lib/install-capabilities.js';
import type { Selection } from '../src/types.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// Relative posix paths of every file (not dir) under `dir`, recursively.
function walkRel(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkRel(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

// A fake fetched clone (flat layout) with the full product + dev surface, so the
// manifest's exclusions (dev commands, *.test.*, settings.json, skipped caps,
// .dev/features + .dev/memory-bank) can be asserted.
function scaffoldRepo(repo: string): void {
  write(join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'));
  write(join(repo, 'pharn-pipeline/grillers/a11y/evals/cases/c.md'));
  write(join(repo, 'pharn-pipeline/grillers/security/security.md'));
  write(join(repo, 'pharn-review/n-plus-one/n-plus-one.md'));
  write(join(repo, 'pharn-review/trust-fence/trust-fence.md'));
  write(join(repo, '.claude/commands/pharn-plan.md'));
  write(join(repo, '.claude/commands/pharn-ship.md'));
  write(join(repo, '.claude/commands/pharn-dev-plan.md'));
  write(join(repo, '.claude/commands/README.md'));
  write(join(repo, '.claude/hooks/set-writes-scope.cjs'));
  write(join(repo, '.claude/hooks/set-writes-scope.test.cjs'));
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'CONSTITUTION.md'));
  write(join(repo, 'ARCHITECTURE.md'));
  write(join(repo, 'THREAT-MODEL.md'));
  write(join(repo, 'LIMITS.md'));
  write(join(repo, 'pharn-contracts/finding-shape.md'));
  write(join(repo, '.dev/floor/validate.mjs'));
  write(join(repo, '.dev/floor/validate.test.mjs'));
  write(join(repo, '.dev/features/some-feature/PLAN.md'));
  write(join(repo, '.dev/memory-bank/lessons-learned.md'));
}

// The pharn/ single-install layout (detection marker: pharn/pharn-contracts).
function scaffoldRepoPharn(repo: string): void {
  write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'));
  write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/evals/cases/c.md'));
  write(join(repo, 'pharn/pharn-review/n-plus-one/n-plus-one.md'));
  write(join(repo, '.claude/commands/pharn-plan.md'));
  write(join(repo, '.claude/commands/pharn-dev-plan.md'));
  write(join(repo, '.claude/hooks/set-writes-scope.cjs'));
  write(join(repo, '.claude/hooks/set-writes-scope.test.cjs'));
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'pharn/CONSTITUTION.md'));
  write(join(repo, 'pharn/ARCHITECTURE.md'));
  write(join(repo, 'pharn/pharn-contracts/finding-shape.md'));
  write(join(repo, 'pharn/floor/validate.mjs'));
  write(join(repo, 'pharn/floor/validate.test.mjs'));
  // dev-only, stay at root, must NOT be part of a pharn install:
  write(join(repo, 'THREAT-MODEL.md'));
  write(join(repo, 'LIMITS.md'));
}

function selection(): Selection {
  return {
    selected: [
      { name: 'a11y', role: 'griller', matched: ['ssr'] },
      { name: 'n-plus-one', role: 'lens', matched: ['ssr'] },
    ],
    skipped: [
      {
        name: 'security',
        role: 'griller',
        reason: 'not selected in this test',
      },
    ],
  };
}

describe('collectExpectedInstallPaths (flat)', () => {
  const tmp = useTmpDir();

  function keys(): string[] {
    const repo = join(tmp.path(), 'repo');
    scaffoldRepo(repo);
    return [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'flat',
      }).keys(),
    ].sort();
  }

  it('includes the selected capability dirs (incl. evals) + fixed surfaces', () => {
    const k = keys();
    for (const p of [
      'pharn-pipeline/grillers/a11y/a11y.md',
      'pharn-pipeline/grillers/a11y/evals/cases/c.md',
      'pharn-review/n-plus-one/n-plus-one.md',
      '.claude/commands/pharn-plan.md',
      '.claude/commands/pharn-ship.md',
      '.claude/hooks/set-writes-scope.cjs',
      'CONSTITUTION.md',
      'ARCHITECTURE.md',
      'THREAT-MODEL.md',
      'LIMITS.md',
      'pharn-contracts/finding-shape.md',
      '.dev/floor/validate.mjs',
    ]) {
      expect(k).toContain(p);
    }
  });

  it('EXCLUDES settings.json, dev commands, non-pharn commands, *.test.*, skipped caps, .dev/features+memory-bank', () => {
    const k = keys();
    for (const p of [
      '.claude/settings.json',
      '.claude/commands/pharn-dev-plan.md',
      '.claude/commands/README.md',
      '.claude/hooks/set-writes-scope.test.cjs',
      '.dev/floor/validate.test.mjs',
      'pharn-pipeline/grillers/security/security.md',
      'pharn-review/trust-fence/trust-fence.md',
      '.dev/features/some-feature/PLAN.md',
      '.dev/memory-bank/lessons-learned.md',
    ]) {
      expect(k).not.toContain(p);
    }
  });
});

describe('collectExpectedInstallPaths (untrusted symlinks)', () => {
  const tmp = useTmpDir();

  it('skips a symlink inside a walked dir (mirrors install, which never copies symlinks)', () => {
    const repo = join(tmp.path(), 'repo');
    scaffoldRepo(repo);
    // Plant a symlink inside a walked capability dir — the clone is untrusted (P2)
    // and installCapabilities never materializes symlinks, so the mirror must not
    // enumerate one either (a symlink's Dirent.isDirectory() is false).
    symlinkSync(
      join(repo, 'CONSTITUTION.md'),
      join(repo, 'pharn-pipeline/grillers/a11y/evil.md'),
    );
    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'flat',
      }).keys(),
    ];
    expect(keys).not.toContain('pharn-pipeline/grillers/a11y/evil.md');
    // The real (non-symlink) sibling in the same dir is still enumerated.
    expect(keys).toContain('pharn-pipeline/grillers/a11y/a11y.md');
  });
});

describe('collectExpectedInstallPaths (pharn layout)', () => {
  const tmp = useTmpDir();

  it('mirrors surfaces UNDER pharn/ and drops THREAT-MODEL/LIMITS', () => {
    const repo = join(tmp.path(), 'repo');
    scaffoldRepoPharn(repo);
    const k = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'pharn',
      }).keys(),
    ];
    expect(k).toContain('pharn/pharn-pipeline/grillers/a11y/a11y.md');
    expect(k).toContain('pharn/CONSTITUTION.md');
    expect(k).toContain('pharn/ARCHITECTURE.md');
    expect(k).toContain('pharn/pharn-contracts/finding-shape.md');
    expect(k).toContain('pharn/floor/validate.mjs');
    // pharn docs set is CONSTITUTION + ARCHITECTURE only; THREAT-MODEL/LIMITS drop.
    expect(k).not.toContain('THREAT-MODEL.md');
    expect(k).not.toContain('LIMITS.md');
    expect(k).not.toContain('pharn/floor/validate.test.mjs');
    // .claude/* stays layout-invariant (at root, not under pharn/).
    expect(k).toContain('.claude/commands/pharn-plan.md');
  });
});

describe('conflictingWriteTargets', () => {
  const tmp = useTmpDir();

  function proj(): string {
    const p = join(tmp.path(), 'proj');
    mkdirSync(p, { recursive: true });
    return p;
  }
  function repoFlat(): string {
    const r = join(tmp.path(), 'repo');
    scaffoldRepo(r);
    return r;
  }

  it('is [] for a fresh project (nothing already installed)', () => {
    expect(
      conflictingWriteTargets({
        repoDir: repoFlat(),
        projectRoot: proj(),
        capabilities: selection().selected,
        layout: 'flat',
      }),
    ).toEqual([]);
  });

  it('is [] for a project with ONLY .claude/settings.json (excluded → stays silent)', () => {
    const p = proj();
    write(join(p, '.claude/settings.json'), '{"user":"cfg"}');
    expect(
      conflictingWriteTargets({
        repoDir: repoFlat(),
        projectRoot: p,
        capabilities: selection().selected,
        layout: 'flat',
      }),
    ).toEqual([]);
  });

  it('includes pharn.config.json when present', () => {
    const p = proj();
    write(join(p, PHARN_CONFIG_FILE), '{}');
    expect(
      conflictingWriteTargets({
        repoDir: repoFlat(),
        projectRoot: p,
        capabilities: selection().selected,
        layout: 'flat',
      }),
    ).toEqual([PHARN_CONFIG_FILE]);
  });

  it('lists existing write targets, sorted (deterministic)', () => {
    const p = proj();
    write(join(p, 'CONSTITUTION.md'));
    write(join(p, 'pharn-review/n-plus-one/n-plus-one.md'));
    const got = conflictingWriteTargets({
      repoDir: repoFlat(),
      projectRoot: p,
      capabilities: selection().selected,
      layout: 'flat',
    });
    expect(got).toEqual([
      'CONSTITUTION.md',
      'pharn-review/n-plus-one/n-plus-one.md',
    ]);
  });
});

// Mirror-consistency: collectExpectedInstallPaths MIRRORS installCapabilities, so
// pin it against a REAL install — the two must not silently drift. The manifest
// intentionally excludes the user-owned .claude/settings.json, which install DOES
// write, so the real-write set equals the manifest keys PLUS that one file.
describe('collectExpectedInstallPaths ⟷ installCapabilities (mirror)', () => {
  const tmp = useTmpDir();

  function assertMirror(
    layout: 'flat' | 'pharn',
    scaffold: (r: string) => void,
  ) {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffold(repo);
    installCapabilities(repo, proj, selection());
    const written = new Set(walkRel(proj));
    const expected = new Set(
      collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout,
      }).keys(),
    );
    expected.add('.claude/settings.json'); // install writes it; manifest excludes it
    expect([...written].sort()).toEqual([...expected].sort());
  }

  it('flat layout: manifest keys ∪ settings.json == files actually written', () => {
    assertMirror('flat', scaffoldRepo);
  });

  it('pharn layout: manifest keys ∪ settings.json == files actually written', () => {
    assertMirror('pharn', scaffoldRepoPharn);
  });
});
