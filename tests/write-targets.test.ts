import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  assertNoExistingTargets,
  CONFIG_MARKER,
  DRIFT_MARKERS,
  MAX_LISTED,
  OverwriteRefusedError,
  planWriteTargets,
  targetLines,
} from '../src/lib/write-targets.js';
import { collectExpectedInstallPaths } from '../src/lib/install-manifest.js';
import { detectLayout } from '../src/lib/layout.js';
import { contentHash } from '../src/lib/hash.js';
import type { InstalledCapability } from '../src/types.js';

// The ONE computation behind init's overwrite prompt, its --dry-run preview and
// its --yes refusal: which write targets already exist, which of them the
// install would back up, and in what order they are listed.

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

const CAPS: InstalledCapability[] = [{ name: 'a11y', role: 'griller' }];

function fixture(root: string): {
  repo: string;
  proj: string;
  manifest: Map<string, string>;
} {
  const repo = join(root, 'repo');
  const proj = join(root, 'proj');
  write(join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'), 'a11y');
  write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
  write(join(repo, '.claude/commands/pharn-ship.md'), 'ship');
  write(join(repo, 'CONSTITUTION.md'), 'C');
  mkdirSync(proj, { recursive: true });
  const manifest = collectExpectedInstallPaths({
    repoDir: repo,
    capabilities: CAPS,
    layout: detectLayout(repo),
  });
  return { repo, proj, manifest };
}

describe('planWriteTargets', () => {
  const tmp = useTmpDir();

  it('finds nothing in a project that has none of the targets', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    const plan = planWriteTargets({
      repoDir: repo,
      projectRoot: proj,
      capabilities: CAPS,
      manifest,
      records: null,
    });
    expect(plan.conflicts).toEqual([]);
    expect(plan.labels.size).toBe(0);
  });

  // F-08: init rewrites an existing config (`seam` and `models` reset), so it
  // is always backed up — marked on its own, never as drift.
  it('counts an existing pharn.config.json as a target that is backed up, not as drift', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    write(join(proj, 'pharn.config.json'), '{}');
    const plan = planWriteTargets({
      repoDir: repo,
      projectRoot: proj,
      capabilities: CAPS,
      manifest,
      records: null,
    });
    expect(plan.conflicts).toEqual(['pharn.config.json']);
    expect(plan.labels.size).toBe(0);
    expect(plan.configBackedUp).toBe(true);
  });

  it('does not back up a pharn.config.json that is a symlink (the write replaces the link)', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    write(join(tmp.path(), 'elsewhere.json'), '{}');
    symlinkSync(
      join(tmp.path(), 'elsewhere.json'),
      join(proj, 'pharn.config.json'),
    );
    const plan = planWriteTargets({
      repoDir: repo,
      projectRoot: proj,
      capabilities: CAPS,
      manifest,
      records: null,
    });
    expect(plan.conflicts).toEqual(['pharn.config.json']);
    expect(plan.configBackedUp).toBe(false);
  });

  it('lists the labelled files first (by label, then path), then the replaced config, then the rest', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    // Identical to upstream: a target, never labelled.
    write(join(proj, 'CONSTITUTION.md'), 'C');
    // Changed since pharn recorded writing it: modified.
    write(join(proj, '.claude/commands/pharn-ship.md'), 'my edit');
    // Differs, no record: unrecorded.
    write(join(proj, '.claude/commands/pharn-plan.md'), 'mine');
    write(join(proj, 'pharn.config.json'), '{}');
    write(join(tmp.path(), 'orig'), 'ship-old');
    const records = {
      '.claude/commands/pharn-ship.md': contentHash(join(tmp.path(), 'orig')),
    };
    const plan = planWriteTargets({
      repoDir: repo,
      projectRoot: proj,
      capabilities: CAPS,
      manifest,
      records,
    });
    expect(plan.conflicts).toEqual([
      '.claude/commands/pharn-ship.md',
      '.claude/commands/pharn-plan.md',
      'pharn.config.json',
      'CONSTITUTION.md',
    ]);
    expect(plan.labels.get('.claude/commands/pharn-ship.md')).toBe('modified');
    expect(plan.labels.get('.claude/commands/pharn-plan.md')).toBe(
      'unrecorded',
    );
    expect(plan.labels.has('CONSTITUTION.md')).toBe(false);
  });

  it('labels every differing file unverifiable when there are no records', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    write(join(proj, '.claude/commands/pharn-plan.md'), 'mine');
    const plan = planWriteTargets({
      repoDir: repo,
      projectRoot: proj,
      capabilities: CAPS,
      manifest,
      records: null,
    });
    expect(plan.labels.get('.claude/commands/pharn-plan.md')).toBe(
      'unverifiable',
    );
  });
});

describe('targetLines', () => {
  const labels = new Map([['a', 'modified' as const]]);

  it('marks each labelled path with the prompt marker, and the replaced config with its own', () => {
    expect(
      targetLines({
        conflicts: ['a', 'pharn.config.json', 'b'],
        labels,
        configBackedUp: true,
      }),
    ).toEqual([
      `  • a ${DRIFT_MARKERS.modified}`,
      `  • pharn.config.json ${CONFIG_MARKER}`,
      '  • b',
    ]);
    expect(
      targetLines({
        conflicts: ['pharn.config.json'],
        labels: new Map(),
        configBackedUp: false,
      }),
    ).toEqual(['  • pharn.config.json']);
  });

  it('caps the list and names the remainder', () => {
    const many = Array.from({ length: MAX_LISTED + 3 }, (_, i) => `f${i}`);
    const lines = targetLines(
      { conflicts: many, labels: new Map(), configBackedUp: false },
      MAX_LISTED,
    );
    expect(lines).toHaveLength(MAX_LISTED + 1);
    expect(lines.at(-1)).toBe('  …and 3 more');
  });

  it('lists everything when no cap is given', () => {
    const many = Array.from({ length: MAX_LISTED + 3 }, (_, i) => `f${i}`);
    expect(
      targetLines({
        conflicts: many,
        labels: new Map(),
        configBackedUp: false,
      }),
    ).toHaveLength(MAX_LISTED + 3);
  });
});

describe('assertNoExistingTargets (init --yes)', () => {
  const tmp = useTmpDir();

  it('passes when no target exists', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    expect(() =>
      assertNoExistingTargets({
        repoDir: repo,
        projectRoot: proj,
        capabilities: CAPS,
        manifest,
        records: null,
      }),
    ).not.toThrow();
  });

  it('refuses naming every existing target, its mark, and the ways forward', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    write(join(proj, 'pharn.config.json'), '{}');
    write(join(proj, '.claude/commands/pharn-plan.md'), 'mine');
    let caught: unknown;
    try {
      assertNoExistingTargets({
        repoDir: repo,
        projectRoot: proj,
        capabilities: CAPS,
        manifest,
        records: null,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OverwriteRefusedError);
    const message = (caught as Error).message;
    expect(message).toContain('--yes');
    expect(message).toContain('2 of them already exist');
    expect(message).toContain(
      `.claude/commands/pharn-plan.md ${DRIFT_MARKERS.unverifiable}`,
    );
    expect(message).toContain(`pharn.config.json ${CONFIG_MARKER}`);
    expect(message).toContain('pharn update');
    expect(message).toContain('pharn init --dry-run');
  });
});
