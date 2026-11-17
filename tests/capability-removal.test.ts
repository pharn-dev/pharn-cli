import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { snapshotTree, useTmpDir } from './helpers.js';
import {
  CapabilityRemovalError,
  planCapabilityRemovals,
  removalBackups,
  removalBackupsNow,
} from '../src/lib/capability-removal.js';
import { contentHash } from '../src/lib/hash.js';
import { layoutPaths } from '../src/lib/layout.js';

const STALE = { name: 'stale', role: 'lens' as const, source: 'auto' as const };
const GONE = { name: 'gone', role: 'griller' as const };

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('planCapabilityRemovals', () => {
  const tmp = useTmpDir();
  let proj = '';
  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
  });

  it('plans one removal per dropped capability, backing up only what pharn cannot prove it wrote, and writes nothing', () => {
    write(join(proj, 'pharn/pharn-review/stale/stale.md'), 'pharn bytes');
    write(join(proj, 'pharn/pharn-review/stale/MINE.md'), 'mine');
    const before = snapshotTree(proj);
    const removals = planCapabilityRemovals({
      cwd: proj,
      paths: layoutPaths('pharn'),
      drops: [
        { cap: STALE, reason: 'dropped-unselected' },
        { cap: STALE, reason: 'dropped-unselected' }, // duplicate → once
        { cap: GONE, reason: 'dropped-gone' }, // nothing on disk
      ],
      records: {
        'pharn/pharn-review/stale/stale.md': contentHash(
          join(proj, 'pharn/pharn-review/stale/stale.md'),
        ),
      },
      command: 'init',
    });
    expect(removals).toEqual([
      {
        cap: STALE,
        reason: 'dropped-unselected',
        dir: 'pharn/pharn-review/stale',
        present: true,
        backups: ['pharn/pharn-review/stale/MINE.md'],
      },
      {
        cap: GONE,
        reason: 'dropped-gone',
        dir: 'pharn/pharn-pipeline/grillers/gone',
        present: false,
        backups: [],
      },
    ]);
    expect(removalBackups(removals)).toEqual([
      'pharn/pharn-review/stale/MINE.md',
    ]);
    expect(snapshotTree(proj)).toEqual(before);
  });

  it('names the refusing command when a component is a symbolic link', () => {
    const outside = join(tmp.path(), 'outside');
    write(join(outside, 'pharn/pharn-review/stale/x.md'), 'x');
    symlinkSync(outside, join(proj, 'pharn'));
    const plan = () =>
      planCapabilityRemovals({
        cwd: proj,
        paths: layoutPaths('pharn'),
        drops: [{ cap: STALE, reason: 'dropped-unselected' }],
        records: null,
        command: 'init',
      });
    expect(plan).toThrow(CapabilityRemovalError);
    expect(plan).toThrow(/Refusing to init: .*`pharn init` again/);
  });
});

// The backup set read again at delete time (C5.2): the plan was made before a
// prompt that may have sat open.
describe('removalBackupsNow', () => {
  const tmp = useTmpDir();
  let proj = '';
  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
  });

  const plan = (records: Record<string, string> | null) =>
    planCapabilityRemovals({
      cwd: proj,
      paths: layoutPaths('pharn'),
      drops: [{ cap: STALE, reason: 'dropped-unselected' }],
      records,
      command: 'update',
    });

  it('adds a file edited or added since the plan to the plan’s own set', () => {
    write(join(proj, 'pharn/pharn-review/stale/stale.md'), 'pharn bytes');
    write(join(proj, 'pharn/pharn-review/stale/MINE.md'), 'mine');
    const records = {
      'pharn/pharn-review/stale/stale.md': contentHash(
        join(proj, 'pharn/pharn-review/stale/stale.md'),
      ),
    };
    const removals = plan(records);
    expect(removalBackups(removals)).toEqual([
      'pharn/pharn-review/stale/MINE.md',
    ]);
    // While the prompt is open: pharn's file is edited, a new one appears.
    write(join(proj, 'pharn/pharn-review/stale/stale.md'), 'edited');
    write(join(proj, 'pharn/pharn-review/stale/NEW.md'), 'new');

    expect(
      removalBackupsNow({ cwd: proj, removals, records, command: 'update' }),
    ).toEqual([
      'pharn/pharn-review/stale/MINE.md',
      'pharn/pharn-review/stale/NEW.md',
      'pharn/pharn-review/stale/stale.md',
    ]);
  });

  it('reads nothing for a removal with nothing on disk', () => {
    expect(
      removalBackupsNow({
        cwd: proj,
        removals: plan(null),
        records: null,
        command: 'init',
      }),
    ).toEqual([]);
  });

  it('refuses, naming the command, when the directory can no longer be listed', () => {
    write(join(proj, 'pharn/pharn-review/stale/stale.md'), 'x');
    const removals = plan(null);
    // A regular file where the directory's parent was: listing it fails
    // (ENOTDIR), which is never "pharn's, safe to delete".
    rmSync(join(proj, 'pharn/pharn-review'), { recursive: true });
    writeFileSync(join(proj, 'pharn/pharn-review'), 'a file now');
    const now = () =>
      removalBackupsNow({
        cwd: proj,
        removals,
        records: null,
        command: 'update',
      });
    expect(now).toThrow(CapabilityRemovalError);
    expect(now).toThrow(
      /^Could not check the files in pharn\/pharn-review\/stale\/ before `pharn update` deletes them: .*Nothing was changed\.$/,
    );
  });
});
