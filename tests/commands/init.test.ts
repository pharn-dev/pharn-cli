import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as prettier from 'prettier';
import { describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import { setTTY } from '../helpers.js';
import {
  AGENT,
  fetched,
  logs,
  SETTINGS,
  UPSTREAM_MODELS,
  at,
  clearOutput,
  config,
  fetchStub,
  HOOK_SETTINGS,
  INSTALLED,
  installFresh,
  projectFiles,
  read,
  records,
  RELEASE_URL,
  RESOLVE_URL,
  run,
  SECURITY,
  serveTip,
  sha256,
  SHA_V1,
  SHA_V2,
  STATE_FILES,
  stdout,
  tagCommitUrl,
  upstreamTree7,
  useHarness,
  VERSION_URL,
} from '../support/harness.js';
import { runInit } from '../../src/commands/init.js';
import { runAdd } from '../../src/commands/add.js';
import { runUpdate } from '../../src/commands/update.js';
import { runRemove } from '../../src/commands/remove.js';
import { runStatus } from '../../src/commands/status.js';
import { runUninstall } from '../../src/commands/uninstall.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

/** The slice of the `status --json` report these cases read. */
interface StatusJson {
  schemaVersion: number;
  version: { installed: string; latest: string; outdated: boolean };
  archetypes: string[];
  capabilities: { count: number };
  layout: { recorded: string; upstream: string | null };
  drift: {
    modified: string[];
    missing: string[];
    absentUpstream: unknown[];
  } | null;
  hooks: { status: string; missing: unknown[] } | null;
  strict: { failed: boolean };
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

    // Every file pharn wrote is recorded at the hash of what landed, stamped
    // with the config pair — the settings.json this fresh install wrote too
    // (CORE-166), so `uninstall` can prove it is pharn's.
    const rec = records();
    expect(rec).toMatchObject({ skillsVersion: '1.0.0', commit: SHA_V1 });
    for (const rel of INSTALLED) expect(rec.files[rel], rel).toBe(sha256(rel));
  });

  // CORE-172: the settings.json a fresh init writes is the hook commands
  // Claude Code will run; init lists them, read from the clone it copied.
  it('init --yes lists the hooks of the settings.json it writes', async () => {
    vi.mocked(clack.note).mockClear();
    await installFresh();
    const hooks = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'HOOKS')
      .map(([body]) => String(body));
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
    expect(read('.claude/settings.json')).toBe(HOOK_SETTINGS);
  });
  it('init keeps a Prettier project’s check off every file pharn wrote; update, status and uninstall leave it', async () => {
    writeFileSync(at('.prettierrc'), '{}\n');
    await installFresh();
    const written = read('.prettierignore');
    const owned = [
      ...INSTALLED.filter((f) => f !== '.claude/settings.json'),
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
    for (const rel of ['.claude/settings.json', 'src/index.ts', 'README.md'])
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
    const raw = JSON.parse(read('pharn.config.json')) as Record<
      string,
      unknown
    >;
    delete raw.modules;
    writeFileSync(at('pharn.config.json'), JSON.stringify(raw, null, 2));

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
  it('an init that preserved an existing settings.json records nothing for it', async () => {
    mkdirSync(at('.claude'));
    writeFileSync(at(SETTINGS), '{"mine":true}\n');
    await installFresh();
    expect(read(SETTINGS)).toBe('{"mine":true}\n');
    expect(records().files).not.toHaveProperty(SETTINGS);
  });
  it('a re-run init keeps the record of the settings.json it now preserves', async () => {
    await installFresh();
    const hash = records().files[SETTINGS];
    expect(hash).toBe(sha256(SETTINGS));
    // `init --yes` refuses every re-install, so the real re-run is the
    // interactive one: the summary answered "install", the overwrite "yes".
    setTTY(true, true);
    vi.mocked(clack.select).mockResolvedValueOnce('install');
    vi.mocked(clack.confirm).mockResolvedValueOnce(true);
    expect(await run(() => runInit({}))).toBeNull();
    expect(vi.mocked(clack.select)).toHaveBeenCalled();
    expect(read(SETTINGS)).toBe(HOOK_SETTINGS);
    expect(records().files[SETTINGS]).toBe(hash);
  });
  it('init --yes installs and records it, never a pharn-dev-* agent', async () => {
    await installFresh();
    expect(read(AGENT)).toBe('review lens agent 1.0.0\n');
    expect(records().files[AGENT]).toBe(sha256(AGENT));
    expect(existsSync(at('.claude/agents/pharn-dev-reviewer.md'))).toBe(false);
  });
  it('a first init prints no ROOT MIGRATION note, even with memory-bank/ at the root', async () => {
    serveTip(SHA_V1, '7.0.0', { tree: upstreamTree7('7.0.0') });
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/canon.md'), 'canon\n');
    vi.mocked(clack.note).mockClear();
    await installFresh();
    expect(
      vi
        .mocked(clack.note)
        .mock.calls.some(([, title]) => title === 'ROOT MIGRATION'),
    ).toBe(false);
    expect(read('memory-bank/canon.md')).toBe('canon\n');
  });

  it('a re-run init hints at memory-bank/ and never moves it (dry run and real run)', async () => {
    serveTip(SHA_V1, '7.0.0', { tree: upstreamTree7('7.0.0') });
    await installFresh();
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/canon.md'), 'canon\n');
    const migrationNotes = (): string[] =>
      vi
        .mocked(clack.note)
        .mock.calls.filter(([, title]) => title === 'ROOT MIGRATION')
        .map(([body]) => String(body));
    const HINT = 'git mv memory-bank pharn/memory-bank';

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runInit({ dryRun: true }))).toBeNull();
    expect(migrationNotes().join('\n')).toContain(HINT);

    // `init --yes` refuses every re-install, so the real re-run is the
    // interactive one: a terminal, the summary answered "install" and the
    // overwrite prompt "yes" — for this one case only.
    const tty = (stream: NodeJS.ReadStream | NodeJS.WriteStream): void => {
      Object.defineProperty(stream, 'isTTY', {
        value: true,
        configurable: true,
      });
    };
    const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    tty(process.stdin);
    tty(process.stdout);
    vi.mocked(clack.select).mockResolvedValueOnce('install');
    vi.mocked(clack.confirm).mockResolvedValueOnce(true);
    vi.mocked(clack.note).mockClear();
    try {
      expect(await run(() => runInit({}))).toBeNull();
    } finally {
      for (const [stream, desc] of [
        [process.stdin, stdinTTY],
        [process.stdout, stdoutTTY],
      ] as const) {
        if (desc) Object.defineProperty(stream, 'isTTY', desc);
        else delete (stream as { isTTY?: boolean }).isTTY;
      }
    }
    expect(process.exitCode).toBeUndefined();
    expect(vi.mocked(clack.select)).toHaveBeenCalled();
    expect(migrationNotes().join('\n')).toContain(HINT);
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

  it('init with no --ref and no release refuses, names --ref main, and fetches no tarball', async () => {
    serveTip(SHA_V1, '1.0.0', { published: false });
    expect(await run(() => runInit({ yes: true }))).toBe(1);
    expect(existsSync(at('pharn.config.json'))).toBe(false);
    expect(fetched().some((u) => u.startsWith('https://codeload.'))).toBe(
      false,
    );
    const errors = vi
      .mocked(clack.log.error)
      .mock.calls.map(([m]) => String(m))
      .join('\n');
    expect(errors).toContain('has published no release yet');
    expect(errors).toContain('pharn init --ref main');
  });

  it('--ref main installs the tip, records no ref, and update keeps it on main with one notice', async () => {
    expect(await run(() => runInit({ yes: true, ref: 'main' }))).toBeNull();
    expect(config().ref).toBeUndefined();
    expect(fetched()).toContain(RESOLVE_URL);
    expect(fetched()).not.toContain(RELEASE_URL);
    // init itself prints no notice.
    expect(
      logs('info').filter((m) =>
        m.startsWith('Verified releases are now the default'),
      ),
    ).toEqual([]);

    serveTip(SHA_V2, '2.0.0');
    fetchStub.mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    // Followed main — not the release the stub also publishes — and said so once.
    expect(fetched()).toContain(VERSION_URL);
    expect(fetched()).not.toContain(RELEASE_URL);
    expect(config()).toMatchObject({ skillsVersion: '2.0.0', commit: SHA_V2 });
    expect(config().ref).toBeUndefined();
    expect(
      logs('info').filter((m) =>
        m.startsWith('Verified releases are now the default'),
      ),
    ).toEqual([
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
