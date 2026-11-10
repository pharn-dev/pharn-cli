import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ignoreAddition,
  ignorePatterns,
  parseIgnorePattern,
  readIgnoreFile,
  writeIgnoreFile,
} from '../src/lib/ignore-file.js';
import { useTmpDir } from './helpers.js';

// The shared ignore-file mechanics (lib/ignore-file.ts). The `.gitignore`
// behaviour built on them is pinned by tests/gitignore.test.ts, unchanged.

describe('parseIgnorePattern', () => {
  it.each([
    ['pharn/', { negated: false, core: 'pharn', floating: true, suffix: '/' }],
    ['/pharn', { negated: false, core: 'pharn', floating: false, suffix: '' }],
    [
      'pharn/**',
      { negated: false, core: 'pharn', floating: false, suffix: '/**' },
    ],
    [
      'pharn/*',
      { negated: false, core: 'pharn', floating: false, suffix: '/*' },
    ],
    [
      '**/pharn-review/',
      { negated: false, core: 'pharn-review', floating: true, suffix: '/' },
    ],
    [
      '!/pharn/x.md',
      { negated: true, core: 'pharn/x.md', floating: false, suffix: '' },
    ],
    [
      'a/b.json  \r',
      { negated: false, core: 'a/b.json', floating: false, suffix: '' },
    ],
  ])('%j', (line, expected) => {
    expect(parseIgnorePattern(line)).toEqual(expected);
  });

  it.each(['', '   ', '# comment', '\r'])('%j is not a pattern', (line) => {
    expect(parseIgnorePattern(line)).toBeNull();
  });

  it('keeps a leading space (part of the pattern)', () => {
    expect(parseIgnorePattern(' x')?.core).toBe(' x');
  });

  it('reads past a UTF-8 BOM', () => {
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('/pharn/\n'),
    ]);
    expect(ignorePatterns(bytes).map((p) => p.core)).toEqual(['pharn']);
  });
});

describe('ignoreAddition', () => {
  it('nothing to add: empty', () => {
    expect(ignoreAddition(Buffer.from('x\n'), [], '# c').length).toBe(0);
  });

  it('a new file: the comment and the entries, LF', () => {
    expect(ignoreAddition(null, ['/a', '/b/'], '# c').toString()).toBe(
      '# c\n/a\n/b/\n',
    );
  });

  it('CRLF follows the file, with a separator when it lacks a final newline', () => {
    expect(
      ignoreAddition(Buffer.from('x\r\ny'), ['/a'], '# c').toString(),
    ).toBe('\r\n# c\r\n/a\r\n');
  });

  it('the comment is written once', () => {
    expect(ignoreAddition(Buffer.from('# c\n'), ['/a'], '# c').toString()).toBe(
      '/a\n',
    );
  });
});

describe('readIgnoreFile / writeIgnoreFile', () => {
  const tmp = useTmpDir();

  it('absent, ok, symlink, directory', () => {
    expect(readIgnoreFile(tmp.path(), '.x')).toEqual({ kind: 'absent' });
    writeFileSync(join(tmp.path(), '.x'), 'a\n');
    expect(readIgnoreFile(tmp.path(), '.x')).toEqual({
      kind: 'ok',
      bytes: Buffer.from('a\n'),
    });
    symlinkSync(join(tmp.path(), '.x'), join(tmp.path(), '.link'));
    expect(readIgnoreFile(tmp.path(), '.link')).toEqual({
      kind: 'refused',
      reason: 'symlink',
    });
    mkdirSync(join(tmp.path(), '.dir'));
    expect(readIgnoreFile(tmp.path(), '.dir')).toEqual({
      kind: 'refused',
      reason: 'not-a-file',
    });
  });

  it('writes old + append; returns null on success', async () => {
    expect(
      await writeIgnoreFile(
        tmp.path(),
        '.x',
        Buffer.from('a\n'),
        Buffer.from('b\n'),
      ),
    ).toBeNull();
    expect(readFileSync(join(tmp.path(), '.x'), 'utf8')).toBe('a\nb\n');
  });
});
