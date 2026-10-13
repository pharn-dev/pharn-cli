import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { removalBackupSet } from '../src/lib/removal-backup.js';
import { contentHash } from '../src/lib/hash.js';
import { useTmpDir } from './helpers.js';

const DIR = 'pharn/pharn-review/a11y';

const tmp = useTmpDir();
let proj = '';

function write(rel: string, content = 'x'): string {
  const abs = join(proj, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

// The hash of what actually landed, never one the test invented.
function recordOf(...rels: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of rels) out[rel] = contentHash(join(proj, rel));
  return out;
}

describe('removalBackupSet', () => {
  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
  });

  it('a file pharn never recorded is backed up', () => {
    write(`${DIR}/a11y.md`, 'pharn');
    write(`${DIR}/notes/USER.md`, 'mine');
    const records = recordOf(`${DIR}/a11y.md`);

    expect(removalBackupSet(proj, [DIR], records)).toEqual([
      `${DIR}/notes/USER.md`,
    ]);
  });

  it('a recorded file still at its recorded hash is NOT backed up', () => {
    write(`${DIR}/a11y.md`, 'pharn');
    write(`${DIR}/evals/cases/basic.md`, 'case');
    const records = recordOf(`${DIR}/a11y.md`, `${DIR}/evals/cases/basic.md`);

    expect(removalBackupSet(proj, [DIR], records)).toEqual([]);
  });

  it('a recorded file whose bytes changed is backed up', () => {
    write(`${DIR}/a11y.md`, 'pharn');
    write(`${DIR}/other.md`, 'pharn too');
    const records = recordOf(`${DIR}/a11y.md`, `${DIR}/other.md`);
    write(`${DIR}/a11y.md`, 'pharn, edited by you');

    expect(removalBackupSet(proj, [DIR], records)).toEqual([`${DIR}/a11y.md`]);
  });

  it('a recorded file re-checked-out with CRLF line endings is NOT backed up (F-16)', () => {
    write(`${DIR}/a11y.md`, '# a11y\nask\n');
    const records = recordOf(`${DIR}/a11y.md`);
    write(`${DIR}/a11y.md`, '# a11y\r\nask\r\n');

    expect(removalBackupSet(proj, [DIR], records)).toEqual([]);
  });

  it('a recorded CRLF file whose content was edited IS backed up', () => {
    write(`${DIR}/a11y.md`, '# a11y\nask\n');
    const records = recordOf(`${DIR}/a11y.md`);
    write(`${DIR}/a11y.md`, '# a11y\r\nask, edited\r\n');

    expect(removalBackupSet(proj, [DIR], records)).toEqual([`${DIR}/a11y.md`]);
  });

  it('with no usable records every regular file is backed up', () => {
    write(`${DIR}/a11y.md`, 'pharn');
    write(`${DIR}/z/deep/nested.md`, 'n');
    write(`${DIR}/b.md`, 'b');

    expect(removalBackupSet(proj, [DIR], null)).toEqual([
      `${DIR}/a11y.md`,
      `${DIR}/b.md`,
      `${DIR}/z/deep/nested.md`,
    ]);
  });

  it('a record key outside the walked dir never matters (keys are compared, not joined)', () => {
    write(`${DIR}/a11y.md`, 'pharn');
    const records = {
      ...recordOf(`${DIR}/a11y.md`),
      '../../etc/passwd': '0'.repeat(64),
    };

    expect(removalBackupSet(proj, [DIR], records)).toEqual([]);
  });

  it('several dirs are scanned into ONE sorted, de-duplicated list', () => {
    const LENS = 'pharn/pharn-review/n-plus-one';
    write(`${LENS}/n.md`, 'n');
    write(`${DIR}/a.md`, 'a');

    expect(removalBackupSet(proj, [LENS, DIR, DIR], null)).toEqual([
      `${DIR}/a.md`,
      `${LENS}/n.md`,
    ]);
  });

  it('an absent dir contributes nothing', () => {
    expect(removalBackupSet(proj, [DIR], null)).toEqual([]);
  });

  it('an address that is a regular FILE is itself a candidate', () => {
    write(DIR, 'a file where the directory should be');

    expect(removalBackupSet(proj, [DIR], null)).toEqual([DIR]);
    expect(removalBackupSet(proj, [DIR], recordOf(DIR))).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')(
    'symlinks inside the dir are neither followed nor backed up',
    () => {
      const outside = join(tmp.path(), 'outside');
      mkdirSync(join(outside, 'sub'), { recursive: true });
      writeFileSync(join(outside, 'file.md'), 'outside');
      writeFileSync(join(outside, 'sub/inner.md'), 'outside');
      write(`${DIR}/a11y.md`, 'pharn');
      symlinkSync(join(outside, 'file.md'), join(proj, DIR, 'link-file.md'));
      symlinkSync(join(outside, 'sub'), join(proj, DIR, 'link-dir'));
      symlinkSync(join(outside, 'gone'), join(proj, DIR, 'dangling'));

      expect(removalBackupSet(proj, [DIR], null)).toEqual([`${DIR}/a11y.md`]);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'a FIFO inside the dir is skipped (never opened, so never a hang)',
    () => {
      write(`${DIR}/a11y.md`, 'pharn');
      execFileSync('mkfifo', [join(proj, DIR, 'pipe')]);

      expect(removalBackupSet(proj, [DIR], null)).toEqual([`${DIR}/a11y.md`]);
    },
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a recorded file that cannot be read THROWS — never treated as unchanged',
    () => {
      const abs = write(`${DIR}/secret.md`, 'mine');
      const records = recordOf(`${DIR}/secret.md`);
      chmodSync(abs, 0o000);
      try {
        expect(() => removalBackupSet(proj, [DIR], records)).toThrow();
      } finally {
        chmodSync(abs, 0o600);
      }
    },
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a directory that cannot be listed THROWS — its files are never assumed absent',
    () => {
      write(`${DIR}/locked/USER.md`, 'mine');
      const locked = join(proj, DIR, 'locked');
      chmodSync(locked, 0o000);
      try {
        expect(() => removalBackupSet(proj, [DIR], null)).toThrow();
      } finally {
        chmodSync(locked, 0o700);
      }
    },
  );

  it('a relDir escaping the project is refused (containment)', () => {
    expect(() => removalBackupSet(proj, ['../elsewhere'], null)).toThrow(
      /Refusing path/,
    );
  });
});
