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

// The one layout since v0.21.0 (the flat layout was removed).
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
    // v0.21.0: one layout; each role addressed under pharn/, never the root.
    expect(capabilityRelDir(pharn, A11Y)).not.toBe(
      'pharn-pipeline/grillers/a11y',
    );
    expect(capabilityRelDir(pharn, N1)).toBe('pharn/pharn-review/n-plus-one');
    expect(capabilityRelDir(pharn, A11Y)).toBe(
      'pharn/pharn-pipeline/grillers/a11y',
    );
    expect(capabilityDir(proj, pharn, N1)).toBe(
      join(proj, 'pharn/pharn-review/n-plus-one'),
    );
  });

  it('refuses a name that is not a strict child of the subtree', () => {
    for (const name of ['..', '../..', 'a/b', '']) {
      expect(() =>
        capabilityDir(proj, pharn, { name, role: 'lens' }),
      ).toThrow();
    }
  });

  it('finds a symlinked component on the way to the directory, or null', () => {
    expect(linkedComponent(proj, pharn, A11Y)).toBeNull();
    mkdirSync(join(tmp.path(), 'elsewhere'), { recursive: true });
    symlinkSync(join(tmp.path(), 'elsewhere'), join(proj, 'pharn'));
    expect(linkedComponent(proj, pharn, A11Y)).toBe('pharn');
  });

  // The walk is repeated at the delete (C5.2): a prompt may sit between the
  // plan and the delete, and rmSync would follow a swapped-in link.
  it('refuses to delete through a symlinked component, deleting nothing behind it', () => {
    const elsewhere = join(tmp.path(), 'shared');
    mkdirSync(join(elsewhere, 'a11y'), { recursive: true });
    writeFileSync(join(elsewhere, 'a11y/NOTES.md'), 'not this project');
    mkdirSync(join(proj, 'pharn'), { recursive: true });
    symlinkSync(elsewhere, join(proj, 'pharn/pharn-pipeline'));
    mkdirSync(join(elsewhere, 'grillers/a11y'), { recursive: true });
    writeFileSync(join(elsewhere, 'grillers/a11y/a11y.md'), 'outside');

    expect(() => deleteCapabilityDir(proj, pharn, A11Y)).toThrow(
      'pharn/pharn-pipeline is a symbolic link; refusing to delete through it.',
    );
    expect(existsSync(join(elsewhere, 'grillers/a11y/a11y.md'))).toBe(true);
  });

  it('treats a component below a regular file as no link (that dir cannot exist)', () => {
    mkdirSync(join(proj, 'pharn'), { recursive: true });
    writeFileSync(join(proj, 'pharn/pharn-review'), 'a file, not a dir');
    expect(linkedComponent(proj, pharn, N1)).toBeNull();
  });

  it('deletes the whole directory and reports whether it existed', () => {
    const dir = join(proj, 'pharn/pharn-review/n-plus-one');
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(join(dir, 'nested/x.md'), 'x');
    writeFileSync(join(proj, 'pharn/pharn-review/sibling.md'), 'keep');

    expect(deleteCapabilityDir(proj, pharn, N1)).toBe(true);
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(join(proj, 'pharn/pharn-review/sibling.md'))).toBe(true);
    expect(deleteCapabilityDir(proj, pharn, N1)).toBe(false);
  });
});
