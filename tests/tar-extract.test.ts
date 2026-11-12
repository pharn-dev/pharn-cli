import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  extractTar,
  extractTarGz,
  TarExtractError,
} from '../src/lib/tar-extract.js';
import { hasUnsafeChars } from '../src/lib/terminal-safe.js';
import { codeloadArchive } from './support/tar-fixture.js';

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
  // An `x` header's records OVERRIDE the ustar header that follows it (`path=`,
  // `size=`), so it is refused on the TYPEFLAG alone. Its payload is never read,
  // so no payload, well-formed or not, can change the answer.

  it.each([
    ['path=', paxRecord('path', 'pharn-oss-abc1234/deep/elsewhere.txt')],
    ['size=', paxRecord('size', '8589934592')],
    ['only benign metadata', paxRecord('mtime', '1700000000.0')],
    ['an unparseable payload', '7 comment=xyz\n'],
    ['an empty payload', ''],
  ])(
    'refuses a pax extended header carrying %s, on its typeflag alone',
    (_label, data) => {
      expect(() =>
        extractTar(
          githubArchive([
            { name: 'pharn-oss-abc1234/PaxHeaders/f.txt', type: 'x', data },
            { name: 'pharn-oss-abc1234/f.txt', data: 'x' },
          ]),
          tmp.path(),
          LIMITS,
        ),
      ).toThrow(/unsupported type 'x'.*pax extended header/);
    },
  );

  // --- pax GLOBAL headers (typeflag 'g') --------------------------------------
  //
  // Every codeload archive opens with one, so 'g' is SKIPPED, payload unread.
  // pharn reads only the ustar fields, so a `g` default for `path`/`size` is
  // never honoured: the entries that follow land at their own ustar paths, and
  // a size the default would imply cannot re-frame pharn's walk.

  it.each([['path'], ['linkpath'], ['size']])(
    'skips a pax global header setting a default %s=, never honouring it',
    (keyword) => {
      const dest = tmp.path();
      extractTar(
        tar([
          {
            name: 'pax_global_header',
            type: 'g',
            data: paxRecord(keyword, 'elsewhere'),
          },
          { name: 'pharn-oss-abc1234/', type: '5' },
          { name: 'pharn-oss-abc1234/f.txt', data: 'x' },
        ]),
        dest,
        LIMITS,
      );
      expect(readdirSync(dest)).toEqual(['f.txt']);
      expect(readFileSync(join(dest, 'f.txt'), 'utf8')).toBe('x');
    },
  );

  it('skips a pax global header whose payload does not parse, unread', () => {
    const dest = tmp.path();
    extractTar(
      tar([
        { name: 'pax_global_header', type: 'g', data: '7 comment=xyz\n' },
        { name: 'pharn-oss-abc1234/', type: '5' },
        { name: 'pharn-oss-abc1234/f.txt', data: 'x' },
      ]),
      dest,
      LIMITS,
    );
    expect(readdirSync(dest)).toEqual(['f.txt']);
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
    ['a pax extended header', 'x'],
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

  // PHARN-17: a name a terminal would interpret is refused before any other
  // entry rule, so it is neither installed (and later listed by status/update)
  // nor echoed raw by a refusal message. Names are latin1 in the header, so a
  // UTF-8 U+202E is written as its three bytes.
  const utf8AsLatin1 = (s: string): string =>
    Buffer.from(s, 'utf8').toString('latin1');

  it.each([
    [
      'an ESC sequence in the name',
      { name: `pharn-oss-abc1234/n${ESC}[2K\r${ESC}[32mOK` },
    ],
    [
      'a right-to-left override',
      { name: utf8AsLatin1('pharn-oss-abc1234/evil\u202egnp.md') },
    ],
    [
      'a zero-width space',
      { name: utf8AsLatin1('pharn-oss-abc1234/se\u200bcurity.md') },
    ],
    [
      'a control byte in the ustar prefix',
      { name: 'f.md', prefix: `pharn-oss-abc1234/d${ESC}x` },
    ],
    // CORE-170: the one unsafe set now holds the two line separators too.
    [
      'a line separator (U+2028)',
      { name: utf8AsLatin1('pharn-oss-abc1234/a\u2028b.md') },
    ],
  ])('refuses %s, naming it without the raw character', (_label, entry) => {
    let message = '';
    try {
      extractTar(githubArchive([entry]), tmp.path(), LIMITS);
    } catch (err) {
      expect(err).toBeInstanceOf(TarExtractError);
      message = (err as Error).message;
    }
    expect(message).toMatch(/control or format character/);
    expect(hasUnsafeChars(message)).toBe(false);
  });

  it('refuses an unsafe name even on an unsupported-type entry (path judged first)', () => {
    expect(() =>
      extractTar(
        githubArchive([{ name: `pharn-oss-abc1234/n${ESC}[32mOK`, type: '2' }]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/control or format character/);
  });

  it('renders an unprintable typeflag as its code, not the raw byte', () => {
    let message = '';
    try {
      extractTar(
        githubArchive([{ name: 'pharn-oss-abc1234/x', type: ESC }]),
        tmp.path(),
        LIMITS,
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('unsupported type 0x1b');
    expect(message).not.toContain(ESC);
  });

  it('still extracts an ordinary non-ASCII name', () => {
    extractTar(
      githubArchive([
        { name: utf8AsLatin1('pharn-oss-abc1234/café.md'), data: 'ok' },
      ]),
      tmp.path(),
      LIMITS,
    );
  });

  // tar-entry-names. The check used to judge a DIFFERENT string than the one
  // written — the UTF-8 decoding of latin1-read bytes, against the latin1 string
  // itself — so a raw C1 byte passed as U+FFFD and landed on disk as U+009B, and
  // every non-ASCII name landed garbled. Names are now decoded once, strictly,
  // and the check, the path rules and the write share that one string. Asserted
  // on the BYTES the filesystem returns, not on a decoded string.
  const onDisk = (dir: string): Buffer[] =>
    readdirSync(dir, { encoding: 'buffer' });

  it('writes a non-ASCII name as exactly the archive bytes', () => {
    const dest = tmp.path();
    extractTar(
      githubArchive([
        { name: utf8AsLatin1('pharn-oss-abc1234/a—b.md'), data: 'ok' },
      ]),
      dest,
      LIMITS,
    );
    expect(onDisk(dest)).toEqual([Buffer.from('a—b.md', 'utf8')]);
  });

  it.each([
    ['a raw C1 byte', 'pharn-oss-abc1234/evil-\x9b2J.md'],
    ['a truncated UTF-8 sequence', 'pharn-oss-abc1234/bad-\xe2\x80.md'],
    ['an overlong encoding of "/"', 'pharn-oss-abc1234/slash-\xc0\xaf.md'],
  ])(
    'refuses a name holding %s — not valid UTF-8 — writing nothing',
    (_label, name) => {
      const dest = tmp.path();
      let message = '';
      try {
        extractTar(githubArchive([{ name, data: 'x' }]), dest, LIMITS);
      } catch (err) {
        expect(err).toBeInstanceOf(TarExtractError);
        message = (err as Error).message;
      }
      expect(message).toMatch(/not valid UTF-8/);
      expect(hasUnsafeChars(message)).toBe(false);
      expect(onDisk(dest)).toEqual([]);
    },
  );

  it('refuses invalid UTF-8 in the ustar prefix too', () => {
    expect(() =>
      extractTar(
        githubArchive([{ name: 'f.md', prefix: 'pharn-oss-abc1234/d\x9b' }]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/not valid UTF-8/);
  });

  // A decoder's DEFAULT drops a leading byte-order mark: the name would be
  // written under a different name than the archive holds instead of refused.
  it('refuses a name field that starts with a byte-order mark, never strips it', () => {
    const dest = tmp.path();
    expect(() =>
      extractTar(
        githubArchive([
          {
            name: utf8AsLatin1('\ufeff' + 'f.md'), // BOM, then `f.md`
            prefix: 'pharn-oss-abc1234',
            data: 'x',
          },
        ]),
        dest,
        LIMITS,
      ),
    ).toThrow(/control or format character/);
    expect(onDisk(dest)).toEqual([]);
  });

  it('counts every pax global header toward the entry cap', () => {
    const empty: EntryInit = { name: 'pax_global_header', type: 'g', data: '' };
    expect(() =>
      extractTar(
        tar([
          empty,
          empty,
          empty,
          empty,
          { name: 'pharn-oss-abc1234/', type: '5' },
        ]),
        tmp.path(),
        { maxEntries: 3, maxTotalBytes: 1024 },
      ),
    ).toThrow(/more than 3 entries/);
  });

  it('names a malformed numeric field escaped — no raw newline reaches the message', () => {
    const bad = header({ name: 'pharn-oss-abc1234/f.txt' });
    bad.fill(0, 124, 136); // the size field
    bad.write('1\n Done', 124, 12, 'latin1');
    bad.write('        ', 148, 8, 'latin1'); // re-checksum over the forged field
    let sum = 0;
    for (const byte of bad) sum += byte;
    bad.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1');

    let message = '';
    try {
      extractTar(
        Buffer.concat([bad, Buffer.alloc(BLOCK * 2)]),
        tmp.path(),
        LIMITS,
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/non-octal numeric field/);
    expect(message).not.toContain('\n');
    expect(message).toContain('1\\x0a Done');
  });

  // PHARN-18: strict framing. Each case was ACCEPTED by the base source.
  const refusal = (archive: Buffer): string => {
    try {
      extractTar(archive, tmp.path(), LIMITS);
    } catch (err) {
      expect(err).toBeInstanceOf(TarExtractError);
      return (err as Error).message;
    }
    return 'accepted';
  };

  it('refuses entries hidden after a zero block mid-archive', () => {
    const archive = Buffer.concat([
      tar([GLOBAL_HEADER, { name: 'pharn-oss-abc1234/', type: '5' }]).subarray(
        0,
        -BLOCK, // keep ONE zero block, then keep going
      ),
      tar([{ name: 'pharn-oss-abc1234/hidden.md', data: 'x' }]),
    ]);
    expect(refusal(archive)).toMatch(/data after its end-of-archive marker/);
  });

  it('refuses trailing garbage after the end marker', () => {
    const archive = Buffer.concat([githubArchive([]), Buffer.from('garbage')]);
    expect(refusal(archive)).toMatch(/data after its end-of-archive marker/);
  });

  it('refuses an archive with no end-of-archive marker', () => {
    const archive = githubArchive([
      { name: 'pharn-oss-abc1234/a.md', data: 'x' },
    ]).subarray(0, -2 * BLOCK);
    expect(refusal(archive)).toMatch(/no end-of-archive marker/);
  });

  it('refuses a header without the ustar magic', () => {
    const archive = githubArchive([
      { name: 'pharn-oss-abc1234/a.md', data: 'x' },
    ]);
    // Blank the magic of the third header and re-seal its checksum, so the
    // magic check — not the checksum — is what refuses it.
    const at = 2 * BLOCK;
    archive.fill(0, at + 257, at + 263);
    archive.write('        ', at + 148, 8, 'latin1');
    let sum = 0;
    for (const byte of archive.subarray(at, at + BLOCK)) sum += byte;
    archive.write(
      sum.toString(8).padStart(6, '0') + '\0 ',
      at + 148,
      8,
      'latin1',
    );
    expect(refusal(archive)).toMatch(/missing "ustar" magic/);
  });

  it.each([['pharn-oss-abc1234/a//b.md'], ['pharn-oss-abc1234/a/./b.md']])(
    'refuses the empty or "." segment in %s',
    (name) => {
      expect(refusal(githubArchive([{ name, data: 'x' }]))).toMatch(
        /empty or "\." path segment/,
      );
    },
  );

  it('still extracts the codeload shape (one small global header, zero tail)', () => {
    expect(
      refusal(
        githubArchive([
          { name: 'pharn-oss-abc1234/SKILLS_VERSION', data: '1\n' },
        ]),
      ),
    ).toBe('accepted');
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

  // A GNU base-256 field sets the high bit of its first byte. No such byte is
  // an octal digit, so the non-octal check refuses it: 0x80 directly, and 0xA0
  // because only ASCII space is trimmed (String#trim would strip U+00A0 and
  // then read the octal digits behind it as the size).
  it.each([
    ['0x80', 0x80],
    ['0xa0 (U+00A0 in latin1)', 0xa0],
    ['0xff', 0xff],
  ])(
    'rejects a size field whose first byte is %s (GNU base-256), never misreading it',
    (_label, byte) => {
      const bytes = Buffer.concat([
        header({ name: 'pharn-oss-abc1234/', type: '5' }),
        header({
          name: 'pharn-oss-abc1234/f.txt',
          data: 'x',
          forgeSizeByte: byte,
        }),
        Buffer.alloc(BLOCK),
        Buffer.alloc(BLOCK * 2),
      ]);
      expect(() => extractTar(bytes, tmp.path(), LIMITS)).toThrow(
        /non-octal numeric field/,
      );
    },
  );

  // CORE-173: `\` and `:` in an entry name. POSIX writes `a\..\..\evil` as
  // ONE literal file name; win32 would read the same bytes as a path. pharn-oss
  // ships neither character, so either is refused, naming the entry.
  it.each([
    ['a backslash path', 'pharn-oss-abc1234/a\\..\\..\\evil'],
    ['a drive letter', 'pharn-oss-abc1234/C:/x'],
    ['a colon in a name', 'pharn-oss-abc1234/a:b.md'],
    ['a backslash in a directory segment', 'pharn-oss-abc1234/d\\e/f.md'],
  ])('refuses %s, writing nothing', (_label, name) => {
    const dest = tmp.path();
    let message = '';
    try {
      extractTar(githubArchive([{ name, data: 'x' }]), dest, LIMITS);
    } catch (err) {
      expect(err).toBeInstanceOf(TarExtractError);
      message = (err as Error).message;
    }
    expect(message).toMatch(/backslash or colon/);
    expect(message).toContain(name);
    expect(readdirSync(dest)).toEqual([]);
  });

  it('refuses a backslash or colon in the ustar prefix too', () => {
    expect(() =>
      extractTar(
        githubArchive([{ name: 'f.md', prefix: 'pharn-oss-abc1234/x:y' }]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/backslash or colon/);
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

  it('bounds the bytes written by the decompressed size (maxTotalBytes)', () => {
    // Moved from extractTar: the decompressed tar holds every byte an entry
    // writes, so gunzip's maxOutputLength is the one total-bytes bound.
    expect(() =>
      extractTarGz(
        gzipSync(
          githubArchive([
            { name: 'pharn-oss-abc1234/big.txt', data: 'x'.repeat(600) },
          ]),
        ),
        tmp.path(),
        { maxEntries: 100, maxTotalBytes: 100 },
      ),
    ).toThrow(/could not decompress/);
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

// CORE-173: the invariant fetchRepo states and clone-side readers rely on — the
// extracted tree holds only regular files and directories. Asserted on what is
// ON DISK (lstat), over the real codeload shape and over the partial tree a
// refused archive leaves behind before fetchRepo removes it.
describe('the extracted tree holds only regular files and directories', () => {
  const tmp = useTmpDir();

  /** Every path under `dir` that lstat says is neither a file nor a directory. */
  function nonFileOrDir(dir: string): string[] {
    const odd: string[] = [];
    for (const rel of readdirSync(dir, { recursive: true }) as string[]) {
      const st = lstatSync(join(dir, rel));
      if (!st.isFile() && !st.isDirectory()) odd.push(rel);
    }
    return odd;
  }

  it('over the codeload shape', () => {
    const dest = tmp.path();
    extractTarGz(
      codeloadArchive('0123456789abcdef0123456789abcdef01234567', {
        SKILLS_VERSION: '1.0.0\n',
        'pharn-review/a11y/a11y.md': '# a11y\n',
        '.claude/hooks/h.cjs': 'module.exports = 1;\n',
        '.claude/settings.json': '{}\n',
      }),
      dest,
      LIMITS,
    );
    expect(readdirSync(dest, { recursive: true }).length).toBeGreaterThan(4);
    expect(nonFileOrDir(dest)).toEqual([]);
  });

  it.each([
    ['a symlink', '2'],
    ['a hard link', '1'],
    ['a fifo', '6'],
    ['a pax extended header', 'x'],
  ])(
    'in the partial tree left when %s entry is refused part-way',
    (_label, type) => {
      const dest = tmp.path();
      expect(() =>
        extractTar(
          githubArchive([
            { name: 'pharn-oss-abc1234/d/', type: '5' },
            { name: 'pharn-oss-abc1234/d/before.md', data: 'x' },
            { name: 'pharn-oss-abc1234/d/odd', type },
          ]),
          dest,
          LIMITS,
        ),
      ).toThrow(TarExtractError);
      expect(readFileSync(join(dest, 'd/before.md'), 'utf8')).toBe('x');
      expect(nonFileOrDir(dest)).toEqual([]);
    },
  );

  // The invariant holds only while fetchRepo is the one place a clone is made.
  // If another src/ file starts extracting or creating temp trees, the
  // clone-side readers that skip symlink checks would trust a tree nobody
  // vouched for — so that is a failure here, not a code-review hope.
  it('fetchRepo (src/lib/repo.ts) is the only producer of a clone tree', () => {
    const srcDir = join(import.meta.dirname, '..', 'src');
    const producers: string[] = [];
    for (const rel of readdirSync(srcDir, { recursive: true }) as string[]) {
      if (!rel.endsWith('.ts') || rel.includes('.updated.')) continue;
      const text = readFileSync(join(srcDir, rel), 'utf8');
      if (/\b(extractTarGz|extractTar|mkdtempSync|mkdtemp)\s*\(/.test(text)) {
        producers.push(rel.split('\\').join('/'));
      }
    }
    expect(producers.sort()).toEqual(['lib/repo.ts', 'lib/tar-extract.ts']);
  });
});
