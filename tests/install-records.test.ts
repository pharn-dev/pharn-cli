import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  buildRecords,
  capabilityRecordPaths,
  mergeRecords,
  readRecords,
  recordsBaseline,
  RECORDS_FILE,
  RECORDS_SCHEMA_VERSION,
  writeRecords,
} from '../src/lib/install-records.js';
import { layoutPaths } from '../src/lib/layout.js';

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

describe('capabilityRecordPaths — what `add` just wrote, read back from the project', () => {
  const tmp = useTmpDir();

  it('enumerates the installed capability dir (incl. evals), sorted, at the given layout', () => {
    const proj = tmp.path();
    write(join(proj, 'pharn-review/n-plus-one/n-plus-one.md'));
    write(join(proj, 'pharn-review/n-plus-one/evals/cases/c.md'));
    write(join(proj, 'pharn-review/other/other.md'));

    expect(
      capabilityRecordPaths(proj, layoutPaths('flat'), {
        name: 'n-plus-one',
        role: 'lens',
      }),
    ).toEqual([
      'pharn-review/n-plus-one/evals/cases/c.md',
      'pharn-review/n-plus-one/n-plus-one.md',
    ]);
  });

  it('addresses the pharn/ layout when that is the recorded layout', () => {
    const proj = tmp.path();
    write(join(proj, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'));
    expect(
      capabilityRecordPaths(proj, layoutPaths('pharn'), {
        name: 'a11y',
        role: 'griller',
      }),
    ).toEqual(['pharn/pharn-pipeline/grillers/a11y/a11y.md']);
  });

  it('is [] when the capability dir is absent', () => {
    expect(
      capabilityRecordPaths(tmp.path(), layoutPaths('flat'), {
        name: 'ghost',
        role: 'lens',
      }),
    ).toEqual([]);
  });

  it('skips symlinks inside the capability dir', () => {
    const proj = tmp.path();
    write(join(proj, 'pharn-review/x/x.md'));
    write(join(proj, 'outside.md'));
    symlinkSync(join(proj, 'outside.md'), join(proj, 'pharn-review/x/link.md'));
    expect(
      capabilityRecordPaths(proj, layoutPaths('flat'), {
        name: 'x',
        role: 'lens',
      }),
    ).toEqual(['pharn-review/x/x.md']);
  });
});
