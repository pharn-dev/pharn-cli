import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  installCapabilities,
  installCapabilityDirs,
} from '../src/lib/install-capabilities.js';
import { collectExpectedInstallPaths } from '../src/lib/install-manifest.js';
import { ManifestValidationError } from '../src/lib/validate.js';
import type { InstalledCapability, Selection } from '../src/types.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// True if ANYTHING exists at `path` (file, dir, OR symlink). Uses lstatSync so a
// copied symlink is detected even when its target is absent (existsSync follows
// the link and would report a dangling symlink as missing).
function isPresent(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

// A fake fetched pharn-oss clone with the full product + dev surface, so the
// copy's dev-only exclusions can be asserted.
function scaffoldRepo(repo: string): void {
  // capabilities (grillers + lenses)
  write(join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'), 'a11y');
  write(join(repo, 'pharn-pipeline/grillers/a11y/evals/cases/c.md'), 'case');
  write(join(repo, 'pharn-pipeline/grillers/security/security.md'), 'sec');
  write(join(repo, 'pharn-review/n-plus-one/n-plus-one.md'), 'npo');
  write(join(repo, 'pharn-review/trust-fence/trust-fence.md'), 'tf');
  // product + dev commands
  write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
  write(join(repo, '.claude/commands/pharn-ship.md'), 'ship');
  write(join(repo, '.claude/commands/pharn-dev-plan.md'), 'DEV');
  write(join(repo, '.claude/commands/README.md'), 'readme');
  // hooks (+ their tests, which are dev-only)
  write(join(repo, '.claude/hooks/set-writes-scope.cjs'), 'hook');
  write(join(repo, '.claude/hooks/set-writes-scope.test.cjs'), 'HOOKTEST');
  // settings
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  // trusted docs
  write(join(repo, 'CONSTITUTION.md'), 'C');
  write(join(repo, 'ARCHITECTURE.md'), 'A');
  write(join(repo, 'THREAT-MODEL.md'), 'T');
  write(join(repo, 'LIMITS.md'), 'L');
  write(join(repo, 'features/README.md'), 'FEATURES');
  write(join(repo, 'LICENSE'), 'APACHE-2.0 UPSTREAM');
  // contracts
  write(join(repo, 'pharn-contracts/finding-shape.md'), 'fs');
  // floor (+ tests, dev-only) + dev-only trees
  write(join(repo, '.dev/floor/validate.mjs'), 'floor');
  write(join(repo, '.dev/floor/validate.test.mjs'), 'FLOORTEST');
  // Dev test apparatus: fixture skills + structural pairs, read only by the
  // *.test.mjs above. Must not reach a user project.
  write(
    join(repo, '.dev/floor/test-fixtures/red/skill.md'),
    'DELIBERATELY RED',
  );
  write(
    join(repo, '.dev/floor/test-fixtures/structural/red-1.expected.json'),
    '{}',
  );
  // A near-miss: SEGMENT match, not substring — this one must survive.
  write(join(repo, '.dev/floor/my-test-fixtures.mjs'), 'KEEP ME');
  write(join(repo, '.dev/features/some-feature/PLAN.md'), 'DEVPLAN');
  write(join(repo, '.dev/memory-bank/lessons-learned.md'), 'DEVMB');
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

describe('installCapabilities', () => {
  const tmp = useTmpDir();

  function run(): {
    repo: string;
    proj: string;
    result: ReturnType<typeof installCapabilities>;
  } {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    const result = installCapabilities(repo, proj, selection());
    return { repo, proj, result };
  }

  it('copies the SELECTED capabilities (whole dir, incl. evals) and no others', () => {
    const { proj } = run();
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'))).toBe(
      true,
    );
    expect(
      existsSync(join(proj, 'pharn-pipeline/grillers/a11y/evals/cases/c.md')),
    ).toBe(true);
    expect(
      existsSync(join(proj, 'pharn-review/n-plus-one/n-plus-one.md')),
    ).toBe(true);
    // security griller was skipped → never copied.
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/security'))).toBe(
      false,
    );
    // trust-fence lens was not in the selection → never copied.
    expect(existsSync(join(proj, 'pharn-review/trust-fence'))).toBe(false);
  });

  it('returns the copied capability list (name + role) and records layout: flat', () => {
    const { result } = run();
    expect(result.capabilities).toEqual([
      { name: 'a11y', role: 'griller' },
      { name: 'n-plus-one', role: 'lens' },
    ]);
    // A flat clone (no pharn/pharn-contracts marker) → the legacy layout (P7).
    expect(result.layout).toBe('flat');
  });

  it('copies product pharn-*.md commands but EXCLUDES pharn-dev-*.md and non-pharn files', () => {
    const { proj } = run();
    expect(existsSync(join(proj, '.claude/commands/pharn-plan.md'))).toBe(true);
    expect(existsSync(join(proj, '.claude/commands/pharn-ship.md'))).toBe(true);
    expect(existsSync(join(proj, '.claude/commands/pharn-dev-plan.md'))).toBe(
      false,
    );
    expect(existsSync(join(proj, '.claude/commands/README.md'))).toBe(false);
  });

  it('copies .cjs hooks but EXCLUDES *.test.cjs', () => {
    const { proj } = run();
    expect(existsSync(join(proj, '.claude/hooks/set-writes-scope.cjs'))).toBe(
      true,
    );
    expect(
      existsSync(join(proj, '.claude/hooks/set-writes-scope.test.cjs')),
    ).toBe(false);
  });

  it('copies the trusted docs and pharn-contracts', () => {
    const { proj } = run();
    for (const doc of [
      'CONSTITUTION.md',
      'ARCHITECTURE.md',
      'THREAT-MODEL.md',
      'LIMITS.md',
    ]) {
      expect(existsSync(join(proj, doc))).toBe(true);
    }
    expect(existsSync(join(proj, 'pharn-contracts/finding-shape.md'))).toBe(
      true,
    );
  });

  // The flat `core` path is resolved for interface uniformity only: no flat clone
  // upstream ships a root pharn-core/ (the dir postdates the pharn/ relocation),
  // so the copy site sees existsSync false and no-ops. Nothing is written, and
  // nothing throws — a flat install is byte-for-byte what it was before (P7).
  it('writes NO pharn-core for a flat clone that has none (tolerant no-op)', () => {
    const { proj } = run();
    expect(existsSync(join(proj, 'pharn-core'))).toBe(false);
    expect(existsSync(join(proj, 'pharn/pharn-core'))).toBe(false);
  });

  it('copies .dev/floor checkers but EXCLUDES *.test.mjs, .dev/features and .dev/memory-bank', () => {
    const { proj } = run();
    expect(existsSync(join(proj, '.dev/floor/validate.mjs'))).toBe(true);
    expect(existsSync(join(proj, '.dev/floor/validate.test.mjs'))).toBe(false);
    expect(existsSync(join(proj, '.dev/features'))).toBe(false);
    expect(existsSync(join(proj, '.dev/memory-bank'))).toBe(false);
  });

  it('copies settings.json into a fresh project (settingsPreserved false)', () => {
    const { proj, result } = run();
    expect(existsSync(join(proj, '.claude/settings.json'))).toBe(true);
    expect(result.settingsPreserved).toBe(false);
  });

  it('PRESERVES an existing .claude/settings.json — never overwrites it (grill F1)', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    write(join(proj, '.claude/settings.json'), '{"USER":"config"}');
    const result = installCapabilities(repo, proj, selection());
    expect(result.settingsPreserved).toBe(true);
    expect(existsSync(join(proj, '.claude/settings.json'))).toBe(true);
    // The user's content is intact.
    expect(readFileSync(join(proj, '.claude/settings.json'), 'utf8')).toContain(
      'USER',
    );
  });

  it('rejects a selected capability whose name escapes the base (P2 safeJoin)', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    const evil: Selection = {
      selected: [{ name: '../escape', role: 'griller', matched: ['ssr'] }],
      skipped: [],
    };
    expect(() => installCapabilities(repo, proj, evil)).toThrow(
      ManifestValidationError,
    );
  });

  it('fails pre-flight (nothing written) when a selected source is missing', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    const missing: Selection = {
      selected: [{ name: 'ghost', role: 'lens', matched: ['ssr'] }],
      skipped: [],
    };
    expect(() => installCapabilities(repo, proj, missing)).toThrow(
      /ghost.*missing/,
    );
    // Pre-flight ran before any copy: no product commands leaked in.
    expect(existsSync(join(proj, '.claude/commands/pharn-plan.md'))).toBe(
      false,
    );
  });

  // --- symlink rejection (P2): the fetched repo is untrusted; a recursive cpSync
  // copies symlinks verbatim by default, so a malicious clone could plant one
  // into the user's tree. Sources below point at REAL files so existsSync passes
  // and the isSymlink/filter guards (not the missing-source path) are exercised.

  it('does NOT copy a symlink planted inside a selected capability dir', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    symlinkSync(
      join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'),
      join(repo, 'pharn-pipeline/grillers/a11y/evil-link'),
    );
    installCapabilities(repo, proj, selection());
    // real files copied; the nested symlink was skipped by the cpSync filter.
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'))).toBe(
      true,
    );
    expect(
      isPresent(join(proj, 'pharn-pipeline/grillers/a11y/evil-link')),
    ).toBe(false);
  });

  it('rejects (pre-flight, nothing written) a selected capability whose source dir is a symlink', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    rmSync(join(repo, 'pharn-pipeline/grillers/a11y'), {
      recursive: true,
      force: true,
    });
    // swap the griller dir for a symlink onto another real capability dir.
    symlinkSync(
      join(repo, 'pharn-review/n-plus-one'),
      join(repo, 'pharn-pipeline/grillers/a11y'),
    );
    expect(() => installCapabilities(repo, proj, selection())).toThrow(
      ManifestValidationError,
    );
    // pre-flight threw before any copy: no product surfaces leaked in.
    expect(existsSync(join(proj, '.claude/commands/pharn-plan.md'))).toBe(
      false,
    );
  });

  it('installs features/README.md at the project root (flat layout)', () => {
    const { proj } = run();
    expect(readFileSync(join(proj, 'features/README.md'), 'utf8')).toBe(
      'FEATURES',
    );
  });

  it('installs cleanly from a clone WITHOUT features/README.md, and expects it not at all', () => {
    const repo = join(tmp.path(), 'no-features-repo');
    const proj = join(tmp.path(), 'no-features-proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    rmSync(join(repo, 'features/README.md'));

    expect(() => installCapabilities(repo, proj, selection())).not.toThrow();
    expect(existsSync(join(proj, 'features/README.md'))).toBe(false);
    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'flat',
      }).keys(),
    ];
    expect(keys).not.toContain('features/README.md');
  });

  it('does NOT copy a symlinked features/README.md', () => {
    const repo = join(tmp.path(), 'link-feat-repo');
    const proj = join(tmp.path(), 'link-feat-proj');
    const outside = join(tmp.path(), 'outside-readme.md');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    write(outside, 'NOT FROM THE CLONE');
    rmSync(join(repo, 'features/README.md'));
    symlinkSync(outside, join(repo, 'features/README.md'));

    installCapabilities(repo, proj, selection());

    expect(existsSync(join(proj, 'features/README.md'))).toBe(false);
  });

  // The asymmetry this closes, MEASURED not assumed: with a symlinked `features/`
  // PARENT, `existsSync(features/README.md)` is true and
  // `lstat(leaf).isSymbolicLink()` is FALSE, so a leaf-only guard lets cpSync
  // copy the pointed-to bytes — from outside the clone — into the user's project.
  // safeJoin cannot catch it: it is lexical and never resolves a link. This is
  // the first root-relative file the install copies that HAS an intermediate
  // directory, which is what makes the hole newly reachable.
  it('does NOT copy through a symlinked features/ PARENT directory', () => {
    const repo = join(tmp.path(), 'link-parent-repo');
    const proj = join(tmp.path(), 'link-parent-proj');
    const outside = join(tmp.path(), 'outside-dir');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    write(join(outside, 'README.md'), 'NOT FROM THE CLONE');
    rmSync(join(repo, 'features'), { recursive: true, force: true });
    symlinkSync(outside, join(repo, 'features'));

    installCapabilities(repo, proj, selection());

    expect(existsSync(join(proj, 'features/README.md'))).toBe(false);
    // …and the manifest agrees, so update never writes it either.
    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'flat',
      }).keys(),
    ];
    expect(keys).not.toContain('features/README.md');
  });

  // The mirror image of the source case, and equally measured: a PROJECT whose
  // own features/ is a symlink to an external directory takes the copy straight
  // through it, writing outside the project root — and the pre-install overwrite
  // check never warns, because existsSync on the absent leaf inside that link is
  // false. safeJoin is lexical and cannot see it.
  it('does NOT write through a symlinked features/ in the PROJECT (no escape)', () => {
    const repo = join(tmp.path(), 'destlink-repo');
    const proj = join(tmp.path(), 'destlink-proj');
    const outside = join(tmp.path(), 'outside-dest');
    mkdirSync(outside, { recursive: true });
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    symlinkSync(outside, join(proj, 'features'));

    installCapabilities(repo, proj, selection());

    expect(existsSync(join(outside, 'README.md'))).toBe(false);
  });

  // ORDER: the file is OPTIONAL, so a clone without it must never reach the
  // destination walk. That walk raises ENOTDIR on a component below a regular
  // file, which would turn "upstream does not ship this yet" into an init that
  // cannot complete on a project that merely has a file named `features`.
  it('does not fail init when the clone lacks the file and the project has a FILE named features', () => {
    const repo = join(tmp.path(), 'nofeat-repo');
    const proj = join(tmp.path(), 'nofeat-proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    rmSync(join(repo, 'features/README.md'));
    write(join(proj, 'features'), 'a regular file, not a directory');

    expect(() => installCapabilities(repo, proj, selection())).not.toThrow();
    // The user's file is left exactly as it was.
    expect(readFileSync(join(proj, 'features'), 'utf8')).toBe(
      'a regular file, not a directory',
    );
    // The rest of the install still happened.
    expect(existsSync(join(proj, 'CONSTITUTION.md'))).toBe(true);
  });

  // Same shape with the source PRESENT: cpSync would throw ENOTDIR on that tree
  // anyway, so one optional surface is skipped rather than failing the install.
  it('skips the copy (does not throw) when the project has a FILE named features', () => {
    const repo = join(tmp.path(), 'filefeat-repo');
    const proj = join(tmp.path(), 'filefeat-proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    write(join(proj, 'features'), 'a regular file');

    expect(() => installCapabilities(repo, proj, selection())).not.toThrow();
    expect(readFileSync(join(proj, 'features'), 'utf8')).toBe('a regular file');
    expect(existsSync(join(proj, 'CONSTITUTION.md'))).toBe(true);
  });

  // The floor ships the deterministic checkers the installed product commands
  // invoke — but NOT its test apparatus, whose only readers are the *.test.mjs
  // files already excluded. A user browsing an installed floor should not find a
  // deliberately-malformed capability and a pile of red failure fixtures.
  it('does NOT install the floor test-fixtures subtree', () => {
    const { proj } = run();
    expect(existsSync(join(proj, '.dev/floor/validate.mjs'))).toBe(true);
    expect(existsSync(join(proj, '.dev/floor/test-fixtures'))).toBe(false);
    expect(
      existsSync(join(proj, '.dev/floor/test-fixtures/red/skill.md')),
    ).toBe(false);
  });

  // SEGMENT, not substring. The scaffold's `my-test-fixtures.mjs` sits beside
  // the fixtures dir and must survive.
  it('still installs a floor file whose NAME merely contains test-fixtures', () => {
    const { proj } = run();
    expect(
      readFileSync(join(proj, '.dev/floor/my-test-fixtures.mjs'), 'utf8'),
    ).toBe('KEEP ME');
  });

  // THE ANCHOR CASE. cpSync hands the filter an ABSOLUTE path and calls it for
  // the source ROOT too, so an unanchored segment test would match an ANCESTOR
  // directory named `test-fixtures`, return false for the root, and copy NOTHING
  // — silently shipping no floor at all. The failure is invisible without this.
  it('installs the whole floor even when an ANCESTOR dir is named test-fixtures', () => {
    const repo = join(tmp.path(), 'test-fixtures', 'repo');
    const proj = join(tmp.path(), 'test-fixtures', 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);

    installCapabilities(repo, proj, selection());

    expect(existsSync(join(proj, '.dev/floor/validate.mjs'))).toBe(true);
    expect(
      readFileSync(join(proj, '.dev/floor/my-test-fixtures.mjs'), 'utf8'),
    ).toBe('KEEP ME');
    // …and the real subtree is still excluded under that ancestor.
    expect(existsSync(join(proj, '.dev/floor/test-fixtures'))).toBe(false);
  });

  // Apache-2.0 §4(a): a redistributor must give recipients a copy of the license,
  // and a published pharn-initialized repo redistributes ~450 Apache-2.0 files.
  it('installs upstream LICENSE as PHARN-LICENSE (flat)', () => {
    const { proj } = run();
    expect(readFileSync(join(proj, 'PHARN-LICENSE'), 'utf8')).toBe(
      'APACHE-2.0 UPSTREAM',
    );
  });

  // THE DATA-LOSS REGRESSION. An identity-mapped `LICENSE` entry would cpSync
  // upstream's text over the user's own root LICENSE with `{ force: true }` and
  // no prompt. The two files carry DIFFERENT bytes on purpose — with identical
  // content this assertion would pass no matter which file won.
  it("never touches the project's own root LICENSE", () => {
    const repo = join(tmp.path(), 'lic-repo');
    const proj = join(tmp.path(), 'lic-proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    write(join(proj, 'LICENSE'), 'THE USER OWN LICENSE — DO NOT TOUCH');

    installCapabilities(repo, proj, selection());

    expect(readFileSync(join(proj, 'LICENSE'), 'utf8')).toBe(
      'THE USER OWN LICENSE — DO NOT TOUCH',
    );
    // …and upstream's landed beside it, under pharn's own name.
    expect(readFileSync(join(proj, 'PHARN-LICENSE'), 'utf8')).toBe(
      'APACHE-2.0 UPSTREAM',
    );
  });

  it('does NOT copy a symlinked upstream LICENSE, and does not expect it', () => {
    const repo = join(tmp.path(), 'liclink-repo');
    const proj = join(tmp.path(), 'liclink-proj');
    const outside = join(tmp.path(), 'outside-license');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    write(outside, 'NOT FROM THE CLONE');
    rmSync(join(repo, 'LICENSE'));
    symlinkSync(outside, join(repo, 'LICENSE'));

    installCapabilities(repo, proj, selection());

    expect(existsSync(join(proj, 'PHARN-LICENSE'))).toBe(false);
    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'flat',
      }).keys(),
    ];
    expect(keys).not.toContain('PHARN-LICENSE');
  });

  it('installs cleanly from a clone with no LICENSE, and expects none', () => {
    const repo = join(tmp.path(), 'nolic-repo');
    const proj = join(tmp.path(), 'nolic-proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    rmSync(join(repo, 'LICENSE'));

    expect(() => installCapabilities(repo, proj, selection())).not.toThrow();
    expect(existsSync(join(proj, 'PHARN-LICENSE'))).toBe(false);
  });

  it('does NOT copy symlinked fixed surfaces (settings, trusted docs, contracts, floor)', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    // single-file surfaces: replace the real file with a symlink onto a real file.
    rmSync(join(repo, '.claude/settings.json'));
    symlinkSync(
      join(repo, 'CONSTITUTION.md'),
      join(repo, '.claude/settings.json'),
    );
    rmSync(join(repo, 'ARCHITECTURE.md'));
    symlinkSync(join(repo, 'CONSTITUTION.md'), join(repo, 'ARCHITECTURE.md'));
    // whole-dir surfaces: plant a nested symlink alongside the real files.
    symlinkSync(
      join(repo, 'pharn-contracts/finding-shape.md'),
      join(repo, 'pharn-contracts/evil-link'),
    );
    symlinkSync(
      join(repo, '.dev/floor/validate.mjs'),
      join(repo, '.dev/floor/evil-link'),
    );

    const result = installCapabilities(repo, proj, selection());

    // symlinked single-file surfaces skipped (settings not preserved, not copied).
    expect(result.settingsPreserved).toBe(false);
    expect(isPresent(join(proj, '.claude/settings.json'))).toBe(false);
    expect(isPresent(join(proj, 'ARCHITECTURE.md'))).toBe(false);
    // real siblings still copied; planted nested symlinks skipped.
    expect(existsSync(join(proj, 'pharn-contracts/finding-shape.md'))).toBe(
      true,
    );
    expect(isPresent(join(proj, 'pharn-contracts/evil-link'))).toBe(false);
    expect(existsSync(join(proj, '.dev/floor/validate.mjs'))).toBe(true);
    expect(isPresent(join(proj, '.dev/floor/evil-link'))).toBe(false);
  });
});

describe('installCapabilityDirs', () => {
  const tmp = useTmpDir();

  it('copies only the named capability dirs — no product surfaces', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    const caps: InstalledCapability[] = [{ name: 'a11y', role: 'griller' }];

    const result = installCapabilityDirs(repo, proj, caps);

    expect(result).toEqual([{ name: 'a11y', role: 'griller' }]);
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'))).toBe(
      true,
    );
    // The focused primitive copies NO product surfaces.
    expect(existsSync(join(proj, '.claude/commands/pharn-plan.md'))).toBe(
      false,
    );
    expect(existsSync(join(proj, 'CONSTITUTION.md'))).toBe(false);
  });

  it('rejects a name that escapes the base (P2 safeJoin)', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepo(repo);
    expect(() =>
      installCapabilityDirs(repo, proj, [
        { name: '../escape', role: 'griller' },
      ]),
    ).toThrow(ManifestValidationError);
  });
});

describe('installCapabilities — pharn/ layout (mirrors PR #86)', () => {
  const tmp = useTmpDir();

  // A fetched clone in the new pharn/ single-install layout: runtime surfaces
  // under pharn/, .claude/* at root. All four trusted docs live under pharn/ and
  // are installed there; the ROOT copies below are the dev repo's own and must
  // never reach the project. The pharn/pharn-contracts dir is the detection
  // marker.
  function scaffoldRepoPharn(repo: string): void {
    write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'), 'a11y');
    write(
      join(repo, 'pharn/pharn-pipeline/grillers/a11y/evals/cases/c.md'),
      'case',
    );
    write(join(repo, 'pharn/pharn-review/n-plus-one/n-plus-one.md'), 'npo');
    write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
    write(join(repo, '.claude/commands/pharn-dev-plan.md'), 'DEV');
    write(join(repo, '.claude/hooks/set-writes-scope.cjs'), 'hook');
    write(join(repo, '.claude/hooks/set-writes-scope.test.cjs'), 'HOOKTEST');
    write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
    write(join(repo, 'pharn/CONSTITUTION.md'), 'C');
    write(join(repo, 'pharn/ARCHITECTURE.md'), 'A');
    write(join(repo, 'pharn/pharn-contracts/finding-shape.md'), 'fs');
    write(join(repo, 'pharn/floor/validate.mjs'), 'floor');
    write(join(repo, 'pharn/floor/validate.test.mjs'), 'FLOORTEST');
    write(
      join(repo, 'pharn/floor/test-fixtures/red/skill.md'),
      'DELIBERATELY RED',
    );
    write(join(repo, 'pharn/floor/my-test-fixtures.mjs'), 'KEEP ME');
    // pharn-core: the fixed skill surface the installed /pharn-build cites
    // (seam-resolver + its evals). Copied whole, like pharn-contracts.
    write(join(repo, 'pharn/pharn-core/seam-resolver/seam-resolver.md'), 'sr');
    write(
      join(repo, 'pharn/pharn-core/seam-resolver/evals/cases/resolve.md'),
      'case',
    );
    write(
      join(repo, 'pharn/pharn-core/seam-resolver/evals/expected/resolve.md'),
      'expected',
    );
    // Root in BOTH layouts, like .claude/* — upstream keeps features/ at the
    // repo root even in a pharn-layout tree.
    write(join(repo, 'pharn/features/README.md'), 'FEATURES');
    write(join(repo, 'LICENSE'), 'APACHE-2.0 UPSTREAM');
    // THE TWO DOCS UPSTREAM KEEPS AT THE ROOT. pharn-oss's relocation moved
    // CONSTITUTION + ARCHITECTURE under pharn/ and left these two behind; there
    // is no `pharn/THREAT-MODEL.md` or `pharn/LIMITS.md` anywhere in its history,
    // so this scaffold deliberately does not invent one. Bytes differ from the
    // pharn/ docs above so a passing assertion cannot be passing on ambiguity.
    write(join(repo, 'THREAT-MODEL.md'), 'T');
    write(join(repo, 'LIMITS.md'), 'L');
    // Genuinely dev-only roots, which the install must leave behind.
    write(join(repo, '.dev/features/x/PLAN.md'), 'DEVPLAN');
    write(join(repo, '.dev/memory-bank/lessons-learned.md'), 'DEVMEM');
  }

  function run(): { repo: string; proj: string } {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepoPharn(repo);
    const result = installCapabilities(repo, proj, selection());
    expect(result.layout).toBe('pharn');
    return { repo, proj };
  }

  it('detects and records layout: pharn', () => {
    run(); // the assertion is inside run()
  });

  it('mirrors capabilities + fixed surfaces UNDER pharn/ (test files excluded)', () => {
    const { proj } = run();
    expect(
      existsSync(join(proj, 'pharn/pharn-pipeline/grillers/a11y/a11y.md')),
    ).toBe(true);
    expect(
      existsSync(
        join(proj, 'pharn/pharn-pipeline/grillers/a11y/evals/cases/c.md'),
      ),
    ).toBe(true);
    expect(
      existsSync(join(proj, 'pharn/pharn-review/n-plus-one/n-plus-one.md')),
    ).toBe(true);
    expect(
      existsSync(join(proj, 'pharn/pharn-contracts/finding-shape.md')),
    ).toBe(true);
    expect(existsSync(join(proj, 'pharn/floor/validate.mjs'))).toBe(true);
    expect(existsSync(join(proj, 'pharn/floor/validate.test.mjs'))).toBe(false);
    expect(existsSync(join(proj, 'pharn/CONSTITUTION.md'))).toBe(true);
    expect(existsSync(join(proj, 'pharn/ARCHITECTURE.md'))).toBe(true);
  });

  // THE REGRESSION. Measured over one real install of pharn-oss@main: 108 of the
  // copied files cite these two docs, always by their BARE name (118x / 68x, and
  // 0x with a pharn/ prefix) — the form an agent resolves against the project
  // root. The install shipped none of them, because the constant named
  // `pharn/THREAT-MODEL.md` / `pharn/LIMITS.md` and both readers are
  // existence-guarded, so 108 files landed citing files that were never written.
  //
  // Fails against the old constant twice over: it wrote to the pharn/ paths, and
  // this scaffold no longer contains a pharn/ source for it to read.
  it('installs THREAT-MODEL.md and LIMITS.md at the project ROOT, from the clone root', () => {
    const { proj } = run();
    expect(readFileSync(join(proj, 'THREAT-MODEL.md'), 'utf8')).toBe('T');
    expect(readFileSync(join(proj, 'LIMITS.md'), 'utf8')).toBe('L');
    // The dead paths are not resurrected.
    expect(existsSync(join(proj, 'pharn/THREAT-MODEL.md'))).toBe(false);
    expect(existsSync(join(proj, 'pharn/LIMITS.md'))).toBe(false);
  });

  // The outro's claim surface: what it reports is what the copy branch actually
  // wrote, in paths.docs order — not the expected list, and not a count.
  it('reports the four docs it wrote, at their per-doc paths', () => {
    const repo = join(tmp.path(), 'docs-repo');
    const proj = join(tmp.path(), 'docs-proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepoPharn(repo);
    expect(installCapabilities(repo, proj, selection()).docs).toEqual([
      'pharn/CONSTITUTION.md',
      'pharn/ARCHITECTURE.md',
      'THREAT-MODEL.md',
      'LIMITS.md',
    ]);
  });

  // The gap this surface closes: the installed /pharn-build cites
  // pharn/pharn-core/seam-resolver/seam-resolver.md, so the install must actually
  // ship it — whole dir, evals included, exactly like a capability dir.
  it('installs pharn/pharn-core whole (seam-resolver + its evals)', () => {
    const { proj } = run();
    expect(
      existsSync(join(proj, 'pharn/pharn-core/seam-resolver/seam-resolver.md')),
    ).toBe(true);
    expect(
      existsSync(
        join(proj, 'pharn/pharn-core/seam-resolver/evals/cases/resolve.md'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(proj, 'pharn/pharn-core/seam-resolver/evals/expected/resolve.md'),
      ),
    ).toBe(true);
  });

  // P2: the clone is untrusted. A symlinked copy ROOT is rejected outright (the
  // same isSymlink guard contracts/floor get), so nothing under it materializes —
  // never a file sourced from outside the clone.
  it('SKIPS a symlinked pharn-core root (nothing materialized)', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside');
    mkdirSync(proj, { recursive: true });
    scaffoldRepoPharn(repo);
    write(join(outside, 'secret.md'), 'not from the clone');
    rmSync(join(repo, 'pharn/pharn-core'), { recursive: true, force: true });
    symlinkSync(outside, join(repo, 'pharn/pharn-core'));

    installCapabilities(repo, proj, selection());

    expect(existsSync(join(proj, 'pharn/pharn-core'))).toBe(false);
    expect(existsSync(join(proj, 'pharn/pharn-core/secret.md'))).toBe(false);
    // The sibling surfaces are unaffected — the skip is scoped to this root.
    expect(
      existsSync(join(proj, 'pharn/pharn-contracts/finding-shape.md')),
    ).toBe(true);
  });

  it('leaks no flat-layout RUNTIME surface to the project root', () => {
    const { proj } = run();
    // The root docs are the exception and have their own case above: they are at
    // the project root because that is where upstream keeps them, not leakage.
    // Everything else a flat install would put at the root must be under pharn/.
    expect(existsSync(join(proj, 'CONSTITUTION.md'))).toBe(false);
    expect(existsSync(join(proj, 'ARCHITECTURE.md'))).toBe(false);
    expect(existsSync(join(proj, 'pharn-contracts'))).toBe(false);
    expect(existsSync(join(proj, 'pharn-pipeline'))).toBe(false);
    expect(existsSync(join(proj, 'pharn-review'))).toBe(false);
    expect(existsSync(join(proj, '.dev'))).toBe(false);
  });

  it('does NOT install the floor test-fixtures subtree (pharn layout)', () => {
    const { proj } = run();
    expect(existsSync(join(proj, 'pharn/floor/validate.mjs'))).toBe(true);
    expect(existsSync(join(proj, 'pharn/floor/test-fixtures'))).toBe(false);
    expect(
      readFileSync(join(proj, 'pharn/floor/my-test-fixtures.mjs'), 'utf8'),
    ).toBe('KEEP ME');
  });

  it('installs upstream LICENSE as pharn/LICENSE (pharn layout)', () => {
    const { proj } = run();
    expect(readFileSync(join(proj, 'pharn/LICENSE'), 'utf8')).toBe(
      'APACHE-2.0 UPSTREAM',
    );
    // Never at the root, where the user's own LICENSE lives.
    expect(existsSync(join(proj, 'LICENSE'))).toBe(false);
    expect(existsSync(join(proj, 'PHARN-LICENSE'))).toBe(false);
  });

  it('installs pharn/features/README.md under pharn/, not at the project root', () => {
    const { proj } = run();
    expect(readFileSync(join(proj, 'pharn/features/README.md'), 'utf8')).toBe(
      'FEATURES',
    );
    expect(existsSync(join(proj, 'features/README.md'))).toBe(false);
  });

  it('installs at the project root when the clone predates the relocation (C2b window)', () => {
    const repo = join(tmp.path(), 'pre-reloc-repo');
    const proj = join(tmp.path(), 'pre-reloc-proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepoPharn(repo);
    rmSync(join(repo, 'pharn/features/README.md'));
    write(join(repo, 'features/README.md'), 'LEGACY');

    installCapabilities(repo, proj, selection());
    expect(readFileSync(join(proj, 'features/README.md'), 'utf8')).toBe('LEGACY');
    expect(existsSync(join(proj, 'pharn/features/README.md'))).toBe(false);
  });

  // THE P7 PIN. A clone that predates a doc must still install cleanly and the
  // manifest must simply omit it — which is what makes naming a doc the CLI's
  // promise about WHERE upstream puts it, not a requirement that it exists yet.
  // The guard is deliberate; only its SILENCE was the defect, and the outro's
  // warn (steps/install-archetype.ts) is what ends that.
  it('installs cleanly from a clone that ships neither root doc, and expects neither', () => {
    const repo = join(tmp.path(), 'old-repo');
    const proj = join(tmp.path(), 'old-proj');
    mkdirSync(proj, { recursive: true });
    scaffoldRepoPharn(repo);
    rmSync(join(repo, 'THREAT-MODEL.md'));
    rmSync(join(repo, 'LIMITS.md'));

    const result = installCapabilities(repo, proj, selection());
    expect(existsSync(join(proj, 'pharn/CONSTITUTION.md'))).toBe(true);
    expect(existsSync(join(proj, 'THREAT-MODEL.md'))).toBe(false);
    expect(existsSync(join(proj, 'LIMITS.md'))).toBe(false);
    // What the caller reports is the SHORTER list — the absence is visible.
    expect(result.docs).toEqual([
      'pharn/CONSTITUTION.md',
      'pharn/ARCHITECTURE.md',
    ]);

    // Omitted from the expected set is what makes `status` report no `missing`
    // and `update` restore nothing — the manifest IS status's missing bucket.
    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'pharn',
      }).keys(),
    ];
    expect(keys).not.toContain('THREAT-MODEL.md');
    expect(keys).not.toContain('LIMITS.md');
    expect(keys).toContain('pharn/CONSTITUTION.md');
  });

  // P2: the clone is untrusted, and the root docs get the same symlink refusal
  // the pharn/-prefixed ones already had — never copied, never expected, and
  // never reported as written. Reading through one would pull bytes from outside
  // the clone into the user's repo.
  it('never copies, expects, or reports a symlinked root LIMITS.md', () => {
    const repo = join(tmp.path(), 'link-repo');
    const proj = join(tmp.path(), 'link-proj');
    const outside = join(tmp.path(), 'outside.md');
    mkdirSync(proj, { recursive: true });
    scaffoldRepoPharn(repo);
    write(outside, 'not from the clone');
    rmSync(join(repo, 'LIMITS.md'));
    symlinkSync(outside, join(repo, 'LIMITS.md'));

    const result = installCapabilities(repo, proj, selection());

    expect(existsSync(join(proj, 'LIMITS.md'))).toBe(false);
    // The reported list is collected inside the copy branch, so a doc the guard
    // rejected cannot appear in it.
    expect(result.docs).not.toContain('LIMITS.md');
    const keys = [
      ...collectExpectedInstallPaths({
        repoDir: repo,
        capabilities: selection().selected,
        layout: 'pharn',
      }).keys(),
    ];
    expect(keys).not.toContain('LIMITS.md');
    // The real sibling doc at the same root is still installed.
    expect(readFileSync(join(proj, 'THREAT-MODEL.md'), 'utf8')).toBe('T');
  });

  it('keeps .claude/* at root (layout-invariant), excluding pharn-dev + *.test', () => {
    const { proj } = run();
    expect(existsSync(join(proj, '.claude/commands/pharn-plan.md'))).toBe(true);
    expect(existsSync(join(proj, '.claude/commands/pharn-dev-plan.md'))).toBe(
      false,
    );
    expect(existsSync(join(proj, '.claude/hooks/set-writes-scope.cjs'))).toBe(
      true,
    );
    expect(
      existsSync(join(proj, '.claude/hooks/set-writes-scope.test.cjs')),
    ).toBe(false);
    expect(existsSync(join(proj, '.claude/settings.json'))).toBe(true);
  });
});
