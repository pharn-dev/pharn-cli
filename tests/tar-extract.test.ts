import { lstatSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  extractTar,
  extractTarGz,
  TarExtractError,
} from '../src/lib/tar-extract.js';
import type { ExtractOptions, TarLimits } from '../src/lib/tar-extract.js';
import { hasUnsafeChars } from '../src/lib/terminal-safe.js';
import { codeloadArchive } from './support/tar-fixture.js';

// Fixtures are built here, byte by byte, rather than shelled out to `tar`.
// That is the whole point: the entries worth testing are the ones a system tar
// refuses to write — an absolute path, a `..` segment, a device node, a header
// whose checksum does not match. A fixture generator that can only produce
// well-formed archives cannot exercise a single rejection.
//
// CORE-386: the extractor writes only the SELECTED paths (pharn-install.json's
// list plus the files the CLI reads). Every block below states which side of
// the selection its entry sits on: outside it, any entry is skipped and nothing
// is written for it; at a selected path, every rule applies.

const BLOCK = 512;
const CAPS: TarLimits = {
  maxHeaders: 1000,
  maxScannedBytes: 8 * 1024 * 1024,
  maxWrittenBytes: 1024 * 1024,
};
/** An escape byte, written as a code point so no raw control char sits in this source. */
const ESC = '\u001b';
const ROOT = 'pharn-oss-abc1234';
const at = (rel: string): string => `${ROOT}/${rel}`;

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
 * be solved for.
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
  return tar([GLOBAL_HEADER, { name: `${ROOT}/`, type: '5' }, ...entries]);
}

/** One selected file every archive below carries, so "nothing else" is visible. */
const KEEP: EntryInit = { name: at('SKILLS_VERSION'), data: '1.0.0\n' };

function opts(
  select: Iterable<string> = ['SKILLS_VERSION'],
  limits: TarLimits = CAPS,
): ExtractOptions {
  return { select: new Set(select), limits };
}

/** Every path under `dir`, files and directories, relative and sorted. */
function treeOf(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((p) => p.split('\\').join('/'))
    .sort();
}

/** Every path under `dir` that lstat says is neither a file nor a directory. */
function nonFileOrDir(dir: string): string[] {
  return treeOf(dir).filter((rel) => {
    const st = lstatSync(join(dir, rel));
    return !st.isFile() && !st.isDirectory();
  });
}

// One temp dir per test; `fresh()` hands out an empty directory inside it.
const tmp = useTmpDir();
const fresh = (): string => mkdtempSync(join(tmp.path(), 'dest-'));

/** The refusal message, or 'accepted'. */
function refusal(archive: Buffer, options = opts(), dest = fresh()): string {
  try {
    extractTar(archive, dest, options);
  } catch (err) {
    expect(err).toBeInstanceOf(TarExtractError);
    return (err as Error).message;
  }
  return 'accepted';
}

const utf8AsLatin1 = (s: string): string =>
  Buffer.from(s, 'utf8').toString('latin1');

/**
 * The options the base-fixture cases extract with: every path they use is
 * selected (keys are the raw header bytes as latin1, below the root), so each
 * is judged by the full rules, as every entry was before CORE-386.
 */
const LIMITS: ExtractOptions = {
  select: new Set([
    'f.txt',
    '../escape.txt',
    'nested/../../escape.txt',
    'loose.txt',
    'link',
    `n${ESC}[2K\r${ESC}[32mOK`,
    utf8AsLatin1('evil\u202egnp.md'),
    utf8AsLatin1('se\u200bcurity.md'),
    `d${ESC}x/f.md`,
    utf8AsLatin1('a\u2028b.md'),
    'evil-\x9b2J.md',
    'bad-\xe2\x80.md',
    'slash-\xc0\xaf.md',
    'a\\..\\..\\evil',
    'C:/x',
    'a:b.md',
    'd\\e/f.md',
  ]),
  limits: CAPS,
};

// What is written.
describe('extractTar', () => {
  it('strips one component and writes the tree', () => {
    const dest = fresh();
    const result = extractTar(
      githubArchive([
        KEEP,
        { name: at('pharn-review/'), type: '5' },
        { name: at('pharn-review/a11y.md'), data: '# a11y\n' },
        { name: at('pharn-review/unlisted.md'), data: 'not listed\n' },
        { name: at('README.md'), data: 'not listed\n' },
      ]),
      dest,
      opts(['SKILLS_VERSION', 'pharn-review/a11y.md']),
    );

    expect(treeOf(dest)).toEqual([
      'SKILLS_VERSION',
      'pharn-review',
      'pharn-review/a11y.md',
    ]);
    expect(readFileSync(join(dest, 'SKILLS_VERSION'), 'utf8')).toBe('1.0.0\n');
    expect(readFileSync(join(dest, 'pharn-review/a11y.md'), 'utf8')).toBe(
      '# a11y\n',
    );
    expect([...result.written].sort()).toEqual([
      'SKILLS_VERSION',
      'pharn-review/a11y.md',
    ]);
    expect(result.bytes).toBe(6 + 7);
    expect(result.root).toBe(ROOT);
  });

  it('writes nothing, and reports no root, when nothing is selected', () => {
    const dest = fresh();
    const result = extractTar(githubArchive([KEEP]), dest, opts([]));
    expect(treeOf(dest)).toEqual([]);
    expect(result).toEqual({ written: new Set(), bytes: 0, root: null });
  });

  it('writes a selected empty file', () => {
    const dest = fresh();
    extractTar(
      githubArchive([{ name: at('MIN_CLI'), data: '' }]),
      dest,
      opts(['MIN_CLI']),
    );
    expect(readFileSync(join(dest, 'MIN_CLI'), 'utf8')).toBe('');
  });

  it('skips the leading pax_global_header instead of rejecting it', () => {
    // The anti-regression for the 100%-failure bug: `pax_global_header` is a
    // single segment with nothing to strip, so judging it fails the FIRST
    // block of every real archive while every hand-made fixture passes.
    const dest = fresh();
    extractTar(githubArchive([KEEP]), dest, opts());
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });

  // A `g` default is never honoured: pharn reads only the ustar fields, so the
  // entries after it land at their own ustar paths.
  it.each([['path'], ['linkpath'], ['size']])(
    'skips a pax global header setting a default %s=, never honouring it',
    (keyword) => {
      const dest = fresh();
      extractTar(
        tar([
          {
            name: 'pax_global_header',
            type: 'g',
            data: paxRecord(keyword, 'elsewhere'),
          },
          { name: `${ROOT}/`, type: '5' },
          { name: at('f.txt'), data: 'x' },
        ]),
        dest,
        opts(['f.txt']),
      );
      expect(treeOf(dest)).toEqual(['f.txt']);
      expect(readFileSync(join(dest, 'f.txt'), 'utf8')).toBe('x');
    },
  );

  it('skips a pax global header whose payload does not parse, unread', () => {
    const dest = fresh();
    extractTar(
      tar([
        { name: 'pax_global_header', type: 'g', data: '7 comment=xyz\n' },
        { name: `${ROOT}/`, type: '5' },
        KEEP,
      ]),
      dest,
      opts(),
    );
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });

  it('still skips the global header GitHub actually sends', () => {
    const dest = fresh();
    extractTar(githubArchive([KEEP]), dest, opts());
    expect(readFileSync(join(dest, 'SKILLS_VERSION'), 'utf8')).toBe('1.0.0\n');
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });

  it('skips a global header carrying metadata and vendor records', () => {
    const dest = fresh();
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
        { name: `${ROOT}/`, type: '5' },
        KEEP,
      ]),
      dest,
      opts(),
    );
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });

  it('skips a global header whose payload spans more than one block', () => {
    const dest = fresh();
    const big = paxRecord('comment', 'q'.repeat(1200));
    expect(big.length).toBeGreaterThan(BLOCK * 2);
    extractTar(
      tar([
        { name: 'pax_global_header', type: 'g', data: big },
        { name: `${ROOT}/`, type: '5' },
        KEEP,
      ]),
      dest,
      opts(),
    );
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });

  it('still extracts the codeload shape (one small global header, zero tail)', () => {
    expect(refusal(githubArchive([KEEP]))).toBe('accepted');
  });

  it('skips a file with no component to strip, writing nothing for it', () => {
    // Formerly refused. Its name has no `/`, so it can never be a selected
    // path: it is skipped like any other entry pharn does not install.
    const dest = fresh();
    extractTar(
      tar([GLOBAL_HEADER, { name: 'loose.txt', data: 'x' }]),
      dest,
      opts(),
    );
    expect(treeOf(dest)).toEqual([]);
  });

  // tar-entry-names: a selected path is decoded once, strictly, and the check,
  // the path rules and the write share that one string; asserted on the BYTES
  // the filesystem returns.
  it('writes a non-ASCII name as exactly the archive bytes', () => {
    const dest = fresh();
    extractTar(
      tar([
        GLOBAL_HEADER,
        { name: utf8AsLatin1('pharn-oss-a—b/SKILLS_VERSION'), data: 'ok' },
        { name: utf8AsLatin1('pharn-oss-a—b/a—b.md'), data: 'unlisted' },
      ]),
      dest,
      opts(),
    );
    expect(readdirSync(dest, { encoding: 'buffer' })).toEqual([
      Buffer.from('SKILLS_VERSION', 'utf8'),
    ]);
  });

  it('reassembles a path split across prefix and name', () => {
    // ustar splits any path over 100 chars: the tail goes in `name`, the head
    // in `prefix`. Reading `name` alone would miss the file entirely.
    const deep = 'a'.repeat(40);
    const rel = `${deep}/${deep}/regression-report.json`;
    const dest = fresh();
    extractTar(
      githubArchive([
        {
          prefix: `${ROOT}/${deep}/${deep}`,
          name: 'regression-report.json',
          data: '{}',
        },
      ]),
      dest,
      opts([rel]),
    );
    expect(readFileSync(join(dest, rel), 'utf8')).toBe('{}');
  });

  it('still extracts an ordinary non-ASCII name', () => {
    const dest = fresh();
    extractTar(
      tar([
        GLOBAL_HEADER,
        { name: utf8AsLatin1('pharn-oss-café/SKILLS_VERSION'), data: 'ok' },
      ]),
      dest,
      opts(),
    );
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });

  it('holds a later pass to the root an earlier pass learned', () => {
    const archive = githubArchive([KEEP]);
    expect(refusal(archive, { ...opts(), root: 'pharn-oss-other' })).toMatch(
      /more than one root component: pharn-oss-other and/,
    );
    expect(refusal(archive, { ...opts(), root: ROOT })).toBe('accepted');
  });
});

// The decision this file used to pin was "reject a symlink entry outright,
// rather than skipping it": degit dropped such entries silently, and a dropped
// entry could be a file pharn installs. It is NARROWED here, not reversed: an
// entry outside the selection is skipped and never written (nothing unlisted
// touches disk, so skipping is strictly safer than judging), while an entry at
// a selected path is still refused. A listed file that a skipped entry stood in
// for — a symlink, or a file a pax record renamed — is missing from the tree,
// and the manifest's sha256 check (verifyUpstreamManifest) refuses it loudly:
// the silent loss degit allowed cannot recur.
// Outside the selection: skipped, nothing written.
describe('extractTar', () => {
  it.each<[string, EntryInit[]]>([
    ['a symlink', [{ name: at('.claude/skills/x'), type: '2' }]],
    ['a hard link', [{ name: at('link'), type: '1' }]],
    ['a character device', [{ name: at('dev'), type: '3' }]],
    ['a block device', [{ name: at('blk'), type: '4' }]],
    ['a fifo', [{ name: at('fifo'), type: '6' }]],
    ['an unknown type', [{ name: at('odd'), type: '9' }]],
    ['a directory', [{ name: at('.dev/'), type: '5' }]],
    [
      'a pax extended header and the entry it renames',
      [
        {
          name: at('PaxHeaders/long'),
          type: 'x',
          data: paxRecord('path', at(`${'d'.repeat(120)}/f.md`)),
        },
        { name: at('0123456789abcdef.data'), data: 'x' },
      ],
    ],
    [
      'a GNU long name and the entry it renames',
      [
        { name: '././@LongLink', type: 'L', data: at('x'.repeat(150)) },
        { name: at('xxxxxxxx'), data: 'x' },
      ],
    ],
    [
      'a GNU long link name and its symlink',
      [
        { name: '././@LongLink', type: 'K', data: 'y'.repeat(150) },
        { name: at('l'), type: '2' },
      ],
    ],
    ['a name with a colon', [{ name: at('a:b.md'), data: 'x' }]],
    ['a name with a backslash', [{ name: at('a\\..\\..\\evil'), data: 'x' }]],
    ['an invalid UTF-8 name', [{ name: at('bad-\x9b2J.md'), data: 'x' }]],
    ['an escape sequence in a name', [{ name: at(`n${ESC}[2K`), data: 'x' }]],
    [
      'a right-to-left override',
      [{ name: utf8AsLatin1(at('evil\u202egnp.md')), data: 'x' }],
    ],
    ['an absolute path', [{ name: '/etc/passwd', data: 'x' }]],
    ['a `..` segment', [{ name: at('../escape.txt'), data: 'x' }]],
    ['a second root', [{ name: 'somewhere-else/evil.txt', data: 'x' }]],
    ['a file with no root', [{ name: 'loose.txt', data: 'x' }]],
    ['an empty segment', [{ name: at('a//b.md'), data: 'x' }]],
  ])('installs past %s and writes nothing for it', (_label, entries) => {
    const dest = fresh();
    const result = extractTar(githubArchive([...entries, KEEP]), dest, opts());
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
    expect([...result.written]).toEqual(['SKILLS_VERSION']);
    expect(nonFileOrDir(dest)).toEqual([]);
  });

  it('a pax header modifies only the next entry: the selected file after it is written', () => {
    const dest = fresh();
    extractTar(
      githubArchive([
        { name: at('PaxHeaders/x'), type: 'x', data: paxRecord('size', '1') },
        { name: at('unlisted.md'), data: 'x' },
        KEEP,
      ]),
      dest,
      opts(),
    );
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });

  it('bounds only the bytes written: an unselected file over the cap is skipped', () => {
    const dest = fresh();
    extractTar(
      githubArchive([{ name: at('big.bin'), data: 'x'.repeat(4096) }, KEEP]),
      dest,
      opts(['SKILLS_VERSION'], { ...CAPS, maxWrittenBytes: 100 }),
    );
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });
});

// At a selected path: refused.
describe('extractTar', () => {
  it('refuses a selected file that follows a GNU long name, whose records pharn does not honour', () => {
    expect(
      refusal(
        githubArchive([{ name: '././@LongLink', type: 'L', data: 'x' }, KEEP]),
      ),
    ).toMatch(/whose records pharn does not honour/);
  });

  it('a pax global header between the extended header and the file does not lift the refusal', () => {
    expect(
      refusal(
        githubArchive([
          { name: at('PaxHeaders/x'), type: 'x', data: '' },
          { name: 'pax_global_header', type: 'g', data: '' },
          KEEP,
        ]),
      ),
    ).toMatch(/whose records pharn does not honour/);
  });

  it('rejects an absolute path', () => {
    expect(
      refusal(tar([GLOBAL_HEADER, { name: '/SKILLS_VERSION', data: 'x' }])),
    ).toMatch(/absolute path/);
  });

  it('refuses a "." root', () => {
    expect(
      refusal(tar([GLOBAL_HEADER, { name: './SKILLS_VERSION', data: 'x' }])),
    ).toMatch(/no leading component/);
  });

  it('refuses a backslash or colon in the ustar prefix too', () => {
    expect(
      refusal(tar([{ prefix: 'x:y', name: 'SKILLS_VERSION', data: 'x' }])),
    ).toMatch(/backslash or colon/);
  });

  it.each([['a//b.md'], ['a/./b.md']])(
    'refuses the empty or "." segment in %s',
    (rel) => {
      expect(
        refusal(githubArchive([{ name: at(rel), data: 'x' }]), opts([rel])),
      ).toMatch(/empty or "\." path segment/);
    },
  );

  it('rejects a second root component', () => {
    expect(
      refusal(
        githubArchive([KEEP, { name: 'elsewhere/MIN_CLI', data: '1.0.0' }]),
        opts(['SKILLS_VERSION', 'MIN_CLI']),
      ),
    ).toMatch(/more than one root component/);
  });

  it('refuses a selected path the archive holds twice', () => {
    const dest = fresh();
    const message = refusal(githubArchive([KEEP, KEEP]), opts(), dest);
    expect(message).toMatch(/holds this path twice/);
    expect(message).toContain(at('SKILLS_VERSION'));
  });

  // A decoder's DEFAULT drops a leading byte-order mark: the name would be
  // written under a different name than the archive holds instead of refused.
  it('refuses a name field that starts with a byte-order mark, never strips it', () => {
    const dest = fresh();
    expect(
      refusal(
        tar([
          GLOBAL_HEADER,
          {
            name: utf8AsLatin1('\ufeff' + 'root/SKILLS_VERSION'),
            data: 'x',
          },
        ]),
        opts(),
        dest,
      ),
    ).toMatch(/control or format character/);
    expect(treeOf(dest)).toEqual([]);
  });

  it('refuses an unsafe name even on an unsupported-type entry (path judged first)', () => {
    expect(
      refusal(tar([{ name: `n${ESC}[32mOK/SKILLS_VERSION`, type: '2' }])),
    ).toMatch(/control or format character/);
  });

  it('renders an unprintable typeflag as its code, not the raw byte', () => {
    const message = refusal(
      githubArchive([{ name: at('SKILLS_VERSION'), type: ESC }]),
    );
    expect(message).toContain('unsupported type 0x1b');
    expect(message).not.toContain(ESC);
  });

  it('refuses invalid UTF-8 in the ustar prefix too', () => {
    expect(
      refusal(tar([{ name: 'SKILLS_VERSION', prefix: 'd\x9b', data: 'x' }])),
    ).toMatch(/not valid UTF-8/);
  });
});

// The rules a SELECTED entry is held to, over the base fixtures: `LIMITS`
// selects each path these cases use (as latin1 keys, byte for byte), so every
// entry below is judged exactly as before CORE-386.
describe('extractTar', () => {
  const onDisk = (dir: string): Buffer[] =>
    readdirSync(dir, { encoding: 'buffer' });

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

  it.each([
    ['a `..` segment', 'pharn-oss-abc1234/../escape.txt'],
    ['a deeper `..` segment', 'pharn-oss-abc1234/nested/../../escape.txt'],
  ])('rejects %s', (_label, name) => {
    expect(() =>
      extractTar(githubArchive([{ name, data: 'x' }]), tmp.path(), LIMITS),
    ).toThrow(TarExtractError);
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
    ['a directory', '5'],
    ['a pax global header', 'g'],
  ])('rejects %s entry outright, rather than skipping it', (_label, type) => {
    // At a selected path only (`link` is in LIMITS.select): outside the
    // selection the same entry is skipped (see the block above).
    expect(() =>
      extractTar(
        githubArchive([{ name: 'pharn-oss-abc1234/link', type }]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/unsupported type/);
  });

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

  it('rejects a file with no component to strip', () => {
    // `loose.txt` is selected: a rootless copy of a listed file is refused,
    // not skipped. No preceding root entry, so the strip-1 rule rejects it.
    expect(() =>
      extractTar(
        tar([GLOBAL_HEADER, { name: 'loose.txt', data: 'x' }]),
        tmp.path(),
        LIMITS,
      ),
    ).toThrow(/no path below the archive root/);
  });
});

// Framing is checked on EVERY header: without it the walk cannot find the next
// header, so these stay refusals whatever the entry is.
// Framing, on every header.
describe('extractTar', () => {
  it('refuses entries hidden after a zero block mid-archive', () => {
    const archive = Buffer.concat([
      tar([GLOBAL_HEADER, { name: `${ROOT}/`, type: '5' }]).subarray(
        0,
        -BLOCK, // keep ONE zero block, then keep going
      ),
      tar([KEEP]),
    ]);
    expect(refusal(archive)).toMatch(/data after its end-of-archive marker/);
  });

  it('refuses trailing garbage after the end marker', () => {
    const archive = Buffer.concat([githubArchive([]), Buffer.from('garbage')]);
    expect(refusal(archive)).toMatch(/data after its end-of-archive marker/);
  });

  it('refuses an archive with no end-of-archive marker', () => {
    const archive = githubArchive([KEEP]).subarray(0, -2 * BLOCK);
    expect(refusal(archive)).toMatch(/no end-of-archive marker/);
  });

  it('rejects a truncated archive', () => {
    const dest = fresh();
    const full = githubArchive([
      { name: at('SKILLS_VERSION'), data: 'x'.repeat(600) },
    ]);
    // Header blocks 0-2, then 512 of the 600 payload bytes.
    expect(refusal(full.subarray(0, BLOCK * 4), opts(), dest)).toMatch(
      /runs past the end of the archive — truncated/,
    );
    expect(treeOf(dest)).toEqual([]);
  });

  it('refuses a header without the ustar magic', () => {
    const archive = githubArchive([{ name: at('a.md'), data: 'x' }, KEEP]);
    // Blank the magic of the third header and re-seal its checksum, so the
    // magic check — not the checksum — is what refuses it.
    const off = 2 * BLOCK;
    archive.fill(0, off + 257, off + 263);
    archive.write('        ', off + 148, 8, 'latin1');
    let sum = 0;
    for (const byte of archive.subarray(off, off + BLOCK)) sum += byte;
    archive.write(
      sum.toString(8).padStart(6, '0') + '\0 ',
      off + 148,
      8,
      'latin1',
    );
    expect(refusal(archive)).toMatch(/missing "ustar" magic/);
  });

  it('rejects a header whose checksum does not match', () => {
    expect(
      refusal(
        githubArchive([
          { name: at('f.txt'), data: 'x', forgeChecksum: '000000\0 ' },
          KEEP,
        ]),
      ),
    ).toMatch(/checksum/);
  });

  it('names a malformed numeric field escaped — no raw newline reaches the message', () => {
    const bad = header({ name: at('f.txt') });
    bad.fill(0, 124, 136); // the size field
    bad.write('1\n Done', 124, 12, 'latin1');
    bad.write('        ', 148, 8, 'latin1'); // re-checksum over the forged field
    let sum = 0;
    for (const byte of bad) sum += byte;
    bad.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1');

    const message = refusal(Buffer.concat([bad, Buffer.alloc(BLOCK * 2)]));
    expect(message).toMatch(/non-octal numeric field/);
    expect(message).not.toContain('\n');
    expect(message).toContain('1\\x0a Done');
  });
});

// Caps.
describe('extractTar', () => {
  it('enforces the entry-count cap', () => {
    // Every header counts, selected or not: the cap bounds the walk itself.
    const many = Array.from({ length: 5 }, (_, i) => ({
      name: at(`f${i}.txt`),
      data: 'x',
    }));
    expect(() =>
      extractTar(githubArchive(many), fresh(), {
        select: new Set(),
        limits: { ...CAPS, maxHeaders: 3 },
      }),
    ).toThrow(/more than 3 headers/);
  });

  it('counts every pax global header toward the entry cap', () => {
    const empty: EntryInit = { name: 'pax_global_header', type: 'g', data: '' };
    const limits = { ...CAPS, maxHeaders: 3 };
    expect(
      refusal(tar([empty, empty, empty, empty]), opts([], limits)),
    ).toMatch(/more than 3 headers/);
    expect(
      refusal(
        githubArchive([{ name: at('a'), data: 'x' }, KEEP]),
        opts(['SKILLS_VERSION'], limits),
      ),
    ).toMatch(/more than 3 headers/);
    expect(
      refusal(githubArchive([KEEP]), opts(['SKILLS_VERSION'], limits)),
    ).toBe('accepted');
  });

  it('refuses selected files whose sizes exceed maxWrittenBytes', () => {
    const dest = fresh();
    const message = refusal(
      githubArchive([KEEP, { name: at('big.md'), data: 'x'.repeat(600) }]),
      opts(['SKILLS_VERSION', 'big.md'], { ...CAPS, maxWrittenBytes: 100 }),
      dest,
    );
    expect(message).toMatch(/exceed 100 bytes/);
    // Refused at the header, before the payload is collected.
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });

  it('refuses a stream over maxScannedBytes', () => {
    expect(
      refusal(
        githubArchive([{ name: at('pad'), data: 'x'.repeat(4096) }, KEEP]),
        opts(['SKILLS_VERSION'], { ...CAPS, maxScannedBytes: 2048 }),
      ),
    ).toMatch(/decompresses to more than 2048 bytes/);
  });
});

// Production chunks (gunzip's 16 KiB) are block-aligned, so a header or payload
// straddling two chunks never happens there; it is forced here.
describe('extractTar — chunk boundaries', () => {
  const archive = githubArchive([
    { name: at('a.md'), data: 'a'.repeat(700) },
    KEEP,
    { name: at('.claude/skills/x'), type: '2' },
    { name: at('d/b.md'), data: 'b'.repeat(1300) },
    { name: at('MIN_CLI'), data: '' },
  ]);
  const select = ['a.md', 'SKILLS_VERSION', 'd/b.md', 'MIN_CLI'];

  function chunked(bytes: Buffer, size: number): Buffer[] {
    const out: Buffer[] = [];
    for (let i = 0; i < bytes.length; i += size)
      out.push(bytes.subarray(i, i + size));
    return out;
  }

  function snapshot(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const rel of treeOf(dir)) {
      if (lstatSync(join(dir, rel)).isFile())
        out[rel] = readFileSync(join(dir, rel), 'utf8');
    }
    return out;
  }

  it.each([[1], [7], [511], [513], [1500]])(
    'gives the same tree in %i-byte chunks as in one buffer',
    (size) => {
      const whole = fresh();
      const parts = fresh();
      const a = extractTar(archive, whole, opts(select));
      const b = extractTar(chunked(archive, size), parts, opts(select));
      expect(snapshot(parts)).toEqual(snapshot(whole));
      expect(b).toEqual(a);
      expect(Object.keys(snapshot(whole)).sort()).toEqual([...select].sort());
    },
  );

  it('still refuses data after the end marker when it arrives in a later chunk', () => {
    const tail = Buffer.concat([archive, Buffer.alloc(BLOCK)]);
    tail[tail.length - 1] = 1;
    expect(() => extractTar(chunked(tail, 300), fresh(), opts(select))).toThrow(
      /data after its end-of-archive marker/,
    );
  });
});

describe('extractTarGz', () => {
  it('decompresses and extracts', async () => {
    const dest = fresh();
    const result = await extractTarGz(
      gzipSync(githubArchive([KEEP, { name: at('other'), data: 'x' }])),
      dest,
      opts(),
    );
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
    expect(result.root).toBe(ROOT);
  });

  it('surfaces corrupt gzip as a TarExtractError', async () => {
    await expect(
      extractTarGz(Buffer.from('not a gzip stream'), fresh(), opts()),
    ).rejects.toThrow(/could not decompress the fetched archive/);
  });

  it('rethrows a refusal from the walk as itself, not as a gzip failure', async () => {
    const err = await extractTarGz(
      gzipSync(githubArchive([{ name: at('SKILLS_VERSION'), type: '2' }])),
      fresh(),
      opts(),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TarExtractError);
    expect((err as Error).message).toMatch(/unsupported type '2'/);
  });

  // The name is the base test's: the decompressed stream is still capped
  // (maxTotalBytes became maxScannedBytes, now counted as the tar streams), and
  // no file can be written past that cap. The written-byte cap is the next test.
  it('bounds the bytes written by the decompressed size (maxTotalBytes)', async () => {
    await expect(
      extractTarGz(
        gzipSync(
          githubArchive([
            { name: 'pharn-oss-abc1234/big.txt', data: 'x'.repeat(600) },
          ]),
        ),
        tmp.path(),
        {
          select: new Set(['big.txt']),
          limits: { ...CAPS, maxScannedBytes: 100 },
        },
      ),
    ).rejects.toThrow(/decompresses to more than 100 bytes/);
  });

  it('bounds the bytes written by the selected sizes (maxWrittenBytes)', async () => {
    // Formerly gunzip's decompressed-size cap: the tar is streamed now, so the
    // cap applies to the bytes written, not to the whole repository.
    await expect(
      extractTarGz(
        gzipSync(
          githubArchive([
            { name: 'pharn-oss-abc1234/big.txt', data: 'x'.repeat(600) },
          ]),
        ),
        tmp.path(),
        {
          select: new Set(['big.txt']),
          limits: { ...CAPS, maxWrittenBytes: 100 },
        },
      ),
    ).rejects.toThrow(/exceed 100 bytes/);
  });

  it('refuses a truncated gzip stream', async () => {
    const gz = gzipSync(githubArchive([KEEP]));
    await expect(
      extractTarGz(gz.subarray(0, gz.length - 20), fresh(), opts()),
    ).rejects.toThrow(TarExtractError);
  });

  it('caps the DECOMPRESSED size, so a zip bomb is bounded', async () => {
    // Neither content-length nor the compressed size bounds this: 4 MB of
    // zeros gzips to a few kilobytes.
    const bomb = gzipSync(
      githubArchive([
        { name: at('bomb'), data: '\0'.repeat(4 * 1024 * 1024) },
        KEEP,
      ]),
    );
    expect(bomb.length).toBeLessThan(64 * 1024);
    await expect(
      extractTarGz(
        bomb,
        fresh(),
        opts(['SKILLS_VERSION'], { ...CAPS, maxScannedBytes: 65536 }),
      ),
    ).rejects.toThrow(/decompresses to more than 65536 bytes/);
  });

  it('installs from a repo larger than maxWrittenBytes when the selected files fit', async () => {
    const dest = fresh();
    await extractTarGz(
      gzipSync(
        githubArchive([
          { name: at('.dev/huge'), data: 'z'.repeat(1024 * 1024) },
          KEEP,
        ]),
      ),
      dest,
      opts(['SKILLS_VERSION'], { ...CAPS, maxWrittenBytes: 4096 }),
    );
    expect(treeOf(dest)).toEqual(['SKILLS_VERSION']);
  });
});

// The invariant fetchRepo states and clone-side readers rely on: the extracted
// tree holds only regular files and directories. Asserted on what is ON DISK
// (lstat), over the codeload shape with every kind of entry outside the
// selection.
describe('the extracted tree holds only regular files and directories', () => {
  it('over the codeload shape', async () => {
    const dest = fresh();
    await extractTarGz(
      codeloadArchive('0123456789abcdef0123456789abcdef01234567', {
        SKILLS_VERSION: '1.0.0\n',
        'pharn-review/a11y/a11y.md': '# a11y\n',
        '.claude/hooks/h.cjs': 'module.exports = 1;\n',
        '.claude/settings.json': '{}\n',
      }),
      dest,
      opts([
        'SKILLS_VERSION',
        'pharn-review/a11y/a11y.md',
        '.claude/hooks/h.cjs',
        '.claude/settings.json',
      ]),
    );
    expect(treeOf(dest).length).toBeGreaterThan(4);
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
      const dest = fresh();
      expect(() =>
        extractTar(
          githubArchive([
            { name: at('d/before.md'), data: 'x' },
            { name: at('d/skipped'), type },
            { name: at('d/odd'), type },
          ]),
          dest,
          opts(['d/before.md', 'd/odd']),
        ),
      ).toThrow(TarExtractError);
      expect(readFileSync(join(dest, 'd/before.md'), 'utf8')).toBe('x');
      expect(nonFileOrDir(dest)).toEqual([]);
    },
  );
});
