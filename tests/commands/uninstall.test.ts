import {
  chmodSync,
  cpSync,
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
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import { CANCEL, setTTY } from '../helpers.js';
import {
  AGENT,
  REPO_DIR,
  at,
  clearOutput,
  CONSTITUTION,
  HOOK_SETTINGS,
  installFresh,
  manifestTree,
  NEW_SURFACE,
  PHARN_GITIGNORE_BLOCK,
  proj,
  projectFiles,
  read,
  rootEntries,
  run,
  serveTip,
  SHA_V1,
  snapshot,
  upstreamTree7,
  useHarness,
} from '../support/harness.js';
import type { PharnConfig } from '../../src/types.js';
import { runUninstall } from '../../src/commands/uninstall.js';
import { writePharnConfig } from '../../src/lib/pharn-config.js';
import {
  MODELS_RECORD_KEY,
  writeRecords,
} from '../../src/lib/install-records.js';
import { contentHash } from '../../src/lib/hash.js';
import { LOCK_FILE } from '../../src/lib/project-lock.js';

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

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

const prompts = clack;
/** A sibling of the project under the test's temp dir: outside the project. */
const outside = (): string => join(proj(), '..');

describe('pharn uninstall, end to end', () => {
  it('uninstall --yes deletes what the records prove — the settings.json init wrote included — and keeps edits', async () => {
    await installFresh();
    writeFileSync(at(CONSTITUTION), `my own constitution\n`);
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();

    // Left: the edited file and the backup of the config uninstall removed.
    // Everything else pharn wrote is gone, the directories it emptied
    // included — `.claude/` too, since the settings.json init wrote was still
    // its bytes (CORE-166).
    const left = projectFiles();
    const backups = left.filter((f) => f.startsWith('pharn/.backup/'));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^pharn\/\.backup\/[^/]+\/pharn\.config\.json$/);
    // `.gitignore` too: pharn's lines in it are harmless and stay (removing
    // a user-file line would be a rewrite).
    expect(left.filter((f) => !f.startsWith('pharn/.backup/'))).toEqual([
      '.gitignore',
      CONSTITUTION,
    ]);
    expect(read('.gitignore')).toBe(PHARN_GITIGNORE_BLOCK);
    expect(read(CONSTITUTION)).toBe(`my own constitution\n`);
    expect(existsSync(at('pharn/pharn-pipeline'))).toBe(false);
    expect(existsSync(at('.claude'))).toBe(false);
    expect(existsSync(at(REPO_DIR))).toBe(true);
    // Nothing is left wiring a removed script, so there is no HOOKS note.
    expect(
      vi.mocked(clack.note).mock.calls.some(([, title]) => title === 'HOOKS'),
    ).toBe(false);
  });

  it('uninstall --yes keeps a settings.json edited after init, lists it, and names its dangling hooks', async () => {
    await installFresh();
    const edited = HOOK_SETTINGS.replace('}}', '},"mine":true}');
    expect(edited).not.toBe(HOOK_SETTINGS);
    writeFileSync(at('.claude/settings.json'), edited);
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();

    expect(read('.claude/settings.json')).toBe(edited);
    const bodies = (title: string): string =>
      vi
        .mocked(clack.note)
        .mock.calls.filter(([, t]) => t === title)
        .map(([body]) => String(body))
        .join('\n');
    expect(bodies('PLAN')).toContain(
      'Keep 1 file(s) you changed (they stay where they are):\n  • .claude/settings.json',
    );
    expect(bodies('HOOKS')).toContain(
      '.claude/settings.json still wires 1 hook(s) whose script was removed:',
    );
    expect(bodies('HOOKS')).toContain('.claude/hooks/guard.cjs');
  });
  it('uninstall --yes deletes an unchanged agent and keeps an edited one', async () => {
    await installFresh();
    writeFileSync(at(AGENT), 'my own lens agent\n');
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(read(AGENT)).toBe('my own lens agent\n');
  });
  it('uninstall afterwards leaves no empty pharn/, and names what it kept', async () => {
    serveTip(SHA_V1, '7.0.0', { tree: upstreamTree7('7.0.0') });
    await installFresh();
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(readdirSync(at('pharn'))).toEqual(['.backup']);
    // `.claude/` is gone too: the settings.json init wrote was unchanged, so
    // uninstall deleted it, and the directory ended empty (CORE-166).
    expect(rootEntries()).toEqual(['.gitignore', 'pharn']);
  });
});

function put(rel: string, content = `bytes of ${rel}`): void {
  const abs = at(rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function seedConfig(extra: Partial<PharnConfig> = {}): PharnConfig {
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
  cfg: PharnConfig = seedConfig(),
  extraRecords: Record<string, string> = {},
): Promise<void> {
  const records: Record<string, string> = {};
  for (const rel of files) {
    put(rel);
    records[rel] = contentHash(at(rel));
  }
  put('.claude/settings.json', JSON.stringify(SETTINGS, null, 2));
  await writeRecords(proj(), {
    skillsVersion: cfg.skillsVersion,
    commit: cfg.commit,
    files: { ...records, ...extraRecords },
  });
  await writePharnConfig(proj(), cfg);
}

function noteText(title: string): string {
  return vi
    .mocked(prompts.note)
    .mock.calls.filter((c) => c[1] === title)
    .map((c) => stripVTControlCharacters(String(c[0])))
    .join('\n');
}

function errorText(): string {
  return vi
    .mocked(prompts.log.error)
    .mock.calls.map((c) => stripVTControlCharacters(String(c[0])))
    .join('\n');
}

function backups(): string[] {
  const root = at('pharn/.backup');
  return existsSync(root) ? readdirSync(root) : [];
}

describe('pharn uninstall over a hand-seeded install', () => {
  afterEach(() => {
    fsHooks.unlink = null;
    fsHooks.rmdir = null;
  });

  it('deletes every recorded, unchanged file, the empty dirs, the records and the config', async () => {
    await install(FLAT_FILES);
    const configBytes = readFileSync(at('pharn.config.json'));
    const settingsBytes = readFileSync(at('.claude/settings.json'));

    await runUninstall({ yes: true });

    for (const rel of FLAT_FILES) expect(existsSync(at(rel))).toBe(false);
    for (const dir of [
      'features',
      'pharn-contracts',
      '.dev',
      '.claude/commands',
      '.claude/hooks',
      'pharn-pipeline',
    ])
      expect(existsSync(at(dir))).toBe(false);
    expect(existsSync(at('pharn.config.json'))).toBe(false);
    expect(existsSync(at('pharn.records.json'))).toBe(false);
    expect(existsSync(at(LOCK_FILE))).toBe(false);
    // settings.json is never written, so `.claude/` keeps it — and its dir.
    expect(readFileSync(at('.claude/settings.json'))).toEqual(settingsBytes);
    // The config is saved, byte for byte, before it is deleted.
    const [ts] = backups();
    expect(readFileSync(at(`pharn/.backup/${ts!}/pharn.config.json`))).toEqual(
      configBytes,
    );
    expect(vi.mocked(prompts.log.info)).toHaveBeenCalledWith(
      `Backed up pharn.config.json to pharn/.backup/${ts}.`,
      { output: process.stdout },
    );
    // F-40: the same .gitignore advice every backup notice carries.
    expect(vi.mocked(prompts.log.info)).toHaveBeenCalledWith(
      'pharn/.backup/ is not gitignored — add it to .gitignore or delete it once you are happy.',
      { output: process.stdout },
    );

    const done = noteText('UNINSTALLED');
    expect(done).toContain(
      `Deleted ${FLAT_FILES.length} file(s) and 11 empty directories`,
    );
    expect(done).toContain(
      '.claude/settings.json, .claude/settings.local.json, every pharn/.backup/ directory and the lines pharn added to .gitignore and .prettierignore are left untouched.',
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
    const hooks = noteText('HOOKS');
    expect(hooks).toContain(
      '.claude/settings.json still wires 1 hook(s) whose script was removed:',
    );
    expect(hooks).toContain('protect-trusted-paths.cjs');
    expect(hooks).not.toContain('my-own-guard');
    expect(hooks).toContain('pharn never edits these files');
  });

  // CORE-166: a fresh `init` records the settings.json it wrote. While it still
  // matches that record it is pharn's bytes, so uninstall deletes it with the
  // rest — `.claude/` then ends empty and goes too, and nothing is left wiring a
  // removed script. The UNTOUCHED line stops claiming the file is left.
  describe('a recorded .claude/settings.json (CORE-166)', () => {
    const SETTINGS_FILE = '.claude/settings.json';
    const UNTOUCHED_WITHOUT_SETTINGS =
      '.claude/settings.local.json, every pharn/.backup/ directory and the lines pharn added to .gitignore and .prettierignore are left untouched.';

    async function installRecordingSettings(): Promise<void> {
      await install(FLAT_FILES);
      const records: Record<string, string> = {};
      for (const rel of FLAT_FILES) records[rel] = contentHash(at(rel));
      records[SETTINGS_FILE] = contentHash(at(SETTINGS_FILE));
      await writeRecords(proj(), {
        skillsVersion: seedConfig().skillsVersion,
        commit: seedConfig().commit,
        files: records,
      });
    }

    it('deletes it while unchanged, removes the emptied .claude/, and prints no HOOKS note', async () => {
      await installRecordingSettings();
      await runUninstall({ yes: true });
      expect(existsSync(at(SETTINGS_FILE))).toBe(false);
      expect(existsSync(at('.claude'))).toBe(false);
      expect(noteText('HOOKS')).toBe('');
      const plan = noteText('PLAN');
      expect(plan).toContain(
        `Delete ${FLAT_FILES.length + 1} file(s) pharn installed and nobody changed.`,
      );
      expect(plan).toContain(UNTOUCHED_WITHOUT_SETTINGS);
      expect(plan).not.toContain('.claude/settings.json,');
      const done = noteText('UNINSTALLED');
      expect(done).toContain(`Deleted ${FLAT_FILES.length + 1} file(s)`);
      expect(done).toContain(UNTOUCHED_WITHOUT_SETTINGS);
      expect(done).not.toContain('.claude/settings.json,');
      expect(done).not.toContain('still hold other files');
    });

    it('keeps it once edited, lists it as changed, and the HOOKS note behaves as before', async () => {
      await installRecordingSettings();
      const edited = { ...SETTINGS, mine: true };
      put(SETTINGS_FILE, JSON.stringify(edited, null, 2));
      await runUninstall({ yes: true });
      expect(JSON.parse(readFileSync(at(SETTINGS_FILE), 'utf8'))).toEqual(
        edited,
      );
      expect(noteText('PLAN')).toContain(
        'Keep 1 file(s) you changed (they stay where they are):\n  • .claude/settings.json',
      );
      expect(noteText('UNINSTALLED')).toContain('  • .claude/settings.json');
      expect(noteText('HOOKS')).toContain(
        '.claude/settings.json still wires 1 hook(s) whose script was removed:',
      );
    });
  });

  // F-10: the install copies `.mjs` hooks, so uninstall's install-root bound
  // must take them too — else a pharn-written ESM hook would be left behind.
  it('deletes a recorded .mjs hook, and names its wiring in the HOOKS note', async () => {
    await install([...FLAT_FILES, '.claude/hooks/require-loop-record.mjs']);
    put(
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
    expect(existsSync(at('.claude/hooks/require-loop-record.mjs'))).toBe(false);
    expect(noteText('HOOKS')).toContain('require-loop-record.mjs');
  });

  it('ignores a recorded hooks key that is not an install path', async () => {
    await install(
      FLAT_FILES.filter((f) => !f.startsWith('.claude/hooks/')),
      seedConfig(),
      // Recorded, absent, and wired — but `*.test.cjs` is never installed.
      { '.claude/hooks/protect-trusted-paths.test.cjs': 'd'.repeat(64) },
    );
    put(
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
    expect(noteText('HOOKS')).toBe('');
  });

  it('prints no HOOKS note when no wired hook runs a removed script', async () => {
    await install(FLAT_FILES.filter((f) => !f.startsWith('.claude/hooks/')));
    await runUninstall({ yes: true });
    expect(noteText('HOOKS')).toBe('');
  });

  it('keeps an edited file and the user’s own feature work, and lists them', async () => {
    await install(PHARN_FILES, seedConfig({ layout: 'pharn' }));
    put('pharn/CONSTITUTION.md', 'my amended constitution');
    put('pharn/features/my-feature/PLAN.md', 'my plan');

    await runUninstall({ yes: true });

    expect(readFileSync(at('pharn/CONSTITUTION.md'), 'utf8')).toBe(
      'my amended constitution',
    );
    expect(readFileSync(at('pharn/features/my-feature/PLAN.md'), 'utf8')).toBe(
      'my plan',
    );
    expect(existsSync(at('pharn/features/README.md'))).toBe(false);
    expect(existsSync(at('pharn/pharn-pipeline'))).toBe(false);
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
    expect(existsSync(at('pharn.config.json'))).toBe(false);

    expect(noteText('PLAN')).toContain('Keep 1 file(s) you changed');
    const done = noteText('UNINSTALLED');
    expect(done).toContain('  • pharn/CONSTITUTION.md');
    expect(done).toContain('  • pharn/features');
  });

  it('never deletes a file pharn has no record of, inside a capability dir', async () => {
    await install(FLAT_FILES);
    put('pharn-pipeline/grillers/a11y/my-notes.md', 'mine');
    await runUninstall({ yes: true });
    expect(
      readFileSync(at('pharn-pipeline/grillers/a11y/my-notes.md'), 'utf8'),
    ).toBe('mine');
    expect(existsSync(at('pharn-pipeline/grillers/a11y/a11y.md'))).toBe(false);
    expect(noteText('UNINSTALLED')).toContain(
      '  • pharn-pipeline/grillers/a11y',
    );
  });

  it('names a recorded key outside the install paths in the PLAN note and leaves it', async () => {
    put('src/app.ts', 'user code');
    await install(FLAT_FILES, seedConfig(), {
      'src/app.ts': contentHash(at('src/app.ts')),
      [MODELS_RECORD_KEY]: 'b'.repeat(64),
    });
    await runUninstall({ yes: true });
    expect(readFileSync(at('src/app.ts'), 'utf8')).toBe('user code');
    const plan = noteText('PLAN');
    expect(plan).toContain(
      "Leave 1 recorded path(s) outside pharn's install paths",
    );
    expect(plan).toContain('  • src/app.ts');
    expect(plan).toContain(
      '.claude/settings.json, .claude/settings.local.json, every pharn/.backup/ directory and the lines pharn added to .gitignore and .prettierignore are left untouched.',
    );
  });

  it('leaves earlier pharn/.backup/ directories untouched', async () => {
    await install(FLAT_FILES);
    put('pharn/.backup/2026-01-01T00-00-00Z/CONSTITUTION.md', 'old');
    await runUninstall({ yes: true });
    expect(
      readFileSync(
        at('pharn/.backup/2026-01-01T00-00-00Z/CONSTITUTION.md'),
        'utf8',
      ),
    ).toBe('old');
    expect(backups()).toHaveLength(2);
  });

  // CORE-161: a recorded hash proves authorship whatever the store's stamp,
  // so a store stamped for another install state (a torn run) still proves
  // which files pharn wrote — uninstall proceeds instead of refusing.
  it('uninstalls when the store is stamped for another install state', async () => {
    await install(FLAT_FILES);
    await writePharnConfig(proj(), seedConfig({ skillsVersion: '6.51.0' }));

    await runUninstall({ yes: true });

    for (const rel of FLAT_FILES) expect(existsSync(at(rel))).toBe(false);
    expect(existsSync(at('pharn.config.json'))).toBe(false);
    expect(existsSync(at('pharn.records.json'))).toBe(false);
    expect(vi.mocked(prompts.outro).mock.calls.at(-1)![0]).toContain(
      'PHARN was uninstalled.',
    );
  });

  it('is a benign no-op when PHARN is not installed (exit 0)', async () => {
    put('README.md', 'a project');
    const before = snapshot();
    await runUninstall({ yes: true });
    expect(snapshot()).toEqual(before);
    expect(vi.mocked(prompts.outro)).toHaveBeenCalledWith(
      'PHARN is not installed here (no pharn.config.json). Nothing was removed.',
    );
  });

  it('exits 1 on a legacy (module) config, writing nothing', async () => {
    put(
      'pharn.config.json',
      JSON.stringify({ ...seedConfig(), capabilities: undefined }),
    );
    const before = snapshot();
    expect(await run(() => runUninstall({ yes: true }))).toBe(1);
    expect(snapshot()).toEqual(before);
  });

  describe('refuses with nothing removed', () => {
    async function expectRefusal(match: RegExp | string): Promise<void> {
      const before = snapshot();
      expect(await run(() => runUninstall({ yes: true }))).toBe(1);
      expect(snapshot()).toEqual(before);
      expect(errorText()).toMatch(match);
    }

    it('when there is no pharn.records.json', async () => {
      await install(FLAT_FILES);
      rmSync(at('pharn.records.json'));
      await expectRefusal(
        /there is no pharn\.records\.json.*Removing PHARN by hand/s,
      );
    });

    it('when the store is corrupt', async () => {
      await install(FLAT_FILES);
      put('pharn.records.json', '{ not json');
      await expectRefusal(/pharn\.records\.json is not valid JSON/);
    });

    it('when a directory on the way is a symbolic link', async () => {
      const shared = join(outside(), 'shared');
      mkdirSync(join(shared, 'commands'), { recursive: true });
      await install(['CONSTITUTION.md'], seedConfig(), {});
      // Record a file reached THROUGH a symlinked `.claude/`. (A symlinked
      // `pharn/` is refused earlier still, by the lock, which lives in it.)
      writeFileSync(join(shared, 'commands/pharn-plan.md'), 'outside');
      rmSync(at('.claude'), { recursive: true, force: true });
      symlinkSync(shared, at('.claude'));
      await writeRecords(proj(), {
        skillsVersion: '6.50.0',
        commit: 'c'.repeat(40),
        files: {
          '.claude/commands/pharn-plan.md': contentHash(
            join(shared, 'commands/pharn-plan.md'),
          ),
        },
      });
      await expectRefusal(/\.claude is a symbolic link.*OUTSIDE the project/);
      expect(existsSync(join(shared, 'commands/pharn-plan.md'))).toBe(true);
    });

    it('when pharn/ itself is a symbolic link (the lock lives there)', async () => {
      const shared = join(outside(), 'shared-pharn');
      mkdirSync(shared, { recursive: true });
      await install(['CONSTITUTION.md'], seedConfig({ layout: 'pharn' }), {});
      symlinkSync(shared, at('pharn'));
      await expectRefusal(/pharn is a symbolic link\. pharn keeps its lock/);
      expect(existsSync(at('CONSTITUTION.md'))).toBe(true);
      expect(readdirSync(shared)).toEqual([]);
    });

    it('when a parent is swapped to a symbolic link while the confirm is open', async () => {
      await install(FLAT_FILES);
      const shared = join(outside(), 'swapped');
      mkdirSync(shared, { recursive: true });
      cpSync(at('pharn-contracts'), shared, { recursive: true });
      const before = readdirSync(shared).sort();
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
        rmSync(at('pharn-contracts'), { recursive: true });
        symlinkSync(shared, at('pharn-contracts'));
        return true;
      });
      expect(await run(() => runUninstall())).toBe(1);
      expect(errorText()).toMatch(
        /pharn-contracts is a symbolic link.*Nothing was removed/,
      );
      expect(readdirSync(shared).sort()).toEqual(before);
      expect(existsSync(at('pharn.config.json'))).toBe(true);
      for (const rel of FLAT_FILES.filter(
        (r) => !r.startsWith('pharn-contracts/'),
      ))
        expect(existsSync(at(rel))).toBe(true);
    });

    it('when the config cannot be backed up (pharn/.backup is a symlink)', async () => {
      await install(FLAT_FILES);
      mkdirSync(join(outside(), 'elsewhere'));
      mkdirSync(at('pharn'), { recursive: true });
      symlinkSync(join(outside(), 'elsewhere'), at('pharn/.backup'));
      await expectRefusal(
        /Could not back up pharn\.config\.json before uninstalling.*Nothing was removed/,
      );
    });

    it('when another pharn process holds the lock', async () => {
      await install(FLAT_FILES);
      mkdirSync(at('pharn'), { recursive: true });
      writeFileSync(
        at(LOCK_FILE),
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
      const before = snapshot();
      expect(await run(() => runUninstall())).toBe(1);
      expect(snapshot()).toEqual(before);
      expect(errorText()).toContain('pass --yes');
      expect(prompts.confirm).not.toHaveBeenCalled();
    });

    it('asks in a TTY (default No) and does nothing when declined', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockResolvedValueOnce(false);
      const before = snapshot();
      expect(await run(() => runUninstall())).toBe(0);
      expect(snapshot()).toEqual(before);
      expect(vi.mocked(prompts.confirm).mock.calls[0]![0]).toMatchObject({
        initialValue: false,
        message: `Uninstall PHARN — delete ${FLAT_FILES.length} file(s), pharn.records.json and pharn.config.json?`,
      });
    });

    it('treats a cancelled prompt as declined', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockResolvedValueOnce(CANCEL as never);
      const before = snapshot();
      expect(await run(() => runUninstall())).toBe(0);
      expect(snapshot()).toEqual(before);
    });

    it('uninstalls when confirmed', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockResolvedValueOnce(true);
      await runUninstall();
      expect(existsSync(at('pharn.config.json'))).toBe(false);
    });

    it('refuses when the config changed while the prompt was open', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
        await writePharnConfig(proj(), seedConfig({ archetypes: ['spa'] }));
        return true;
      });
      expect(await run(() => runUninstall())).toBe(1);
      for (const rel of FLAT_FILES) expect(existsSync(at(rel))).toBe(true);
      expect(errorText()).toContain(
        'changed while `pharn uninstall` was running',
      );
    });

    it('re-plans under the lock: a file edited while the prompt was open is kept', async () => {
      await install(FLAT_FILES);
      setTTY(true, true);
      vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
        put('ARCHITECTURE.md', 'edited while the prompt was open');
        return true;
      });
      await runUninstall();
      expect(readFileSync(at('ARCHITECTURE.md'), 'utf8')).toBe(
        'edited while the prompt was open',
      );
      expect(noteText('UNINSTALLED')).toContain('  • ARCHITECTURE.md');
    });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'stops on a failed delete with config + records kept, and a re-run finishes',
    async () => {
      await install(FLAT_FILES);
      const locked = at('pharn-contracts');
      chmodSync(locked, 0o555);
      try {
        expect(await run(() => runUninstall({ yes: true }))).toBe(1);
        expect(errorText()).toMatch(
          /Could not delete pharn-contracts\/finding-shape\.md.*re-running `pharn uninstall` continues/,
        );
        expect(existsSync(at('pharn.config.json'))).toBe(true);
        expect(existsSync(at('pharn.records.json'))).toBe(true);
        expect(existsSync(at(LOCK_FILE))).toBe(false);
      } finally {
        chmodSync(locked, 0o755);
      }
      clearOutput();
      await runUninstall({ yes: true });
      for (const rel of FLAT_FILES) expect(existsSync(at(rel))).toBe(false);
      expect(existsSync(at('pharn.config.json'))).toBe(false);
      expect(noteText('PLAN')).toMatch(/recorded file\(s\) are already gone/);
    },
  );

  it('caps a long kept list and names a path it cannot verify', async () => {
    const many = Array.from(
      { length: 12 },
      (_, i) => `pharn-contracts/c${i}.md`,
    );
    await install([...many, 'CONSTITUTION.md']);
    for (const rel of many) put(rel, 'edited');
    // A directory where a recorded file should be: not a regular file.
    rmSync(at('CONSTITUTION.md'));
    mkdirSync(at('CONSTITUTION.md'));
    await runUninstall({ yes: true });
    const plan = noteText('PLAN');
    expect(plan).toContain('Keep 12 file(s) you changed');
    expect(plan).toContain('  …and 2 more');
    expect(plan).toContain('Keep 1 path(s) that cannot be verified');
    expect(plan).toContain('  • CONSTITUTION.md');
    expect(lstatSync(at('CONSTITUTION.md')).isDirectory()).toBe(true);
    expect(noteText('UNINSTALLED')).toContain(
      'Deleted 0 file(s) and 0 empty directories',
    );
  });

  it('says "directory" for exactly one removed directory', async () => {
    await install(['pharn-contracts/finding-shape.md', 'CONSTITUTION.md']);
    await runUninstall({ yes: true });
    expect(noteText('UNINSTALLED')).toContain(
      'Deleted 2 file(s) and 1 empty directory,',
    );
  });

  it('names an unreadable settings file in the HOOKS note instead of guessing', async () => {
    await install(FLAT_FILES);
    put('.claude/settings.local.json', '{ not json');
    await runUninstall({ yes: true });
    expect(noteText('HOOKS')).toContain(
      '.claude/settings.local.json could not be read (it is not valid JSON)',
    );
  });

  it('refuses under the lock when a directory became a symlink while the prompt was open', async () => {
    await install(
      ['pharn/pharn-contracts/x.md'],
      seedConfig({ layout: 'pharn' }),
    );
    setTTY(true, true);
    const shared = join(outside(), 'shared');
    vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
      const { renameSync } = await import('node:fs');
      renameSync(at('pharn'), shared);
      symlinkSync(shared, at('pharn'));
      return true;
    });
    expect(await run(() => runUninstall())).toBe(1);
    expect(errorText()).toMatch(/pharn is a symbolic link/);
    expect(existsSync(join(shared, 'pharn-contracts/x.md'))).toBe(true);
    expect(existsSync(at('pharn.config.json'))).toBe(true);
  });

  it('refuses under the lock when the record store vanished while the prompt was open', async () => {
    await install(FLAT_FILES);
    setTTY(true, true);
    vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
      rmSync(at('pharn.records.json'));
      return true;
    });
    expect(await run(() => runUninstall())).toBe(1);
    expect(errorText()).toContain('there is no pharn.records.json');
    for (const rel of FLAT_FILES) expect(existsSync(at(rel))).toBe(true);
  });

  // Orphans (lib/orphans.ts): files upstream stopped shipping keep their
  // records while they exist. They are pharn's bytes too.
  it('deletes an unchanged orphan and keeps an edited one, listing it', async () => {
    await install([
      ...FLAT_FILES,
      '.claude/commands/pharn-old.md',
      '.claude/hooks/old-hook.cjs',
    ]);
    put('.claude/hooks/old-hook.cjs', 'the user changed this');
    await runUninstall({ yes: true });
    expect(existsSync(at('.claude/commands/pharn-old.md'))).toBe(false);
    expect(readFileSync(at('.claude/hooks/old-hook.cjs'), 'utf8')).toBe(
      'the user changed this',
    );
    expect(noteText('PLAN')).toContain('  • .claude/hooks/old-hook.cjs');
    expect(noteText('UNINSTALLED')).toContain('  • .claude/hooks/old-hook.cjs');
  });

  it('deletes an orphan left at the OTHER layout after a flat → pharn move', async () => {
    await install(
      [...PHARN_FILES, 'pharn-contracts/finding-shape.md', 'CONSTITUTION.md'],
      seedConfig({ layout: 'pharn' }),
    );
    await runUninstall({ yes: true });
    expect(existsSync(at('pharn-contracts'))).toBe(false);
    expect(existsSync(at('CONSTITUTION.md'))).toBe(false);
    // Every recorded file under pharn/ is gone; what is left is the config's
    // backup, which uninstall never deletes — and says so.
    expect(readdirSync(at('pharn'))).toEqual(['.backup']);
    expect(noteText('UNINSTALLED')).toContain(
      'pharn/ was left because it still holds files pharn has no record of (.backup)',
    );
  });

  describe('a file that vanishes mid-run', () => {
    it('skips a recorded file another process deleted after the plan (ENOENT)', async () => {
      await install(FLAT_FILES);
      const victim = at('CONSTITUTION.md');
      fsHooks.unlink = (path) => {
        if (path === victim && existsSync(victim)) {
          fsHooks.unlink = null;
          rmSync(victim);
        }
      };
      await runUninstall({ yes: true });
      expect(existsSync(at('pharn.config.json'))).toBe(false);
      expect(noteText('UNINSTALLED')).toContain(
        `Deleted ${FLAT_FILES.length - 1} file(s)`,
      );
    });

    it('skips a directory another process removed first (ENOENT on rmdir)', async () => {
      await install(FLAT_FILES);
      const dir = at('features');
      fsHooks.rmdir = (path) => {
        if (path === dir) {
          fsHooks.rmdir = null;
          rmSync(dir, { recursive: true });
        }
      };
      await runUninstall({ yes: true });
      expect(existsSync(dir)).toBe(false);
      expect(noteText('UNINSTALLED')).toContain('and 10 empty directories');
    });

    it('treats an already-deleted pharn.records.json as done', async () => {
      await install(FLAT_FILES);
      const records = at('pharn.records.json');
      fsHooks.unlink = (path) => {
        if (path === records && existsSync(records)) rmSync(records);
      };
      await runUninstall({ yes: true });
      expect(existsSync(at('pharn.config.json'))).toBe(false);
    });
  });

  it('reports a failed final config delete, naming the file to delete by hand', async () => {
    await install(FLAT_FILES);
    const cfg = at('pharn.config.json');
    fsHooks.unlink = (path) => {
      if (path === cfg) {
        throw Object.assign(new Error('EACCES: permission denied'), {
          code: 'EACCES',
        });
      }
    };
    expect(await run(() => runUninstall({ yes: true }))).toBe(1);
    expect(errorText()).toMatch(
      /Could not delete pharn\.config\.json: EACCES: permission denied\. Every file pharn could prove it wrote is already gone; delete pharn\.config\.json yourself to finish\./,
    );
    for (const rel of FLAT_FILES) expect(existsSync(at(rel))).toBe(false);
    expect(existsSync(at('pharn.records.json'))).toBe(false);
    expect(existsSync(cfg)).toBe(true);
    expect(existsSync(at(LOCK_FILE))).toBe(false);
  });

  it('reports a failed records delete and keeps the config', async () => {
    await install(FLAT_FILES);
    const records = at('pharn.records.json');
    fsHooks.unlink = (path) => {
      if (path === records) {
        throw Object.assign(new Error('EPERM: operation not permitted'), {
          code: 'EPERM',
        });
      }
    };
    expect(await run(() => runUninstall({ yes: true }))).toBe(1);
    expect(errorText()).toContain('Could not delete pharn.records.json');
    expect(existsSync(at('pharn.config.json'))).toBe(true);
  });

  it('never removes the project root, even when nothing else is left in it', async () => {
    await install(['CONSTITUTION.md']);
    rmSync(at('.claude'), { recursive: true });
    await runUninstall({ yes: true });
    expect(lstatSync(proj()).isDirectory()).toBe(true);
    expect(rootEntries()).toEqual(['pharn']);
    expect(readdirSync(at('pharn'))).toEqual(['.backup']);
  });
});

// CORE-194: a file installed into a surface the CLI names nowhere is still an
// install path, so uninstall deletes it under the records hash rule.
describe('uninstall after an install from pharn-install.json', () => {
  it('deletes a new-surface file it can prove it wrote, with its empty dirs', async () => {
    serveTip(SHA_V1, '7.20.0', { tree: manifestTree('7.20.0') });
    await installFresh();
    expect(read(NEW_SURFACE)).toBe('skill 7.20.0\n');
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(existsSync(at(NEW_SURFACE))).toBe(false);
    expect(existsSync(at('.claude/skills'))).toBe(false);
  });

  it('keeps an edited new-surface file', async () => {
    serveTip(SHA_V1, '7.20.0', { tree: manifestTree('7.20.0') });
    await installFresh();
    writeFileSync(at(NEW_SURFACE), 'mine now\n');
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(read(NEW_SURFACE)).toBe('mine now\n');
  });
});
