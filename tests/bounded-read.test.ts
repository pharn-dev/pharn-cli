import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  MAX_LOCAL_FILE_BYTES,
  readBoundedFile,
} from '../src/lib/bounded-read.js';

// ---------------------------------------------------------------------------
// The one reader for the files pharn keeps in a project: bytes, absent, or
// unusable with a fixed reason — never a hang, never an unbounded read.
// ---------------------------------------------------------------------------

describe('readBoundedFile', () => {
  const tmp = useTmpDir();
  const at = (name: string): string => join(tmp.path(), name);

  it('reads a regular file', () => {
    writeFileSync(at('f.json'), '{"a":1}');
    expect(readBoundedFile(at('f.json'))).toEqual({
      kind: 'ok',
      bytes: Buffer.from('{"a":1}'),
    });
  });

  it('reports an absent file as absent', () => {
    expect(readBoundedFile(at('nope.json'))).toEqual({ kind: 'absent' });
  });

  it('refuses a directory, with the errno a plain read would have given', () => {
    mkdirSync(at('d.json'));
    expect(readBoundedFile(at('d.json'))).toEqual({
      kind: 'unusable',
      code: 'EISDIR',
      reason: 'is not a regular file',
    });
  });

  it('refuses a file over the cap, and reads one exactly at it', () => {
    writeFileSync(at('big'), 'x'.repeat(9));
    expect(readBoundedFile(at('big'), 8)).toEqual({
      kind: 'unusable',
      code: 'too-large',
      reason: 'is larger than 8 bytes',
    });
    writeFileSync(at('edge'), 'x'.repeat(8));
    expect(readBoundedFile(at('edge'), 8)).toMatchObject({ kind: 'ok' });
  });

  it('names the default cap in MiB', () => {
    expect(MAX_LOCAL_FILE_BYTES).toBe(16 * 1024 * 1024);
    writeFileSync(at('huge'), Buffer.alloc(MAX_LOCAL_FILE_BYTES + 1));
    expect(readBoundedFile(at('huge'))).toMatchObject({
      kind: 'unusable',
      reason: 'is larger than 16 MiB',
    });
  });

  // The size check alone is not the bound: a file can grow after the fstat.
  // procfs is a deterministic stand-in — its files are regular, fstat says 0
  // bytes, and a read returns more than that.
  it.runIf(process.platform === 'linux')(
    'stops at the cap while reading, not only at the fstat size',
    () => {
      expect(readBoundedFile('/proc/self/status', 8)).toEqual({
        kind: 'unusable',
        code: 'too-large',
        reason: 'is larger than 8 bytes',
      });
    },
  );

  it('reports any other open failure by its errno', () => {
    writeFileSync(at('locked.json'), '{}');
    chmodSync(at('locked.json'), 0o000);
    try {
      // (Inert for uid 0 with CAP_DAC_OVERRIDE — this suite must not run as
      // root, like the other permission cases in it.)
      expect(readBoundedFile(at('locked.json'))).toEqual({
        kind: 'unusable',
        code: 'EACCES',
        reason: 'could not be read (EACCES)',
      });
    } finally {
      chmodSync(at('locked.json'), 0o644);
    }
  });

  it('follows a symlink to a regular file, as a plain read does', () => {
    writeFileSync(at('real.json'), 'ok');
    symlinkSync(at('real.json'), at('link.json'));
    expect(readBoundedFile(at('link.json'))).toEqual({
      kind: 'ok',
      bytes: Buffer.from('ok'),
    });
  });

  // A device reads forever. It is refused on its type, before any byte.
  it('refuses a symlink to /dev/zero without reading it', () => {
    symlinkSync('/dev/zero', at('zero.json'));
    expect(readBoundedFile(at('zero.json'))).toEqual({
      kind: 'unusable',
      code: 'not-a-file',
      reason: 'is not a regular file',
    });
  });

  // A blocking open(2) on a FIFO waits for a writer that never comes. The read
  // runs in a child with a hard timeout, so a regression fails here as a
  // timeout instead of hanging the test worker (as tests/hook-wiring.test.ts
  // does for its settings files).
  it('refuses a FIFO without waiting on it', () => {
    execFileSync('mkfifo', [at('pipe.json')]);
    const mod = fileURLToPath(
      new URL('../src/lib/bounded-read.ts', import.meta.url),
    );
    const script = `
      const { readBoundedFile } = await import(${JSON.stringify(mod)});
      console.log(JSON.stringify(readBoundedFile(process.argv[1])));
    `;
    const r = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script, at('pipe.json')],
      { encoding: 'utf8', timeout: 15_000 },
    );
    expect(r.signal, 'the read hung and was killed').toBeNull();
    expect(JSON.parse(r.stdout)).toEqual({
      kind: 'unusable',
      code: 'not-a-file',
      reason: 'is not a regular file',
    });
  }, 30_000);
});
