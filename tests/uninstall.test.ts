import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL,
  ProcessExit,
  restoreTTY,
  setTTY,
  snapshotTree,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
import type { PharnConfig } from '../src/types.js';

// A pass-through `node:fs` whose unlink/rmdir a test can intercept, so the
// ENOENT tolerance and the final config/records delete failing can be driven
// without a concurrent process. Untouched hooks behave exactly like node:fs.
const fsHooks = vi.hoisted(() => ({
  unlink: null as null | ((path: string) => void),
  rmdir: null as null | ((path: string) => void),
}));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    default: real,
    unlinkSync: (path: string) => {
      fsHooks.unlink?.(String(path));
      return real.unlinkSync(path);
    },
    rmdirSync: (path: string) => {
      fsHooks.rmdir?.(String(path));
      return real.rmdirSync(path);
    },
  };
});

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  outro: vi.fn(),
}));

// Nothing below is mocked but the prompts: the config, the record store, the
// lock and the filesystem are all real, so every assertion is about bytes on
// disk. `uninstall` imports no repo/network module at all.
const { runUninstall } = await import('../src/commands/uninstall.js');
const prompts = await import('@clack/prompts');
const { writePharnConfig } = await import('../src/lib/pharn-config.js');
const { writeRecords, MODELS_RECORD_KEY } =
  await import('../src/lib/install-records.js');
const { contentHash } = await import('../src/lib/hash.js');
const { LOCK_FILE } = await import('../src/lib/project-lock.js');

const tmp = useTmpDir();
let proj = '';

function write(rel: string, content = `bytes of ${rel}`): void {
  const abs = join(proj, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function config(extra: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.12.0',
    skillsVersion: '6.50.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'c'.repeat(40),
    modules: [],
    installedAt: '2026-10-01T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller', source: 'auto' }],
    ...extra,
  };
}

const FLAT_FILES = [
  'CONSTITUTION.md',
  'ARCHITECTURE.md',
  'PHARN-LICENSE',
  'features/README.md',
  'pharn-contracts/finding-shape.md',
  '.dev/floor/validate.mjs',
  '.claude/commands/pharn-ship.md',
  '.claude/hooks/protect-trusted-paths.cjs',
  'pharn-pipeline/grillers/a11y/a11y.md',
  'pharn-pipeline/grillers/a11y/evals/cases/c.md',
];

const PHARN_FILES = [
  'pharn/CONSTITUTION.md',
  'THREAT-MODEL.md',
  'pharn/LICENSE',
  'pharn/features/README.md',
  'pharn/pharn-contracts/finding-shape.md',
  'pharn/floor/validate.mjs',
  '.claude/commands/pharn-ship.md',
  '.claude/hooks/protect-trusted-paths.cjs',
  'pharn/pharn-pipeline/grillers/a11y/a11y.md',
];

const SETTINGS = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'Write|Edit',
        hooks: [
          {
            type: 'command',
            command:
              'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/protect-trusted-paths.cjs',
          },
          { type: 'command', command: 'node scripts/my-own-guard.js' },
        ],
      },
    ],
  },
};

// An install as `init` leaves it: files, a settings.json it never rewrites,
// records stamped with the config's pair, and the config.
async function install(
  files: string[],
  cfg: PharnConfig = config(),
  extraRecords: Record<string, string> = {},
): Promise<void> {
  const records: Record<string, string> = {};
  for (const rel of files) {
    write(rel);
    records[rel] = contentHash(join(proj, rel));
  }
  write('.claude/settings.json', JSON.stringify(SETTINGS, null, 2));
  await writeRecords(proj, {
    skillsVersion: cfg.skillsVersion,
    commit: cfg.commit,
    files: { ...records, ...extraRecords },
  });
  await writePharnConfig(proj, cfg);
}

function notes(title: string): string {
  return vi
    .mocked(prompts.note)
    .mock.calls.filter((c) => c[1] === title)
    .map((c) => stripVTControlCharacters(String(c[0])))
    .join('\n');
}

function errors(): string {
  return vi
    .mocked(prompts.log.error)
    .mock.calls.map((c) => stripVTControlCharacters(String(c[0])))
    .join('\n');
}

function backups(): string[] {
  const root = join(proj, 'pharn/.backup');
  return existsSync(root) ? readdirSync(root) : [];
}

describe('runUninstall', () => {
  stubProcessExit();
  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
  });
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
    fsHooks.unlink = null;
    fsHooks.rmdir = null;
  });

  it('deletes every recorded, unchanged file, the empty dirs, the records and the config', async () => {
    await install(FLAT_FILES);
    const configBytes = readFileSync(join(proj, 'pharn.config.json'));
    const settingsBytes = readFileSync(join(proj, '.claude/settings.json'));

    await runUninstall({ yes: true });

    for (const rel of FLAT_FILES)
      expect(existsSync(join(proj, rel))).toBe(false);
    for (const dir of [
      'features',
      'pharn-contracts',
      '.dev',
      '.claude/commands',
      '.claude/hooks',
      'pharn-pipeline',
    ])
      expect(existsSync(join(proj, dir))).toBe(false);
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);
    expect(existsSync(join(proj, 'pharn.records.json'))).toBe(false);
    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
    // settings.json is never written, so `.claude/` keeps it — and its dir.
    expect(readFileSync(join(proj, '.claude/settings.json'))).toEqual(
      settingsBytes,
    );
    // The config is saved, byte for byte, before it is deleted.
    const [ts] = backups();
    expect(
      readFileSync(join(proj, 'pharn/.backup', ts!, 'pharn.config.json')),
    ).toEqual(configBytes);
    expect(vi.mocked(prompts.log.info)).toHaveBeenCalledWith(
      `Backed up pharn.config.json to pharn/.backup/${ts}.`,
      { output: process.stdout },
    );
    // F-40: the same .gitignore advice every backup notice carries.
    expect(vi.mocked(prompts.log.info)).toHaveBeenCalledWith(
      'pharn/.backup/ is not gitignored — add it to .gitignore or delete it once you are happy.',
      { output: process.stdout },
    );

    const done = notes('UNINSTALLED');
    expect(done).toContain(
      `Deleted ${FLAT_FILES.length} file(s) and 11 empty directories`,
    );
    expect(done).toContain(
      '.claude/settings.json, .claude/settings.local.json and every pharn/.backup/ directory are left untouched.',
    );
    expect(done).toContain('Left 1 directory that still hold other files:');
    expect(done).toContain('  • .claude');
    expect(vi.mocked(prompts.outro).mock.calls.at(-1)![0]).toContain(
      'PHARN was uninstalled.',
    );
  });

  it('lists the hooks still wired to a removed script, and only those', async () => {
    await install(FLAT_FILES);
    await runUninstall({ yes: true });
    const hooks = notes('HOOKS');
    expect(hooks).toContain(
      '.claude/settings.json still wires 1 hook(s) whose script was removed:',
    );
    expect(hooks).toContain('protect-trusted-paths.cjs');
    expect(hooks).not.toContain('my-own-guard');
    expect(hooks).toContain('pharn never edits these files');
  });

  // F-10: the install copies `.mjs` hooks, so uninstall's install-root bound
  // must take them too — else a pharn-written ESM hook would be left behind.
  it('deletes a recorded .mjs hook, and names its wiring in the HOOKS note', async () => {
    await install([...FLAT_FILES, '.claude/hooks/require-loop-record.mjs']);
    write(
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node',
                  args: ['.claude/hooks/require-loop-record.mjs'],
                },
              ],
            },
          ],
        },
      }),
    );
    await runUninstall({ yes: true });
    expect(
      existsSync(join(proj, '.claude/hooks/require-loop-record.mjs')),
    ).toBe(false);
    expect(notes('HOOKS')).toContain('require-loop-record.mjs');
  });

  it('ignores a recorded hooks key that is not an install path', async () => {
    await install(
      FLAT_FILES.filter((f) => !f.startsWith('.claude/hooks/')),
      config(),
      // Recorded, absent, and wired — but `*.test.cjs` is never installed.
      { '.claude/hooks/protect-trusted-paths.test.cjs': 'd'.repeat(64) },
    );
    write(
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node .claude/hooks/protect-trusted-paths.test.cjs',
                },
              ],
            },
          ],
        },
      }),
    );
    await runUninstall({ yes: true });
    expect(notes('HOOKS')).toBe('');
  });

  it('prints no HOOKS note when no wired hook runs a removed script', async () => {
    await install(FLAT_FILES.filter((f) => !f.startsWith('.claude/hooks/')));
    await runUninstall({ yes: true });
    expect(notes('HOOKS')).toBe('');
  });

  it('keeps an edited file and the user’s own feature work, and lists them', async () => {
    await install(PHARN_FILES, config({ layout: 'pharn' }));
    write('pharn/CONSTITUTION.md', 'my amended constitution');
    write('pharn/features/my-feature/PLAN.md', 'my plan');

    await runUninstall({ yes: true });

    expect(readFileSync(join(proj, 'pharn/CONSTITUTION.md'), 'utf8')).toBe(
      'my amended constitution',
    );
    expect(
      readFileSync(join(proj, 'pharn/features/my-feature/PLAN.md'), 'utf8'),
    ).toBe('my plan');
    expect(existsSync(join(proj, 'pharn/features/README.md'))).toBe(false);
    expect(existsSync(join(proj, 'pharn/pharn-pipeline'))).toBe(false);
    expect(existsSync(join(proj, 'THREAT-MODEL.md'))).toBe(false);
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);

    expect(notes('PLAN')).toContain('Keep 1 file(s) you changed');
    const done = notes('UNINSTALLED');
    expect(done).toContain('  • pharn/CONSTITUTION.md');
    expect(done).toContain('  • pharn/features');
  });

  it('never deletes a file pharn has no record of, inside a capability dir', async () => {
    await install(FLAT_FILES);
    write('pharn-pipeline/grillers/a11y/my-notes.md', 'mine');
    await runUninstall({ yes: true });
    expect(
      readFileSync(
        join(proj, 'pharn-pipeline/grillers/a11y/my-notes.md'),
        'utf8',
      ),
    ).toBe('mine');
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'))).toBe(
      false,
    );
    expect(notes('UNINSTALLED')).toContain('  • pharn-pipeline/grillers/a11y');
  });

  it('names a recorded key outside the install paths in the PLAN note and leaves it', async () => {
    write('src/app.ts', 'user code');
    await install(FLAT_FILES, config(), {
      'src/app.ts': contentHash(join(proj, 'src/app.ts')),
      [MODELS_RECORD_KEY]: 'b'.repeat(64),
    });
    await runUninstall({ yes: true });
    expect(readFileSync(join(proj, 'src/app.ts'), 'utf8')).toBe('user code');
    const plan = notes('PLAN');
    expect(plan).toContain(
      "Leave 1 recorded path(s) outside pharn's install paths",
    );
    expect(plan).toContain('  • src/app.ts');
    expect(plan).toContain(
      '.claude/settings.json, .claude/settings.local.json and every pharn/.backup/ directory are left untouched.',
    );
  });

  it('leaves earlier pharn/.backup/ directories untouched', async () => {
    await install(FLAT_FILES);
    write('pharn/.backup/2026-01-01T00-00-00Z/CONSTITUTION.md', 'old');
    await runUninstall({ yes: true });
    expect(
      readFileSync(
        join(proj, 'pharn/.backup/2026-01-01T00-00-00Z/CONSTITUTION.md'),
        'utf8',
      ),
    ).toBe('old');
    expect(backups()).toHaveLength(2);
  });

  it('is a benign no-op when PHARN is not installed (exit 0)', async () => {
    write('README.md', 'a project');
    const before = snapshotTree(proj);
    await runUninstall({ yes: true });
    expect(snapshotTree(proj)).toEqual(before);
    expect(vi.mocked(prompts.outro)).toHaveBeenCalledWith(
      'PHARN is not installed here (no pharn.config.json). Nothing was removed.',
    );
  });

  it('exits 1 on a legacy (module) config, writing nothing', async () => {
    write(
      'pharn.config.json',
      JSON.stringify({ ...config(), capabilities: undefined }),
    );
    const before = snapshotTree(proj);
    await expect(runUninstall({ yes: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(snapshotTree(proj)).toEqual(before);
  });

  describe('refuses with nothing removed', () => {
    async function expectRefusal(match: RegExp | string): Promise<void> {
      const before = snapshotTree(proj);
      await expect(runUninstall({ yes: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );
      expect(snapshotTree(proj)).toEqual(before);
      expect(errors()).toMatch(match);
    }

    it('when there is no pharn.records.json', async () => {
      await install(FLAT_FILES);
      rmSync(join(proj, 'pharn.records.json'));
      await expectRefusal(
        /there is no pharn\.records\.json.*Removing PHARN by hand/s,
      );
    });

    it('when the store is corrupt', async () => {
      await install(FLAT_FILES);
      write('pharn.records.json', '{ not json');
      await expectRefusal(/pharn\.records\.json is not valid JSON/);
    });

    it('when the store is stamped for another install state', async () => {
      await install(FLAT_FILES);
      await writePharnConfig(proj, config({ skillsVersion: '6.51.0' }));
      await expectRefusal(/written for a different install state/);
    });

    it('when a directory on the way is a symbolic link', async () => {
      const shared = join(tmp.path(), 'shared');
      mkdirSync(join(shared, 'pharn-pipeline/grillers/a11y'), {
        recursive: true,
      });
      await install(['CONSTITUTION.md'], config({ layout: 'pharn' }), {});
      // Record a file reached THROUGH a symlinked `pharn/`.
      writeFileSync(
        join(shared, 'pharn-pipeline/grillers/a11y/a11y.md'),
        'outside',
      );
      symlinkSync(shared, join(proj, 'pharn'));
      await writeRecords(proj, {
        skillsVersion: '6.50.0',
        commit: 'c'.repeat(40),
        files: {
          'pharn/pharn-pipeline/grillers/a11y/a11y.md': contentHash(
            join(shared, 'pharn-pipeline/grillers/a11y/a11y.md'),
          ),
        },
      });
      await expectRefusal(/pharn is a symbolic link.*OUTSIDE the project/);
      expect(
        existsSync(join(shared, 'pharn-pipeline/grillers/a11y/a11y.md')),
      ).toBe(true);
    });

    it('when the config cannot be backed up (pharn/.backup is a symlink)', async () => {
      await install(FLAT_FILES);
      mkdirSync(join(tmp.path(), 'elsewhere'));
      mkdirSync(join(proj, 'pharn'), { recursive: true });
      symlinkSync(join(tmp.path(), 'elsewhere'), join(proj, 'pharn/.backup'));
      await expectRefusal(
        /Could not back up pharn\.config\.json before uninstalling.*Nothing was removed/,
      );
    });

    it('when another pharn process holds the lock', async () => {
      await install(FLAT_FILES);
      mkdirSync(join(proj, 'pharn'), { recursive: true });
      writeFileSync(
        join(proj, LOCK_FILE),
        JSON.stringify({
          pid: process.pid,
          command: 'update',
          startedAt: new Date().toISOString(),
        }),
      );
      await expectRefusal(/Another pharn process/);
    });
  });

  describe('confirmation', () => {
    it('refuses off a TTY without --yes, writing nothing', async () => {
      await install(FLAT_FILES);
      setTTY(undefined, undefined);
      const before = snapshotTree(proj);
      await expect(runUninstall()).rejects.toMatchObject(new ProcessExit(1));
      expect(snapshotTree(proj)).toEqual(before);
      expect(errors()).toContain('pass --yes');
      expect(prompts.confirm).not.toHaveBeenCalled();
    });

    it('asks in a TTY (default No) and does nothing when declined', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockResolvedValueOnce(false);
      const before = snapshotTree(proj);
      await expect(runUninstall()).rejects.toMatchObject(new ProcessExit(0));
      expect(snapshotTree(proj)).toEqual(before);
      expect(vi.mocked(prompts.confirm).mock.calls[0]![0]).toMatchObject({
        initialValue: false,
        message: `Uninstall PHARN — delete ${FLAT_FILES.length} file(s), pharn.records.json and pharn.config.json?`,
      });
    });

    it('treats a cancelled prompt as declined', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockResolvedValueOnce(CANCEL as never);
      const before = snapshotTree(proj);
      await expect(runUninstall()).rejects.toMatchObject(new ProcessExit(0));
      expect(snapshotTree(proj)).toEqual(before);
    });

    it('uninstalls when confirmed', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockResolvedValueOnce(true);
      await runUninstall();
      expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);
    });

    it('refuses when the config changed while the prompt was open', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
        await writePharnConfig(proj, config({ archetypes: ['spa'] }));
        return true;
      });
      await expect(runUninstall()).rejects.toMatchObject(new ProcessExit(1));
      for (const rel of FLAT_FILES)
        expect(existsSync(join(proj, rel))).toBe(true);
      expect(errors()).toContain('changed while `pharn uninstall` was running');
    });

    it('re-plans under the lock: a file edited while the prompt was open is kept', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
        write('ARCHITECTURE.md', 'edited while the prompt was open');
        return true;
      });
      await runUninstall();
      expect(readFileSync(join(proj, 'ARCHITECTURE.md'), 'utf8')).toBe(
        'edited while the prompt was open',
      );
      expect(notes('UNINSTALLED')).toContain('  • ARCHITECTURE.md');
    });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'stops on a failed delete with config + records kept, and a re-run finishes',
    async () => {
      await install(FLAT_FILES);
      const locked = join(proj, 'pharn-contracts');
      chmodSync(locked, 0o555);
      try {
        await expect(runUninstall({ yes: true })).rejects.toMatchObject(
          new ProcessExit(1),
        );
        expect(errors()).toMatch(
          /Could not delete pharn-contracts\/finding-shape\.md.*re-running `pharn uninstall` continues/,
        );
        expect(existsSync(join(proj, 'pharn.config.json'))).toBe(true);
        expect(existsSync(join(proj, 'pharn.records.json'))).toBe(true);
        expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
      } finally {
        chmodSync(locked, 0o755);
      }
      vi.clearAllMocks();
      await runUninstall({ yes: true });
      for (const rel of FLAT_FILES)
        expect(existsSync(join(proj, rel))).toBe(false);
      expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);
      expect(notes('PLAN')).toMatch(/recorded file\(s\) are already gone/);
    },
  );

  it('caps a long kept list and names a path it cannot verify', async () => {
    const many = Array.from(
      { length: 12 },
      (_, i) => `pharn-contracts/c${i}.md`,
    );
    await install([...many, 'CONSTITUTION.md']);
    for (const rel of many) write(rel, 'edited');
    // A directory where a recorded file should be: not a regular file.
    rmSync(join(proj, 'CONSTITUTION.md'));
    mkdirSync(join(proj, 'CONSTITUTION.md'));
    await runUninstall({ yes: true });
    const plan = notes('PLAN');
    expect(plan).toContain('Keep 12 file(s) you changed');
    expect(plan).toContain('  …and 2 more');
    expect(plan).toContain('Keep 1 path(s) that cannot be verified');
    expect(plan).toContain('  • CONSTITUTION.md');
    expect(lstatSync(join(proj, 'CONSTITUTION.md')).isDirectory()).toBe(true);
    expect(notes('UNINSTALLED')).toContain(
      'Deleted 0 file(s) and 0 empty directories',
    );
  });

  it('says "directory" for exactly one removed directory', async () => {
    await install(['pharn-contracts/finding-shape.md', 'CONSTITUTION.md']);
    await runUninstall({ yes: true });
    expect(notes('UNINSTALLED')).toContain(
      'Deleted 2 file(s) and 1 empty directory,',
    );
  });

  it('names an unreadable settings file in the HOOKS note instead of guessing', async () => {
    await install(FLAT_FILES);
    write('.claude/settings.local.json', '{ not json');
    await runUninstall({ yes: true });
    expect(notes('HOOKS')).toContain(
      '.claude/settings.local.json could not be read (it is not valid JSON)',
    );
  });

  it('refuses under the lock when a directory became a symlink while the prompt was open', async () => {
    await install(['pharn/pharn-contracts/x.md'], config({ layout: 'pharn' }));
    setTTY(true, true);
    const shared = join(tmp.path(), 'shared');
    vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
      const { renameSync } = await import('node:fs');
      renameSync(join(proj, 'pharn'), shared);
      symlinkSync(shared, join(proj, 'pharn'));
      return true;
    });
    await expect(runUninstall()).rejects.toMatchObject(new ProcessExit(1));
    expect(errors()).toMatch(/pharn is a symbolic link/);
    expect(existsSync(join(shared, 'pharn-contracts/x.md'))).toBe(true);
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(true);
  });

  it('refuses under the lock when the record store vanished while the prompt was open', async () => {
    await install(FLAT_FILES);
    setTTY(true, true);
    vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
      rmSync(join(proj, 'pharn.records.json'));
      return true;
    });
    await expect(runUninstall()).rejects.toMatchObject(new ProcessExit(1));
    expect(errors()).toContain('there is no pharn.records.json');
    for (const rel of FLAT_FILES)
      expect(existsSync(join(proj, rel))).toBe(true);
  });

  // Orphans (lib/orphans.ts): files upstream stopped shipping keep their
  // records while they exist. They are pharn's bytes too.
  it('deletes an unchanged orphan and keeps an edited one, listing it', async () => {
    await install([
      ...FLAT_FILES,
      '.claude/commands/pharn-old.md',
      '.claude/hooks/old-hook.cjs',
    ]);
    write('.claude/hooks/old-hook.cjs', 'the user changed this');
    await runUninstall({ yes: true });
    expect(existsSync(join(proj, '.claude/commands/pharn-old.md'))).toBe(false);
    expect(readFileSync(join(proj, '.claude/hooks/old-hook.cjs'), 'utf8')).toBe(
      'the user changed this',
    );
    expect(notes('PLAN')).toContain('  • .claude/hooks/old-hook.cjs');
    expect(notes('UNINSTALLED')).toContain('  • .claude/hooks/old-hook.cjs');
  });

  it('deletes an orphan left at the OTHER layout after a flat → pharn move', async () => {
    await install(
      [...PHARN_FILES, 'pharn-contracts/finding-shape.md', 'CONSTITUTION.md'],
      config({ layout: 'pharn' }),
    );
    await runUninstall({ yes: true });
    expect(existsSync(join(proj, 'pharn-contracts'))).toBe(false);
    expect(existsSync(join(proj, 'CONSTITUTION.md'))).toBe(false);
    // Every recorded file under pharn/ is gone; what is left is the config's
    // backup, which uninstall never deletes — and says so.
    expect(readdirSync(join(proj, 'pharn'))).toEqual(['.backup']);
    expect(notes('UNINSTALLED')).toContain(
      'pharn/ was left because it still holds files pharn has no record of (.backup)',
    );
  });

  describe('a file that vanishes mid-run', () => {
    it('skips a recorded file another process deleted after the plan (ENOENT)', async () => {
      await install(FLAT_FILES);
      const victim = join(proj, 'CONSTITUTION.md');
      fsHooks.unlink = (path) => {
        if (path === victim && existsSync(victim)) {
          fsHooks.unlink = null;
          rmSync(victim);
        }
      };
      await runUninstall({ yes: true });
      expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);
      expect(notes('UNINSTALLED')).toContain(
        `Deleted ${FLAT_FILES.length - 1} file(s)`,
      );
    });

    it('skips a directory another process removed first (ENOENT on rmdir)', async () => {
      await install(FLAT_FILES);
      const dir = join(proj, 'features');
      fsHooks.rmdir = (path) => {
        if (path === dir) {
          fsHooks.rmdir = null;
          rmSync(dir, { recursive: true });
        }
      };
      await runUninstall({ yes: true });
      expect(existsSync(dir)).toBe(false);
      expect(notes('UNINSTALLED')).toContain('and 10 empty directories');
    });

    it('treats an already-deleted pharn.records.json as done', async () => {
      await install(FLAT_FILES);
      const records = join(proj, 'pharn.records.json');
      fsHooks.unlink = (path) => {
        if (path === records && existsSync(records)) rmSync(records);
      };
      await runUninstall({ yes: true });
      expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);
    });
  });

  it('reports a failed final config delete, naming the file to delete by hand', async () => {
    await install(FLAT_FILES);
    const cfg = join(proj, 'pharn.config.json');
    fsHooks.unlink = (path) => {
      if (path === cfg) {
        throw Object.assign(new Error('EACCES: permission denied'), {
          code: 'EACCES',
        });
      }
    };
    await expect(runUninstall({ yes: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(errors()).toMatch(
      /Could not delete pharn\.config\.json: EACCES: permission denied\. Every file pharn could prove it wrote is already gone; delete pharn\.config\.json yourself to finish\./,
    );
    for (const rel of FLAT_FILES)
      expect(existsSync(join(proj, rel))).toBe(false);
    expect(existsSync(join(proj, 'pharn.records.json'))).toBe(false);
    expect(existsSync(cfg)).toBe(true);
    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
  });

  it('reports a failed records delete and keeps the config', async () => {
    await install(FLAT_FILES);
    const records = join(proj, 'pharn.records.json');
    fsHooks.unlink = (path) => {
      if (path === records) {
        throw Object.assign(new Error('EPERM: operation not permitted'), {
          code: 'EPERM',
        });
      }
    };
    await expect(runUninstall({ yes: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(errors()).toContain('Could not delete pharn.records.json');
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(true);
  });

  it('never removes the project root, even when nothing else is left in it', async () => {
    await install(['CONSTITUTION.md']);
    rmSync(join(proj, '.claude'), { recursive: true });
    await runUninstall({ yes: true });
    expect(lstatSync(proj).isDirectory()).toBe(true);
    expect(readdirSync(proj)).toEqual(['pharn']);
    expect(readdirSync(join(proj, 'pharn'))).toEqual(['.backup']);
  });
});
