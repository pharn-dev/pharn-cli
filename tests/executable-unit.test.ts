import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isExecutableUnitPath } from '../src/lib/executable-unit.js';
import { layoutPaths } from '../src/lib/layout.js';

const pharn = layoutPaths('pharn');
const flat = layoutPaths('flat');

describe('isExecutableUnitPath — membership by path only', () => {
  it.each([
    ['pharn/floor/reconcile-baseline.mjs', pharn],
    ['pharn/floor/worktree-fingerprint.mjs', pharn],
    // The floor's data maps are read by its CLIs, so they belong too.
    ['pharn/floor/lens-family-map.json', pharn],
    ['pharn/floor/lib/deep/x.mjs', pharn],
    ['pharn/floor/README.md', pharn],
    ['.dev/floor/check-spec.mjs', flat],
    ['.claude/hooks/enforce-writes-scope.cjs', pharn],
    ['.claude/hooks/new-hook.mjs', flat],
    ['.claude/commands/pharn-ship.md', pharn],
    ['.claude/commands/pharn-loop.md', flat],
  ])('%s is a member', (rel, paths) => {
    expect(isExecutableUnitPath(rel, paths)).toBe(true);
  });

  it.each([
    // The trailing slash in the prefix: a sibling dir sharing the name is not in.
    ['pharn/floorplan/x.mjs', pharn],
    ['pharn/floor', pharn],
    // The OTHER layout's floor is not this layout's unit.
    ['.dev/floor/check-spec.mjs', pharn],
    ['pharn/floor/check-spec.mjs', flat],
    ['pharn/pharn-review/lenses/a11y/a11y.md', pharn],
    ['pharn/CONSTITUTION.md', pharn],
    ['pharn/pharn-contracts/finding-shape.md', pharn],
    ['pharn/pharn-core/seam-resolver/SKILL.md', pharn],
    ['.claude/settings.json', pharn],
    ['.claude/commands/other.md', pharn],
    ['.claude/commands/pharn-dev-build.md', pharn],
    ['.claude/hooks/x.test.cjs', pharn],
    ['.claude/hooks/nested/x.cjs', pharn],
    ['.claude/commands/nested/pharn-x.md', pharn],
  ])('%s is not a member', (rel, paths) => {
    expect(isExecutableUnitPath(rel, paths)).toBe(false);
  });

  it('reads no file: the module imports nothing from node:fs', () => {
    const source = readFileSync(
      new URL('../src/lib/executable-unit.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/from 'node:fs/);
    expect(source).not.toMatch(/from 'fs/);
  });
});
