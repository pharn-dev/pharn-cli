import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  capabilityDir,
  capabilityRelDir,
  deleteCapabilityDir,
  linkedComponent,
} from '../src/lib/capability-dir.js';
import { layoutPaths } from '../src/lib/layout.js';
import type { InstalledCapability } from '../src/types.js';

const flat = layoutPaths('flat');
const pharn = layoutPaths('pharn');
const A11Y: InstalledCapability = { name: 'a11y', role: 'griller' };
const N1: InstalledCapability = { name: 'n-plus-one', role: 'lens' };

describe('capability-dir', () => {
  const tmp = useTmpDir();
  let proj = '';
  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
  });

  it('addresses a capability at its role subtree, in both layouts', () => {
    expect(capabilityRelDir(flat, A11Y)).toBe('pharn-pipeline/grillers/a11y');
    expect(capabilityRelDir(flat, N1)).toBe('pharn-review/n-plus-one');
    expect(capabilityRelDir(pharn, A11Y)).toBe(
      'pharn/pharn-pipeline/grillers/a11y',
    );
    expect(capabilityDir(proj, flat, N1)).toBe(
      join(proj, 'pharn-review/n-plus-one'),
    );
  });

  it('refuses a name that is not a strict child of the subtree', () => {
    for (const name of ['..', '../..', 'a/b', '']) {
      expect(() => capabilityDir(proj, flat, { name, role: 'lens' })).toThrow();
    }
  });

  it('finds a symlinked component on the way to the directory, or null', () => {
    expect(linkedComponent(proj, pharn, A11Y)).toBeNull();
    mkdirSync(join(tmp.path(), 'elsewhere'), { recursive: true });
    symlinkSync(join(tmp.path(), 'elsewhere'), join(proj, 'pharn'));
    expect(linkedComponent(proj, pharn, A11Y)).toBe('pharn');
  });

  it('treats a component below a regular file as no link (that dir cannot exist)', () => {
    writeFileSync(join(proj, 'pharn-review'), 'a file, not a dir');
    expect(linkedComponent(proj, flat, N1)).toBeNull();
  });

  it('deletes the whole directory and reports whether it existed', () => {
    const dir = join(proj, 'pharn-review/n-plus-one');
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(join(dir, 'nested/x.md'), 'x');
    writeFileSync(join(proj, 'pharn-review/sibling.md'), 'keep');

    expect(deleteCapabilityDir(proj, flat, N1)).toBe(true);
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(join(proj, 'pharn-review/sibling.md'))).toBe(true);
    expect(deleteCapabilityDir(proj, flat, N1)).toBe(false);
  });
});
