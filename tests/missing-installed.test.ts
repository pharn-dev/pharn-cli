import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { findMissingInstalled } from '../src/lib/missing-installed.js';
import { MODELS_RECORD_KEY } from '../src/lib/install-records.js';
import type { InstalledCapability, PharnConfig } from '../src/types.js';

// The LOCAL check that re-opens `pharn update`'s same-version early return. It
// may only ever answer "provably missing": a path that is present, crosses a
// symlink, or cannot be walked is NOT missing, because the full run could not
// repair it either and re-opening would loop on work it cannot do.

const HASH = 'a'.repeat(64);
const CAP_FILE = 'pharn-pipeline/grillers/a11y/a11y.md';
const DOC = 'CONSTITUTION.md';

function config(
  capabilities: InstalledCapability[],
  over: Partial<PharnConfig> = {},
): PharnConfig {
  return {
    pharnVersion: '0.12.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: null,
    modules: [],
    installedAt: '2026-10-13T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities,
    layout: 'flat',
    ...over,
  };
}

const A11Y: InstalledCapability = {
  name: 'a11y',
  role: 'griller',
  source: 'auto',
};

describe('findMissingInstalled', () => {
  const tmp = useTmpDir();
  const put = (rel: string, body = 'x'): void => {
    const abs = join(tmp.path(), rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  };

  it('returns null for a complete install', () => {
    put(CAP_FILE);
    put(DOC);
    expect(
      findMissingInstalled(tmp.path(), config([A11Y]), {
        [CAP_FILE]: HASH,
        [DOC]: HASH,
      }),
    ).toBeNull();
  });

  it('names a recorded file that is absent on disk', () => {
    put(CAP_FILE);
    expect(
      findMissingInstalled(tmp.path(), config([A11Y]), {
        [CAP_FILE]: HASH,
        [DOC]: HASH,
      }),
    ).toBe(DOC);
  });

  it('names a configured capability whose directory is gone — records or not', () => {
    put(DOC);
    expect(findMissingInstalled(tmp.path(), config([A11Y]), null)).toBe(
      'pharn-pipeline/grillers/a11y',
    );
    expect(
      findMissingInstalled(tmp.path(), config([A11Y]), { [DOC]: HASH }),
    ).toBe('pharn-pipeline/grillers/a11y');
  });

  it('addresses capability dirs at the RECORDED layout', () => {
    put('pharn-pipeline/grillers/a11y/a11y.md');
    // Present at the flat path, absent at the pharn/ one the config records.
    expect(
      findMissingInstalled(
        tmp.path(),
        config([A11Y], { layout: 'pharn' }),
        null,
      ),
    ).toBe('pharn/pharn-pipeline/grillers/a11y');
    put('pharn/pharn-review/n-plus-one/n-plus-one.md');
    expect(
      findMissingInstalled(
        tmp.path(),
        config([{ name: 'n-plus-one', role: 'lens' }], { layout: 'pharn' }),
        null,
      ),
    ).toBeNull();
  });

  it('never reads the models record key as a path', () => {
    put(DOC);
    expect(
      findMissingInstalled(tmp.path(), config([]), {
        [DOC]: HASH,
        [MODELS_RECORD_KEY]: HASH,
      }),
    ).toBeNull();
  });

  it('with no usable records, checks only the capability dirs', () => {
    put(CAP_FILE);
    // CONSTITUTION.md is absent, but nothing records it: not provable.
    expect(findMissingInstalled(tmp.path(), config([A11Y]), null)).toBeNull();
  });

  // A symlinked component is not "missing": the real run refuses to write
  // through it, so re-opening could not repair it and would never close.
  it('ignores a path that crosses a symlinked component (live or dangling)', () => {
    const outside = join(tmp.path(), 'outside');
    mkdirSync(outside);
    const proj = join(tmp.path(), 'proj');
    mkdirSync(join(proj, 'pharn-pipeline/grillers'), { recursive: true });
    // Dangling link at the capability dir.
    symlinkSync(
      join(tmp.path(), 'nowhere'),
      join(proj, 'pharn-pipeline/grillers/a11y'),
    );
    expect(
      findMissingInstalled(proj, config([A11Y]), { [CAP_FILE]: HASH }),
    ).toBeNull();
    // A live link to an empty dir outside the project: the recorded file is
    // absent THROUGH the link, and that is still not provable here.
    symlinkSync(outside, join(proj, 'pharn-review'));
    expect(
      findMissingInstalled(
        proj,
        config([{ name: 'n-plus-one', role: 'lens' }]),
        { 'pharn-review/n-plus-one/n-plus-one.md': HASH },
      ),
    ).toBeNull();
  });

  it('ignores a path below a regular file (ENOTDIR) instead of throwing', () => {
    put('pharn-pipeline', 'not a dir');
    expect(
      findMissingInstalled(tmp.path(), config([A11Y]), { [CAP_FILE]: HASH }),
    ).toBeNull();
  });

  it('treats a non-directory at the capability path as present, not missing', () => {
    put('pharn-pipeline/grillers/a11y', 'a file');
    expect(findMissingInstalled(tmp.path(), config([A11Y]), null)).toBeNull();
  });

  it('is deterministic: capability dirs first, then recorded keys in sorted order', () => {
    expect(
      findMissingInstalled(tmp.path(), config([A11Y]), {
        'z.md': HASH,
        'b.md': HASH,
      }),
    ).toBe('pharn-pipeline/grillers/a11y');
    expect(
      findMissingInstalled(tmp.path(), config([]), {
        'z.md': HASH,
        'b.md': HASH,
      }),
    ).toBe('b.md');
  });
});
