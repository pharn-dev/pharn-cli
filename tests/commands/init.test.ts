import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import * as prettier from 'prettier';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import {
  CANCEL,
  restoreNodeVersion,
  setNodeVersion,
  setTTY,
} from '../helpers.js';
import {
  A11Y,
  AGENT,
  at,
  backupFiles,
  capability,
  clearOutput,
  config,
  CONSTITUTION,
  editConfig,
  editRecords,
  exists,
  failures,
  FLOOR,
  fetched,
  fetchStub,
  FLAT,
  HOOK,
  HOOK_SETTINGS,
  INSTALLED,
  installFresh,
  legacyInstall,
  MANIFEST,
  manifestTree,
  NEW_SURFACE,
  interactive,
  lastOutro,
  logs,
  N_PLUS_ONE,
  notes,
  printed,
  PLAN_COMMAND,
  proj,
  projectFiles,
  read,
  records,
  RELEASE_URL,
  RESOLVE_URL,
  run,
  SECURITY,
  serveTip,
  SETTINGS,
  sha256,
  SHA_V1,
  SHA_V2,
  SHA_V3,
  snapshot,
  STATE_FILES,
  stderr,
  stdout,
  tagCommitUrl,
  tarballUrl,
  upstream,
  upstreamTree,
  UPSTREAM_MODELS,
  useHarness,
  VERSION_URL,
  withManifest,
  write,
  serveRefusedDest,
} from '../support/harness.js';
import { runInit } from '../../src/commands/init.js';
import { runInstallArchetype } from '../../src/steps/install-archetype.js';
import { parseCapabilityIndex } from '../../src/lib/capability-index.js';
// Spied on (never mocked) to count planner calls per run.
import * as initPlanModule from '../../src/lib/init-plan.js';

const { buildInitPlan, resolveInitSelection } = initPlanModule;
import { runAdd } from '../../src/commands/add.js';
import { runUpdate } from '../../src/commands/update.js';
import { runRemove } from '../../src/commands/remove.js';
import { runStatus } from '../../src/commands/status.js';
import { runUninstall } from '../../src/commands/uninstall.js';
import { runList } from '../../src/commands/list.js';
import { LEGACY_CONFIG_KEYS } from '../../src/lib/pharn-config.js';
import { displayHook } from '../../src/lib/hook-wiring.js';
import { CliError } from '../../src/lib/cli-error.js';
import { reportCliError } from '../../src/lib/report-error.js';
import {
  MODELS_RECORD_KEY,
  modelsRecordHash,
} from '../../src/lib/install-records.js';

// A pass-through `node:fs` with one hook: the lock's exclusive create, so a
// case can make a write target appear INSIDE the lock — after init's pre-lock
// check, before its install — the way a concurrent writer would.
const fsHooks = vi.hoisted(() => ({
  open: null as null | ((path: string, flags: unknown) => void),
}));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const openSync = ((path: string, flags: unknown, ...rest: unknown[]) => {
    fsHooks.open?.(String(path), flags);
    return (real.openSync as (...a: unknown[]) => number)(path, flags, ...rest);
  }) as typeof real.openSync;
  return { ...real, default: { ...real, openSync }, openSync };
});

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();
afterEach(() => {
  fsHooks.open = null;
  restoreNodeVersion();
});

/** The slice of the `status --json` report these cases read. */
interface StatusJson {
  capabilities: { count: number };
}

const NEXT_APP = JSON.stringify({ dependencies: { next: '14.0.0' } });
/** A Next.js app: detection resolves `ssr` (security + a11y, not n-plus-one). */
const ssrProject = (): void => write('package.json', NEXT_APP);

const errors = (): string => logs('error').join('\n');
const warned = (): string => logs('warn').join('\n');
const informed = (): string => logs('info').join('\n');
const allNotes = (): string[] =>
  vi
    .mocked(clack.note)
    .mock.calls.map(([body]) => stripVTControlCharacters(String(body)));
const summary = (): string =>
  allNotes().find((b) => b.includes('PHARN Install Summary')) ?? '';
/** The overwrite prompt's warning (the only one that lists paths). */
const overwriteWarning = (): string =>
  logs('warn').find((w) =>
    w.includes('already exist and may be overwritten'),
  ) ?? '';

/**
 * Point the clone's temp dir (os.tmpdir) at a private directory, so a case can
 * see the clone removed — `repo.cleanup()` in init's `finally` — on every exit.
 */
function watchClones(): () => string[] {
  const dir = join(proj(), '..', 'clones');
  mkdirSync(dir);
  vi.stubEnv('TMPDIR', dir);
  return () => readdirSync(dir);
}

/** The interactive re-run: the summary answered, the overwrite prompt too. */
async function rerun(
  answers: { select?: unknown[]; confirm?: unknown[] } = {
    select: ['install'],
    confirm: [true],
  },
): Promise<number | null> {
  clearOutput();
  interactive(answers);
  return run(() => runInit());
}

describe('pharn init, end to end', () => {
  it('init --yes installs the archetype selection into an empty project', async () => {
    await installFresh();

    // The selection for `lib` (the universal griller only), every product
    // surface at the clone's `pharn/` layout, and none of the dev-only files.
    expect(projectFiles()).toEqual([...INSTALLED, ...STATE_FILES].sort());
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(read('pharn/LICENSE')).toBe('Apache-2.0\n');

    expect(config()).toMatchObject({
      skillsVersion: '1.0.0',
      commit: SHA_V1,
      layout: 'pharn',
      capabilities: [{ name: 'security', role: 'griller', source: 'auto' }],
      archetypes: ['lib'],
      models: UPSTREAM_MODELS,
    });
    expect(config()).not.toHaveProperty('modules');
    expect(config()).not.toHaveProperty('frozenCapabilities');
    expect(config()).not.toHaveProperty('seam');
    expect(config()).not.toHaveProperty('updatedAt');

    // Every file pharn wrote is recorded at the hash of what landed, stamped
    // with the config pair — the settings.json this fresh install wrote too
    // (CORE-166), so `uninstall` can prove it is pharn's — plus the models
    // block, and nothing else.
    const rec = records();
    expect(rec).toMatchObject({ skillsVersion: '1.0.0', commit: SHA_V1 });
    for (const rel of INSTALLED) expect(rec.files[rel], rel).toBe(sha256(rel));
    expect(Object.keys(rec.files).sort()).toEqual(
      [...INSTALLED, MODELS_RECORD_KEY].sort(),
    );
    expect(rec.files[MODELS_RECORD_KEY]).toBe(
      modelsRecordHash(UPSTREAM_MODELS),
    );
    // A first install makes no backup, and a fully parsed clone warns nothing.
    expect(exists('pharn/.backup')).toBe(false);
    expect(informed()).not.toContain('Backed up');
    expect(logs('warn')).toEqual([]);
  });

  // CORE-172: the settings.json a fresh init writes is the hook commands
  // Claude Code will run; init lists them, read from the clone it copied.
  it('init --yes lists the hooks of the settings.json it writes', async () => {
    await installFresh();
    const hooks = notes('HOOKS');
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toContain(
      'Wrote .claude/settings.json from upstream. It wires 1 hook(s):',
    );
    expect(hooks[0]).toContain(
      'PreToolUse [Write]: {"type":"command","command":"node .claude/hooks/guard.cjs"}',
    );
    expect(hooks[0]).toContain(
      'Claude Code runs these commands; review `.claude/settings.json`.',
    );
    expect(read(SETTINGS)).toBe(HOOK_SETTINGS);
  });

  it('init keeps a Prettier project’s check off every file pharn wrote; update, status and uninstall leave it', async () => {
    writeFileSync(at('.prettierrc'), '{}\n');
    await installFresh();
    const written = read('.prettierignore');
    const owned = [
      ...INSTALLED.filter((f) => f !== SETTINGS),
      'pharn.config.json',
      'pharn.records.json',
    ];
    for (const rel of owned) {
      const info = await prettier.getFileInfo(at(rel), {
        ignorePath: at('.prettierignore'),
      });
      expect(info.ignored, rel).toBe(true);
    }
    // The user's own settings and files stay under their check.
    for (const rel of [SETTINGS, 'src/index.ts', 'README.md'])
      expect(
        (
          await prettier.getFileInfo(at(rel), {
            ignorePath: at('.prettierignore'),
          })
        ).ignored,
        rel,
      ).toBe(false);

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.prettierignore')).toBe(written);

    expect(await run(() => runStatus({ json: true }))).toBeNull();
    expect(JSON.parse(stdout().at(-1) ?? '').prettierignore).toBeNull();

    // A deleted line comes back, once.
    writeFileSync(
      at('.prettierignore'),
      written.replace('/pharn.config.json\n', ''),
    );
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    expect(JSON.parse(stdout().at(-1) ?? '').prettierignore).toEqual({
      action: 'append',
      entries: ['/pharn.config.json'],
    });
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.prettierignore')).toBe(
      written.replace('/pharn.config.json\n', '') + '/pharn.config.json\n',
    );

    const before = read('.prettierignore');
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(read('.prettierignore')).toBe(before);
  });

  it('a config without `modules` loads in every command, and a re-run init carries its manual entry', async () => {
    await installFresh();
    expect(await run(() => runAdd('a11y'))).toBeNull();
    editConfig((c) => {
      delete c.modules;
    });

    clearOutput();
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    const report = JSON.parse(stdout().at(-1) ?? '') as StatusJson;
    expect(report.capabilities.count).toBe(2);
    expect(await run(() => runAdd('n-plus-one'))).toBeNull();
    expect(config().capabilities).toContainEqual({
      name: 'n-plus-one',
      role: 'lens',
      source: 'manual',
    });
    expect(await run(() => runRemove('n-plus-one'))).toBeNull();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();

    clearOutput();
    expect(await run(() => runInit({ dryRun: true, json: true }))).toBeNull();
    const plan = JSON.parse(stdout().at(-1) ?? '') as {
      capabilities: { carried: { manual: string[] } };
    };
    expect(plan.capabilities.carried.manual).toEqual(['griller:a11y']);
  });

  // CORE-189 (v0.21.0): a config an older CLI wrote, with `modules: []` and the
  // module-era and wizard fields, loads in every command; the first config
  // write drops every one of them, and nothing carries them as the user's.
  it('an old config with `modules` and the legacy fields loads in every command, and a write drops them', async () => {
    await installFresh();
    const legacy = {
      modules: [],
      constitution: 'minimal',
      isMultiTenant: false,
      stackAnswers: { db: 'postgres' },
      installedSkills: [{ skill: 'x', from: 'y' }],
    };
    expect(Object.keys(legacy)).toEqual([...LEGACY_CONFIG_KEYS]);
    const plant = (): void => editConfig((c) => Object.assign(c, legacy));
    const dropped = (): void => {
      for (const key of LEGACY_CONFIG_KEYS) {
        expect(config()).not.toHaveProperty(key);
      }
    };

    // The readers: nothing written, so the old keys stay as found.
    plant();
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    expect(await run(() => runList({ json: true }))).toBeNull();
    expect(await run(() => runUpdate({ dryRun: true }))).toBeNull();
    expect(await run(() => runInit({ dryRun: true, json: true }))).toBeNull();
    expect(config()).toMatchObject(legacy);

    // Every writer drops them.
    expect(await run(() => runAdd('a11y'))).toBeNull();
    dropped();
    plant();
    expect(await run(() => runRemove('a11y'))).toBeNull();
    dropped();
    plant();
    expect(await rerun()).toBeNull();
    dropped();
    plant();
    serveTip(SHA_V2, '2.0.0');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(config().skillsVersion).toBe('2.0.0');
    dropped();

    plant();
    expect(await run(() => runUninstall({ yes: true }))).toBeNull();
    expect(exists('pharn.config.json')).toBe(false);
  });

  it('an init that preserved an existing settings.json records nothing for it', async () => {
    write(SETTINGS, '{"mine":true}\n');
    await installFresh();
    expect(read(SETTINGS)).toBe('{"mine":true}\n');
    expect(records().files).not.toHaveProperty(SETTINGS);
  });

  it('a re-run init keeps the record of the settings.json it now preserves', async () => {
    await installFresh();
    const hash = records().files[SETTINGS];
    expect(hash).toBe(sha256(SETTINGS));
    expect(await rerun()).toBeNull();
    expect(read(SETTINGS)).toBe(HOOK_SETTINGS);
    expect(records().files[SETTINGS]).toBe(hash);
  });

  it('init --yes installs and records the review lens agent, never a pharn-dev-* agent', async () => {
    await installFresh();
    expect(read(AGENT)).toBe('review lens agent 1.0.0\n');
    expect(records().files[AGENT]).toBe(sha256(AGENT));
    expect(existsSync(at('.claude/agents/pharn-dev-reviewer.md'))).toBe(false);
  });

  it('a first init prints no ROOT MIGRATION note, even with memory-bank/ at the root', async () => {
    serveTip(SHA_V1, '7.0.0', { tree: upstreamTree('7.0.0') });
    write('memory-bank/canon.md', 'canon\n');
    await installFresh();
    expect(notes('ROOT MIGRATION')).toEqual([]);
    expect(read('memory-bank/canon.md')).toBe('canon\n');
  });

  it('a re-run init hints at memory-bank/ and never moves it (dry run and real run)', async () => {
    serveTip(SHA_V1, '7.0.0', { tree: upstreamTree('7.0.0') });
    await installFresh();
    write('memory-bank/canon.md', 'canon\n');
    // v0.21.0: the root-footprint migration is removed — no ROOT MIGRATION
    // note and no `git mv` hint in either run; memory-bank/ is never touched.
    const HINT = 'git mv memory-bank pharn/memory-bank';

    clearOutput();
    expect(await run(() => runInit({ dryRun: true }))).toBeNull();
    expect(notes('ROOT MIGRATION')).toEqual([]);
    expect(printed()).not.toContain(HINT);

    expect(await rerun()).toBeNull();
    expect(process.exitCode).toBeUndefined();
    expect(notes('ROOT MIGRATION')).toEqual([]);
    expect(printed()).not.toContain(HINT);
    expect(read('memory-bank/canon.md')).toBe('canon\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
  });

  it('init with no --ref installs the newest verified release and records it', async () => {
    await installFresh();
    expect(config()).toMatchObject({
      ref: 'latest',
      skillsVersion: '1.0.0',
      commit: SHA_V1,
    });
    // The release and its tag's commit were resolved; the tip never was.
    expect(fetched()).toContain(RELEASE_URL);
    expect(fetched()).toContain(tagCommitUrl('v1.0.0'));
    expect(fetched()).not.toContain(RESOLVE_URL);
  });

  // A re-run without --ref moves an install off `main` to the release: the
  // summary says so, names the flag that keeps it, and that it goes BACK.
  it('a re-run without --ref over a `main` install names the move to the release', async () => {
    serveTip(SHA_V2, '2.0.0');
    await installFresh({ ref: 'main' });
    serveTip(SHA_V1, '1.0.0');
    expect(await rerun()).toBeNull();
    expect(summary()).toContain(
      'previously followed: main (the pharn-oss tip) — pass --ref main to keep it',
    );
    expect(summary()).toContain(
      'installed v2.0.0 is newer than release v1.0.0 — this re-install goes back to it',
    );
    expect(config()).toMatchObject({ ref: 'latest', skillsVersion: '1.0.0' });
  });

  it('--ref latest is the same channel, recorded the same way', async () => {
    await installFresh({ ref: 'latest' });
    expect(config().ref).toBe('latest');
    expect(fetched()).not.toContain(RESOLVE_URL);
  });

  it('init with no --ref and no release refuses, names --ref main, and fetches no tarball', async () => {
    serveTip(SHA_V1, '1.0.0', { published: false });
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(existsSync(at('pharn.config.json'))).toBe(false);
    expect(fetched().some((u) => u.startsWith('https://codeload.'))).toBe(
      false,
    );
    expect(errors()).toContain('has published no release yet');
    expect(errors()).toContain('pharn init --ref main');
    // The resolver's own message, never wrapped as a network failure, and no
    // fall back to main.
    expect(errors()).not.toContain('Could not reach');
    expect(fetched()).not.toContain(RESOLVE_URL);
  });

  it('--ref main installs the tip, records no ref, and update keeps it on main with one notice', async () => {
    expect(await run(() => runInit({ yes: true, ref: 'main' }))).toBeNull();
    expect(config().ref).toBeUndefined();
    expect(fetched()).toContain(RESOLVE_URL);
    expect(fetched()).not.toContain(RELEASE_URL);
    const notice = (): string[] =>
      logs('info').filter((m) =>
        m.startsWith('Verified releases are now the default'),
      );
    // init itself prints no notice.
    expect(notice()).toEqual([]);

    serveTip(SHA_V2, '2.0.0');
    fetchStub.mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    // Followed main — not the release the stub also publishes — and said so once.
    expect(fetched()).toContain(VERSION_URL);
    expect(fetched()).not.toContain(RELEASE_URL);
    expect(config()).toMatchObject({ skillsVersion: '2.0.0', commit: SHA_V2 });
    expect(config().ref).toBeUndefined();
    expect(notice()).toEqual([
      'Verified releases are now the default for new installs. This install keeps following pharn-oss main; run `pharn update --ref latest` to switch (recorded on first use).',
    ]);

    // And status reports the recorded channel as main.
    clearOutput();
    expect(await run(() => runStatus({ json: true }))).toBeNull();
    const report = JSON.parse(stdout()[0] ?? '') as {
      version: { channel: string; source: { kind: string } };
    };
    expect(report.version.channel).toBe('main');
    expect(report.version.source.kind).toBe('main');
  });
});

// ---------------------------------------------------------------------------
// Every refusal that comes before the download: nothing fetched, nothing
// written, and nothing on stdout (the banner and intro print only once every
// gate has passed — F-29).
// ---------------------------------------------------------------------------

describe('init refuses before any download', () => {
  const refusedQuietly = (): void => {
    expect(fetched()).toEqual([]);
    expect(stdout()).toEqual([]);
    expect(clack.intro).not.toHaveBeenCalled();
    expect(informed()).not.toContain('PHARN_DEBUG');
  };

  // The Node floor is the first fact about the environment: it wins over a
  // missing .git and over the non-TTY refusal.
  it.each([
    ['24.1.9', '24.1.9'],
    ['20.13.0', '20.13.0'],
    ['weird', 'could not read'],
  ])('on Node %s: exit 1, ahead of every other gate', async (v, named) => {
    setNodeVersion(v);
    rmSync(at('.git'), { recursive: true });
    const before = snapshot();
    expect(await run(() => runInit())).toBe(1);
    expect(errors()).toContain('24.2.0');
    expect(errors()).toContain(named);
    expect(errors()).not.toContain('git not found');
    expect(errors()).not.toContain('interactive');
    expect(snapshot()).toEqual(before);
    refusedQuietly();
  });

  it('lets a supported Node through to the normal flow', async () => {
    setNodeVersion('24.2.0');
    await installFresh();
  });

  // The git prerequisite's error wins over the TTY message.
  it('without a .git: exit 1, says how to make one — over the TTY refusal', async () => {
    rmSync(at('.git'), { recursive: true });
    setTTY(false, false);
    expect(await run(() => runInit())).toBe(1);
    expect(errors()).toContain('git not found');
    expect(errors()).toContain('git init');
    expect(errors()).not.toContain('interactive');
    refusedQuietly();
  });

  it('below the repository root: names the root instead of `git init` (CORE-168)', async () => {
    mkdirSync(at('apps/web'), { recursive: true });
    vi.mocked(process.cwd).mockReturnValue(at('apps/web'));
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(errors()).toContain(
      `is inside the git repository at ${proj()}, not at its root.`,
    );
    expect(errors()).not.toContain('git init');
    refusedQuietly();
  });

  // Off a TTY the summary would render into a dead stream and "cancel" with
  // exit 0, having paid for a clone. Both streams must be terminals.
  it.each([
    [false, false],
    [false, true],
    [true, false],
  ])(
    'off a TTY (stdin %s, stdout %s): exit 1, naming --yes and --dry-run',
    async (i, o) => {
      setTTY(i, o);
      expect(await run(() => runInit())).toBe(1);
      expect(errors()).toContain('interactive terminal');
      expect(errors()).toContain('--yes');
      expect(errors()).toContain('never overwrites');
      expect(errors()).toContain('--dry-run');
      expect(exists('pharn.config.json')).toBe(false);
      refusedQuietly();
    },
  );

  // CORE-168: an existing pharn.config.json is ALWAYS a write target, so the
  // `--yes` refusal is certain and needs no network.
  it.each<[string, () => void]>([
    ['a file', () => write('pharn.config.json', '{"hand":"written"}')],
    ['a directory', () => mkdirSync(at('pharn.config.json'))],
    [
      'an unreadable config',
      () =>
        write(
          'pharn.config.json',
          '{"skillsVersion":"1.0.0","archetypes":"ssr","capabilities":[]}',
        ),
    ],
  ])(
    '--yes over %s at pharn.config.json: exit 1 before the fetch',
    async (_l, plant) => {
      plant();
      const before = snapshot();
      expect(await run(() => runInit({ yes: true }))).toBe(1);
      expect(snapshot()).toEqual(before);
      expect(errors()).toContain(
        'pharn init --yes installs only into a project where none of its files exists yet, and pharn.config.json already exists.',
      );
      expect(errors()).toContain('--yes never overwrites');
      expect(errors()).toContain('`pharn init` in a terminal');
      expect(errors()).toContain('`pharn init --dry-run`');
      expect(errors()).toContain('`pharn update`');
      // Only the config is named: the marked target list needs the clone.
      expect(errors()).not.toContain('•');
      expect(summary()).toBe('');
      refusedQuietly();
    },
  );

  it('--dry-run --yes over an existing config previews instead of refusing', async () => {
    await installFresh();
    const before = snapshot();
    clearOutput();
    expect(await run(() => runInit({ yes: true, dryRun: true }))).toBeNull();
    expect(snapshot()).toEqual(before);
    expect(notes('PLAN').join('\n')).toContain(
      '`pharn init --yes` would refuse',
    );
  });
});

// ---------------------------------------------------------------------------
// The download, and what goes wrong after it. Every exit below happens AFTER
// the clone is removed (the finally): watchClones() sees it gone.
// ---------------------------------------------------------------------------

describe('init after the download', () => {
  it('a failed download: exit 1, names the host and the PHARN_DEBUG hint, after the banner', async () => {
    const clones = watchClones();
    failures.tarball = 'throw';
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(errors()).toContain('Could not reach');
    expect(errors()).toContain('fetch failed');
    expect(informed()).toContain('PHARN_DEBUG=1');
    // The banner and intro come before the fetch, once the gates passed.
    expect(stdout().length).toBeGreaterThan(0);
    expect(clack.intro).toHaveBeenCalledWith('init wizard');
    expect(exists('pharn.config.json')).toBe(false);
    expect(clones()).toEqual([]);
  });

  it('under PHARN_DEBUG the failure is dumped to stderr instead of the hint', async () => {
    vi.stubEnv('PHARN_DEBUG', '1');
    failures.tarball = 'throw';
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(informed()).not.toContain('PHARN_DEBUG=1');
    expect(stderr().join('\n')).toContain('fetch failed');
  });

  // pharn's fetch reads no proxy variable, so a configured one is silently
  // unused: the notice says so BEFORE the fetch — here the fetch fails, and the
  // warning is already out.
  it.each(['HTTPS_PROXY', 'https_proxy'])(
    'warns about %s before the fetch',
    async (name) => {
      vi.stubEnv(name, 'http://proxy.internal:3128');
      failures.release = 'throw';
      expect(await run(() => runInit({ yes: true }))).toBe(1);
      expect(warned()).toContain(name);
      expect(warned()).toContain('DIRECTLY');
      expect(warned()).not.toContain('degit');
    },
  );

  it('refuses a too-old CLI (MIN_CLI): exit 1, no hint, nothing written', async () => {
    const clones = watchClones();
    upstream.tree.MIN_CLI = '99.0.0\n';
    const before = snapshot();
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(errors()).toContain('This pharn is too old');
    expect(errors()).toContain('Nothing was written');
    // A policy refusal is not a crash.
    expect(informed()).not.toContain('PHARN_DEBUG');
    expect(summary()).toBe('');
    expect(snapshot()).toEqual(before);
    expect(clones()).toEqual([]);
  });

  it('a malformed clone: exit 1 with the hint, nothing written, the clone removed', async () => {
    const clones = watchClones();
    // The manifest declares a lens file the tree does not ship.
    upstream.tree = withManifest(upstream.tree);
    delete upstream.tree[N_PLUS_ONE];
    const before = snapshot();
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(errors()).toContain(
      `pharn-oss's pharn-install.json declares ${N_PLUS_ONE}, which the tree does not ship as a file`,
    );
    expect(informed()).toContain('PHARN_DEBUG=1');
    expect(snapshot()).toEqual(before);
    expect(clones()).toEqual([]);
  });

  it('a copy that fails part-way: exit 1 (never the cancel’s 0), the lock released, the clone removed', async () => {
    const clones = watchClones();
    mkdirSync(at('.claude'));
    chmodSync(at('.claude'), 0o555);
    try {
      expect(await run(() => runInit({ yes: true }))).toBe(1);
    } finally {
      chmodSync(at('.claude'), 0o755);
    }
    expect(errors()).toContain('EACCES');
    expect(informed()).toContain('PHARN_DEBUG=1');
    expect(exists('pharn.config.json')).toBe(false);
    expect(exists('pharn/.lock')).toBe(false);
    expect(clones()).toEqual([]);
  });

  // An upstream capability this CLI cannot read is skipped, named before the
  // summary the user acts on, and never copied. A MIN_CLI it cannot read only
  // warns.
  it('names an unreadable upstream capability before the summary, and never copies it', async () => {
    ssrProject();
    // An `applies` token this pharn does not know.
    upstream.tree[
      'pharn/pharn-pipeline/grillers/backwards-compat/backwards-compat.md'
    ] = capability('griller', '["mobile"]', 'WIP');
    upstream.tree.MIN_CLI = 'garbage\n';
    interactive({ select: ['install'] });
    expect(await run(() => runInit())).toBeNull();

    expect(warned()).toContain('backwards-compat');
    expect(warned()).toContain('MIN_CLI');
    const warnAt = vi.mocked(clack.log.warn).mock.invocationCallOrder[0]!;
    expect(warnAt).toBeLessThan(
      vi.mocked(clack.select).mock.invocationCallOrder[0]!,
    );
    expect(exists('pharn/pharn-pipeline/grillers/backwards-compat')).toBe(
      false,
    );
    expect(config().capabilities.map((c) => c.name)).not.toContain(
      'backwards-compat',
    );
  });
});

// ---------------------------------------------------------------------------
// A fresh install, interactively and with --yes.
// ---------------------------------------------------------------------------

describe('a fresh install', () => {
  // CORE-189: from v0.21.0 a new config has no `modules` (0.20.x was the last
  // CLI that wrote it), nor any other field only older CLIs wrote.
  it('writes none of the legacy fields, modules included', async () => {
    await installFresh();
    const written = config();
    expect(written).not.toHaveProperty('modules');
    for (const key of [
      'constitution',
      'isMultiTenant',
      'stackAnswers',
      'installedSkills',
    ]) {
      expect(written).not.toHaveProperty(key);
    }
  });

  it('detect → summary → install: the ssr selection, no overwrite prompt, the outro', async () => {
    ssrProject();
    // pharn-oss's root config carries keys of its own besides `models`.
    upstream.tree['pharn.config.json'] = JSON.stringify({
      _models_stages_note: 'not copied',
      models: UPSTREAM_MODELS,
      ship: { requireAttestation: true },
    });
    interactive({ select: ['install'] }); // no conflict, so no confirm
    expect(await run(() => runInit())).toBeNull();

    expect(clack.select).toHaveBeenCalledTimes(1);
    expect(summary()).toContain('a11y (griller)');
    expect(summary()).toContain('security (griller)');
    expect(summary()).toContain('n-plus-one (lens)');
    expect(read(A11Y)).toContain('a11y');
    expect(exists('pharn/pharn-review/n-plus-one')).toBe(false);
    expect(exists('.claude/commands/pharn-dev-plan.md')).toBe(false);
    expect(exists('pharn/floor/validate.test.mjs')).toBe(false);

    const raw = config();
    expect(raw.archetypes).toEqual(['ssr']);
    expect(raw.capabilities).toEqual([
      { name: 'a11y', role: 'griller', source: 'auto' },
      { name: 'security', role: 'griller', source: 'auto' },
    ]);
    expect(raw.models).toEqual(UPSTREAM_MODELS);
    expect(raw).not.toHaveProperty('_models_stages_note');
    expect(raw).not.toHaveProperty('ship');
    expect(records().files[A11Y]).toBe(sha256(A11Y));

    // pharn-oss's own checker passes the block init wrote.
    const r = spawnSync(
      process.execPath,
      [
        join(
          import.meta.dirname,
          '../fixtures/pharn-oss/check-model-config.mjs',
        ),
        'validate',
        '--config',
        at('pharn.config.json'),
      ],
      { encoding: 'utf8' },
    );
    expect(r.stdout).toMatch(/^GREEN/);
    expect(r.status).toBe(0);

    // The outro claims what landed, and labels the block truthfully.
    const outro = lastOutro();
    expect(outro).toContain('4 trusted docs written');
    expect(outro).toContain('PHARN commands + hooks + agents written');
    expect(outro).toContain('Declared model per stage');
    expect(outro).toContain('plan             opus · high');
    expect(outro).toContain('ship             sonnet · high  (default)');
    expect(outro).toContain(
      '/pharn-ship and /pharn-loop read this block to pick the model they',
    );
    expect(outro).toContain('Effort is never');
  });

  it('cancelling the summary exits 0 and writes nothing', async () => {
    const clones = watchClones();
    ssrProject();
    const before = snapshot();
    interactive({ select: ['cancel'] });
    expect(await run(() => runInit())).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(clones()).toEqual([]);
  });

  // F-17: `--yes` composes with `--archetype`, in a TTY too, without a prompt.
  it('`--yes --archetype backend` installs and records the flag’s archetypes, prompting nothing', async () => {
    setTTY(true, true);
    expect(
      await run(() => runInit({ yes: true, archetypes: ['backend'] })),
    ).toBeNull();
    expect(config().archetypes).toEqual(['backend']);
    expect(
      config()
        .capabilities.map((c) => c.name)
        .sort(),
    ).toEqual(['n-plus-one', 'security']);
    expect(summary()).toMatch(/Archetypes \(--archetype\)\s+backend/);
    expect(summary()).toContain('detection found lib (not used)');
    expect(noteTitlesOf('Archetypes (from --archetype)')).toBe(false);
  });

  // pharn-oss owns `models`: init copies its block, never invents one, never
  // writes one its rules reject — and the install always finishes.
  it.each<[string, string | null]>([
    ['no root config', null],
    ['a root config without models', '{"ship":{}}'],
    ['models: null', '{"models":null}'],
    [
      'a block too deep to copy',
      `{"models":{"stages":{"default":{"model":"opus","effort":"high"}},"deep":${'['.repeat(100_000)}${']'.repeat(100_000)}}}`,
    ],
  ])('writes no models key for %s', async (_l, root) => {
    if (root === null) delete upstream.tree['pharn.config.json'];
    else upstream.tree['pharn.config.json'] = root;
    if (root?.includes('"deep"')) {
      // Too deep for the fixture's own JSON.stringify: the block is spliced
      // into the manifest's text, as pharn-oss's generator would carry it.
      const block = root.slice('{"models":'.length, -1);
      upstream.tree['pharn.config.json'] = '{}';
      const sealed = withManifest(upstream.tree);
      sealed[MANIFEST] = sealed[MANIFEST]!.replace(
        '"models": {',
        `"models": {"defaults": ${block},`,
      );
      upstream.tree = sealed;
    }
    await installFresh();
    expect(config()).not.toHaveProperty('models');
    expect(records().files).not.toHaveProperty([MODELS_RECORD_KEY]);
    expect(lastOutro()).not.toContain('Declared model per stage');
  });

  it("writes no models block, and says why, when pharn-oss's fails its rules", async () => {
    const RLO = String.fromCharCode(0x202e);
    upstream.tree['pharn.config.json'] = JSON.stringify({
      models: {
        stages: {
          default: { model: 'sonnet', effort: 'high' },
          deploy: { model: 'opus', effort: 'high' },
          plan: { model: `${RLO}opus`, effort: 'high' },
        },
      },
    });
    await installFresh();
    expect(config()).not.toHaveProperty('models');
    const warning = logs('warn').find((m) => m.includes('models block')) ?? '';
    expect(warning).toContain(
      "pharn-oss's models block was not written; this pharn rejects it:",
    );
    expect(warning).toContain('stage "deploy" is not a product stage');
    expect(warning).toContain('stage "plan" model "opus" is not an alias');
    expect(warning).toContain('upgrade pharn');
    expect(warning).not.toContain(RLO);
  });

  // F-10: every declared surface the clone ships nothing for is named in ONE
  // warning, never fatal; the outro claims only what landed.
  it.each<[string, string[], string[], string[]]>([
    [
      'no agent (only a pharn-dev-* one)',
      [AGENT],
      ['PHARN commands + hooks written'],
      [],
    ],
    [
      'no hooks, docs, LICENSE or features README',
      [HOOK, 'pharn/LIMITS.md', 'LICENSE', 'pharn/features/README.md'],
      ['3 trusted docs written', 'PHARN commands + agents written'],
      [
        '.claude/hooks (hooks)',
        'LIMITS.md (trusted-doc)',
        'LICENSE (license)',
        'pharn/features/README.md (features-readme)',
      ],
    ],
    [
      'no command, hook or agent',
      [PLAN_COMMAND, '.claude/commands/pharn-dev-plan.md', HOOK, AGENT],
      ['no PHARN commands or hooks written'],
      ['.claude/commands (commands)', '.claude/hooks (hooks)'],
    ],
    [
      'one trusted doc',
      ['pharn/ARCHITECTURE.md', 'pharn/THREAT-MODEL.md', 'pharn/LIMITS.md'],
      ['1 trusted doc written'],
      ['ARCHITECTURE.md (trusted-doc)', 'THREAT-MODEL.md (trusted-doc)'],
    ],
    [
      'no trusted doc at all',
      [
        CONSTITUTION,
        'pharn/ARCHITECTURE.md',
        'pharn/THREAT-MODEL.md',
        'pharn/LIMITS.md',
      ],
      ['no trusted docs written'],
      ['CONSTITUTION.md (trusted-doc)', 'LIMITS.md (trusted-doc)'],
    ],
  ])('a clone with %s', async (_l, drop, outroHas, absent) => {
    for (const rel of drop) delete upstream.tree[rel];
    await installFresh();
    const outro = lastOutro();
    for (const s of outroHas) expect(outro).toContain(s);
    if (outroHas.includes('no trusted docs written'))
      expect(outro).not.toContain('docs written →');
    if (!drop.includes(AGENT)) expect(outro).toContain('agents');
    else expect(outro).not.toContain('agents');
    const warnings = logs('warn').filter((w) =>
      w.includes('pharn-oss ships nothing'),
    );
    expect(warnings).toHaveLength(absent.length ? 1 : 0);
    for (const s of absent) expect(warnings[0]).toContain(s);
    if (absent.length) {
      expect(warnings[0]).not.toContain('(floor)');
      expect(warnings[0]).not.toContain('(core)');
    }
    expect(exists('pharn.records.json')).toBe(true);
  });

  // pharn/pharn-contracts is the pharn layout's marker: a manifest that
  // declares that layout over a tree without it is refused, never installed.
  it('a clone with no pharn-contracts is refused: its manifest declares a layout the tree lacks', async () => {
    delete upstream.tree['pharn/pharn-contracts/finding-shape.md'];
    const before = snapshot();
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(errors()).toContain(
      'declares the pharn layout, but the tree has no pharn/pharn-contracts',
    );
    expect(snapshot()).toEqual(before);
  });
});

function noteTitlesOf(title: string): boolean {
  return vi.mocked(clack.note).mock.calls.some(([, t]) => t === title);
}

// ---------------------------------------------------------------------------
// What `--yes` refuses once it has the clone, and what init refuses to install
// into: exit 1, nothing written, the clone removed.
// ---------------------------------------------------------------------------

describe('init refuses a project it cannot install into', () => {
  it.each<[string, () => void, string[]]>([
    [
      'a file of yours at a target (--yes)',
      () => write(PLAN_COMMAND, 'mine'),
      [
        '.claude/commands/pharn-plan.md (differs from upstream)',
        'pharn init --dry-run',
      ],
    ],
    [
      'a dangling symlink at a target',
      () => {
        mkdirSync(at('.claude/commands'), { recursive: true });
        symlinkSync(join(proj(), '..', 'nowhere'), at(PLAN_COMMAND));
      },
      ['.claude/commands/pharn-plan.md'],
    ],
    [
      'a directory at pharn.records.json',
      () => mkdirSync(at('pharn.records.json')),
      ['Refusing to install: pharn.records.json is in the way'],
    ],
  ])('%s', async (_l, plant, named) => {
    const clones = watchClones();
    plant();
    const before = snapshot();
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    for (const s of named) expect(errors()).toContain(s);
    expect(snapshot()).toEqual(before);
    expect(clones()).toEqual([]);
  });

  it('--yes refuses under the lock when a target appears after the first check', async () => {
    let planted = false;
    fsHooks.open = (path, flags) => {
      if (!planted && flags === 'wx' && path.endsWith(join('pharn', '.lock'))) {
        planted = true;
        write(CONSTITUTION, 'appeared');
      }
    };
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(planted).toBe(true);
    expect(read(CONSTITUTION)).toBe('appeared');
    expect(errors()).toContain(CONSTITUTION);
    expect(exists('pharn.config.json')).toBe(false);
    expect(exists(PLAN_COMMAND)).toBe(false);
    // The refusal is thrown inside the lock, which is released on the way out.
    expect(exists('pharn/.lock')).toBe(false);
  });

  // The pre-flight runs BEFORE the overwrite prompt: a project the install
  // cannot finish in is refused without being asked "Continue and overwrite?".
  it('refuses a re-install before asking to overwrite or backing anything up', async () => {
    await installFresh();
    write(PLAN_COMMAND, 'MY EDIT');
    rmSync(at('pharn/pharn-contracts'), { recursive: true });
    write('pharn/pharn-contracts', 'a FILE where a directory goes');

    expect(await rerun()).toBe(1);
    expect(clack.confirm).not.toHaveBeenCalled();
    expect(overwriteWarning()).toBe('');
    expect(errors()).toContain(
      'Refusing to install: pharn/pharn-contracts is in the way',
    );
    expect(exists('pharn/.backup')).toBe(false);
    expect(read(PLAN_COMMAND)).toBe('MY EDIT');
    expect(config().commit).toBe(SHA_V1);
  });

  // A write that fails part-way names the files that landed and writes no
  // records and no config. The failure is real and root-proof: once the first
  // file is being written (after every pre-flight), a non-empty DIRECTORY
  // appears where the security griller goes (written last), so its atomic
  // rename fails. The next run treats the landed files as unrecorded: one that
  // differs from upstream is backed up before it is overwritten.
  it('a write failing part-way names what landed and writes no records or config', async () => {
    let planted = false;
    fsHooks.open = (path, flags) => {
      if (!planted && flags === 'wx' && path.endsWith('.tmp')) {
        planted = true;
        mkdirSync(at(`${SECURITY}/in-the-way`), { recursive: true });
      }
    };
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    fsHooks.open = null;

    expect(planted).toBe(true);
    // The manifest's order: `.claude/` lands first.
    expect(errors()).toMatch(
      /\d+ files were written before the failure; no records or config were written:\n {2}\.claude\/agents\/pharn-review-lens\.md\n/,
    );
    expect(errors()).toMatch(/\n {2}and \d+ more$/m);
    expect(errors()).toContain(`Failed to write ${SECURITY}`);
    expect(exists(AGENT)).toBe(true);
    expect(exists(`${SECURITY}/in-the-way`)).toBe(true);
    expect(exists('pharn.config.json')).toBe(false);
    expect(exists('pharn.records.json')).toBe(false);

    rmSync(at(SECURITY), { recursive: true });
    write(AGENT, 'EDITED AFTER THE FAILED RUN\n');
    expect(await rerun()).toBeNull();
    expect(backupFiles()).toContain(AGENT);
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(Object.keys(records().files)).toContain(SECURITY);
  });

  // The install step hands the writer what the plan's scan saw (`seen`): a
  // file that appears between that scan and its own write is backed up, then
  // written, and recorded at the bytes that landed. Run on the step itself,
  // over a clone written from the served tree and the run's one plan.
  it('runInstallArchetype backs up, then writes, a file that changed since its scan', async () => {
    const clone = join(proj(), '..', 'step-clone');
    for (const [rel, body] of Object.entries(withManifest(upstream.tree))) {
      mkdirSync(join(clone, rel, '..'), { recursive: true });
      writeFileSync(join(clone, rel), body);
    }
    const index = parseCapabilityIndex(clone);
    const chosen = resolveInitSelection({
      cwd: proj(),
      archetypes: ['lib'],
      index,
    });
    const planned = buildInitPlan({
      repoDir: clone,
      cwd: proj(),
      sha: SHA_V1,
      source: { kind: 'main' },
      channel: 'main',
      archetypes: ['lib'],
      index,
      chosen,
    });
    let planted = false;
    fsHooks.open = (path, flags) => {
      if (!planted && flags === 'wx' && path.endsWith('.tmp')) {
        planted = true;
        write(FLOOR, 'APPEARED DURING THE INSTALL\n');
      }
    };

    await runInstallArchetype(
      clone,
      proj(),
      ['lib'],
      chosen.selection,
      SHA_V1,
      chosen.carry,
      planned.apply,
    );
    fsHooks.open = null;

    expect(planted).toBe(true);
    expect(backupFiles()).toEqual([FLOOR]);
    expect(informed()).toContain('Backed up 1 file(s) to pharn/.backup/');
    const [dir] = readdirSync(at('pharn/.backup'));
    expect(read(`pharn/.backup/${dir!}/${FLOOR}`)).toBe(
      'APPEARED DURING THE INSTALL\n',
    );
    expect(read(FLOOR)).toBe('export {};\n');
    expect(records().files[FLOOR]).toBe(sha256(FLOOR));
  });

  // PHARN-03's re-check: the config fingerprint is taken before the prompts,
  // so a pharn run that writes the config while they are open is not
  // overwritten from the stale snapshot.
  it.each([
    ['appeared where there was none', false],
    ['was rewritten by another run', true],
  ])(
    'refuses when pharn.config.json %s while the prompts were open',
    async (_l, reinstall) => {
      if (reinstall) await installFresh();
      const concurrent = '{"written":"by another run"}\n';
      interactive({ confirm: [true] });
      vi.mocked(clack.select).mockImplementationOnce(async () => {
        writeFileSync(at('pharn.config.json'), concurrent);
        return 'install';
      });
      clearOutput();
      expect(await run(() => runInit())).toBe(1);
      expect(errors()).toContain(
        'pharn.config.json changed while `pharn init` was running',
      );
      // The concurrent write survives untouched.
      expect(read('pharn.config.json')).toBe(concurrent);
    },
  );
});

// ---------------------------------------------------------------------------
// A re-run init over an existing install. It overwrites every file it
// installs; what it marks and backs up first is what `update` would have
// SKIPPED — through the records the previous install wrote — so an upstream
// bump alone is never "your edits".
// ---------------------------------------------------------------------------

describe('re-running init over an install', () => {
  // C5.2: init takes the lock before its fetch and holds it across both
  // prompts, so the overwrite prompt and the install consume ONE plan.
  it.each([
    ['a re-install answered at both prompts', true],
    ['a first install under --yes', false],
  ])('plans exactly once per run (%s)', async (_l, reinstall) => {
    if (reinstall) await installFresh();
    const planner = vi.spyOn(initPlanModule, 'buildInitPlan');
    if (reinstall) expect(await rerun()).toBeNull();
    else await installFresh();
    expect(planner).toHaveBeenCalledTimes(1);
    expect(config().skillsVersion).toBe('1.0.0');
  });

  // A root doc init would retire is deleted only while it still equals its
  // record, re-hashed at the delete; an edit made during the prompt keeps it.
  it('a root doc edited while the overwrite prompt is open is never deleted', async () => {
    serveTip(SHA_V1, '6.9.0');
    await installFresh();
    legacyInstall('pre7');
    expect(records().files['LIMITS.md']).toBeDefined();
    const threat = records().files['THREAT-MODEL.md'];
    serveTip(SHA_V2, '7.0.0', { tree: upstreamTree('7.0.0') });
    interactive({ select: ['install'] });
    vi.mocked(clack.confirm).mockImplementationOnce(async () => {
      write('LIMITS.md', 'my limits, edited at the prompt\n');
      return true;
    });
    clearOutput();
    expect(await run(() => runInit())).toBeNull();
    expect(process.exitCode).toBeUndefined();
    // Both kept byte for byte, each with its record.
    expect(read('LIMITS.md')).toBe('my limits, edited at the prompt\n');
    expect(records().files['LIMITS.md']).toBeDefined();
    expect(read('THREAT-MODEL.md')).toBe('threat model\n');
    expect(records().files['THREAT-MODEL.md']).toBe(threat);
    expect(read('pharn/LIMITS.md')).toBe('limits\n');
    expect(notes('ROOT MIGRATION')).toEqual([]);
  });

  it('a file edited while the overwrite prompt is open is backed up, then overwritten', async () => {
    await installFresh();
    interactive({ select: ['install'] });
    vi.mocked(clack.confirm).mockImplementationOnce(async () => {
      write(CONSTITUTION, 'edited while the prompt was open\n');
      return true;
    });
    clearOutput();
    expect(await run(() => runInit())).toBeNull();
    // The prompt did not mark it (it was pharn's bytes then); the writer saw
    // the change against the plan's hash and saved it first, in a backup of
    // its own beside the planned one (the replaced config).
    const saved = readdirSync(at('pharn/.backup'))
      .map((d) => `pharn/.backup/${d}/${CONSTITUTION}`)
      .filter((rel) => exists(rel));
    expect(saved).toHaveLength(1);
    expect(read(saved[0]!)).toBe('edited while the prompt was open\n');
    expect(read(CONSTITUTION)).toBe('constitution 1.0.0\n');
    expect(records().files[CONSTITUTION]).toBe(sha256(CONSTITUTION));
  });

  it('after an upstream bump alone: no installed file marked or backed up — only the config', async () => {
    await installFresh();
    const planRecord = records().files[PLAN_COMMAND];
    serveTip(SHA_V2, '2.0.0');
    // Upstream stops shipping two files: one is still here, one is not.
    delete upstream.tree[PLAN_COMMAND];
    delete upstream.tree[AGENT];
    rmSync(at(AGENT));

    expect(await rerun()).toBeNull();

    const warning = overwriteWarning();
    expect(warning).toContain(CONSTITUTION);
    expect(warning).not.toContain('(edited)');
    expect(warning).not.toContain('(differs from upstream)');
    expect(warning).toContain(
      'pharn.config.json (will be rewritten — backed up first)',
    );
    expect(backupFiles()).toEqual(['pharn.config.json']);
    expect(informed()).toContain('Backed up 1 file(s) to pharn/.backup/');
    expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');
    expect(config()).toMatchObject({ skillsVersion: '2.0.0', commit: SHA_V2 });
    // F-12: a file upstream stopped shipping keeps its record while it exists;
    // one that is gone keeps none.
    expect(read(PLAN_COMMAND)).toBe('plan\n');
    expect(records().files[PLAN_COMMAND]).toBe(planRecord);
    expect(records().files).not.toHaveProperty([AGENT]);
  });

  it('marks and backs up exactly the files the user changed, then upgrades them', async () => {
    await installFresh();
    serveTip(SHA_V2, '2.0.0');
    write(CONSTITUTION, 'MY CONSTITUTION');
    write('pharn/LICENSE', 'MY LICENSE NOTES');

    expect(await rerun()).toBeNull();

    const bullets = overwriteWarning()
      .split('\n')
      .filter((l) => l.trimStart().startsWith('•'));
    expect(bullets.filter((b) => b.includes('('))).toHaveLength(3);
    expect(bullets[0]).toContain('(edited)');
    expect(bullets[1]).toContain('(edited)');
    expect(overwriteWarning()).toContain(
      '2 of them changed since pharn wrote them (your edits).',
    );
    expect(backupFiles()).toEqual(
      ['pharn.config.json', CONSTITUTION, 'pharn/LICENSE'].sort(),
    );
    const [dir] = readdirSync(at('pharn/.backup'));
    expect(read(`pharn/.backup/${dir!}/${CONSTITUTION}`)).toBe(
      'MY CONSTITUTION',
    );
    expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');
    expect(read('pharn/LICENSE')).toBe('Apache-2.0\n');
  });

  // CORE-161: the stamp does not gate — a store stamped for another install
  // state still proves which bytes pharn wrote. With no store at all, every
  // differing file is backed up: conservative, never a guess.
  it.each<[string, () => void, string[]]>([
    [
      'a store stamped for another install state',
      () =>
        editRecords((r) => {
          r.skillsVersion = '0.9.0';
          r.commit = SHA_V3;
        }),
      ['pharn.config.json'],
    ],
    [
      'no record store',
      () => rmSync(at('pharn.records.json')),
      ['pharn.config.json', AGENT, CONSTITUTION, SECURITY],
    ],
  ])('over %s', async (_l, damage, backedUp) => {
    await installFresh();
    damage();
    serveTip(SHA_V2, '2.0.0');
    expect(await rerun()).toBeNull();
    expect(backupFiles()).toEqual([...backedUp].sort());
    if (backedUp.length > 1)
      expect(overwriteWarning()).toContain(
        `${CONSTITUTION} (differs from upstream)`,
      );
  });

  // F-08: the rewrite resets `models` (`seam` is carried, CORE-165), so the
  // original bytes are saved first.
  it('backs up the original pharn.config.json bytes before rewriting it', async () => {
    await installFresh();
    const tuned = {
      ...config(),
      seam: { resolutionOrder: ['pinned-docs', 'ask'], haltOnUnknown: false },
      models: { stages: { default: { model: 'haiku', effort: 'low' } } },
    };
    const original = `${JSON.stringify(tuned, null, 4)}\n`;
    writeFileSync(at('pharn.config.json'), original);

    expect(await rerun()).toBeNull();

    expect(backupFiles()).toEqual(['pharn.config.json']);
    const [dir] = readdirSync(at('pharn/.backup'));
    expect(read(`pharn/.backup/${dir!}/pharn.config.json`)).toBe(original);
    expect(config().seam).toEqual(tuned.seam);
    expect(config().models).toEqual(UPSTREAM_MODELS);
    // This install keeps pharn/.backup/ out of git itself, so no advice.
    expect(informed()).not.toContain('not gitignored');
    expect(read('.gitignore')).toContain('pharn/.backup/\n');
  });

  it('never writes through a pharn.config.json that is a symlink, nor backs it up', async () => {
    await installFresh();
    const outside = join(proj(), '..', 'outside.json');
    renameSync(at('pharn.config.json'), outside);
    symlinkSync(outside, at('pharn.config.json'));
    const before = readFileSync(outside, 'utf8');
    serveTip(SHA_V2, '2.0.0');

    expect(await rerun()).toBeNull();

    expect(exists('pharn/.backup')).toBe(false);
    expect(readFileSync(outside, 'utf8')).toBe(before);
    expect(config().commit).toBe(SHA_V2);
  });

  // Declining is a graceful exit 0, and so is Ctrl-C at the prompt — which
  // used to leave the clone behind.
  it.each([
    ['declined', false],
    ['cancelled (Ctrl-C)', CANCEL],
  ])(
    'the overwrite prompt %s: exit 0, nothing written, the clone removed',
    async (_l, answer) => {
      await installFresh();
      serveTip(SHA_V2, '2.0.0');
      write(CONSTITUTION, 'MY CONSTITUTION');
      const clones = watchClones();
      const before = snapshot();
      expect(await rerun({ select: ['install'], confirm: [answer] })).toBe(0);
      expect(snapshot()).toEqual(before);
      expect(clones()).toEqual([]);
    },
  );

  describe('flat layout', () => {
    // The records are keyed by PATH: a layout change writes to new paths and
    // leaves the old files in place (init deletes only dropped capabilities),
    // so only a file of the user's at a new path is backed up.
    // A flat install is one this pharn can no longer make: installed from
    // today's tree, then put in the flat shape (legacyInstall).
    it('a layout change (flat → pharn/) backs up only a file of yours at a new path', async () => {
      await installFresh();
      legacyInstall('flat');
      expect(config().layout).toBe('flat');
      write('pharn/LICENSE', 'MY OWN NOTES');
      serveTip(SHA_V2, '2.0.0');
      expect(await rerun()).toBeNull();
      expect(backupFiles()).toEqual(['pharn.config.json', 'pharn/LICENSE']);
      expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');
      expect(config().layout).toBe('pharn');
      expect(exists(FLAT.constitution)).toBe(true);
      expect(exists(FLAT.license)).toBe(true);
    });
  });

  // PHARN-11 + update's merge rows: a manual entry the index still has is
  // installed again and stays manual (also when the archetypes select it); one
  // upstream no longer ships is dropped, NAMED, and its directory deleted.
  it('carries the hand-added capabilities over, and drops one upstream no longer ships', async () => {
    ssrProject();
    await installFresh();
    editConfig((c) => {
      c.capabilities = [
        { name: 'a11y', role: 'griller', source: 'manual' },
        { name: 'security', role: 'griller', source: 'auto' },
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
        { name: 'gone-now', role: 'lens', source: 'manual' },
      ];
    });
    write('pharn/pharn-review/gone-now/gone-now.md', 'old upstream bytes');

    expect(await rerun()).toBeNull();

    expect(config().capabilities).toEqual(
      expect.arrayContaining([
        { name: 'a11y', role: 'griller', source: 'manual' },
        { name: 'security', role: 'griller', source: 'auto' },
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
      ]),
    );
    expect(config().capabilities).toHaveLength(3);
    expect(read(N_PLUS_ONE)).toContain('n-plus-one');
    expect(records().files[N_PLUS_ONE]).toBe(sha256(N_PLUS_ONE));
    expect(informed()).toContain(
      'Keeping 1 capability you added by hand: lens:n-plus-one.',
    );
    expect(summary()).toContain('n-plus-one (lens)');
    expect(warned()).toContain(
      'Not keeping 1 capability you added by hand that upstream no longer ships: lens:gone-now.',
    );
    expect(exists('pharn/pharn-review/gone-now')).toBe(false);
    expect(backupFiles()).toContain('pharn/pharn-review/gone-now/gone-now.md');
  });

  // F-04: a capability the archetypes no longer select is dropped and its
  // directory DELETED — PHARN runs every capability directory on disk — after
  // backing up what pharn cannot prove it wrote. Named before the summary,
  // listed in the prompt, asked once.
  it('deletes the directory of a capability the archetypes no longer select', async () => {
    ssrProject();
    await installFresh({ archetypes: ['ssr', 'backend'] });
    write('pharn/pharn-review/n-plus-one/NOTES.md', 'my notes');
    editConfig((c) => {
      c.capabilities.push({ name: 'legacy-gone', role: 'lens' });
    });

    expect(await rerun()).toBeNull();

    // Re-detection says ssr; the summary says what was recorded.
    expect(summary()).toContain(
      'previously recorded: ssr, backend — pass --archetype ssr,backend to keep them',
    );
    expect(warned()).toContain(
      'your archetypes no longer select (or upstream no longer ships): lens:n-plus-one, lens:legacy-gone',
    );
    expect(warned()).toContain('will be DELETED');
    expect(warned()).toContain(
      'pharn/pharn-review/n-plus-one/ (lens:n-plus-one — 1 file(s)',
    );
    expect(clack.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Continue, overwrite and delete?' }),
    );
    expect(exists('pharn/pharn-review/n-plus-one')).toBe(false);
    expect(backupFiles()).toEqual([
      'pharn.config.json',
      'pharn/pharn-review/n-plus-one/NOTES.md',
    ]);
    expect(informed()).toContain('before overwriting and removing.');
    expect(informed()).toContain(
      'Deleted 1 capability directory no longer installed: pharn/pharn-review/n-plus-one/.',
    );
    expect(
      config()
        .capabilities.map((c) => c.name)
        .sort(),
    ).toEqual(['a11y', 'security']);
    expect(
      Object.keys(records().files).filter((k) =>
        k.startsWith('pharn/pharn-review/'),
      ),
    ).toEqual([]);
  });

  it('refuses, writing nothing, when the dropped directory sits behind a symlink', async () => {
    ssrProject();
    await installFresh({ archetypes: ['ssr', 'backend'] });
    const outside = join(proj(), '..', 'shared-review');
    renameSync(at('pharn/pharn-review'), outside);
    symlinkSync(outside, at('pharn/pharn-review'));

    expect(await rerun()).toBe(1);

    expect(clack.confirm).not.toHaveBeenCalled();
    expect(errors()).toMatch(
      /Refusing to init: n-plus-one \(lens\) is no longer installed[\s\S]*pharn\/pharn-review is a symbolic link/,
    );
    expect(errors()).not.toContain('PHARN_DEBUG');
    expect(
      readFileSync(join(outside, 'n-plus-one/n-plus-one.md'), 'utf8'),
    ).toContain('n-plus-one');
    expect(exists('pharn/.backup')).toBe(false);
    expect(config().archetypes).toEqual(['ssr', 'backend']);
  });

  // CORE-164: a config with no `modules` key loads; its manual entries carry
  // and its dropped directories are deleted; `modules` is not written back.
  it.each([
    ['a manual entry is kept', true],
    ['a dropped entry is deleted', false],
  ])('over a config with no `modules`: %s', async (_l, manual) => {
    ssrProject();
    await installFresh({ archetypes: ['ssr', 'backend'] });
    editConfig((c) => {
      delete c.modules;
      if (manual)
        c.capabilities = c.capabilities.map((x) =>
          x.name === 'n-plus-one' ? { ...x, source: 'manual' } : x,
        );
    });

    expect(await rerun()).toBeNull();

    expect(exists(N_PLUS_ONE)).toBe(manual);
    if (manual)
      expect(config().capabilities).toContainEqual({
        name: 'n-plus-one',
        role: 'lens',
        source: 'manual',
      });
    else expect(warned()).toContain('will be DELETED');
    expect(config()).not.toHaveProperty('modules');
    expect(summary()).not.toContain('could not be read');
  });

  // Upstream ships a capability this CLI cannot parse: its entries (manual or
  // source-less) are KEPT verbatim, listed in frozenCapabilities, their files
  // untouched and their records carried — never minted from nothing.
  it.each([
    ['a usable store', 'keep'],
    ['a store stamped for another state', 'stale'],
    ['no store', 'none'],
  ])(
    'keeps a capability this pharn cannot parse, over %s',
    async (_l, store) => {
      const PERF = 'pharn/pharn-review/perf/perf.md';
      const unparseable = (): void => {
        upstream.tree[PERF] = capability('lens', '["bogus"]', 'perf');
        upstream.tree['pharn/pharn-pipeline/grillers/legacy/legacy.md'] =
          capability('griller', '["bogus"]', 'legacy');
      };
      unparseable();
      await installFresh();
      write(PERF, 'perf as installed');
      const perfHash = sha256(PERF);
      editRecords((r) => {
        r.files[PERF] = perfHash;
        if (store === 'stale') {
          r.skillsVersion = '0.9.0';
          r.commit = SHA_V3;
        }
      });
      if (store === 'none') rmSync(at('pharn.records.json'));
      editConfig((c) => {
        c.capabilities.push(
          { name: 'perf', role: 'lens', source: 'manual' },
          { name: 'legacy', role: 'griller' },
        );
        c.testResults = { test: 'vitest-json' };
      });
      serveTip(SHA_V2, '2.0.0');
      unparseable();

      expect(await rerun()).toBeNull();

      const c = config();
      expect(c.capabilities).toContainEqual({
        name: 'perf',
        role: 'lens',
        source: 'manual',
      });
      expect(c.capabilities.find((x) => x.name === 'legacy')).toEqual({
        name: 'legacy',
        role: 'griller',
      });
      expect(c.frozenCapabilities).toEqual(['griller:legacy', 'lens:perf']);
      expect(c.testResults).toEqual({ test: 'vitest-json' });
      expect(informed()).toContain('Keeping 2 capabilities as installed');
      expect(warned()).not.toContain('Not keeping');
      expect(read(PERF)).toBe('perf as installed');
      expect(records().commit).toBe(SHA_V2);
      if (store === 'none') expect(records().files).not.toHaveProperty([PERF]);
      else expect(records().files[PERF]).toBe(perfHash);
    },
  );
});

// ---------------------------------------------------------------------------
// The config a re-run replaces: keys pharn does not own are carried across;
// every key pharn owns is rewritten; one it cannot read is NAMED.
// ---------------------------------------------------------------------------

describe('re-running init over the config it replaces', () => {
  it('carries the keys pharn does not own verbatim and rewrites every key it does', async () => {
    ssrProject();
    await installFresh();
    const fresh = config();
    const userKeys = {
      testResults: { test: 'vitest-json', 'test:e2e': 'playwright-json' },
      ship: { requireAttestation: true },
      // CORE-165: pharn-oss's; carried in its own key order, even values this
      // CLI used to refuse.
      seam: { note: 'ours', resolutionOrder: ['model', 'ask', 'ask', 'guess'] },
    };
    editConfig((c) => {
      Object.assign(c, userKeys, {
        // State an earlier run recorded, stale the moment init reinstalls.
        pharnVersion: '0.0.1',
        updatedAt: '2026-10-01T00:00:00.000Z',
        pendingSkillsVersion: '0.0.2',
        frozenCapabilities: ['lens:path-traversal'],
        layout: 'flat',
        archetypes: ['ssr'],
        capabilities: [{ name: 'security', role: 'griller', source: 'auto' }],
        models: { default: { model: 'haiku-4-5', effort: 'low' }, stages: {} },
        modules: [{ name: 'core', version: '1.0.0' }],
        constitution: 'minimal',
        stackAnswers: { db: 'postgres' },
        installedSkills: [{ skill: 'x', from: 'y' }],
      });
    });

    expect(await rerun()).toBeNull();

    // Exactly what a fresh install writes, plus the keys pharn does not own.
    expect({ ...config(), installedAt: null }).toEqual({
      ...fresh,
      installedAt: null,
      ...userKeys,
    });
    expect(JSON.stringify(config().seam)).toBe(JSON.stringify(userKeys.seam));
  });

  // Carried as DATA: `__proto__` (an own key after JSON.parse) round-trips as
  // a key and never becomes the written object's prototype.
  it('carries keys named like Object.prototype members as plain data', async () => {
    await installFresh();
    writeFileSync(
      at('pharn.config.json'),
      read('pharn.config.json').replace(
        /^\{/,
        '{\n  "__proto__": { "polluted": true },\n  "constructor": "mine",\n  "toString": 1,',
      ),
    );
    expect(await rerun()).toBeNull();
    const written = JSON.parse(read('pharn.config.json')) as object;
    expect(
      Object.getOwnPropertyDescriptor(written, '__proto__')?.value,
    ).toEqual({ polluted: true });
    expect(Object.getPrototypeOf(written)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(written, 'constructor')?.value).toBe(
      'mine',
    );
    expect(Object.getOwnPropertyDescriptor(written, 'toString')?.value).toBe(1);
  });

  // CORE-164: a config that EXISTS but cannot be read carries nothing — and
  // says so, with the reason, in the summary before either prompt. The keys
  // pharn does not own still carry from any JSON object.
  const damaged =
    (edit: (c: Record<string, unknown>) => void) =>
    (c: Record<string, unknown>): string => {
      edit(c);
      return JSON.stringify(c);
    };
  it.each<
    [string, (c: Record<string, unknown>) => string, string | null, boolean]
  >([
    [
      'archetypes that is not an array',
      damaged((c) => {
        c.archetypes = 'ssr';
      }),
      'pharn.config.json: archetypes must be an array of "ssr", "backend", "spa", "lib" (found "ssr")',
      true,
    ],
    [
      'no skillsVersion string',
      damaged((c) => {
        delete c.skillsVersion;
      }),
      'it has no "skillsVersion" string',
      true,
    ],
    [
      'an invalid capabilities[].source',
      damaged((c) => {
        c.capabilities = [{ name: 'a11y', role: 'griller', source: 'guess' }];
      }),
      null,
      true,
    ],
    [
      'an archetype holding control bytes (escaped, never raw)',
      damaged((c) => {
        c.archetypes = ['ssr\u001b[2J'];
      }),
      'pharn.config.json: archetypes[0] must be one of "ssr", "backend", "spa", "lib" (found "ssr\\u001b[2J"))',
      true,
    ],
    ['not JSON', () => '{ "testResults": ', null, false],
    ['a JSON array', () => '[{ "testResults": {} }]', null, false],
  ])(
    'names a config with %s, and still installs',
    async (_l, damage, reason, carries) => {
      ssrProject();
      await installFresh({ archetypes: ['ssr', 'backend'] });
      editConfig((c) => {
        c.testResults = { test: 'vitest-json' };
        c.capabilities = c.capabilities.map((x) =>
          x.name === 'n-plus-one' ? { ...x, source: 'manual' } : x,
        );
      });
      writeFileSync(
        at('pharn.config.json'),
        damage(
          JSON.parse(read('pharn.config.json')) as Record<string, unknown>,
        ),
      );

      expect(await rerun()).toBeNull();

      const line = summary();
      expect(line).toContain(
        `the previous pharn.config.json could not be read (${reason ?? ''}`,
      );
      expect(line).toContain(
        'nothing is carried over, so manual capabilities will be dropped',
      );
      expect(line).not.toContain('pharn init');
      expect(line).not.toContain('previously recorded');
      const summaryAt = vi.mocked(clack.note).mock.invocationCallOrder[
        vi
          .mocked(clack.note)
          .mock.calls.findIndex(([b]) =>
            String(b).includes('PHARN Install Summary'),
          )
      ]!;
      expect(summaryAt).toBeLessThan(
        vi.mocked(clack.select).mock.invocationCallOrder[0]!,
      );
      // As the line says: the manual entry was not carried.
      expect(config().capabilities.map((x) => x.name)).not.toContain(
        'n-plus-one',
      );
      expect(config().skillsVersion).toBe('1.0.0');
      if (carries)
        expect(config().testResults).toEqual({ test: 'vitest-json' });
      else expect(config()).not.toHaveProperty('testResults');
    },
  );
});

// ---------------------------------------------------------------------------
// F-02 / CORE-172: an existing `.claude/settings.json` is never overwritten or
// merged. While the clone still exists, init prints the HOOKS note `status`
// and `update` print; a fresh one lists what it wires.
// ---------------------------------------------------------------------------

describe('init and .claude/settings.json — the HOOKS note', () => {
  const SCOPE = {
    type: 'command',
    command:
      'node "${CLAUDE_PROJECT_DIR}"/.claude/hooks/enforce-writes-scope.cjs',
  };
  const STOP = {
    type: 'command',
    command: 'node',
    args: ['.claude/hooks/stop-check.cjs'],
  };
  const UPSTREAM_SETTINGS = {
    hooks: {
      PreToolUse: [{ matcher: 'Write|Edit', hooks: [SCOPE] }],
      Stop: [{ hooks: [STOP] }],
    },
  };
  const SCOPE_LINE = displayHook({
    event: 'PreToolUse',
    matcher: 'Write|Edit',
    command: SCOPE.command,
    args: [],
  });
  const STOP_LINE = displayHook({
    event: 'Stop',
    matcher: '',
    command: STOP.command,
    args: STOP.args,
  });
  const STRICT = '`pharn status --strict` fails until';

  it.each<[string, { settings: string; local?: string }, string[], string[]]>([
    [
      'wires one of the two upstream hooks',
      {
        settings: JSON.stringify({
          permissions: { allow: ['Bash(ls)'] },
          hooks: { PreToolUse: [{ matcher: 'Write|Edit', hooks: [SCOPE] }] },
        }),
      },
      [STOP_LINE, '.claude/settings.local.json', STRICT],
      [SCOPE_LINE],
    ],
    [
      'wires none',
      { settings: '{"permissions":{}}' },
      [SCOPE_LINE, STOP_LINE, 'Upstream wires 2 hook(s)'],
      [],
    ],
    [
      'wires them only in settings.local.json',
      { settings: '{}', local: JSON.stringify(UPSTREAM_SETTINGS) },
      ['only in .claude/settings.local.json'],
      ['--strict'],
    ],
    [
      'is not valid JSON',
      { settings: '{ not json' },
      [
        '.claude/settings.json could not be read (it is not valid JSON)',
        SCOPE_LINE,
        STRICT,
      ],
      [],
    ],
  ])('a preserved file that %s', async (_l, files, has, hasNot) => {
    upstream.tree[SETTINGS] = JSON.stringify(UPSTREAM_SETTINGS);
    write(SETTINGS, files.settings);
    if (files.local) write('.claude/settings.local.json', files.local);
    await installFresh();
    const hooks = notes('HOOKS');
    expect(hooks).toHaveLength(1);
    for (const s of has) expect(hooks[0]).toContain(s);
    for (const s of hasNot) expect(hooks[0]).not.toContain(s);
    expect(informed()).toContain('Existing .claude/settings.json preserved');
    expect(warned()).not.toContain('compare it against pharn-oss');
    // Never written or merged: the user's bytes, exactly.
    expect(read(SETTINGS)).toBe(files.settings);
    expect(lastOutro()).not.toBe('');
  });

  it('prints no HOOKS note when the preserved file already wires every upstream hook', async () => {
    upstream.tree[SETTINGS] = JSON.stringify(UPSTREAM_SETTINGS);
    write(SETTINGS, JSON.stringify({ ...UPSTREAM_SETTINGS, model: 'opus' }));
    await installFresh();
    expect(notes('HOOKS')).toEqual([]);
    expect(informed()).toContain('Existing .claude/settings.json preserved');
  });

  it('lists the hooks a fresh install writes from upstream, then the review line', async () => {
    upstream.tree[SETTINGS] = JSON.stringify(UPSTREAM_SETTINGS);
    await installFresh();
    expect(notes('HOOKS')).toEqual([
      [
        '  Wrote .claude/settings.json from upstream. It wires 2 hook(s):',
        `  ${SCOPE_LINE}`,
        `  ${STOP_LINE}`,
        '  Claude Code runs these commands; review `.claude/settings.json`.',
      ].join('\n'),
    ]);
    expect(informed()).not.toContain('preserved');
    expect(JSON.parse(read(SETTINGS))).toEqual(UPSTREAM_SETTINGS);
  });
});

// THE ONE EXIT POINT: init never exits and never prints its own ending. A
// refusal and a cancel reject with a CliError carrying the exit code, and the
// line the user sees comes out once, from the top-level reporter.
describe('pharn init ends through a CliError', () => {
  const thrown = (p: Promise<void>): Promise<unknown> =>
    p.then(
      () => null,
      (err: unknown) => err,
    );

  it('a refusal (off a TTY): CliError exit 1, its one error line printed by reportCliError', async () => {
    const err = await thrown(runInit());
    expect(err).toBeInstanceOf(CliError);
    expect(err).toMatchObject({ exitCode: 1 });
    expect(logs('error')).toEqual([]);
    expect(reportCliError(err)).toBe(1);
    const lines = logs('error');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('pharn init is interactive');
    expect(stdout()).toEqual([]);
  });

  it('a cancel (the summary answered Cancel): CliError exit 0, one "Cancelled" line', async () => {
    ssrProject();
    interactive({ select: ['cancel'] });
    const err = await thrown(runInit());
    expect(err).toBeInstanceOf(CliError);
    expect(err).toMatchObject({ exitCode: 0 });
    const cancelled = (): string[] =>
      logs('info').filter((l) => l.includes('Cancelled. Nothing was changed.'));
    expect(cancelled()).toEqual([]);
    expect(reportCliError(err)).toBe(0);
    expect(cancelled()).toHaveLength(1);
    expect(logs('error')).toEqual([]);
  });
});

// CORE-194: a tree that declares pharn-install.json is installed from it, after
// every declared file's raw sha256 is verified — before anything is written.
describe('init with pharn-install.json', () => {
  // What `init --yes` installs for `lib` from manifestTree: the 7.x layout,
  // plus a surface this CLI names nowhere.
  const MANIFEST_INSTALLED = [...INSTALLED, NEW_SURFACE].sort();
  const DECLARED_MODELS = {
    stages: { default: { model: 'haiku', effort: 'low' } },
  };

  it('installs exactly the declared set, LICENSE at its dest, models from the manifest', async () => {
    serveTip(SHA_V1, '7.20.0', {
      tree: manifestTree('7.20.0', (m) => {
        m.models.defaults = DECLARED_MODELS;
      }),
    });
    await installFresh();
    expect(projectFiles()).toEqual(
      [...MANIFEST_INSTALLED, ...STATE_FILES].sort(),
    );
    expect(read('pharn/LICENSE')).toBe('Apache-2.0\n');
    expect(exists('LICENSE')).toBe(false);
    expect(read(NEW_SURFACE)).toBe('skill 7.20.0\n');
    expect(config().models).toEqual(DECLARED_MODELS);
    const rec = records();
    // Every managed file recorded at what landed; settings too (fresh write).
    for (const rel of MANIFEST_INSTALLED)
      expect(rec.files[rel], rel).toBe(sha256(rel));
    expect(logs('warn')).toEqual([]);
  });

  it('never writes over an existing settings.json, and does not record it', async () => {
    serveTip(SHA_V1, '7.20.0', { tree: manifestTree('7.20.0') });
    write(SETTINGS, '{"mine":true}\n');
    await installFresh();
    expect(read(SETTINGS)).toBe('{"mine":true}\n');
    expect(records().files).not.toHaveProperty(SETTINGS);
  });

  it('refuses a tree whose file does not match its declared sha256: exit 1, nothing written', async () => {
    const clones = watchClones();
    const tree = manifestTree('7.20.0');
    serveTip(SHA_V1, '7.20.0', {
      tree: { ...tree, [SECURITY]: 'swapped after the manifest was made\n' },
    });
    const before = snapshot();
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(errors()).toContain(
      `pharn-oss's pharn-install.json declares a sha256 for ${SECURITY} that its bytes do not match`,
    );
    expect(errors()).toContain('Nothing was written');
    // Shown bare: the network was reached.
    expect(errors()).not.toContain('Could not reach');
    expect(snapshot()).toEqual(before);
    expect(clones()).toEqual([]);
  });

  it.each<[string, Parameters<typeof manifestTree>[1], string]>([
    [
      'an unknown schemaVersion',
      (m) => (m.schemaVersion = 2),
      'schemaVersion 2',
    ],
    [
      'a dest outside the paths pharn installs',
      (m) =>
        (m.files.find((f) => f.dest === PLAN_COMMAND)!.dest =
          '.git/hooks/pre-commit'),
      'would write .git/hooks/pre-commit',
    ],
    [
      "a dest at the user's local settings",
      (m) =>
        (m.files.find((f) => f.dest === PLAN_COMMAND)!.dest =
          '.claude/settings.local.json'),
      'would write .claude/settings.local.json',
    ],
  ])('refuses %s: exit 1, nothing written', async (_l, edit, text) => {
    serveTip(SHA_V1, '7.20.0', { tree: manifestTree('7.20.0', edit) });
    const before = snapshot();
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(errors()).toContain(text);
    expect(snapshot()).toEqual(before);
  });

  // A pharn-oss older than 7.21.0 ships no pharn-install.json. `--ref` takes
  // only `latest` or `main`, so an old tree arrives as the latest release or
  // the tip of main; either is refused at the fetch.
  it.each<[string, Parameters<typeof runInit>[0]]>([
    ['the latest release (v7.20.0)', {}],
    ['the tip of main (--ref main)', { ref: 'main' }],
  ])(
    'refuses a tree without the manifest from %s: exit 1, nothing written, no clone left',
    async (_l, opts) => {
      const clones = watchClones();
      serveTip(SHA_V1, '7.20.0', { seal: false });
      const before = snapshot();
      expect(await run(() => runInit({ yes: true, ...opts }))).toBe(1);
      expect(errors()).toContain(
        'The fetched pharn-oss (SKILLS_VERSION 7.20.0) ships no pharn-install.json, so it is older than 7.21.0',
      );
      expect(errors()).toContain('`--ref main`');
      expect(errors()).toContain('Nothing was written.');
      // Shown bare: the network was reached.
      expect(errors()).not.toContain('Could not reach');
      expect(fetched()).toContain(tarballUrl(SHA_V1));
      expect(snapshot()).toEqual(before);
      expect(clones()).toEqual([]);
    },
  );
});

describe('a release whose manifest names a path outside the outer bound', () => {
  it('init exits 1 with the same refusal and writes nothing', async () => {
    const message = serveRefusedDest(SHA_V1, '1.0.0');
    const before = snapshot();
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(errors()).toContain(message);
    expect(errors()).not.toContain('Could not reach');
    expect(snapshot()).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// A refused pharn-oss archive. The symlink sits at a path the manifest
// declares, so the extractor refuses it however narrowly it unpacks. The
// message names the ref, blames the archive, keeps the original reason and
// lists only steps the CLI has; the raw error is behind PHARN_DEBUG.
// ---------------------------------------------------------------------------

describe('init on a refused pharn-oss archive', () => {
  const LINKED = { [SECURITY]: '../../../.agents/skills/security' };
  const ISSUES = 'https://github.com/pharn-dev/pharn-oss/issues';

  it('on the release channel: names the tag and commit, blames the archive, offers --ref main, and changes nothing', async () => {
    const clones = watchClones();
    serveTip(SHA_V1, '1.0.0', { links: LINKED });
    const before = snapshot();
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    const shown = errors();
    expect(shown).toContain(
      `pharn-oss release v1.0.0 (commit ${SHA_V1}) was refused: its published archive failed pharn's checks.`,
    );
    expect(shown).toContain(
      'The problem is in that pharn-oss archive, not in your project; nothing in your project was changed.',
    );
    expect(shown).toContain(
      `Reason: tar entry has an unsupported type '2': pharn-oss-${SHA_V1.slice(0, 7)}/${SECURITY}`,
    );
    expect(shown).toContain(
      'No option skips this check: forcing an update or answering yes does not help. Next steps:',
    );
    expect(shown).toContain(
      '- install the tip of main instead: `pharn init --ref main` (`pharn update --ref main` for an existing install)',
    );
    expect(shown).toContain('`npm install -g @pharn-dev/pharn@latest`');
    expect(shown).toContain(
      `re-run once pharn-oss publishes a fixed release, and report this at ${ISSUES}`,
    );
    // A release has no `--ref latest` step to offer, and the network was reached.
    expect(shown).not.toContain('--ref latest');
    expect(shown).not.toContain('Could not reach');
    expect(informed()).toContain('PHARN_DEBUG=1');
    // The spinner agrees: refused, not a failure to fetch.
    const stops = vi
      .mocked(clack.spinner)
      .mock.results.flatMap((r) =>
        (
          r.value as { stop: { mock: { calls: unknown[][] } } }
        ).stop.mock.calls.map((c) =>
          stripVTControlCharacters(String(c[0] ?? '')),
        ),
      );
    expect(stops).toContain('pharn-oss archive refused');
    expect(stops).not.toContain('Failed to fetch PHARN');
    // The sentence is true: no config, no .claude/, no lock, nothing at all.
    expect(snapshot()).toEqual(before);
    expect(exists('pharn.config.json')).toBe(false);
    expect(exists('.claude')).toBe(false);
    expect(exists('pharn/.lock')).toBe(false);
    expect(clones()).toEqual([]);
  });

  it('on the main channel: names main and the commit, and offers --ref latest', async () => {
    serveTip(SHA_V2, '1.0.0', { links: LINKED });
    const before = snapshot();
    expect(await run(() => runInit({ yes: true, ref: 'main' }))).toBe(1);
    const shown = errors();
    expect(shown).toContain(
      `pharn-oss main at commit ${SHA_V2} was refused: its published archive failed pharn's checks.`,
    );
    expect(shown).toContain(
      `Reason: tar entry has an unsupported type '2': pharn-oss-${SHA_V2.slice(0, 7)}/${SECURITY}`,
    );
    expect(shown).toContain(
      '- go back to verified releases: `pharn init --ref latest` (`pharn update --ref latest` for an existing install)',
    );
    expect(shown).toContain(
      `re-run later, once main is fixed, and report this at ${ISSUES}`,
    );
    expect(shown).not.toContain('--ref main');
    expect(snapshot()).toEqual(before);
  });

  it('on the main channel with the commit unresolved: says so instead of a SHA', async () => {
    failures.tip = 'throw';
    serveTip(SHA_V2, '1.0.0', { links: LINKED });
    expect(await run(() => runInit({ yes: true, ref: 'main' }))).toBe(1);
    expect(errors()).toContain(
      'pharn-oss main (refs/heads/main, commit not resolved) was refused',
    );
  });

  it('a manifest sha256 mismatch is reported the same way, its own reason kept', async () => {
    const tree = manifestTree('7.20.0');
    serveTip(SHA_V1, '7.20.0', {
      tree: { ...tree, [SECURITY]: 'swapped after the manifest was made\n' },
    });
    const before = snapshot();
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    const shown = errors();
    expect(shown).toContain(
      `pharn-oss release v7.20.0 (commit ${SHA_V1}) was refused`,
    );
    expect(shown).toContain(
      `Reason: pharn-oss's pharn-install.json declares a sha256 for ${SECURITY} that its bytes do not match`,
    );
    expect(shown).toContain('`pharn init --ref main`');
    expect(snapshot()).toEqual(before);
  });

  it('under PHARN_DEBUG=1 the raw refusal is dumped to stderr instead of the hint', async () => {
    vi.stubEnv('PHARN_DEBUG', '1');
    serveTip(SHA_V1, '1.0.0', { links: LINKED });
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(errors()).toContain('pharn-oss release v1.0.0');
    expect(informed()).not.toContain('PHARN_DEBUG=1');
    const raw = stripVTControlCharacters(stderr().join('\n'));
    expect(raw).toContain(
      `TarExtractError: tar entry has an unsupported type '2': pharn-oss-${SHA_V1.slice(0, 7)}/${SECURITY}`,
    );
  });
});
