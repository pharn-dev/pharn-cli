import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  assertNoExistingTargets,
  CONFIG_MARKER,
  DRIFT_MARKERS,
  existingConfigRefusal,
  MAX_LISTED,
  OverwriteRefusedError,
  planWriteTargets,
  removalLines,
  targetLines,
} from '../src/lib/write-targets.js';
import type { CapabilityRemoval } from '../src/lib/capability-removal.js';
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

  // F-08: init rewrites an existing config (`models` reset), so it
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

// F-04: the dropped capabilities' directories a re-install deletes ride the
// same plan. `--yes` never deletes — since CORE-168 because it never gets that
// far: a removal needs a replaced pharn.config.json, which refuses `--yes`
// before the fetch (existingConfigRefusal, below).
describe('removals in the write-target plan', () => {
  const tmp = useTmpDir();
  const removal = (
    over: Partial<CapabilityRemoval> = {},
  ): CapabilityRemoval => ({
    cap: { name: 'old', role: 'lens', source: 'auto' },
    reason: 'dropped-unselected',
    dir: 'pharn-review/old',
    present: true,
    backups: ['pharn-review/old/NOTES.md'],
    ...over,
  });

  it('passes the removals through, with or without conflicts', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    const plan = planWriteTargets({
      repoDir: repo,
      projectRoot: proj,
      capabilities: CAPS,
      manifest,
      records: null,
      removals: [removal()],
    });
    expect(plan.conflicts).toEqual([]);
    expect(plan.removals).toEqual([removal()]);
  });

  it('lists only the directories that exist, with their backup counts', () => {
    expect(
      removalLines([
        removal(),
        removal({ cap: { name: 'x', role: 'griller' }, backups: [] }),
        removal({ cap: { name: 'gone', role: 'lens' }, present: false }),
      ]),
    ).toEqual([
      '  • pharn-review/old/ (lens:old — 1 file(s) backed up to pharn/.backup/ first)',
      '  • pharn-review/old/ (griller:x)',
    ]);
  });

  it('assertNoExistingTargets takes no removals: it judges the write targets only', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    // The removal branch is gone (CORE-168): a removal is unrepresentable in
    // its parameters, and nothing existing means nothing to refuse.
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

  // The F-04 scenario, still refused — by the config it comes from. A removal
  // is planned only from the entries of the pharn.config.json a re-install
  // replaces, so that file exists: `--yes` refuses before the fetch, naming it
  // (existingConfigRefusal), and the in-run check refuses it too, as a write
  // target. The deleted directory is never reached, so it is not named.
  it('--yes refuses a re-install that would delete a directory, naming it', () => {
    const { repo, proj, manifest } = fixture(tmp.path());
    write(join(proj, 'pharn.config.json'), '{"capabilities":[]}');
    write(join(proj, 'pharn-review/old/NOTES.md'), 'mine');
    expect(existingConfigRefusal(proj)).toMatch(
      /pharn\.config\.json already exists/,
    );
    const params = {
      repoDir: repo,
      projectRoot: proj,
      capabilities: CAPS,
      manifest,
      records: null,
    };
    expect(() => assertNoExistingTargets(params)).toThrow(
      OverwriteRefusedError,
    );
    expect(() => assertNoExistingTargets(params)).toThrow(
      /--yes never overwrites/,
    );
    let message = '';
    try {
      assertNoExistingTargets(params);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain(`pharn.config.json ${CONFIG_MARKER}`);
    // planWriteTargets still carries the removal for the prompt and dry run.
    expect(
      planWriteTargets({ ...params, removals: [removal()] }).removals,
    ).toEqual([removal()]);
  });
});

// CORE-168: `init --yes` over an existing pharn.config.json refuses BEFORE the
// fetch — the config is always a write target, so the refusal is certain and
// needs no network. Its existence test is conflictingWriteTargets' own.
describe('existingConfigRefusal', () => {
  const tmp = useTmpDir();

  it('is null when there is no pharn.config.json', () => {
    expect(existingConfigRefusal(tmp.path())).toBeNull();
  });

  it('names pharn.config.json alone and the three ways forward', () => {
    write(join(tmp.path(), 'pharn.config.json'), '{}');
    const message = existingConfigRefusal(tmp.path())!;
    expect(message).toContain(
      'pharn init --yes installs only into a project where none of its files exists yet, and pharn.config.json already exists.',
    );
    expect(message).toContain('--yes never overwrites');
    expect(message).toContain('`pharn init` in a terminal');
    expect(message).toContain('`pharn init --dry-run`');
    expect(message).toContain('`pharn update`');
    // No marked target list: that needs the clone.
    expect(message).not.toContain('•');
  });

  it('closes with the same two lines as the in-run refusal', () => {
    write(join(tmp.path(), 'pharn.config.json'), '{}');
    const tail = existingConfigRefusal(tmp.path())!.split('\n').slice(-2);
    const { repo, proj, manifest } = fixture(join(tmp.path(), 'f'));
    write(join(proj, '.claude/commands/pharn-plan.md'), 'mine');
    let inRun = '';
    try {
      assertNoExistingTargets({
        repoDir: repo,
        projectRoot: proj,
        capabilities: CAPS,
        manifest,
        records: null,
      });
    } catch (err) {
      inRun = (err as Error).message;
    }
    expect(inRun.split('\n').slice(-2)).toEqual(tail);
  });

  it('refuses whatever exists there — a directory or a live link too', () => {
    mkdirSync(join(tmp.path(), 'pharn.config.json'));
    expect(existingConfigRefusal(tmp.path())).not.toBeNull();
    const other = join(tmp.path(), 'p2');
    write(join(other, 'real.json'), '{}');
    symlinkSync(join(other, 'real.json'), join(other, 'pharn.config.json'));
    expect(existingConfigRefusal(other)).not.toBeNull();
  });

  it('a dangling link is not "existing" — as for conflictingWriteTargets', () => {
    const p = join(tmp.path(), 'p3');
    mkdirSync(p);
    symlinkSync(join(p, 'nowhere.json'), join(p, 'pharn.config.json'));
    expect(existingConfigRefusal(p)).toBeNull();
  });
});
