import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  capabilityCloneFiles,
  collectExpectedInstallPaths,
  absentInstallSurfaces,
  conflictingWriteTargets,
  PHARN_CONFIG_FILE,
} from '../src/lib/install-manifest.js';
import {
  isInstalledHookFile,
  isProductAgentFile,
  isProductCommandFile,
} from '../src/lib/install-surfaces.js';
import {
  installCapabilities,
  installCapabilityDirs,
} from '../src/lib/install-capabilities.js';
import { applyWrites } from '../src/lib/apply-update.js';
import { isInstallRootPath } from '../src/lib/orphans.js';
import { BACKUP_DIR } from '../src/lib/backup.js';
import { RECORDS_FILE } from '../src/lib/install-records.js';
import { UpstreamManifestError } from '../src/lib/upstream-manifest.js';
import type { Selection } from '../src/types.js';
import {
  A11Y,
  manifestTree,
  NEW_SURFACE,
  sealRepo,
  SECURITY,
  SETTINGS,
  upstreamTree,
  withManifest,
  writeTree,
} from './support/harness.js';
import { upstreamSettingsCopyable } from '../src/lib/install-capabilities.js';

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

// A fake fetched clone in the pharn/ layout (marker: pharn/pharn-contracts),
// with the full product + dev surface. NOT sealed: a test changes the tree
// first if it needs to, then seals it (`sealed`), so the pharn-install.json
// declares exactly what is on disk.
function scaffoldRepoPharn(repo: string): void {
  write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'));
  write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/evals/cases/c.md'));
  write(join(repo, 'pharn/pharn-pipeline/grillers/security/security.md'));
  write(join(repo, 'pharn/pharn-review/n-plus-one/n-plus-one.md'));
  write(join(repo, 'pharn/pharn-review/trust-fence/trust-fence.md'));
  write(join(repo, '.claude/commands/pharn-plan.md'));
  write(join(repo, '.claude/commands/pharn-dev-plan.md'));
  write(join(repo, '.claude/commands/README.md'));
  write(join(repo, '.claude/hooks/set-writes-scope.cjs'));
  write(join(repo, '.claude/hooks/set-writes-scope.test.cjs'));
  // An ESM hook: upstream may ship `.mjs` as well as `.cjs` (F-10).
  write(join(repo, '.claude/hooks/require-loop-record.mjs'));
  write(join(repo, '.claude/hooks/require-loop-record.test.mjs'));
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  // The review lens agent (pharn-oss >= 6.64.0), a dev-loop agent the install
  // must leave out, and a non-pharn file (CORE-272).
  write(join(repo, '.claude/agents/pharn-review-lens.md'));
  write(join(repo, '.claude/agents/pharn-dev-reviewer.md'));
  write(join(repo, '.claude/agents/README.md'));
  // All four trusted docs live under pharn/ (pharn-oss SKILLS 7.0.0 on).
  write(join(repo, 'pharn/CONSTITUTION.md'));
  write(join(repo, 'pharn/ARCHITECTURE.md'));
  write(join(repo, 'pharn/THREAT-MODEL.md'));
  write(join(repo, 'pharn/LIMITS.md'));
  write(join(repo, 'pharn/features/README.md'));
  write(join(repo, 'LICENSE'));
  write(join(repo, 'pharn/pharn-contracts/finding-shape.md'));
  write(join(repo, 'pharn/floor/validate.mjs'));
  write(join(repo, 'pharn/floor/validate.test.mjs'));
  // pharn-core: the fixed skill surface (seam-resolver + its evals), copied whole.
  write(join(repo, 'pharn/pharn-core/seam-resolver/seam-resolver.md'));
  write(join(repo, 'pharn/pharn-core/seam-resolver/evals/cases/resolve.md'));
  write(join(repo, 'pharn/pharn-core/seam-resolver/evals/expected/resolve.md'));
  // Genuinely dev-only roots, which an install must NOT copy.
  write(join(repo, '.dev/features/x/PLAN.md'));
  write(join(repo, '.dev/memory-bank/lessons-learned.md'));
}

// The scaffold, changed by `change` and then sealed.
function sealed(repo: string, change?: (repo: string) => void): string {
  scaffoldRepoPharn(repo);
  change?.(repo);
  return sealRepo(repo);
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

describe('collectExpectedInstallPaths (pharn layout)', () => {
  const tmp = useTmpDir();

  it('mirrors every surface UNDER pharn/, all four trusted docs included', () => {
    const repo = sealed(join(tmp.path(), 'repo'));
    const k = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
      }).keys(),
    ];
    expect(k).toContain('pharn/pharn-pipeline/grillers/a11y/a11y.md');
    expect(k).toContain('pharn/pharn-pipeline/grillers/a11y/evals/cases/c.md');
    expect(k).toContain('pharn/pharn-review/n-plus-one/n-plus-one.md');
    expect(k).toContain('pharn/CONSTITUTION.md');
    expect(k).toContain('pharn/ARCHITECTURE.md');
    expect(k).toContain('pharn/THREAT-MODEL.md');
    expect(k).toContain('pharn/LIMITS.md');
    expect(k).toContain('pharn/pharn-contracts/finding-shape.md');
    expect(k).toContain('pharn/floor/validate.mjs');
    // pharn-core is in the expected set, so status compares it and update
    // restores it — the drift coverage the manifest entry buys.
    expect(k).toContain('pharn/pharn-core/seam-resolver/seam-resolver.md');
    expect(k).toContain(
      'pharn/pharn-core/seam-resolver/evals/cases/resolve.md',
    );
    expect(k).toContain('pharn/features/README.md');
    expect(k).not.toContain('features/README.md');
    expect(k).not.toContain('THREAT-MODEL.md');
    expect(k).not.toContain('LIMITS.md');
    // Unselected capabilities, settings (copied only if absent) and the
    // dev-only roots stay out.
    expect(k).not.toContain(
      'pharn/pharn-pipeline/grillers/security/security.md',
    );
    expect(k).not.toContain('pharn/pharn-review/trust-fence/trust-fence.md');
    expect(k).not.toContain('.claude/settings.json');
    expect(k).not.toContain('.dev/features/x/PLAN.md');
    expect(k).not.toContain('.dev/memory-bank/lessons-learned.md');
    expect(k).not.toContain('pharn/floor/validate.test.mjs');
    // .claude/* stays layout-invariant (at root, not under pharn/).
    expect(k).toContain('.claude/commands/pharn-plan.md');
    expect(k).toContain('.claude/agents/pharn-review-lens.md');
    expect(k).not.toContain('pharn/.claude/agents/pharn-review-lens.md');
    expect(k).not.toContain('.claude/commands/pharn-dev-plan.md');
    expect(k).not.toContain('.claude/agents/pharn-dev-reviewer.md');
    expect(k).not.toContain('.claude/agents/README.md');
  });
});

describe('conflictingWriteTargets', () => {
  const tmp = useTmpDir();

  function proj(): string {
    const p = join(tmp.path(), 'proj');
    mkdirSync(p, { recursive: true });
    return p;
  }
  function repo(): string {
    return sealed(join(tmp.path(), 'repo'));
  }

  it('is [] for a fresh project (nothing already installed)', () => {
    expect(
      conflictingWriteTargets({
        repoDir: repo(),
        projectRoot: proj(),
        capabilities: selection().selected,
      }),
    ).toEqual([]);
  });

  it('is [] for a project with ONLY .claude/settings.json (excluded → stays silent)', () => {
    const p = proj();
    write(join(p, '.claude/settings.json'), '{"user":"cfg"}');
    expect(
      conflictingWriteTargets({
        repoDir: repo(),
        projectRoot: p,
        capabilities: selection().selected,
      }),
    ).toEqual([]);
  });

  it('includes pharn.config.json when present', () => {
    const p = proj();
    write(join(p, PHARN_CONFIG_FILE), '{}');
    expect(
      conflictingWriteTargets({
        repoDir: repo(),
        projectRoot: p,
        capabilities: selection().selected,
      }),
    ).toEqual([PHARN_CONFIG_FILE]);
  });

  it('lists existing write targets, sorted (deterministic)', () => {
    const p = proj();
    write(join(p, 'pharn/pharn-review/n-plus-one/n-plus-one.md'));
    write(join(p, 'pharn/CONSTITUTION.md'));
    const got = conflictingWriteTargets({
      repoDir: repo(),
      projectRoot: p,
      capabilities: selection().selected,
    });
    expect(got).toEqual([
      'pharn/CONSTITUTION.md',
      'pharn/pharn-review/n-plus-one/n-plus-one.md',
    ]);
  });
});

// The license is the ONE entry whose dest differs from its source, which is what
// the map's dest→source shape exists for. Assert the MAPPING, not just presence.
describe('collectExpectedInstallPaths — the mapped LICENSE entry', () => {
  const tmp = useTmpDir();

  it('maps pharn/LICENSE back to the clone ROOT LICENSE (pharn)', () => {
    const repo = sealed(join(tmp.path(), 'pharn-repo'));
    const map = collectExpectedInstallPaths({
      repoDir: repo,
      capabilities: selection().selected,
    });
    expect(map.get('pharn/LICENSE')).toBe(join(repo, 'LICENSE'));
    expect(map.has('LICENSE')).toBe(false);
    expect(map.has('PHARN-LICENSE')).toBe(false);
  });
});

// Mirror-consistency: installCapabilities writes collectExpectedInstallPaths, so
// a REAL install's written set must equal the manifest exactly. The manifest
// intentionally excludes the user-owned .claude/settings.json, which install DOES
// write, so the real-write set equals the manifest keys PLUS that one file.
describe('collectExpectedInstallPaths ⟷ installCapabilities (mirror)', () => {
  const tmp = useTmpDir();

  it('pharn layout: manifest keys ∪ settings.json == files actually written', () => {
    const repo = sealed(join(tmp.path(), 'repo'));
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    installCapabilities(repo, proj, selection());
    const written = new Set(walkRel(proj));
    const expected = new Set(
      collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
      }).keys(),
    );
    expected.add('.claude/settings.json'); // install writes it; manifest excludes it
    expect([...written].sort()).toEqual([...expected].sort());
  });
});

// The manifest now drives a SECOND writer: `pharn update` applies it file by
// file. The mirror must therefore be pinned against that writer too, or the two
// write paths can silently diverge (the exact drift this block exists to stop).
describe('collectExpectedInstallPaths ⟷ the update writer (mirror)', () => {
  const tmp = useTmpDir();

  function assertUpdateMirror(): Map<string, string> {
    const repo = sealed(join(tmp.path(), 'repo'));
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });

    const expected = collectExpectedInstallPaths({
      repoDir: repo,
      capabilities: selection().selected,
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
    assertUpdateMirror();
  });

  // pharn-core is a surface the update writer must restore too, so pin it.
  it('pharn layout: applying every manifest entry writes exactly the keys', () => {
    const expected = assertUpdateMirror();
    expect([...expected.keys()]).toContain(
      'pharn/pharn-core/seam-resolver/seam-resolver.md',
    );
  });
});

// The CLI's own metadata is not part of the install: it is never copied from the
// clone and must never be reported as drift or as an overwrite conflict.
describe('CLI-owned metadata is outside the install set', () => {
  const tmp = useTmpDir();

  it('pharn.records.json and pharn/.backup/ are in neither the manifest nor the conflict set', () => {
    const repo = sealed(join(tmp.path(), 'repo'));
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    write(join(proj, RECORDS_FILE), '{}');
    write(
      join(proj, `${BACKUP_DIR}/20260807-091500/pharn/CONSTITUTION.md`),
      'old',
    );

    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
      }).keys(),
    ];
    expect(keys).not.toContain(RECORDS_FILE);
    expect(keys.some((k) => k.startsWith(`${BACKUP_DIR}/`))).toBe(false);

    const conflicts = conflictingWriteTargets({
      repoDir: repo,
      projectRoot: proj,
      capabilities: selection().selected,
    });
    expect(conflicts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// capabilityCloneFiles — ONE capability's files as the clone's manifest
// declares them, which is what `pharn add` derives BOTH its drift set and its
// record keys from. The contract that matters: it reports what the copy WOULD
// write and nothing else, and for a capability the manifest does not declare
// it reports NOTHING rather than throwing — the curated refusal belongs to
// installCapabilityDirs' pre-flight, which runs after it and must be the
// message the user sees.
// ---------------------------------------------------------------------------
describe('capabilityCloneFiles', () => {
  const tmp = useTmpDir();

  // A minimal sealed pharn-layout clone holding `files`.
  function clone(...files: string[]): string {
    const repo = join(tmp.path(), 'repo');
    write(join(repo, 'pharn/pharn-contracts/finding-shape.md'));
    for (const f of files) write(join(repo, f));
    return sealRepo(repo);
  }

  it('enumerates the capability dir (incl. evals), sorted, prefixed with its subtree', () => {
    const repo = clone(
      'pharn/pharn-review/n-plus-one/n-plus-one.md',
      'pharn/pharn-review/n-plus-one/evals/cases/c.md',
      'pharn/pharn-review/other/other.md',
    );

    expect(
      capabilityCloneFiles(repo, { name: 'n-plus-one', role: 'lens' }),
    ).toEqual([
      'pharn/pharn-review/n-plus-one/evals/cases/c.md',
      'pharn/pharn-review/n-plus-one/n-plus-one.md',
    ]);
  });

  it('routes a griller to the grillers subtree', () => {
    const repo = clone('pharn/pharn-pipeline/grillers/a11y/a11y.md');

    expect(
      capabilityCloneFiles(repo, { name: 'a11y', role: 'griller' }),
    ).toEqual(['pharn/pharn-pipeline/grillers/a11y/a11y.md']);
  });

  it('is [] when the capability dir is absent — the pre-flight owns that refusal', () => {
    // A throw from here would pre-empt installCapabilityDirs' curated
    // `Capability "ghost" (lens) is missing at …` message, which is the one the
    // user can act on.
    expect(
      capabilityCloneFiles(clone(), { name: 'ghost', role: 'lens' }),
    ).toEqual([]);
  });

  // The MIRROR pin, the same one collectExpectedInstallPaths carries against a
  // real installCapabilities run. capabilityCloneFiles drives a DESTRUCTIVE
  // decision (which files `add` backs up) and a DURABLE one (which it records),
  // so its agreement with what the copy actually writes is tested against the
  // real disk, not argued from the code.
  it('MIRROR: equals exactly what a real installCapabilityDirs copy writes', () => {
    const repo = clone(
      'pharn/pharn-review/a11y/a11y.md',
      'pharn/pharn-review/a11y/evals/cases/basic.md',
      'pharn/pharn-review/a11y/evals/expected/basic.json',
    );
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    const cap = { name: 'a11y', role: 'lens' } as const;

    installCapabilityDirs(repo, proj, [cap]);

    // Both sides sorted: walkRel yields readdir order, so an unsorted compare
    // would pass or fail on directory-entry ordering rather than on membership.
    expect(capabilityCloneFiles(repo, cap)).toEqual(
      walkRel(join(proj, 'pharn/pharn-review/a11y'))
        .map((rel) => `pharn/pharn-review/a11y/${rel}`)
        .sort(),
    );
  });

  it('is [] when the capability path is a file rather than a directory', () => {
    const repo = clone('pharn/pharn-review/x');

    expect(capabilityCloneFiles(repo, { name: 'x', role: 'lens' })).toEqual([]);
  });
});

// `pharn uninstall` (and orphan detection) has no clone, so it bounds what it
// may touch with isInstallRootPath, a pure predicate over the SHAPE of an
// install path. Pinned here against a REAL install: every path the install
// writes must pass, or uninstall would silently leave it.
describe('isInstallRootPath ⟷ installCapabilities (mirror)', () => {
  const tmp = useTmpDir();

  it('accepts every path a real pharn-layout install writes', () => {
    const repo = sealed(join(tmp.path(), 'repo'));
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    installCapabilities(repo, proj, selection());
    const paths = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
      }).keys(),
    ];
    expect(paths).toContain('pharn/pharn-core/seam-resolver/seam-resolver.md');
    expect(paths).toContain('pharn/LICENSE');
    expect(paths.filter((p) => !isInstallRootPath(p))).toEqual([]);
  });

  it("never accepts the user's own feature work beside the features README", () => {
    expect(isInstallRootPath('pharn/features/my-feature/PLAN.md')).toBe(false);
    expect(isInstallRootPath('features/my-feature/PLAN.md')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Surface accounting (F-10): every DECLARED fixed surface either contributes at
// least one file to the manifest's install set or is named as absent upstream
// — never a silent no-op.
// ---------------------------------------------------------------------------
describe('absentInstallSurfaces', () => {
  const tmp = useTmpDir();

  it('is [] for a complete clone, in both layouts', () => {
    expect(
      absentInstallSurfaces({ repoDir: sealed(join(tmp.path(), 'repo')) }),
    ).toEqual([]);
  });

  const pharnCases: [string, string, { surface: string; path: string }][] = [
    [
      '.claude/commands',
      'dir',
      { surface: 'commands', path: '.claude/commands' },
    ],
    ['.claude/hooks', 'dir', { surface: 'hooks', path: '.claude/hooks' }],
    [
      'pharn/CONSTITUTION.md',
      'file',
      { surface: 'trusted-doc', path: 'pharn/CONSTITUTION.md' },
    ],
    [
      'pharn/LIMITS.md',
      'file',
      { surface: 'trusted-doc', path: 'pharn/LIMITS.md' },
    ],
    ['LICENSE', 'file', { surface: 'license', path: 'LICENSE' }],
    [
      'pharn/features/README.md',
      'file',
      { surface: 'features-readme', path: 'pharn/features/README.md' },
    ],
    [
      'pharn/pharn-contracts',
      'dir',
      { surface: 'contracts', path: 'pharn/pharn-contracts' },
    ],
    ['pharn/pharn-core', 'dir', { surface: 'core', path: 'pharn/pharn-core' }],
    ['pharn/floor', 'dir', { surface: 'floor', path: 'pharn/floor' }],
  ];
  for (const [rel, kind, row] of pharnCases) {
    it(`pharn layout: names exactly ${row.surface} at ${row.path} when the clone lacks ${rel} (${kind})`, () => {
      const repo = sealed(join(tmp.path(), 'repo'), (r) => {
        rmSync(join(r, rel), { recursive: true, force: true });
        // The layout MARKER: keep the dir (the manifest's layout check needs
        // it), but ship no file in it — zero files declared is absent.
        if (rel === 'pharn/pharn-contracts')
          mkdirSync(join(r, rel), { recursive: true });
      });
      expect(absentInstallSurfaces({ repoDir: repo })).toEqual([row]);
    });
  }

  it('a dir that ships no file passing its filter is absent (zero files contributed)', () => {
    const repo = sealed(join(tmp.path(), 'repo'), (r) => {
      // Commands renamed out of the product prefix; hooks shipped only as tests
      // or under an extension pharn-oss does not declare.
      rmSync(join(r, '.claude/commands/pharn-plan.md'));
      write(join(r, '.claude/commands/plan.md'));
      for (const f of ['set-writes-scope.cjs', 'require-loop-record.mjs'])
        rmSync(join(r, '.claude/hooks', f));
      write(join(r, '.claude/hooks/guard.js'));
    });
    expect(
      absentInstallSurfaces({ repoDir: repo }).map((s) => s.surface),
    ).toEqual(['commands', 'hooks']);
  });

  it('a clone without .claude/agents/ is NOT reported: the surface is optional (CORE-272)', () => {
    // pharn-oss before 6.64.0 ships no agent; naming it would turn `status
    // --strict` red for every older clone.
    const repo = sealed(join(tmp.path(), 'repo'), (r) =>
      rmSync(join(r, '.claude/agents'), { recursive: true, force: true }),
    );
    expect(absentInstallSurfaces({ repoDir: repo })).toEqual([]);
    expect(
      [
        ...collectExpectedInstallPaths({
          repoDir: repo,
          capabilities: [],
        }).keys(),
      ].some((k) => k.startsWith('.claude/agents/')),
    ).toBe(false);
  });
});

describe('hook and command name predicates (shared by the copy and the manifest)', () => {
  const tmp = useTmpDir();

  it('takes .cjs and .mjs hooks, never their tests or other extensions', () => {
    expect(isInstalledHookFile('guard.cjs')).toBe(true);
    expect(isInstalledHookFile('guard.mjs')).toBe(true);
    expect(isInstalledHookFile('guard.test.cjs')).toBe(false);
    expect(isInstalledHookFile('guard.test.mjs')).toBe(false);
    expect(isInstalledHookFile('guard.js')).toBe(false);
    expect(isInstalledHookFile('nested/guard.cjs')).toBe(false);
  });

  it('takes top-level non-dev pharn-*.md agents only — the command rule', () => {
    expect(isProductAgentFile('pharn-review-lens.md')).toBe(true);
    expect(isProductAgentFile('pharn-dev-reviewer.md')).toBe(false);
    expect(isProductAgentFile('reviewer.md')).toBe(false);
    expect(isProductAgentFile('sub/pharn-review-lens.md')).toBe(false);
  });

  it('takes top-level non-dev pharn-*.md commands only', () => {
    expect(isProductCommandFile('pharn-plan.md')).toBe(true);
    expect(isProductCommandFile('pharn-dev-plan.md')).toBe(false);
    expect(isProductCommandFile('plan.md')).toBe(false);
    expect(isProductCommandFile('pharn-plan.txt')).toBe(false);
    expect(isProductCommandFile('sub/pharn-plan.md')).toBe(false);
  });

  it('an .mjs hook is in the manifest; its .test.mjs is not (the copy side: the mirror tests)', () => {
    const repo = sealed(join(tmp.path(), 'repo'));
    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: [],
      }).keys(),
    ];
    expect(keys).toContain('.claude/hooks/require-loop-record.mjs');
    expect(keys).not.toContain('.claude/hooks/require-loop-record.test.mjs');
  });
});

// CORE-194: a tree's pharn-install.json is the install set. Some fixtures make
// the manifest DISAGREE with the files on disk, so a pass proves the manifest
// was the source.
describe('with pharn-install.json — the manifest is the install set', () => {
  const tmp = useTmpDir();
  const repo = (tree: Record<string, string>): string =>
    writeTree(join(tmp.path(), 'repo'), tree);
  const SEC = { name: 'security', role: 'griller' as const };
  const A11 = { name: 'a11y', role: 'griller' as const };

  it("is the manifest's managed fixed files plus the selected capabilities", () => {
    const dir = repo(manifestTree('7.20.0'));
    const expected = collectExpectedInstallPaths({
      repoDir: dir,
      capabilities: [SEC],
    });
    expect([...expected.keys()].sort()).toEqual(
      [
        '.claude/agents/pharn-review-lens.md',
        '.claude/commands/pharn-plan.md',
        '.claude/hooks/guard.cjs',
        NEW_SURFACE,
        'pharn/ARCHITECTURE.md',
        'pharn/CONSTITUTION.md',
        'pharn/LICENSE',
        'pharn/LIMITS.md',
        'pharn/THREAT-MODEL.md',
        'pharn/features/README.md',
        'pharn/floor/validate.mjs',
        'pharn/pharn-contracts/finding-shape.md',
        'pharn/pharn-core/seam-resolver/SKILL.md',
        SECURITY,
      ].sort(),
    );
    expect(expected.get('pharn/LICENSE')).toBe(join(dir, 'LICENSE'));
    expect(expected.has(SETTINGS)).toBe(false);
    expect(expected.has(A11Y)).toBe(false);
  });

  it('installs a file the derivation never would, and leaves out one it would', () => {
    const tree = {
      ...upstreamTree('7.20.0'),
      'pharn/floor/fixtures/kept.mjs': 'declared\n',
      'pharn/floor/extra.mjs': 'undeclared\n',
    };
    const dir = repo(
      withManifest(tree, (m) => {
        m.files = m.files.filter((f) => f.path !== 'pharn/floor/extra.mjs');
      }),
    );
    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: dir,
        capabilities: [],
      }).keys(),
    ];
    expect(keys).toContain('pharn/floor/fixtures/kept.mjs');
    expect(keys).not.toContain('pharn/floor/extra.mjs');
  });

  it('accounts absent surfaces from the manifest: none for a full one, named for an empty one', () => {
    expect(
      absentInstallSurfaces({ repoDir: repo(manifestTree('7.20.0')) }),
    ).toEqual([]);
    rmSync(join(tmp.path(), 'repo'), { recursive: true, force: true });
    const sparse = repo(
      manifestTree('7.20.0', (m) => {
        m.files = m.files.filter(
          (f) =>
            !f.dest.startsWith('.claude/hooks/') &&
            f.dest !== 'pharn/LIMITS.md' &&
            f.dest !== 'pharn/LICENSE' &&
            f.dest !== 'pharn/features/README.md',
        );
      }),
    );
    expect(absentInstallSurfaces({ repoDir: sparse })).toEqual([
      { surface: 'hooks', path: '.claude/hooks' },
      { surface: 'trusted-doc', path: 'pharn/LIMITS.md' },
      { surface: 'license', path: 'LICENSE' },
      { surface: 'features-readme', path: 'pharn/features/README.md' },
    ]);
  });

  it("lists one capability's declared files for add, sorted", () => {
    const dir = repo(
      withManifest({
        ...upstreamTree('7.20.0'),
        'pharn/pharn-pipeline/grillers/a11y/evals/case.md': 'case\n',
      }),
    );
    expect(capabilityCloneFiles(dir, A11)).toEqual([
      A11Y,
      'pharn/pharn-pipeline/grillers/a11y/evals/case.md',
    ]);
  });

  it('copies settings only when the manifest declares it', () => {
    expect(upstreamSettingsCopyable(repo(manifestTree('7.20.0')))).toBe(true);
    rmSync(join(tmp.path(), 'repo'), { recursive: true, force: true });
    const without = repo(
      manifestTree('7.20.0', (m) => {
        m.files = m.files.filter((f) => f.dest !== SETTINGS);
      }),
    );
    // The tree still ships the file; the manifest decides.
    expect(existsSync(join(without, SETTINGS))).toBe(true);
    expect(upstreamSettingsCopyable(without)).toBe(false);
  });

  it("writes the manifest's set through a real install, new surface included", () => {
    const dir = repo(manifestTree('7.20.0'));
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj);
    const result = installCapabilities(dir, proj, {
      selected: [{ ...SEC, matched: 'universal' }],
    } as unknown as Selection);
    expect(result.settingsWritten).toBe(true);
    expect(existsSync(join(proj, NEW_SURFACE))).toBe(true);
    expect(existsSync(join(proj, 'pharn/LICENSE'))).toBe(true);
    expect(existsSync(join(proj, 'LICENSE'))).toBe(false);
  });
});

// C8.3: there is no derivation left. A tree without pharn-install.json (a
// pharn-oss older than 7.21.0) gets no install set, no capability file list
// and no conflict set: each refuses, naming the missing manifest.
describe('without pharn-install.json — every install-set reader refuses', () => {
  const tmp = useTmpDir();
  const bare = (): string => {
    const repo = join(tmp.path(), 'repo');
    scaffoldRepoPharn(repo);
    return repo;
  };
  const MISSING = /ships no pharn-install\.json/;

  it('collectExpectedInstallPaths refuses a tree without the manifest', () => {
    const repo = bare();
    expect(() =>
      collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
      }),
    ).toThrow(UpstreamManifestError);
    expect(() =>
      collectExpectedInstallPaths({ repoDir: repo, capabilities: [] }),
    ).toThrow(MISSING);
  });

  it('absentInstallSurfaces and conflictingWriteTargets refuse it too', () => {
    const repo = bare();
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    expect(() => absentInstallSurfaces({ repoDir: repo })).toThrow(MISSING);
    expect(() =>
      conflictingWriteTargets({
        repoDir: repo,
        projectRoot: proj,
        capabilities: selection().selected,
      }),
    ).toThrow(MISSING);
  });

  it('capabilityCloneFiles refuses it rather than walking the directory', () => {
    expect(() =>
      capabilityCloneFiles(bare(), { name: 'a11y', role: 'griller' }),
    ).toThrow(UpstreamManifestError);
  });

  it('upstreamSettingsCopyable refuses it although the tree ships a settings file', () => {
    const repo = bare();
    expect(existsSync(join(repo, '.claude/settings.json'))).toBe(true);
    expect(() => upstreamSettingsCopyable(repo)).toThrow(MISSING);
  });

  it('installCapabilities refuses it and writes nothing', () => {
    const repo = bare();
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    expect(() => installCapabilities(repo, proj, selection())).toThrow(
      UpstreamManifestError,
    );
    expect(readdirSync(proj)).toEqual([]);
  });
});
