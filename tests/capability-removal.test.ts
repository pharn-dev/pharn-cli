import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { snapshotTree, useTmpDir } from './helpers.js';
import {
  CapabilityRemovalError,
  planCapabilityRemovals,
  removalBackups,
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
    write(join(proj, 'pharn-review/stale/stale.md'), 'pharn bytes');
    write(join(proj, 'pharn-review/stale/MINE.md'), 'mine');
    const before = snapshotTree(proj);
    const removals = planCapabilityRemovals({
      cwd: proj,
      paths: layoutPaths('flat'),
      drops: [
        { cap: STALE, reason: 'dropped-unselected' },
        { cap: STALE, reason: 'dropped-unselected' }, // duplicate → once
        { cap: GONE, reason: 'dropped-gone' }, // nothing on disk
      ],
      records: {
        'pharn-review/stale/stale.md': contentHash(
          join(proj, 'pharn-review/stale/stale.md'),
        ),
      },
      command: 'init',
    });
    expect(removals).toEqual([
      {
        cap: STALE,
        reason: 'dropped-unselected',
        dir: 'pharn-review/stale',
        present: true,
        backups: ['pharn-review/stale/MINE.md'],
      },
      {
        cap: GONE,
        reason: 'dropped-gone',
        dir: 'pharn-pipeline/grillers/gone',
        present: false,
        backups: [],
      },
    ]);
    expect(removalBackups(removals)).toEqual(['pharn-review/stale/MINE.md']);
    expect(snapshotTree(proj)).toEqual(before);
  });

  it('names the refusing command when a component is a symbolic link', () => {
    const outside = join(tmp.path(), 'outside');
    write(join(outside, 'pharn-review/stale/x.md'), 'x');
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
