import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  extractTar,
  extractTarGz,
  TarExtractError,
} from '../src/lib/tar-extract.js';

// Fixtures are built here, byte by byte, rather than shelled out to `tar`.
// That is the whole point: the entries worth testing are the ones a system tar
// refuses to write — an absolute path, a `..` segment, a device node, a header
// whose checksum does not match. A fixture generator that can only produce
// well-formed archives cannot exercise a single rejection.

const BLOCK = 512;
const LIMITS = { maxEntries: 1000, maxTotalBytes: 1024 * 1024 };

interface EntryInit {
  name: string;
  type?: string;
  data?: string;
  prefix?: string;
  /** Overwrite the checksum field with this literal, to forge a bad header. */
  forgeChecksum?: string;
  /** Raw first byte of the size field, written BEFORE the checksum is computed. */
  forgeSizeByte?: number;
}

function header(entry: EntryInit): Buffer {
  const block = Buffer.alloc(BLOCK);
  const data = entry.data ?? '';
  const type = entry.type ?? '0';
  block.write(entry.name, 0, 100, 'latin1');
  block.write('000644 \0', 100, 8, 'latin1'); // mode
  block.write('000000 \0', 108, 8, 'latin1'); // uid
  block.write('000000 \0', 116, 8, 'latin1'); // gid
  block.write(
    Buffer.byteLength(data).toString(8).padStart(11, '0') + ' ',
    124,
    12,
    'latin1',
  );
  block.write('00000000000 ', 136, 12, 'latin1'); // mtime
  block.write('        ', 148, 8, 'latin1'); // checksum placeholder: 8 spaces
  block.write(type, 156, 1, 'latin1');
  block.write('ustar\0', 257, 6, 'latin1');
  block.write('00', 263, 2, 'latin1');
  if (entry.prefix !== undefined) block.write(entry.prefix, 345, 155, 'latin1');
  // Applied before the checksum so the header stays internally consistent —
  // otherwise the checksum guard fires first and the numeric guard is never
  // reached, which would make this a test of the wrong rejection.
  if (entry.forgeSizeByte !== undefined) block[124] = entry.forgeSizeByte;

  if (entry.forgeChecksum !== undefined) {
    block.write(entry.forgeChecksum.padEnd(8, '\0'), 148, 8, 'latin1');
  } else {
    let sum = 0;
    for (const byte of block) sum += byte;
    block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1');
  }
  return block;
}

function tar(entries: EntryInit[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    parts.push(header(entry));
    const data = Buffer.from(entry.data ?? '', 'utf8');
    if (data.length > 0) {
      const padded = Buffer.alloc(Math.ceil(data.length / BLOCK) * BLOCK);
      data.copy(padded);
      parts.push(padded);
    }
  }
  parts.push(Buffer.alloc(BLOCK * 2)); // end-of-archive
  return Buffer.concat(parts);
}

/** The shape every real codeload archive has, minus the entries under test. */
function githubArchive(entries: EntryInit[]): Buffer {
  return tar([
    // GitHub's first entry, always. Single-segment name, no leading component.
    {
      name: 'pax_global_header',
      type: 'g',
      data: '52 comment=0123456789abcdef0123456789abcdef01234567\n',
    },
    { name: 'pharn-oss-abc1234/', type: '5' },
    ...entries,
  ]);
}

describe('extractTar', () => {
  const tmp = useTmpDir();

  it('strips one component and writes the tree', () => {
    const dest = tmp.path();
    extractTar(
      githubArchive([
        { name: 'pharn-oss-abc1234/SKILLS_VERSION', data: '1.0.0\n' },
        { name: 'pharn-oss-abc1234/pharn-review/', type: '5' },
        { name: 'pharn-oss-abc1234/pharn-review/a11y.md', data: '# a11y\n' },
      ]),
      dest,
      LIMITS,
    );

    expect(readFileSync(join(dest, 'SKILLS_VERSION'), 'utf8')).toBe('1.0.0\n');
    expect(readFileSync(join(dest, 'pharn-review/a11y.md'), 'utf8')).toBe(
      '# a11y\n',
    );
    // The archive root itself is not written as a directory named after the sha.
    expect(existsSync(join(dest, 'pharn-oss-abc1234'))).toBe(false);
  });

  it('skips the leading pax_global_header instead of rejecting it', () => {
    // The regression this test exists for: a `g` entry's name is a single
    // segment with nothing to strip, so running the path rules over it fails
    // the FIRST block of every real archive — init/add/update/status would fail
    // 100% of the time against the live remote while every hand-made fixture
    // passed.
    const dest = tmp.path();
    expect(() =>
      extractTar(
        githubArchive([{ name: 'pharn-oss-abc1234/ok.txt', data: 'ok' }]),
        dest,
        LIMITS,
      ),
    ).not.toThrow();
    expect(readFileSync(join(dest, 'ok.txt'), 'utf8')).toBe('ok');
    expect(existsSync(join(dest, 'pax_global_header'))).toBe(false);
  });

  it('skips a pax extended header (typeflag x) the same way', () => {
    const dest = tmp.path();
    extractTar(
      githubArchive([
        { name: 'PaxHeaders/0/long', type: 'x', data: '30 path=whatever\n' },
        { name: 'pharn-oss-abc1234/ok.txt', data: 'ok' },
      ]),
      dest,
      LIMITS,
    );
    expect(readFileSync(join(dest, 'ok.txt'), 'utf8')).toBe('ok');
  });

  it('reassembles a path split across prefix and name', () => {
    // ustar splits any path over 100 chars: the tail goes in `name`, the head in
    // `prefix`. 619 of the live archive's ~1,470 entries use it. Reading `name`
    // alone yields a bare leaf, which strip-1 then rejects for having no leading
    // component — losing a third of the tree rather than misplacing it.
    const deep = 'a'.repeat(40);
    const dest = tmp.path();
    extractTar(
      githubArchive([
        {
          prefix: `pharn-oss-abc1234/${deep}/${deep}`,
          name: 'regression-report.json',
          data: '{}',
        },
      ]),
      dest,
      LIMITS,
    );
    expect(
      readFileSync(join(dest, deep, deep, 'regression-report.json'), 'utf8'),
    ).toBe('{}');
    // ...and it did NOT land at the root as a bare leaf.
    expect(existsSync(join(dest, 'regression-report.json'))).toBe(false);
  });

  it.each([
    ['a `..` segment', 'pharn-oss-abc1234/../escape.txt'],
    ['a deeper `..` segment', 'pharn-oss-abc1234/nested/../../escape.txt'],
  ])('rejects %s', (_label, name) => {
    expect(() =>
      extractTar(githubArchive([{ name, data: 'x' }]), tmp.path(), LIMITS),
    ).toThrow(TarExtractError);
  });

  it('rejects an absolute path', () => {
    expect(() =>
      extractTar(
        githubArchive([{ name: '/etc/passwd', data: 'x' }]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/absolute path/);
  });

  it('rejects a file with no component to strip', () => {
    // No preceding root entry, so this is the FIRST accepted path: the
    // multi-root guard cannot fire and the strip-1 rule is what must reject it.
    expect(() =>
      extractTar(
        tar([
          { name: 'pax_global_header', type: 'g', data: '20 comment=x\n' },
          { name: 'loose.txt', data: 'x' },
        ]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/no path below the archive root/);
  });

  it('rejects a second root component', () => {
    expect(() =>
      extractTar(
        githubArchive([
          { name: 'pharn-oss-abc1234/ok.txt', data: 'x' },
          { name: 'somewhere-else/evil.txt', data: 'x' },
        ]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/more than one root component/);
  });

  it.each([
    ['a symlink', '2'],
    ['a hardlink', '1'],
    ['a character device', '3'],
    ['a block device', '4'],
    ['a fifo', '6'],
    ['an unknown type', '9'],
  ])('rejects %s entry outright, rather than skipping it', (_label, type) => {
    // degit passed neither `strict` nor `onwarn`, so an entry like this was
    // dropped and the clone still resolved. The live archive contains none of
    // these, so a rejection here is a real signal.
    expect(() =>
      extractTar(
        githubArchive([{ name: 'pharn-oss-abc1234/link', type }]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/unsupported type/);
  });

  it('enforces the entry-count cap', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      name: `pharn-oss-abc1234/f${i}.txt`,
      data: 'x',
    }));
    expect(() =>
      extractTar(githubArchive(many), tmp.path(), {
        maxEntries: 3,
        maxTotalBytes: 1024,
      }),
    ).toThrow(/more than 3 entries/);
  });

  it('enforces the total-bytes cap', () => {
    expect(() =>
      extractTar(
        githubArchive([
          { name: 'pharn-oss-abc1234/big.txt', data: 'x'.repeat(600) },
        ]),
        tmp.path(),
        { maxEntries: 100, maxTotalBytes: 100 },
      ),
    ).toThrow(/expands past 100 bytes/);
  });

  it('rejects a truncated archive', () => {
    const full = githubArchive([
      { name: 'pharn-oss-abc1234/f.txt', data: 'x'.repeat(600) },
    ]);
    // Cut inside the file payload: the header promises more than is there.
    expect(() =>
      extractTar(full.subarray(0, BLOCK * 4), tmp.path(), LIMITS),
    ).toThrow(/truncated/);
  });

  it('rejects a header whose checksum does not match', () => {
    expect(() =>
      extractTar(
        githubArchive([
          {
            name: 'pharn-oss-abc1234/f.txt',
            data: 'x',
            forgeChecksum: '000000\0 ',
          },
        ]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/checksum/);
  });

  it('rejects the GNU base-256 numeric encoding rather than misreading it', () => {
    const bytes = Buffer.concat([
      header({ name: 'pharn-oss-abc1234/', type: '5' }),
      header({ name: 'pharn-oss-abc1234/f.txt', forgeSizeByte: 0x80 }),
      Buffer.alloc(BLOCK * 2),
    ]);
    expect(() => extractTar(bytes, tmp.path(), LIMITS)).toThrow(/base-256/);
  });
});

describe('extractTarGz', () => {
  const tmp = useTmpDir();

  it('decompresses and extracts', () => {
    const dest = tmp.path();
    extractTarGz(
      gzipSync(githubArchive([{ name: 'pharn-oss-abc1234/v', data: '1.0.0' }])),
      dest,
      LIMITS,
    );
    expect(readFileSync(join(dest, 'v'), 'utf8')).toBe('1.0.0');
  });

  it('surfaces corrupt gzip as a TarExtractError', () => {
    expect(() =>
      extractTarGz(Buffer.from('not a gzip stream'), tmp.path(), LIMITS),
    ).toThrow(TarExtractError);
  });

  it('caps the DECOMPRESSED size, so a zip bomb is bounded', () => {
    // Neither content-length nor the compressed size bounds this: 1 MB of zeros
    // gzips to about a kilobyte.
    const bomb = gzipSync(
      githubArchive([
        { name: 'pharn-oss-abc1234/bomb', data: '\0'.repeat(1024 * 1024) },
      ]),
    );
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(() =>
      extractTarGz(bomb, tmp.path(), { maxEntries: 10, maxTotalBytes: 4096 }),
    ).toThrow(TarExtractError);
  });
});
