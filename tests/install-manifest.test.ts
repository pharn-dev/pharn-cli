import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  capabilityCloneFiles,
  collectExpectedInstallPaths,
  conflictingWriteTargets,
  PHARN_CONFIG_FILE,
} from '../src/lib/install-manifest.js';
import {
  installCapabilities,
  installCapabilityDirs,
} from '../src/lib/install-capabilities.js';
import { applyWrites } from '../src/lib/apply-update.js';
import { BACKUP_DIR } from '../src/lib/backup.js';
import { RECORDS_FILE } from '../src/lib/install-records.js';
import { layoutPaths } from '../src/lib/layout.js';
import { ManifestValidationError } from '../src/lib/validate.js';
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
  write(join(repo, 'features/README.md'));
  write(join(repo, 'pharn-contracts/finding-shape.md'));
  write(join(repo, '.dev/floor/validate.mjs'));
  write(join(repo, '.dev/floor/validate.test.mjs'));
  write(join(repo, '.dev/floor/test-fixtures/red/skill.md'));
  write(join(repo, '.dev/floor/test-fixtures/structural/red-1.expected.json'));
  write(join(repo, '.dev/floor/my-test-fixtures.mjs'));
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
  write(join(repo, 'pharn/THREAT-MODEL.md'));
  write(join(repo, 'pharn/LIMITS.md'));
  // Root in BOTH layouts, like .claude/*.
  write(join(repo, 'features/README.md'));
  write(join(repo, 'pharn/pharn-contracts/finding-shape.md'));
  write(join(repo, 'pharn/floor/validate.mjs'));
  write(join(repo, 'pharn/floor/validate.test.mjs'));
  write(join(repo, 'pharn/floor/test-fixtures/red/skill.md'));
  write(join(repo, 'pharn/floor/my-test-fixtures.mjs'));
  // pharn-core: the fixed skill surface (seam-resolver + its evals), copied whole.
  write(join(repo, 'pharn/pharn-core/seam-resolver/seam-resolver.md'));
  write(join(repo, 'pharn/pharn-core/seam-resolver/evals/cases/resolve.md'));
  write(join(repo, 'pharn/pharn-core/seam-resolver/evals/expected/resolve.md'));
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
      // The product-loop boundary contract the installed commands cite by name.
      'features/README.md',
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
    // The flat `core` path resolves, but no flat clone ships the dir, so it
    // contributes no keys — a flat install's expected set is unchanged (P7).
    expect(k.some((p) => p.startsWith('pharn-core/'))).toBe(false);
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

  it('mirrors every surface UNDER pharn/, all four trusted docs included', () => {
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
    // pharn-core is in the expected set, so status compares it and update
    // restores it — the drift coverage the manifest entry buys.
    expect(k).toContain('pharn/pharn-core/seam-resolver/seam-resolver.md');
    expect(k).toContain(
      'pharn/pharn-core/seam-resolver/evals/cases/resolve.md',
    );
    expect(k).toContain('pharn/THREAT-MODEL.md');
    expect(k).toContain('pharn/LIMITS.md');
    // Layout-INVARIANT: root in both layouts, like .claude/*.
    expect(k).toContain('features/README.md');
    expect(k).not.toContain('pharn/features/README.md');
    // Path-anchored, not a basename: the point is that nothing leaks to the
    // project ROOT, and `not.toContain('THREAT-MODEL.md')` would fail on the
    // pharn/-prefixed key it is supposed to allow.
    expect(k).not.toContain('THREAT-MODEL.md');
    expect(k).not.toContain('LIMITS.md');
    expect(k).not.toContain('pharn/floor/validate.test.mjs');
    // .claude/* stays layout-invariant (at root, not under pharn/).
    expect(k).toContain('.claude/commands/pharn-plan.md');
  });

  // P2: the manifest is the SOURCE side of every update write, so a symlinked
  // pharn-core root must contribute nothing — the writer refuses it, and a
  // mirror that enumerated it would have `update` copy files from outside the
  // clone into the user's repo.
  it('a symlinked pharn-core root contributes NO keys', () => {
    const repo = join(tmp.path(), 'repo');
    const outside = join(tmp.path(), 'outside');
    scaffoldRepoPharn(repo);
    write(join(outside, 'secret.md'), 'not from the clone');
    rmSync(join(repo, 'pharn/pharn-core'), { recursive: true, force: true });
    symlinkSync(outside, join(repo, 'pharn/pharn-core'));

    const k = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'pharn',
      }).keys(),
    ];
    expect(k.some((p) => p.startsWith('pharn/pharn-core/'))).toBe(false);
    expect(k.some((p) => p.includes('secret'))).toBe(false);
    // The sibling surfaces are unaffected — the skip is scoped to this root.
    expect(k).toContain('pharn/pharn-contracts/finding-shape.md');
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

// The floor's test apparatus is excluded from the expected set too, or `status`
// would drift-track 16 dev files as product and `update` would restore them.
describe('collectExpectedInstallPaths — floor test-fixtures excluded', () => {
  const tmp = useTmpDir();

  function keysFor(layout: 'flat' | 'pharn'): string[] {
    const repo = join(tmp.path(), 'repo');
    if (layout === 'flat') scaffoldRepo(repo);
    else scaffoldRepoPharn(repo);
    return [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout,
      }).keys(),
    ];
  }

  it('omits every test-fixtures path but keeps the checkers (flat)', () => {
    const k = keysFor('flat');
    expect(k).toContain('.dev/floor/validate.mjs');
    expect(k.filter((p) => p.includes('test-fixtures/'))).toEqual([]);
    // SEGMENT, not substring: the near-miss sibling survives.
    expect(k).toContain('.dev/floor/my-test-fixtures.mjs');
  });

  it('omits every test-fixtures path but keeps the checkers (pharn)', () => {
    const k = keysFor('pharn');
    expect(k).toContain('pharn/floor/validate.mjs');
    expect(k.filter((p) => p.includes('test-fixtures/'))).toEqual([]);
    expect(k).toContain('pharn/floor/my-test-fixtures.mjs');
  });

  // The mirror pin below proves writer and manifest agree — but ONLY if the
  // scaffold actually contains a fixture. Without this guard a future scaffold
  // edit could remove it and the pin would go quiet rather than red.
  it('the mirror scaffolds really do contain a fixture file (else the pin is vacuous)', () => {
    const repo = join(tmp.path(), 'repo');
    scaffoldRepo(repo);
    expect(
      existsSync(join(repo, '.dev/floor/test-fixtures/red/skill.md')),
    ).toBe(true);
    const pharnRepo = join(tmp.path(), 'pharn-repo');
    scaffoldRepoPharn(pharnRepo);
    expect(
      existsSync(join(pharnRepo, 'pharn/floor/test-fixtures/red/skill.md')),
    ).toBe(true);
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

// The manifest now drives a SECOND writer: `pharn update` applies it file by
// file. The mirror must therefore be pinned against that writer too, or the two
// write paths can silently diverge (the exact drift this block exists to stop).
describe('collectExpectedInstallPaths ⟷ the update writer (mirror)', () => {
  const tmp = useTmpDir();

  function assertUpdateMirror(
    layout: 'flat' | 'pharn',
    scaffold: (r: string) => void,
  ): Map<string, string> {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffold(repo);

    const expected = collectExpectedInstallPaths({
      repoDir: repo,
      capabilities: selection().selected,
      layout,
    });
    // A fresh project: every expected file is absent → row 1 → all written.
    applyWrites({
      projectRoot: proj,
      expected,
      writes: [...expected.keys()],
    });

    expect(walkRel(proj).sort()).toEqual([...expected.keys()].sort());
    return expected;
  }

  it('applying every manifest entry writes exactly the manifest keys', () => {
    assertUpdateMirror('flat', scaffoldRepo);
  });

  // The pharn layout carries the surfaces the flat scaffold cannot (pharn-core),
  // so pin the update writer against it too — otherwise the new surface is
  // covered by the init writer's mirror only, and `update` could silently
  // diverge on exactly the files it is now expected to restore.
  it('pharn layout: applying every manifest entry writes exactly the keys', () => {
    const expected = assertUpdateMirror('pharn', scaffoldRepoPharn);
    expect([...expected.keys()]).toContain(
      'pharn/pharn-core/seam-resolver/seam-resolver.md',
    );
  });
});

// The manifest is the SOURCE side of every update write, so a symlinked source
// root would let a hostile clone source files from anywhere on disk into the
// user's repo. installCapabilities never copies through such a root; the mirror
// must not enumerate one either.
describe('collectExpectedInstallPaths — symlinked SOURCE roots (P2)', () => {
  const tmp = useTmpDir();

  function keysWith(plant: (repo: string, outside: string) => void): string[] {
    const repo = join(tmp.path(), 'repo');
    const outside = join(tmp.path(), 'outside');
    scaffoldRepo(repo);
    write(join(outside, 'secret.md'), 'not from the clone');
    plant(repo, outside);
    return [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'flat',
      }).keys(),
    ];
  }

  it('a symlinked capability dir contributes NOTHING (never files from outside the clone)', () => {
    const keys = keysWith((repo, outside) => {
      rmSync(join(repo, 'pharn-review/n-plus-one'), {
        recursive: true,
        force: true,
      });
      symlinkSync(outside, join(repo, 'pharn-review/n-plus-one'));
    });
    expect(keys).not.toContain('pharn-review/n-plus-one/secret.md');
    expect(keys.some((k) => k.includes('secret'))).toBe(false);
    // The real sibling capability is unaffected.
    expect(keys).toContain('pharn-pipeline/grillers/a11y/a11y.md');
  });

  it('a symlinked contracts/floor dir contributes nothing', () => {
    const keys = keysWith((repo, outside) => {
      rmSync(join(repo, 'pharn-contracts'), { recursive: true, force: true });
      symlinkSync(outside, join(repo, 'pharn-contracts'));
    });
    expect(keys.some((k) => k.startsWith('pharn-contracts/'))).toBe(false);
  });

  it('a symlinked trusted doc is not expected', () => {
    const keys = keysWith((repo, outside) => {
      rmSync(join(repo, 'CONSTITUTION.md'), { force: true });
      symlinkSync(join(outside, 'secret.md'), join(repo, 'CONSTITUTION.md'));
    });
    expect(keys).not.toContain('CONSTITUTION.md');
  });

  // lstat refuses to dereference only the FINAL component, so checking the leaf
  // alone still enumerates a clone whose ANCESTOR directory is a symlink.
  it('a symlinked ANCESTOR of a capability dir contributes nothing', () => {
    const keys = keysWith((repo, outside) => {
      write(join(outside, 'n-plus-one/n-plus-one.md'), 'planted');
      rmSync(join(repo, 'pharn-review'), { recursive: true, force: true });
      symlinkSync(outside, join(repo, 'pharn-review'));
    });
    expect(keys.some((k) => k.startsWith('pharn-review/'))).toBe(false);
    expect(keys).toContain('pharn-pipeline/grillers/a11y/a11y.md');
  });

  it('a symlinked ANCESTOR of the floor dir contributes nothing', () => {
    const keys = keysWith((repo, outside) => {
      write(join(outside, 'floor/evil.mjs'), 'planted');
      rmSync(join(repo, '.dev'), { recursive: true, force: true });
      symlinkSync(outside, join(repo, '.dev'));
    });
    expect(keys.some((k) => k.startsWith('.dev/'))).toBe(false);
  });
});

// The CLI's own metadata is not part of the install: it is never copied from the
// clone and must never be reported as drift or as an overwrite conflict.
describe('CLI-owned metadata is outside the install set', () => {
  const tmp = useTmpDir();

  it('pharn.records.json and .pharn-backup/ are in neither the manifest nor the conflict set', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    mkdirSync(proj, { recursive: true });
    write(join(proj, RECORDS_FILE), '{}');
    write(join(proj, `${BACKUP_DIR}/20260807-091500/CONSTITUTION.md`), 'old');

    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'flat',
      }).keys(),
    ];
    expect(keys).not.toContain(RECORDS_FILE);
    expect(keys.some((k) => k.startsWith(`${BACKUP_DIR}/`))).toBe(false);

    const conflicts = conflictingWriteTargets({
      repoDir: repo,
      projectRoot: proj,
      capabilities: selection().selected,
      layout: 'flat',
    });
    expect(conflicts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// capabilityCloneFiles — ONE capability's files enumerated in the CLONE, which
// is what `pharn add` derives BOTH its drift set and its record keys from. The
// contract that matters: it reports what the copy WOULD write and nothing else,
// and on an unreadable source it reports NOTHING rather than throwing — the
// curated refusal belongs to installCapabilityDirs' pre-flight, which runs after
// it and must be the message the user sees.
// ---------------------------------------------------------------------------
describe('capabilityCloneFiles', () => {
  const tmp = useTmpDir();

  it('enumerates the capability dir (incl. evals), sorted, prefixed with its subtree', () => {
    const repo = tmp.path();
    write(join(repo, 'pharn-review/n-plus-one/n-plus-one.md'));
    write(join(repo, 'pharn-review/n-plus-one/evals/cases/c.md'));
    write(join(repo, 'pharn-review/other/other.md'));

    expect(
      capabilityCloneFiles(repo, layoutPaths('flat'), {
        name: 'n-plus-one',
        role: 'lens',
      }),
    ).toEqual([
      'pharn-review/n-plus-one/evals/cases/c.md',
      'pharn-review/n-plus-one/n-plus-one.md',
    ]);
  });

  it('routes a griller to the grillers subtree', () => {
    const repo = tmp.path();
    write(join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'));

    expect(
      capabilityCloneFiles(repo, layoutPaths('flat'), {
        name: 'a11y',
        role: 'griller',
      }),
    ).toEqual(['pharn-pipeline/grillers/a11y/a11y.md']);
  });

  it('addresses the pharn/ layout when that is the layout given', () => {
    const repo = tmp.path();
    write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'));

    expect(
      capabilityCloneFiles(repo, layoutPaths('pharn'), {
        name: 'a11y',
        role: 'griller',
      }),
    ).toEqual(['pharn/pharn-pipeline/grillers/a11y/a11y.md']);
  });

  it('skips a symlink inside the capability dir, matching the copy filter', () => {
    // installCapabilityDirs' cpSync passes `filter: noSymlinks`, so a symlinked
    // entry is never written — claiming it here would put a path in the drift set
    // and the record store that the copy never touches.
    const repo = tmp.path();
    write(join(repo, 'pharn-review/x/x.md'));
    write(join(repo, 'outside.md'));
    symlinkSync(join(repo, 'outside.md'), join(repo, 'pharn-review/x/link.md'));

    expect(
      capabilityCloneFiles(repo, layoutPaths('flat'), {
        name: 'x',
        role: 'lens',
      }),
    ).toEqual(['pharn-review/x/x.md']);
  });

  it('is [] when the capability dir is absent — the pre-flight owns that refusal', () => {
    // A raw ENOENT from here would pre-empt installCapabilityDirs' curated
    // `Capability "ghost" (lens) is missing at …` message, which is the one the
    // user can act on.
    expect(
      capabilityCloneFiles(tmp.path(), layoutPaths('flat'), {
        name: 'ghost',
        role: 'lens',
      }),
    ).toEqual([]);
  });

  it('is [] when the capability dir is itself a symlink', () => {
    const repo = tmp.path();
    write(join(repo, 'elsewhere/x.md'));
    mkdirSync(join(repo, 'pharn-review'), { recursive: true });
    symlinkSync(join(repo, 'elsewhere'), join(repo, 'pharn-review/x'));

    expect(
      capabilityCloneFiles(repo, layoutPaths('flat'), {
        name: 'x',
        role: 'lens',
      }),
    ).toEqual([]);
  });

  // The MIRROR pin, the same one collectExpectedInstallPaths carries against a
  // real installCapabilities run. capabilityCloneFiles drives a DESTRUCTIVE
  // decision (which files `add` backs up) and a DURABLE one (which it records),
  // so its agreement with what the copy actually writes must be tested, not
  // argued: the two traversals are independent (walkFiles' Dirent check vs
  // cpSync's noSymlinks filter) and could drift apart silently.
  it('MIRROR: equals exactly what a real installCapabilityDirs copy writes', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    write(join(repo, 'pharn-review/a11y/a11y.md'));
    write(join(repo, 'pharn-review/a11y/evals/cases/basic.md'));
    write(join(repo, 'pharn-review/a11y/evals/expected/basic.json'));
    // A symlink the copy skips — the divergence the mirror exists to catch.
    write(join(repo, 'outside.md'));
    symlinkSync(join(repo, 'outside.md'), join(repo, 'pharn-review/a11y/l.md'));
    const cap = { name: 'a11y', role: 'lens' } as const;

    installCapabilityDirs(repo, proj, [cap]);

    // Both sides sorted: walkRel yields readdir order, so an unsorted compare
    // would pass or fail on directory-entry ordering rather than on membership.
    expect(capabilityCloneFiles(repo, layoutPaths('flat'), cap)).toEqual(
      walkRel(join(proj, 'pharn-review/a11y'))
        .map((rel) => `pharn-review/a11y/${rel}`)
        .sort(),
    );
  });

  it('is [] when the capability path is a file rather than a directory', () => {
    const repo = tmp.path();
    write(join(repo, 'pharn-review/x'));

    expect(
      capabilityCloneFiles(repo, layoutPaths('flat'), {
        name: 'x',
        role: 'lens',
      }),
    ).toEqual([]);
  });
});

// The manifest is the SOURCE side of every `pharn update` write, and the
// installer copies the SAME two surfaces through copyFilteredDir — which holds
// each kept basename to COPY_FILENAME_RE + no-`..` and HARD-FAILS on a miss
// (src/lib/install-capabilities.ts). Before this floor existed the two write
// paths disagreed on one clone: `init` refused it, `update` copied the file in.
// These cases pin that they now refuse together, and that the floor is scoped to
// exactly those two surfaces.
describe('collectExpectedInstallPaths — command/hook filename floor (P2)', () => {
  const tmp = useTmpDir();

  function repoWith(plant: (repo: string) => void): string {
    const repo = join(tmp.path(), 'repo');
    scaffoldRepo(repo);
    plant(repo);
    return repo;
  }

  function keysOf(repo: string): string[] {
    return [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'flat',
      }).keys(),
    ];
  }

  function installInto(repo: string): void {
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    installCapabilities(repo, proj, selection());
  }

  // Both write paths, one clone: the mirror must agree on the REFUSAL too, not
  // just on the accepted set.
  it('an out-of-allowlist product command makes BOTH the manifest and the installer throw', () => {
    const repo = repoWith((r) =>
      write(join(r, '.claude/commands/pharn-Weird_Name.md')),
    );
    expect(() => keysOf(repo)).toThrow(ManifestValidationError);
    expect(() => keysOf(repo)).toThrow(/pharn-Weird_Name\.md/);
    expect(() => installInto(repo)).toThrow(ManifestValidationError);
  });

  // A NEW name, not an uppercase respelling of the scaffold's own hook: on a
  // case-insensitive filesystem (macOS default) the respelling would overwrite
  // the existing entry and readdir would report the original lowercase name, so
  // the case would pass vacuously.
  it('an uppercase hook name makes BOTH the manifest and the installer throw', () => {
    const repo = repoWith((r) =>
      write(join(r, '.claude/hooks/Guard-Hook.cjs')),
    );
    expect(() => keysOf(repo)).toThrow(ManifestValidationError);
    expect(() => installInto(repo)).toThrow(ManifestValidationError);
  });

  // The regex half and the control-char half of assertSafeString are different
  // checks; a control char is a legal POSIX filename byte, so pin it separately.
  it('a control-char hook name is refused by both (assertSafeString, not just the regex)', () => {
    const bad = `set${String.fromCharCode(1)}scope.cjs`;
    const repo = repoWith((r) => write(join(r, '.claude/hooks', bad)));
    expect(() => keysOf(repo)).toThrow(ManifestValidationError);
    expect(() => keysOf(repo)).toThrow(/control characters/);
    expect(() => installInto(repo)).toThrow(ManifestValidationError);
  });

  // Ordering: `keep` runs first, so a name that is not a copy candidate never
  // reaches the validator. scaffoldRepo already carries `.claude/commands/
  // README.md` and `pharn-dev-plan.md`; these add the adversarial spellings.
  it('a non-candidate odd name throws nothing and contributes nothing', () => {
    const repo = repoWith((r) => {
      write(join(r, '.claude/commands/pharn-dev-Weird.md'));
      write(join(r, '.claude/commands/READ_ME.md'));
      write(join(r, '.claude/hooks/Some-Hook.test.cjs'));
    });
    const keys = keysOf(repo);
    expect(keys).not.toContain('.claude/commands/pharn-dev-Weird.md');
    expect(keys).not.toContain('.claude/commands/READ_ME.md');
    expect(keys).not.toContain('.claude/hooks/Some-Hook.test.cjs');
    expect(keys).toContain('.claude/commands/pharn-plan.md');
  });

  // The nested case is what actually pins keep-before-validate: the basename is
  // adversarial, but `keep`'s `!rel.includes('/')` rejects it first, so the
  // validator never sees it — matching copyFilteredDir, which only ever reads
  // top-level entries.
  it('a nested adversarial name under the commands dir throws nothing', () => {
    const repo = repoWith((r) =>
      write(join(r, '.claude/commands/sub/pharn-Weird_Name.md')),
    );
    const keys = keysOf(repo);
    expect(keys).not.toContain('.claude/commands/sub/pharn-Weird_Name.md');
    expect(keys).toContain('.claude/commands/pharn-plan.md');
  });

  // Scope proof: the verbatim-copied surfaces are copied by recursive cpSync
  // with NO name check, so validating them here would break the mirror and
  // reject legitimate evals fixtures.
  it('capability, contract and floor names outside COPY_FILENAME_RE are still enumerated', () => {
    const repo = repoWith((r) => {
      write(join(r, 'pharn-pipeline/grillers/a11y/evals/cases/Case_One.TXT'));
      write(join(r, 'pharn-review/n-plus-one/README.notes.md'));
      write(join(r, 'pharn-contracts/Finding_Shape.md'));
      write(join(r, '.dev/floor/check-Ship.mjs'));
    });
    const keys = keysOf(repo);
    for (const rel of [
      'pharn-pipeline/grillers/a11y/evals/cases/Case_One.TXT',
      'pharn-review/n-plus-one/README.notes.md',
      'pharn-contracts/Finding_Shape.md',
      '.dev/floor/check-Ship.mjs',
    ]) {
      expect(keys).toContain(rel);
    }
  });
});
