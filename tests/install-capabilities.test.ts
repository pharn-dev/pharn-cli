import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  installCapabilities,
  installCapabilityDirs,
} from '../src/lib/install-capabilities.js';
import { ManifestValidationError } from '../src/lib/validate.js';
import type { InstalledCapability, Selection } from '../src/types.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
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
  // contracts
  write(join(repo, 'pharn-contracts/finding-shape.md'), 'fs');
  // floor (+ tests, dev-only) + dev-only trees
  write(join(repo, '.dev/floor/validate.mjs'), 'floor');
  write(join(repo, '.dev/floor/validate.test.mjs'), 'FLOORTEST');
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

  it('returns the copied capability list (name + role)', () => {
    const { result } = run();
    expect(result.capabilities).toEqual([
      { name: 'a11y', role: 'griller' },
      { name: 'n-plus-one', role: 'lens' },
    ]);
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
