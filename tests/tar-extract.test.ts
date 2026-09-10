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
/** An escape byte, written as a code point so no raw control char sits in this source. */
const ESC = '\u001b';

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

/**
 * One pax record, `<len> <keyword>=<value>\n`, where `<len>` counts the whole
 * record INCLUDING its own digits — so the width is self-referential and has to
 * be solved for, which is exactly the arithmetic a hand-written literal gets
 * wrong (and which the reader now rejects rather than tolerates).
 */
function paxRecord(keyword: string, value: string): string {
  const body = ` ${keyword}=${value}\n`;
  let len = body.length + 1;
  for (;;) {
    const next = String(len).length + body.length;
    if (next === len) return `${len}${body}`;
    len = next;
  }
}

/** GitHub's actual first block: one global header carrying only `comment=<sha>`. */
const GLOBAL_HEADER: EntryInit = {
  name: 'pax_global_header',
  type: 'g',
  data: paxRecord('comment', '0123456789abcdef0123456789abcdef01234567'),
};

/** The shape every real codeload archive has, minus the entries under test. */
function githubArchive(entries: EntryInit[]): Buffer {
  return tar([
    // GitHub's first entry, always. Single-segment name, no leading component.
    GLOBAL_HEADER,
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

  // --- pax extended headers (typeflag 'x') ------------------------------------
  //
  // These REPLACE an earlier test that asserted an `x` header was skipped like a
  // `g` one. That was the defect: an `x` header's records OVERRIDE the ustar
  // header that follows it, so discarding them changes where a file lands (or
  // how the rest of the stream is framed) without a word of complaint.

  it('rejects a pax extended header carrying path=, instead of writing the TRUNCATED path', () => {
    // The real shape, reproduced from `tar --format=pax` output: a writer emits
    // `path=` exactly when the path does not fit ustar, and writes that path
    // truncated to the 100-byte `name` field in the header it cannot represent.
    // The truncated path is relative, rooted and `..`-free, so every other rule
    // in the module passes it — which is what made the loss silent.
    const real = `${'z'.repeat(140)}.txt`;
    const truncated = 'z'.repeat(100);
    const dest = tmp.path();

    expect(() =>
      extractTar(
        githubArchive([
          {
            name: 'PaxHeaders/0/zzz',
            prefix: 'pharn-oss-abc1234/deep',
            type: 'x',
            data: paxRecord('path', `pharn-oss-abc1234/deep/${real}`),
          },
          { name: truncated, prefix: 'pharn-oss-abc1234/deep', data: 'hi' },
        ]),
        dest,
        LIMITS,
      ),
    ).toThrow(TarExtractError);

    // ...and it did not land at either name on the way out.
    expect(existsSync(join(dest, 'deep', truncated))).toBe(false);
    expect(existsSync(join(dest, 'deep', real))).toBe(false);
  });

  it('rejects a pax extended header carrying size=, which would re-frame the stream', () => {
    // Worse than a misplaced file: `size=` overrides how many bytes the next
    // entry occupies, so ignoring it makes the reader parse that entry's
    // attacker-controlled CONTENT as the following tar header.
    expect(() =>
      extractTar(
        githubArchive([
          {
            name: 'PaxHeaders/0/big',
            type: 'x',
            data: paxRecord('size', '8589934592'),
          },
          { name: 'pharn-oss-abc1234/big.bin', data: '' },
        ]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(TarExtractError);
  });

  it('rejects a pax extended header carrying only benign metadata', () => {
    // Pins that the decision is the TYPEFLAG, not the payload. `git archive`
    // emits `x` only for path/linkpath/size — all three load-bearing — and the
    // live archive has none, so presence alone is the signal. Reading the
    // payload to decide would be a parse of untrusted bytes standing between
    // the archive and the refusal.
    expect(() =>
      extractTar(
        githubArchive([
          {
            name: 'PaxHeaders/0/f',
            type: 'x',
            data: paxRecord('mtime', '1700000000.0'),
          },
          { name: 'pharn-oss-abc1234/f.txt', data: 'x' },
        ]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/pax extended header/);
  });

  it.each([
    ['an empty payload', ''],
    ['a length prefix that lies', '99 path=elsewhere\n'],
    ['no length prefix at all', 'path=elsewhere\n'],
  ])(
    'rejects a pax extended header with %s — an unreadable payload cannot dodge the throw',
    (_label, data) => {
      expect(() =>
        extractTar(
          githubArchive([
            { name: 'PaxHeaders/0/f', type: 'x', data },
            { name: 'pharn-oss-abc1234/f.txt', data: 'x' },
          ]),
          tmp.path(),
          LIMITS,
        ),
      ).toThrow(/pax extended header/);
    },
  );

  it('names the typeflag and the records it read, so the cause is one read away', () => {
    // A future upstream change that starts emitting pax must be diagnosable
    // from the error alone — not from a debugger.
    expect(() =>
      extractTar(
        githubArchive([
          {
            name: 'PaxHeaders/0/f',
            type: 'x',
            data: paxRecord('path', 'pharn-oss-abc1234/somewhere/else.txt'),
          },
        ]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/typeflag 'x'.*records path/s);
  });

  it('caps how many keywords it names, so a padded payload cannot flood the message', () => {
    // The other half of bounding untrusted text: the shape filter stops any ONE
    // keyword being hostile, this stops a payload supplying hundreds of benign
    // ones. Ten distinct keywords in, eight named, the rest counted.
    const many = Array.from({ length: 10 }, (_, i) =>
      paxRecord(`kw${i}`, 'v'),
    ).join('');
    let message = '';
    try {
      extractTar(
        githubArchive([{ name: 'PaxHeaders/0/f', type: 'x', data: many }]),
        tmp.path(),
        LIMITS,
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/pax extended header/);
    expect(message).toContain('(+2 more)');
    expect(message).toContain('kw0');
    expect(message).toContain('kw7');
    // ...and the two past the cap are counted, not printed.
    expect(message).not.toContain('kw8');
    expect(message).not.toContain('kw9');
  });

  it('keeps a hostile keyword out of the message rather than echoing it', () => {
    // The payload is remote bytes. Only the keyword is ever read, and only
    // through a shape filter, so control characters cannot reach a terminal.
    let message = '';
    try {
      extractTar(
        githubArchive([
          {
            name: 'PaxHeaders/0/f',
            type: 'x',
            data: paxRecord(`pa${ESC}[31mth`, 'x'),
          },
        ]),
        tmp.path(),
        LIMITS,
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/pax extended header/);
    expect(message).toContain('<unprintable>');
    expect(message).not.toContain(ESC);
  });

  // --- pax GLOBAL headers (typeflag 'g') --------------------------------------
  //
  // 'g' cannot take the same rule: every codeload archive opens with one, so an
  // unconditional throw would reject 100% of real fetches on the first block.
  // Its records are judged instead — a global record is a default applied to
  // every entry that follows it.

  it.each([['path'], ['linkpath'], ['size']])(
    'rejects a pax global header setting a default %s=',
    (keyword) => {
      expect(() =>
        extractTar(
          tar([
            {
              name: 'pax_global_header',
              type: 'g',
              data: paxRecord(keyword, '1'),
            },
            { name: 'pharn-oss-abc1234/', type: '5' },
            { name: 'pharn-oss-abc1234/f.txt', data: 'x' },
          ]),
          tmp.path(),
          LIMITS,
        ),
      ).toThrow(/pax global header setting a default/);
    },
  );

  it('rejects a pax global header whose records do not parse', () => {
    // Fail-closed in the only direction that is honest: a payload the reader
    // cannot account for END TO END could hide a `path=` between two mis-split
    // records, so "the keywords I managed to find" is not an answer.
    expect(() =>
      extractTar(
        tar([
          { name: 'pax_global_header', type: 'g', data: '7 comment=xyz\n' },
          { name: 'pharn-oss-abc1234/', type: '5' },
          { name: 'pharn-oss-abc1234/f.txt', data: 'x' },
        ]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/records could not be read/);
  });

  it('still skips the global header GitHub actually sends', () => {
    // The anti-regression for the 100%-failure bug: `pax_global_header` is a
    // single segment with nothing to strip, so running the path rules over it —
    // or throwing on `g` outright — fails the FIRST block of every real archive
    // while every hand-made fixture passes.
    const dest = tmp.path();
    extractTar(
      githubArchive([{ name: 'pharn-oss-abc1234/ok.txt', data: 'ok' }]),
      dest,
      LIMITS,
    );
    expect(readFileSync(join(dest, 'ok.txt'), 'utf8')).toBe('ok');
    expect(existsSync(join(dest, 'pax_global_header'))).toBe(false);
  });

  it('skips a global header carrying metadata and vendor records', () => {
    const dest = tmp.path();
    extractTar(
      tar([
        {
          name: 'pax_global_header',
          type: 'g',
          data:
            paxRecord('mtime', '1700000000.0') +
            paxRecord('uname', 'root') +
            paxRecord('SCHILY.xattr.user.thing', 'value'),
        },
        { name: 'pharn-oss-abc1234/', type: '5' },
        { name: 'pharn-oss-abc1234/ok.txt', data: 'ok' },
      ]),
      dest,
      LIMITS,
    );
    expect(readFileSync(join(dest, 'ok.txt'), 'utf8')).toBe('ok');
  });

  it('skips a global header whose payload spans more than one block', () => {
    // The padded multi-block advance is newly load-bearing: the reader now
    // consumes the payload it used to step over blind, so the framing has to be
    // demonstrated rather than inherited.
    const dest = tmp.path();
    const big = paxRecord('comment', 'q'.repeat(1200));
    expect(big.length).toBeGreaterThan(BLOCK * 2);
    extractTar(
      tar([
        { name: 'pax_global_header', type: 'g', data: big },
        { name: 'pharn-oss-abc1234/', type: '5' },
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
        tar([GLOBAL_HEADER, { name: 'loose.txt', data: 'x' }]),
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
    // GNU's long-name typeflags are the other way a writer escapes ustar's
    // 100-byte name field. They need no branch of their own — they are neither
    // '0'/NUL nor '5', so they land in this reject — but they are pinned HERE
    // so a future refactor of the bucket cannot start accepting them quietly.
    ['a GNU long name', 'L'],
    ['a GNU long link name', 'K'],
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
