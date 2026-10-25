import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  backupAction,
  backupNoticeLines,
  backupTimestamp,
  BACKUP_DIR,
  createBackup,
  legacyBackupNotice,
} from '../src/lib/backup.js';
import { parseCapabilityIndex } from '../src/lib/capability-index.js';
import { scanDest } from '../src/lib/dest-drift.js';
import { diffInstalledCapabilities } from '../src/lib/diff.js';
import { contentHash } from '../src/lib/hash.js';
import { collectExpectedInstallPaths } from '../src/lib/install-manifest.js';
import { findOrphans, isInstallRootPath } from '../src/lib/orphans.js';
import { planUninstall } from '../src/lib/uninstall-plan.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

const AT = new Date(2026, 7, 7, 9, 15, 0); // 2026-08-07 09:15:00 local

describe('backupTimestamp', () => {
  it('formats YYYYMMDD-HHMMSS, zero-padded', () => {
    expect(backupTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe(
      '20260102-030405',
    );
    expect(backupTimestamp(AT)).toBe('20260807-091500');
  });
});

describe('createBackup', () => {
  const tmp = useTmpDir();

  it('copies each file into pharn/.backup/<ts>/ preserving its relative path', () => {
    const proj = tmp.path();
    write(join(proj, 'CONSTITUTION.md'), 'my edit');
    write(join(proj, 'pharn-review/a/a.md'), 'nested edit');

    const dir = createBackup(
      proj,
      ['CONSTITUTION.md', 'pharn-review/a/a.md'],
      AT,
    );

    expect(dir).toBe(`${BACKUP_DIR}/20260807-091500`);
    expect(readFileSync(join(proj, dir, 'CONSTITUTION.md'), 'utf8')).toBe(
      'my edit',
    );
    expect(readFileSync(join(proj, dir, 'pharn-review/a/a.md'), 'utf8')).toBe(
      'nested edit',
    );
  });

  it('leaves the originals in place — a backup copies, it never moves', () => {
    const proj = tmp.path();
    write(join(proj, 'a.md'), 'original');
    createBackup(proj, ['a.md'], AT);
    expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('original');
  });

  it('NEVER writes into an existing timestamp dir — it uniquifies instead', () => {
    // Two --force runs inside the same second must not let the second destroy
    // the only surviving copy of the user's edits.
    const proj = tmp.path();
    write(join(proj, 'a.md'), 'first');
    const first = createBackup(proj, ['a.md'], AT);

    write(join(proj, 'a.md'), 'second');
    const second = createBackup(proj, ['a.md'], AT);

    expect(second).toBe(`${first}-2`);
    expect(readFileSync(join(proj, first, 'a.md'), 'utf8')).toBe('first');
    expect(readFileSync(join(proj, second, 'a.md'), 'utf8')).toBe('second');
  });

  it('refuses to write through a symlinked pharn/.backup (safeJoin is lexical only)', () => {
    // proj and the symlink target are siblings inside the tmp dir, so the escape
    // is real but stays inside the fixture.
    const proj = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside-target');
    mkdirSync(proj, { recursive: true });
    mkdirSync(outside, { recursive: true });
    write(join(proj, 'a.md'), 'secret');
    mkdirSync(join(proj, 'pharn'), { recursive: true });
    symlinkSync(outside, join(proj, BACKUP_DIR));

    expect(() => createBackup(proj, ['a.md'], AT)).toThrow(/symlink/i);
    expect(existsSync(join(outside, '20260807-091500'))).toBe(false);
  });

  it('refuses to back up a source that is a symlink', () => {
    const proj = tmp.path();
    write(join(proj, 'real.md'), 'r');
    symlinkSync(join(proj, 'real.md'), join(proj, 'link.md'));
    expect(() => createBackup(proj, ['link.md'], AT)).toThrow(/symlink/i);
  });

  it('refuses a source whose PARENT is a symlink (lstat only guards the leaf)', () => {
    const proj = join(tmp.path(), 'proj');
    const outside = join(tmp.path(), 'outside-src');
    mkdirSync(proj, { recursive: true });
    write(join(outside, 'a.md'), 'bytes from outside the project');
    symlinkSync(outside, join(proj, 'linked-dir'));

    expect(() => createBackup(proj, ['linked-dir/a.md'], AT)).toThrow(
      /symlink/i,
    );
  });

  it('throws (rather than silently skipping) when a source disappeared', () => {
    expect(() => createBackup(tmp.path(), ['ghost.md'], AT)).toThrow(
      /disappeared/,
    );
  });

  it('THROWS when the backup root cannot be created, so the caller can abort before touching originals', () => {
    // A plain FILE at pharn/.backup makes mkdir fail — a real, deterministic
    // failure seam with no injection needed.
    const proj = tmp.path();
    write(join(proj, BACKUP_DIR), 'i am a file, not a directory');
    write(join(proj, 'a.md'), 'user bytes');

    expect(() => createBackup(proj, ['a.md'], AT)).toThrow();
    // The original is untouched — that is the property the update relies on.
    expect(readFileSync(join(proj, 'a.md'), 'utf8')).toBe('user bytes');
  });

  it('creates the directory even for an empty file list (callers skip that case)', () => {
    const proj = tmp.path();
    const dir = createBackup(proj, [], AT);
    expect(existsSync(join(proj, dir))).toBe(true);
  });
});

// F-40: the notice was written five ways (init, add, remove, uninstall, update)
// and only update's carried the .gitignore advice. One wording now.
describe('backupNoticeLines', () => {
  const HINT =
    'pharn/.backup/ is not gitignored — add it to .gitignore or delete it once you are happy.';

  it('names the count, the directory and what the backup was made ahead of', () => {
    expect(
      backupNoticeLines({
        dir: 'pharn/.backup/20260807-091500',
        saved: 3,
        action: 'overwriting and removing',
      }),
    ).toEqual([
      'Backed up 3 file(s) to pharn/.backup/20260807-091500 before overwriting and removing.',
      HINT,
    ]);
  });

  it('names a single file by name, with no action phrase', () => {
    expect(
      backupNoticeLines({
        dir: 'pharn/.backup/20260807-091500',
        saved: 'pharn.config.json',
      }),
    ).toEqual([
      'Backed up pharn.config.json to pharn/.backup/20260807-091500.',
      HINT,
    ]);
  });

  it('drops the .gitignore advice on an aborted run (the pointer alone is repeated)', () => {
    expect(
      backupNoticeLines(
        { dir: 'pharn/.backup/x', saved: 1, action: 'removing' },
        { aborted: true },
      ),
    ).toEqual(['Backed up 1 file(s) to pharn/.backup/x before removing.']);
  });
});

// 0.14.0: backups live under pharn/, so BOTH components are guarded.
describe('createBackup — the pharn/.backup root', () => {
  const tmp = useTmpDir();

  it('lands under pharn/.backup/<ts>/', () => {
    const proj = join(tmp.path(), 'proj');
    write(join(proj, 'a.md'), 'a');
    expect(createBackup(proj, ['a.md'], AT)).toBe(
      'pharn/.backup/20260807-091500',
    );
    expect(BACKUP_DIR).toBe('pharn/.backup');
  });

  it('refuses a symlinked pharn — nothing lands where it points', () => {
    const proj = join(tmp.path(), 'proj');
    write(join(proj, 'a.md'), 'a');
    mkdirSync(join(tmp.path(), 'outside'));
    symlinkSync(join(tmp.path(), 'outside'), join(proj, 'pharn'));
    expect(() => createBackup(proj, ['a.md'], AT)).toThrow(
      /pharn is a symlink; refusing/,
    );
    expect(existsSync(join(tmp.path(), 'outside/.backup'))).toBe(false);
  });

  it('refuses a pharn (or pharn/.backup) that is not a directory', () => {
    const proj = join(tmp.path(), 'proj');
    write(join(proj, 'a.md'), 'a');
    writeFileSync(join(proj, 'pharn'), 'file');
    expect(() => createBackup(proj, ['a.md'], AT)).toThrow(
      /pharn is not a directory/,
    );
    const proj2 = join(tmp.path(), 'proj2');
    write(join(proj2, 'a.md'), 'a');
    write(join(proj2, 'pharn/.backup'), 'file');
    expect(() => createBackup(proj2, ['a.md'], AT)).toThrow(
      /pharn\/\.backup is not a directory/,
    );
  });

  it('the advice names pharn/.backup/', () => {
    expect(
      backupNoticeLines({ dir: 'pharn/.backup/x', saved: 1 }).join('\n'),
    ).toContain('pharn/.backup/ is not gitignored');
  });
});

describe('backupAction — every combination has a phrase', () => {
  it('joins the reasons in a fixed order', () => {
    const cases: [boolean, boolean, boolean, string][] = [
      [false, false, false, 'overwriting'],
      [true, false, false, 'overwriting'],
      [false, true, false, 'removing'],
      [false, false, true, 'moving'],
      [true, true, false, 'overwriting and removing'],
      [true, false, true, 'overwriting and moving'],
      [false, true, true, 'removing and moving'],
      [true, true, true, 'overwriting, removing and moving'],
    ];
    for (const [o, r, m, phrase] of cases)
      expect(backupAction(o, r, m)).toBe(phrase);
  });
});

// A backed-up capability copy sits at pharn/.backup/<ts>/pharn/pharn-review/…,
// a path that LOOKS like an install path one level down. None of the readers
// of the install may count it.
describe('a backed-up capability copy is invisible to every install reader', () => {
  const tmp = useTmpDir();
  const COPY = 'pharn/.backup/20260807-091500/pharn/pharn-review/x/x.md';
  const LIVE = 'pharn/pharn-review/x/x.md';

  function setup(): { proj: string; repo: string } {
    const proj = join(tmp.path(), 'proj');
    const repo = join(tmp.path(), 'repo');
    write(join(proj, COPY), 'old');
    write(join(proj, LIVE), 'cap');
    write(join(repo, 'SKILLS_VERSION'), '7.0.0\n');
    write(join(repo, 'pharn/pharn-contracts/x.md'), 'x');
    write(join(repo, LIVE), '---\nrole: lens\napplies: universal\n---\ncap\n');
    return { proj, repo };
  }

  it('is not an install path, so never an orphan nor an uninstall candidate', () => {
    const { proj } = setup();
    expect(isInstallRootPath(COPY)).toBe(false);
    const planted = { [COPY]: contentHash(join(proj, COPY)) };
    expect(
      findOrphans({
        projectRoot: proj,
        records: planted,
        expected: new Map(),
        capabilities: [],
        frozen: [],
      }).orphans,
    ).toEqual([]);
    // Even a hand-planted record is `outside`, never deleted.
    const plan = planUninstall(proj, planted);
    expect(plan.delete).toEqual([]);
    expect(plan.outside).toEqual([COPY]);
  });

  it('is not part of the expected set status diffs, nor of the drift scan', () => {
    const { proj, repo } = setup();
    const caps = [{ name: 'x', role: 'lens' as const }];
    const diff = diffInstalledCapabilities({
      repoDir: repo,
      projectRoot: proj,
      capabilities: caps,
      layout: 'pharn',
    });
    expect(JSON.stringify(diff)).not.toContain('.backup');
    const expected = collectExpectedInstallPaths({
      repoDir: repo,
      capabilities: caps,
      layout: 'pharn',
    });
    expect([...expected.keys()].some((k) => k.includes('.backup'))).toBe(false);
    const scan = scanDest({
      repoDir: repo,
      projectRoot: proj,
      rels: [...expected.keys()],
    });
    expect(JSON.stringify(scan)).not.toContain('.backup');
  });

  it('is not a capability the index reads, known or unknown', () => {
    const { proj } = setup();
    // Read the project as the index would read a pharn-layout tree.
    write(join(proj, 'pharn/pharn-contracts/x.md'), 'x');
    mkdirSync(join(proj, 'pharn/pharn-pipeline/grillers'), { recursive: true });
    write(join(proj, LIVE), '---\nrole: lens\napplies: universal\n---\ncap\n');
    const index = parseCapabilityIndex(proj);
    expect(index.capabilities.map((c) => c.name)).toEqual(['x']);
    expect(JSON.stringify(index)).not.toContain('.backup');
  });
});

describe('legacyBackupNotice — an old root .pharn-backup/', () => {
  const tmp = useTmpDir();

  it('names a real directory, and says pharn deletes neither', () => {
    mkdirSync(join(tmp.path(), '.pharn-backup/20261001-120000'), {
      recursive: true,
    });
    const line = legacyBackupNotice(tmp.path());
    expect(line).toContain('.pharn-backup/ holds backups from pharn 0.13.0');
    expect(line).toContain('new ones go to pharn/.backup/');
    expect(line).toContain('pharn never deletes either');
  });

  it('is silent when there is none, or when the name is a file or a link', () => {
    expect(legacyBackupNotice(tmp.path())).toBeNull();
    writeFileSync(join(tmp.path(), '.pharn-backup'), 'not a dir');
    expect(legacyBackupNotice(tmp.path())).toBeNull();
    const other = join(tmp.path(), 'p2');
    mkdirSync(join(other, '..', 'elsewhere'), { recursive: true });
    mkdirSync(other);
    symlinkSync(join(other, '..', 'elsewhere'), join(other, '.pharn-backup'));
    expect(legacyBackupNotice(other)).toBeNull();
  });
});
