import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  buildRecords,
  mergeRecords,
  readRecords,
  recordsBaseline,
  RECORDS_FILE,
  RECORDS_SCHEMA_VERSION,
  writeRecords,
} from '../src/lib/install-records.js';
import { tmpPathFor } from '../src/lib/atomic-write.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function writeStore(cwd: string, store: unknown): void {
  writeFileSync(join(cwd, RECORDS_FILE), JSON.stringify(store));
}

const STAMP = { skillsVersion: '1.0.0', commit: null };

function validStore(files: Record<string, string> = { 'a.md': sha('a') }) {
  return {
    schemaVersion: RECORDS_SCHEMA_VERSION,
    skillsVersion: '1.0.0',
    commit: null,
    files,
  };
}

describe('buildRecords — hashes the DEST, never the source', () => {
  const tmp = useTmpDir();

  it('records the bytes actually on disk at each path', () => {
    const proj = tmp.path();
    write(join(proj, 'CONSTITUTION.md'), 'landed bytes');
    write(join(proj, 'nested/deep/file.md'), 'other');

    const records = buildRecords(proj, [
      'CONSTITUTION.md',
      'nested/deep/file.md',
    ]);

    expect(records).toEqual({
      'CONSTITUTION.md': sha('landed bytes'),
      'nested/deep/file.md': sha('other'),
    });
  });

  it('a source and a dest with DIFFERENT bytes record the dest (the point of the design)', () => {
    const proj = tmp.path();
    write(join(proj, 'src.md'), 'upstream');
    write(join(proj, 'dest.md'), 'what landed');
    expect(buildRecords(proj, ['dest.md'])['dest.md']).toBe(sha('what landed'));
    expect(buildRecords(proj, ['dest.md'])['dest.md']).not.toBe(
      sha('upstream'),
    );
  });

  it('contributes no record for an absent path or a directory', () => {
    const proj = tmp.path();
    mkdirSync(join(proj, 'adir'), { recursive: true });
    expect(buildRecords(proj, ['nope.md', 'adir'])).toEqual({});
  });

  it('contributes no record for a symlink (the installer never materializes one)', () => {
    const proj = tmp.path();
    write(join(proj, 'real.md'), 'r');
    symlinkSync(join(proj, 'real.md'), join(proj, 'link.md'));
    expect(buildRecords(proj, ['link.md'])).toEqual({});
  });
});

describe('readRecords — validation is fail-closed and NAMES the failure', () => {
  const tmp = useTmpDir();

  it('absent → { kind: absent } (a legacy install, not an error)', () => {
    expect(readRecords(tmp.path())).toEqual({ kind: 'absent' });
  });

  it('round-trips a store it wrote', async () => {
    const proj = tmp.path();
    await writeRecords(proj, {
      skillsVersion: '1.2.0',
      commit: 'a'.repeat(40),
      files: { 'b.md': sha('b') },
    });
    const read = readRecords(proj);
    expect(read).toMatchObject({
      kind: 'ok',
      store: {
        schemaVersion: RECORDS_SCHEMA_VERSION,
        skillsVersion: '1.2.0',
        commit: 'a'.repeat(40),
        files: { 'b.md': sha('b') },
      },
    });
  });

  it('sorts keys on write so the committed file has a reviewable diff', async () => {
    const proj = tmp.path();
    await writeRecords(proj, {
      ...STAMP,
      files: { 'z.md': sha('z'), 'a.md': sha('a'), 'm.md': sha('m') },
    });
    const raw = readFileSync(join(proj, RECORDS_FILE), 'utf8');
    expect(Object.keys(JSON.parse(raw).files)).toEqual([
      'a.md',
      'm.md',
      'z.md',
    ]);
  });

  it.each([
    ['not JSON at all', 'not json{', /not valid JSON/],
    ['a JSON array', '[]', /not a JSON object/],
  ])('%s → invalid, named', (_label, body, expected) => {
    const proj = tmp.path();
    writeFileSync(join(proj, RECORDS_FILE), body);
    const read = readRecords(proj);
    expect(read.kind).toBe('invalid');
    expect(read.kind === 'invalid' && read.message).toMatch(expected);
  });

  it('an unknown schemaVersion is never guessed at — it is invalid, by exact match (P5)', () => {
    const proj = tmp.path();
    writeStore(proj, { ...validStore(), schemaVersion: 99 });
    const read = readRecords(proj);
    expect(read.kind).toBe('invalid');
    expect(read.kind === 'invalid' && read.message).toMatch(/schemaVersion/);
  });

  it('a non-sha256 hash value invalidates the whole store (fail closed, not per-entry)', () => {
    const proj = tmp.path();
    writeStore(proj, validStore({ 'a.md': 'deadbeef' }));
    const read = readRecords(proj);
    expect(read.kind).toBe('invalid');
    expect(read.kind === 'invalid' && read.message).toMatch(/invalid hash/);
  });

  it('an uppercase hash is rejected (the regex is exact, not case-insensitive)', () => {
    const proj = tmp.path();
    writeStore(proj, validStore({ 'a.md': sha('a').toUpperCase() }));
    expect(readRecords(proj).kind).toBe('invalid');
  });

  it.each([
    ['a traversal key', '../escape.md'],
    ['an absolute key', '/etc/passwd'],
  ])('%s invalidates the store', (_label, key) => {
    const proj = tmp.path();
    writeStore(proj, validStore({ [key]: sha('x') }));
    const read = readRecords(proj);
    expect(read.kind).toBe('invalid');
    expect(read.kind === 'invalid' && read.message).toMatch(
      /invalid file path/,
    );
  });

  it('a traversal key never causes a filesystem access — it is only ever a lookup key (P2)', () => {
    const proj = tmp.path();
    // The store is read, rejected, and nothing outside the project is touched:
    // the key is compared, never joined. If it were joined, this would throw.
    writeStore(proj, validStore({ '../../../../etc/passwd': sha('x') }));
    expect(() => readRecords(proj)).not.toThrow();
    expect(readRecords(proj).kind).toBe('invalid');
  });

  // -------------------------------------------------------------------------
  // The key rule is a SEGMENT rule, not a substring ban.
  //
  // The writer records whatever relative paths the install manifest hands it,
  // and those come from enumerating the untrusted clone — capability contents,
  // contracts and floor files are copied verbatim and their basenames are never
  // name-validated. So the reader must accept every benign name the writer can
  // legitimately produce, or `pharn` declares its OWN store corrupt and degrades
  // the whole update to `unverifiable` for a filename `cpSync` copied happily.
  //
  // What makes the loose rule sound is that a key is COMPARED, never joined (see
  // the pin above): containment is `safeJoin`'s job, not this predicate's.
  // -------------------------------------------------------------------------
  it.each([
    ['`..` inside a basename', 'pharn-review/x/migration..v2.md'],
    ['`..` inside a directory name', 'pharn-pipeline/v1..v2/skill.md'],
    // A backslash is a legal POSIX filename character (lib/validate.ts, toPosix):
    // on win32 it splits into ordinary segments, on posix it stays one opaque
    // segment. Safe either way, because nothing joins it.
    ['a literal backslash', 'pharn-review/x/we\\ird.md'],
    ['a leading dot', '.claude/hooks/set-writes-scope.cjs'],
    ['a dot-suffixed directory', 'pharn-review/a11y.v2/lens.md'],
    // A drive LETTER is only absolute when a separator follows it. `C:notes.md`
    // is an ordinary posix filename, so rejecting it would recreate exactly the
    // over-rejection this rule exists to remove.
    ['a drive letter with no separator', 'C:notes.md'],
  ])('%s is a valid key — the store reads back ok', (_label, key) => {
    const proj = tmp.path();
    writeStore(proj, validStore({ [key]: sha('x') }));
    const read = readRecords(proj);
    expect(read.kind).toBe('ok');
    expect(read.kind === 'ok' && read.store.files[key]).toBe(sha('x'));
  });

  it.each([
    ['a `..` segment mid-path', 'a/../b.md'],
    ['a bare `..`', '..'],
    ['a trailing `..` segment', 'pharn-review/..'],
    ['a `.` segment mid-path', 'a/./b.md'],
    ['a bare `.`', '.'],
    ['an empty key', ''],
    // Drive-absolute. `toPosix` maps a win32 `C:\\x` onto this same form, so one
    // rule covers both spellings and the docs' "absolute keys are invalid" stays
    // true on every platform rather than only for a leading `/`.
    ['a drive-absolute key', 'C:/x'],
  ])('%s invalidates the store', (_label, key) => {
    const proj = tmp.path();
    writeStore(proj, validStore({ [key]: sha('x') }));
    const read = readRecords(proj);
    expect(read.kind).toBe('invalid');
    expect(read.kind === 'invalid' && read.message).toMatch(
      /invalid file path/,
    );
  });

  // The key is validated on a NORMALIZED copy and stored VERBATIM. `toPosix`'s
  // separator swap is platform-conditional, but its trailing-slash strip is not
  // — so this one fixture discriminates on every platform, including the only
  // one CI runs. An implementation that keyed the map with the normalized string
  // would return `a/b` here and silently stop matching the manifest lookup that
  // is this store's only consumer (lib/update-decision.ts).
  it('validates a normalized copy but stores the ORIGINAL key', () => {
    const proj = tmp.path();
    writeStore(proj, validStore({ 'a/b/': sha('x') }));
    const read = readRecords(proj);
    expect(read.kind).toBe('ok');
    expect(read.kind === 'ok' && Object.keys(read.store.files)).toEqual([
      'a/b/',
    ]);
  });

  it('round-trips a `..`-in-basename key through writeRecords → readRecords', async () => {
    const proj = tmp.path();
    const key = 'pharn-review/x/migration..v2.md';
    await writeRecords(proj, { ...STAMP, files: { [key]: sha('bytes') } });

    const read = readRecords(proj);

    expect(read.kind).toBe('ok');
    // Byte-identical: what the writer emits, the reader accepts and returns.
    expect(read.kind === 'ok' && read.store.files).toEqual({
      [key]: sha('bytes'),
    });
  });

  it('a non-string stamp invalidates the store', () => {
    const proj = tmp.path();
    writeStore(proj, { ...validStore(), skillsVersion: 42 });
    expect(readRecords(proj).kind).toBe('invalid');
    writeStore(proj, { ...validStore(), commit: 42 });
    expect(readRecords(proj).kind).toBe('invalid');
  });

  it('an odd-but-string stamp is KEPT — the stamp is compared, never consumed', () => {
    // Format-checking the stamp would make a store pharn itself wrote read as
    // corrupt whenever the config carries an older-shaped value, degrading the
    // whole install to `unverifiable` for no security gain. Formats are enforced
    // where these values enter (readSkillsVersion / fetchRepo).
    const proj = tmp.path();
    writeStore(proj, { ...validStore(), skillsVersion: '1.0', commit: 'sha1' });
    const read = readRecords(proj);
    expect(read.kind).toBe('ok');
    expect(read.kind === 'ok' && read.store.commit).toBe('sha1');
  });
});

describe('recordsBaseline — the stamp gate', () => {
  it('a matching stamp yields the records', () => {
    const files = { 'a.md': sha('a') };
    expect(
      recordsBaseline(
        { kind: 'ok', store: { schemaVersion: 1, ...STAMP, files } },
        STAMP,
      ),
    ).toEqual({ records: files, note: null });
  });

  it('absent → no records, and NO note (a legacy install is not a problem to report)', () => {
    expect(recordsBaseline({ kind: 'absent' }, STAMP)).toEqual({
      records: null,
      note: null,
    });
  });

  it('invalid → no records, and the named reason is carried through for the report', () => {
    expect(
      recordsBaseline({ kind: 'invalid', message: 'boom' }, STAMP),
    ).toEqual({ records: null, note: 'boom' });
  });

  it('a stamp disagreeing with the config is ignored — a downgrade round-trip fails CLOSED', () => {
    // The scenario: an older CLI rewrote the tree and advanced pharn.config.json
    // while ignoring the store. Trusting it would label upstream bytes as the
    // user's edits and freeze the install.
    const store = {
      schemaVersion: 1,
      skillsVersion: '1.0.0',
      commit: null,
      files: { 'a.md': sha('a') },
    };
    const result = recordsBaseline(
      { kind: 'ok', store },
      {
        skillsVersion: '1.1.0',
        commit: null,
      },
    );
    expect(result.records).toBeNull();
    expect(result.note).toMatch(/different install state/);
  });

  it('a differing commit alone also invalidates the baseline', () => {
    const store = {
      schemaVersion: 1,
      skillsVersion: '1.0.0',
      commit: 'a'.repeat(40),
      files: {},
    };
    expect(
      recordsBaseline(
        { kind: 'ok', store },
        {
          skillsVersion: '1.0.0',
          commit: 'b'.repeat(40),
        },
      ).records,
    ).toBeNull();
  });
});

describe('mergeRecords', () => {
  it('next wins per key; untouched prev entries survive', () => {
    expect(
      mergeRecords(
        { keep: sha('keep'), shared: sha('old') },
        { shared: sha('new'), added: sha('added') },
      ),
    ).toEqual({
      keep: sha('keep'),
      shared: sha('new'),
      added: sha('added'),
    });
  });
});

// The store is written temp-then-rename (lib/atomic-write.ts). A torn write is
// fail-closed here — the reader names it `invalid` — but it still degrades every
// update decision to `unverifiable`, withholds the version bump, and silently
// stops `add`/`remove` maintaining the store until `--force` or a hand-edit.
describe('writeRecords — atomic replacement', () => {
  const tmp = useTmpDir();
  const proj = () => tmp.path();
  const storeFile = () => join(proj(), RECORDS_FILE);

  it('writes the same bytes as before: 2-space JSON + trailing newline', async () => {
    const files = { 'a.md': sha('a') };
    await writeRecords(proj(), { ...STAMP, files });
    expect(readFileSync(storeFile(), 'utf8')).toBe(
      `${JSON.stringify(validStore(files), null, 2)}\n`,
    );
  });

  it('overwrites an existing store in place, leaving no temp sibling', async () => {
    await writeRecords(proj(), { ...STAMP, files: { 'a.md': sha('a') } });
    await writeRecords(proj(), { ...STAMP, files: { 'b.md': sha('b') } });
    expect(readdirSync(proj())).toEqual([RECORDS_FILE]);
    const read = readRecords(proj());
    expect(read.kind === 'ok' && read.store.files).toEqual({
      'b.md': sha('b'),
    });
  });

  it('leaves the previous store intact and readable when the write fails', async () => {
    await writeRecords(proj(), { ...STAMP, files: { 'a.md': sha('a') } });
    mkdirSync(tmpPathFor(storeFile()), { recursive: true });

    await expect(
      writeRecords(proj(), { ...STAMP, files: { 'b.md': sha('b') } }),
    ).rejects.toThrow();

    const read = readRecords(proj());
    expect(read.kind).toBe('ok');
    expect(read.kind === 'ok' && read.store.files).toEqual({
      'a.md': sha('a'),
    });
  });
});

// The install manifest is SOURCE-derived: it lists what the clone has, not what
// the copy managed to write. When the two disagree because the destination is
// unwritable, buildRecords must not crash the install after every other file is
// already on disk.
describe('buildRecords — an unstatable dest is skipped, not fatal', () => {
  const tmp = useTmpDir();

  it('skips a rel whose parent is a REGULAR FILE (ENOTDIR), and records the rest', () => {
    const proj = tmp.path();
    write(join(proj, 'CONSTITUTION.md'), 'C');
    // `features` is a file, so `features/README.md` cannot be stat'd at all —
    // lstat's throwIfNoEntry suppresses ENOENT only.
    writeFileSync(join(proj, 'features'), 'a regular file');

    const files = buildRecords(proj, ['CONSTITUTION.md', 'features/README.md']);

    expect(Object.keys(files)).toEqual(['CONSTITUTION.md']);
  });
});
