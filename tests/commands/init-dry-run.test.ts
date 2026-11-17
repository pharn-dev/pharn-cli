import {
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import * as clack from '@clack/prompts';
import {
  restoreNodeVersion,
  setNodeVersion,
  snapshotTree,
} from '../helpers.js';
import {
  at,
  backupFiles,
  capability,
  clearOutput,
  downloaded,
  editConfig,
  exists,
  failures,
  installFresh,
  interactive,
  jsonOut,
  lastOutro,
  logs,
  notes,
  PLAN_COMMAND,
  proj,
  read,
  run,
  serveTip,
  SETTINGS,
  SHA_V1,
  snapshot,
  stderr,
  stdout,
  upstream,
  useHarness,
} from '../support/harness.js';
import { runInit } from '../../src/commands/init.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

// `pharn init --dry-run [--json]`: the real steps — detect, fetch, MIN_CLI,
// index, selection, manifest, pre-flight, drift scan — and NO write. "Writes
// nothing" is a whole-tree snapshot of the project before and after; the clone
// is downloaded into a per-test TMPDIR that must be empty again afterwards.

const ESC = '\u001b';
const N_PLUS_ONE_DIR = 'pharn/pharn-review/n-plus-one';

let clones = '';
beforeEach(() => {
  // An ssr project: `next` is a dependency, so detection resolves `ssr`.
  writeFileSync(
    at('package.json'),
    JSON.stringify({ dependencies: { next: '14.0.0' } }),
  );
  clones = join(dirname(proj()), 'clones');
  mkdirSync(clones);
  vi.stubEnv('TMPDIR', clones);
});
afterEach(() => restoreNodeVersion());

/** The clone was downloaded and then removed, whatever the outcome. */
function expectCloneCleanedUp(): void {
  expect(downloaded()).toBe(true);
  expect(readdirSync(clones)).toEqual([]);
}

const dryRun = (opts: Parameters<typeof runInit>[0] = {}) =>
  run(() => runInit({ ...opts, dryRun: true }));

/** The latest install summary note (the body the interactive run asks about). */
const summary = (): string =>
  vi
    .mocked(clack.note)
    .mock.calls.map(([body]) => String(body))
    .filter((b) => b.includes('PHARN Install Summary'))
    .at(-1) ?? '';
const plan = (): string => notes('PLAN').join('\n');
/** Raw (not colour-stripped) text of a clack function's calls. */
const raw = (fn: unknown): string =>
  (fn as Mock).mock.calls.map((c) => c.map(String).join(' ')).join('\n');

/** Forget every output so far, the spinner included (for a second run). */
function resetOutput(): void {
  clearOutput();
  vi.mocked(clack.spinner).mockClear();
}

/** A re-run init in a terminal: summary → install, overwrite → yes. */
async function realRerun(): Promise<void> {
  interactive({ select: ['install'], confirm: [true] });
  expect(await run(() => runInit({}))).toBeNull();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Report = any;

/** `init --dry-run --json`: ONE object on stdout, no clack call at all. */
async function jsonRun(
  opts: Parameters<typeof runInit>[0] = {},
): Promise<Report> {
  expect(
    await run(() => runInit({ ...opts, dryRun: true, json: true })),
  ).toBeNull();
  expectNoClack();
  return jsonOut<Report>();
}

function expectNoClack(): void {
  for (const fn of [
    clack.intro,
    clack.outro,
    clack.note,
    clack.spinner,
    clack.log.info,
    clack.log.warn,
    clack.log.error,
    clack.select,
    clack.confirm,
  ]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

describe('pharn init --dry-run (text)', () => {
  it('previews a fresh install off a TTY: summary with evidence, PLAN, outro, nothing written', async () => {
    const before = snapshot();
    expect(await dryRun()).toBeNull();
    expect(snapshot()).toEqual(before);
    expectCloneCleanedUp();

    expect(summary()).toMatch(/Detected archetypes\s+ssr/);
    expect(summary()).toMatch(/ssr\s+← next \(package\.json\)/);
    expect(summary()).toContain('a11y (griller)');
    expect(notes('PLAN')).toHaveLength(1);
    expect(plan()).toContain('Nothing in your project would be overwritten.');
    expect(plan()).toMatch(/WOULD CREATE \d+ file\(s\)/);
    expect(plan()).toContain('pharn.config.json');
    expect(plan()).toContain('`pharn init --yes` would install');
    expect(lastOutro()).toMatch(
      /^Dry run — would create \d+ · overwrite 0 · back up 0\. Nothing was changed\./,
    );
  });

  // pharn 0.14.1 to 0.19.x pointed at an old root `.pharn-backup/` here; from
  // 0.20.0 nothing reads it.
  it('prints no notice for an old root .pharn-backup/, and leaves it alone', async () => {
    mkdirSync(at('.pharn-backup/20261001-120000'), { recursive: true });
    writeFileSync(at('.pharn-backup/20261001-120000/x.md'), 'old\n');
    expect(await dryRun()).toBeNull();
    expect(plan()).toMatch(/WOULD CREATE \d+ file\(s\)/);
    expect(
      vi
        .mocked(clack.log.info)
        .mock.calls.some(([m]) => String(m).includes('.pharn-backup')),
    ).toBe(false);
    expect(read('.pharn-backup/20261001-120000/x.md')).toBe('old\n');
  });

  it('`--archetype backend` previews for the flag and names the unused detection', async () => {
    const before = snapshot();
    expect(await dryRun({ archetypes: ['backend'] })).toBeNull();
    expect(snapshot()).toEqual(before);
    expect(summary()).toMatch(/Archetypes \(--archetype\)\s+backend/);
    expect(summary()).toContain('detection found ssr (not used)');
    expect(summary()).toContain('n-plus-one (lens)');
    expect(plan()).toContain('archetypes: backend');
  });

  it('names a move off main on a re-run, and the flag that keeps it', async () => {
    await installFresh({ ref: 'main' });
    const before = snapshot();
    expect(await dryRun()).toBeNull();
    expect(snapshot()).toEqual(before);
    expect(summary()).toContain(
      'previously followed: main (the pharn-oss tip) — pass --ref main to keep it',
    );
  });

  describe('over an existing install', () => {
    it('names a config it cannot read, with the reason, and writes nothing', async () => {
      await installFresh();
      editConfig((c) => {
        c.archetypes = 'ssr' as unknown as string[];
      });
      const before = snapshot();
      expect(await dryRun()).toBeNull();
      expect(snapshot()).toEqual(before);
      expect(summary()).toContain(
        'the previous pharn.config.json could not be read (pharn.config.json: archetypes must be an array of "ssr", "backend", "spa", "lib" (found "ssr")); nothing is carried over, so manual capabilities will be dropped',
      );
    });

    it('carries a manual entry over from a config with no `modules` key', async () => {
      await installFresh();
      editConfig((c) => {
        delete c.modules;
        c.capabilities.push({
          name: 'n-plus-one',
          role: 'lens',
          source: 'manual',
        });
      });
      expect(await dryRun()).toBeNull();
      expect(summary()).toMatch(/n-plus-one \(lens\)\s+added by hand/);
      expect(summary()).not.toContain('could not be read');
    });

    it('marks exactly the files a real run backs up, and backs up none itself', async () => {
      await installFresh();
      // An edit to a file pharn recorded, and a file of the user's at a path
      // the install now writes that pharn has no record of.
      const NEW = 'pharn/pharn-contracts/new.md';
      writeFileSync(at(PLAN_COMMAND), 'my edit');
      upstream.tree[NEW] = 'upstream new\n';
      writeFileSync(at(NEW), 'mine');

      const before = snapshot();
      expect(await dryRun()).toBeNull();
      expect(snapshot()).toEqual(before);
      const text = plan();
      expect(text).toContain(`${PLAN_COMMAND} (edited)`);
      expect(text).toContain(`${NEW} (no pharn record)`);
      expect(text).toContain(
        'pharn.config.json (will be rewritten — backed up first)',
      );
      expect(text).toContain('WOULD BACK UP 3 file(s)');
      expect(text).toContain(
        'The existing pharn.config.json would be rewritten (models reset to its default)',
      );
      expect(text).toContain('`pharn init --yes` would refuse');
      // Labelled files are listed first.
      expect(text.indexOf('(edited)')).toBeLessThan(
        text.indexOf('pharn.config.json'),
      );

      // Parity: the real run backs up exactly those three files.
      await realRerun();
      expect(backupFiles()).toEqual(
        [PLAN_COMMAND, NEW, 'pharn.config.json'].sort(),
      );
    });

    it('lists a dropped capability’s directory under WOULD DELETE (text and --json), deletes nothing, and the real run matches', async () => {
      await installFresh({ archetypes: ['backend'] });
      writeFileSync(at(`${N_PLUS_ONE_DIR}/NOTES.md`), 'mine');

      const before = snapshot();
      expect(await dryRun()).toBeNull(); // detection: ssr
      expect(snapshot()).toEqual(before);
      const text = plan();
      expect(text).toContain('WOULD DELETE 1 capability directory');
      expect(text).toContain(`${N_PLUS_ONE_DIR}/ (lens:n-plus-one — 1 file(s)`);
      // CORE-168: a re-install always overwrites pharn.config.json, and that
      // alone is why `--yes` refuses — no separate removal reason.
      expect(text).toMatch(
        /`pharn init --yes` would refuse: \d+ existing file\(s\) would be overwritten\./,
      );
      expect(text).not.toContain('capability directory would be deleted');
      expect(lastOutro()).toContain('delete 1 directory');
      expect(logs('warn').join('\n')).toContain(
        'your archetypes no longer select: lens:n-plus-one',
      );

      resetOutput();
      const r = await jsonRun();
      expect(r.capabilities.removals).toEqual([
        {
          role: 'lens',
          name: 'n-plus-one',
          reason: 'dropped-unselected',
          dir: N_PLUS_ONE_DIR,
          present: true,
          backups: [`${N_PLUS_ONE_DIR}/NOTES.md`],
        },
      ]);
      expect(r.backups).toContain(`${N_PLUS_ONE_DIR}/NOTES.md`);
      expect(r.yesWouldProceed).toBe(false);
      expect(snapshot()).toEqual(before);

      await realRerun();
      expect(exists(N_PLUS_ONE_DIR)).toBe(false);
      expect(backupFiles()).toContain(`${N_PLUS_ONE_DIR}/NOTES.md`);
    });

    it('names the hand-added capability it would keep, and the user keys it would carry, terminal-safe', async () => {
      writeFileSync(
        at('pharn.config.json'),
        JSON.stringify({
          pharnVersion: '0.1.0',
          skillsVersion: '1.0.0',
          repo: 'pharn-dev/pharn-oss',
          commit: null,
          installedAt: '2026-01-01T00:00:00.000Z',
          modules: [],
          archetypes: ['ssr'],
          capabilities: [
            { name: 'n-plus-one', role: 'lens', source: 'manual' },
          ],
          testResults: { ok: true },
          [`k${ESC}[31m`]: 1,
        }),
      );
      expect(await dryRun()).toBeNull();
      expect(logs('info').join('\n')).toContain(
        'Keeping 1 capability you added by hand: lens:n-plus-one.',
      );
      expect(plan()).toContain('testResults');
      expect(raw(clack.note)).not.toContain(ESC);
    });
  });

  describe('.claude/settings.json', () => {
    it('an existing one: says it would be preserved, and prints the HOOKS note a real run prints', async () => {
      mkdirSync(at('.claude'));
      writeFileSync(at(SETTINGS), '{"hooks":{}}');
      expect(await dryRun()).toBeNull();
      const preview = notes('HOOKS');
      expect(preview).toHaveLength(1);
      expect(plan()).toContain(
        'Would preserve the existing .claude/settings.json',
      );
      expect(preview[0]).toContain('pharn status --strict');

      vi.mocked(clack.note).mockClear();
      await realRerun();
      expect(notes('HOOKS')).toEqual(preview);
      expect(read(SETTINGS)).toBe('{"hooks":{}}');
    });

    it('a fresh one: says it would be written, lists its hooks as a real run does, and writes nothing', async () => {
      const before = snapshot();
      expect(await dryRun()).toBeNull();
      expect(snapshot()).toEqual(before);
      expect(plan()).toContain(
        'Would write .claude/settings.json from upstream; see HOOKS.',
      );
      expect(plan()).not.toContain('Would preserve');
      const preview = notes('HOOKS');
      expect(preview).toHaveLength(1);
      expect(preview[0]).toContain(
        'PreToolUse [Write]: {"type":"command","command":"node .claude/hooks/guard.cjs"}',
      );
      expect(preview[0]).toContain(
        'Claude Code runs these commands; review `.claude/settings.json`.',
      );

      vi.mocked(clack.note).mockClear();
      await installFresh();
      expect(notes('HOOKS')).toEqual(preview);
    });

    it('upstream ships none: no HOOKS note, no write line, no settingsHooks key', async () => {
      delete upstream.tree[SETTINGS];
      expect(await dryRun()).toBeNull();
      expect(notes('HOOKS')).toEqual([]);
      expect(plan()).not.toContain('.claude/settings.json');

      resetOutput();
      const r = await jsonRun();
      expect(r.settings).toEqual({ preserved: false });
      expect('settingsHooks' in r).toBe(false);
    });
  });

  describe('the project .gitignore', () => {
    it('previews creating it, writes nothing, and the real run writes exactly that', async () => {
      const before = snapshot();
      expect(await dryRun()).toBeNull();
      expect(snapshot()).toEqual(before);
      expect(plan()).toContain(
        ".gitignore: would create it with pharn/.run/, pharn/.backup/ (PHARN's run state and update backups).",
      );

      await installFresh();
      expect(read('.gitignore')).toBe(
        '# PHARN run state and update backups (added by pharn)\npharn/.run/\npharn/.backup/\n',
      );
      expect(lastOutro()).toContain(
        '.gitignore created → pharn/.run/, pharn/.backup/',
      );
    });

    it.each([
      {
        name: 'previews appending only the missing entry',
        content: 'node_modules\n/pharn/.run\n',
        line: ".gitignore: would add pharn/.backup/ (PHARN's run state and update backups).",
      },
      {
        name: 'says nothing when it already covers both',
        content: 'pharn/.run/**\npharn/.backup\n',
        line: null,
      },
    ])('$name', async ({ content, line }) => {
      writeFileSync(at('.gitignore'), content);
      expect(await dryRun()).toBeNull();
      if (line) expect(plan()).toContain(line);
      else {
        expect(plan()).not.toContain('.gitignore');
        expect(logs('warn').join('\n')).not.toContain('.gitignore');
      }
      expect(read('.gitignore')).toBe(content);
    });

    it('warns, naming the lines, when .gitignore is a symlink', async () => {
      const outside = join(dirname(proj()), 'outside');
      writeFileSync(outside, 'x\n');
      symlinkSync(outside, at('.gitignore'));
      expect(await dryRun()).toBeNull();
      expect(logs('warn').join('\n')).toContain(
        ".gitignore would not be updated: it is a symlink, and pharn never writes through one. Add these lines yourself so PHARN's run state is never committed: pharn/.run/, pharn/.backup/",
      );
    });
  });

  describe('warnings in the text preview', () => {
    it('warns about every declared surface the clone does not ship, as a real run would', async () => {
      delete upstream.tree['pharn/features/README.md'];
      delete upstream.tree['pharn/LIMITS.md'];
      expect(await dryRun()).toBeNull();
      const warned = logs('warn').join('\n');
      expect(warned).toContain('so pharn would not install them:');
      expect(warned).toContain('LIMITS.md (trusted-doc)');
      expect(warned).toContain('pharn/features/README.md (features-readme)');
      expect(warned).not.toContain('(hooks)');
      expect(warned).not.toContain('(contracts)');
    });

    it('names an upstream capability this pharn cannot read', async () => {
      // An `applies` token this pharn does not know: seen, never installed.
      upstream.tree['pharn/pharn-review/broken/broken.md'] = capability(
        'lens',
        '["mobile"]',
        'x',
      );
      expect(await dryRun()).toBeNull();
      const warned = logs('warn').join('\n');
      expect(warned).toContain('lens:broken');
      expect(warned).toContain('could not be read');
      expect(notes('PLAN')).toHaveLength(1);
    });

    it("says pharn-oss's models block would not be written when this pharn rejects it", async () => {
      upstream.tree['pharn.config.json'] = JSON.stringify({
        models: { stages: { plan: { model: `x${ESC}y` } } },
      });
      expect(await dryRun()).toBeNull();
      expect(logs('warn').join('\n')).toContain(
        "pharn-oss's models block would not be written; this pharn rejects it:",
      );
      expect(raw(clack.log.warn)).not.toContain(ESC);
    });
  });

  describe('refusals exit 1 as in a real run, writing nothing', () => {
    it('a project whose .claude/commands is a symlink', async () => {
      const outside = join(dirname(proj()), 'outside');
      mkdirSync(outside);
      mkdirSync(at('.claude'));
      symlinkSync(outside, at('.claude/commands'));
      const before = [snapshot(), snapshotTree(outside)];
      expect(await dryRun()).toBe(1);
      expect([snapshot(), snapshotTree(outside)]).toEqual(before);
      expectCloneCleanedUp();
    });

    it('a too-old CLI (MIN_CLI)', async () => {
      upstream.tree.MIN_CLI = '999.0.0\n';
      expect(await dryRun()).toBe(1);
      expectCloneCleanedUp();
      expect(notes('PLAN')).toEqual([]);
    });

    // A pharn-oss older than 7.21.0 ships no pharn-install.json.
    it('a pharn-oss older than 7.21.0 (no pharn-install.json), with --json: stdout empty', async () => {
      serveTip(SHA_V1, '7.20.0', { seal: false });
      const before = snapshot();
      expect(await run(() => runInit({ dryRun: true, json: true }))).toBe(1);
      expect(stdout()).toEqual([]);
      expect(stderr().join('\n')).toContain(
        'The fetched pharn-oss (SKILLS_VERSION 7.20.0) ships no pharn-install.json, so it is older than 7.21.0',
      );
      expect(stderr().join('\n')).toContain('`--ref main`');
      expect(snapshot()).toEqual(before);
      expectCloneCleanedUp();
    });
  });
});

describe('pharn init --dry-run --json', () => {
  it('prints one schemaVersion 1 object for a fresh project, writing nothing', async () => {
    upstream.tree['pharn/pharn-review/broken/broken.md'] = capability(
      'lens',
      '["mobile"]',
      'x',
    );
    const before = snapshot();
    const r = await jsonRun();
    expect(snapshot()).toEqual(before);
    expectCloneCleanedUp();

    expect(r).toMatchObject({
      schemaVersion: 1,
      command: 'init',
      dryRun: true,
      status: 'planned',
      // The default channel for a new install: the newest verified release.
      channel: 'latest',
      source: { kind: 'release', tag: 'v1.0.0' },
      commit: SHA_V1,
      skillsVersion: '1.0.0',
      archetypes: ['ssr'],
      archetypeSource: 'detected',
      detectedArchetypes: null,
      archetypeEvidence: [
        { archetype: 'ssr', source: 'dependency', value: 'next' },
      ],
      yesWouldProceed: true,
      settings: { preserved: false },
      hooks: null,
      models: { outcome: 'copy', reasons: [] },
    });
    expect(r.capabilities.selected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'griller',
          name: 'a11y',
          matched: ['ssr'],
        }),
      ]),
    );
    expect(r.capabilities.skipped).toEqual([
      expect.objectContaining({ role: 'lens', name: 'n-plus-one' }),
    ]);
    expect(r.unknownCapabilities).toEqual([
      expect.objectContaining({ role: 'lens', name: 'broken' }),
    ]);
    expect(r.counts).toMatchObject({ overwrite: 0, backup: 0 });
    expect(r.counts.create).toBe(r.targets.length);
    expect(r.targets).toContainEqual({
      rel: 'pharn.config.json',
      action: 'create',
      label: null,
    });
    // CORE-172: what the settings.json it would write wires.
    expect(r.settingsHooks).toEqual({
      status: 'ok',
      hooks: [
        {
          event: 'PreToolUse',
          matcher: 'Write',
          command: 'node .claude/hooks/guard.cjs',
          args: [],
        },
      ],
      otherKeys: [],
      skipped: 0,
    });
    expect(r.gitignore).toEqual({
      action: 'create',
      entries: ['pharn/.run/', 'pharn/.backup/'],
    });
    // Present only when non-empty: a complete upstream, a complete walk, no
    // removal, no Prettier.
    for (const key of [
      'absentUpstream',
      'detectionTruncated',
      'prettierignore',
    ])
      expect(r).not.toHaveProperty(key);
    expect(r.capabilities).not.toHaveProperty('removals');
    // The unknown-capabilities prose went to stderr, plain.
    expect(stderr().join('\n')).toContain('could not be read');
  });

  it('`--archetype backend`: plans for the flag, reports the unused detection', async () => {
    const before = snapshot();
    const r = await jsonRun({ archetypes: ['backend'] });
    expect(snapshot()).toEqual(before);
    expect(r.archetypes).toEqual(['backend']);
    expect(r.archetypeSource).toBe('flag');
    expect(r.detectedArchetypes).toEqual(['ssr']);
    expect(r.archetypeEvidence).toEqual([
      { archetype: 'ssr', source: 'dependency', value: 'next' },
    ]);
    expect(r.capabilities.selected).toContainEqual({
      role: 'lens',
      name: 'n-plus-one',
      matched: ['backend'],
    });
    expect(r.capabilities.skipped).toEqual([
      expect.objectContaining({ role: 'griller', name: 'a11y' }),
    ]);
  });

  it('detectionTruncated: true when detection stopped early (the depth cap)', async () => {
    const deep = Array.from({ length: 25 }, () => 'a').join('/');
    mkdirSync(at(deep), { recursive: true });
    writeFileSync(at(`${deep}/Page.tsx`), 'x');
    const r = await jsonRun();
    expect(r.detectionTruncated).toBe(true);
    expect(r.schemaVersion).toBe(1);
  });

  it('--ref main reports the main channel and no tag', async () => {
    const r = await jsonRun({ ref: 'main' });
    expect(r.channel).toBe('main');
    expect(r.source).toEqual({ kind: 'main', tag: null });
  });

  it('lists every overwrite with its mark, and says --yes would refuse', async () => {
    mkdirSync(at('.claude/commands'), { recursive: true });
    writeFileSync(at(PLAN_COMMAND), 'mine');
    writeFileSync(at('pharn.config.json'), '{"testResults":{}}');
    writeFileSync(at(SETTINGS), '{}');
    const r = await jsonRun();
    expect(r.targets).toContainEqual({
      rel: PLAN_COMMAND,
      action: 'overwrite',
      label: 'unverifiable',
    });
    // The replaced config is rewritten and backed up first (F-08).
    expect(r.targets).toContainEqual({
      rel: 'pharn.config.json',
      action: 'overwrite',
      label: 'rewritten',
    });
    expect(r.backups).toEqual([PLAN_COMMAND, 'pharn.config.json']);
    expect(r.counts).toMatchObject({ overwrite: 2, backup: 2 });
    expect(r.yesWouldProceed).toBe(false);
    expect(r.config).toEqual({ carriedKeys: ['testResults'] });
    expect(r.settings).toEqual({ preserved: true });
    expect(r.hooks).toMatchObject({ status: 'missing' });
    // Nothing would be written to settings.json, so nothing is listed.
    expect('settingsHooks' in r).toBe(false);
  });

  it('carries settingsHooks with the hooks and other keys upstream would write, escaped once', async () => {
    upstream.tree[SETTINGS] = JSON.stringify({
      permissions: {},
      [`k${ESC}[31m`]: 1,
      _comment: 'not a setting',
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node',
                args: ['.claude/hooks/s.cjs'],
              },
              { type: 'prompt', prompt: 'p' },
            ],
          },
        ],
      },
    });
    const r = await jsonRun();
    expect(stdout()[0]).not.toContain(ESC);
    expect(r.settingsHooks).toEqual({
      status: 'ok',
      hooks: [
        {
          event: 'Stop',
          matcher: '',
          command: 'node',
          args: ['.claude/hooks/s.cjs'],
        },
      ],
      otherKeys: [`k${ESC}[31m`, 'permissions'],
      skipped: 1,
    });
  });

  it('reports an unreadable upstream settings.json as such', async () => {
    upstream.tree[SETTINGS] = '{ not json';
    expect((await jsonRun()).settingsHooks).toEqual({
      status: 'unreadable',
      reason: 'it is not valid JSON',
    });
  });

  it('carries absentUpstream, prettierignore, an appended gitignore, and models: none when upstream ships no block', async () => {
    delete upstream.tree['pharn/features/README.md'];
    delete upstream.tree['pharn.config.json'];
    writeFileSync(at('package.json'), '{"devDependencies":{"prettier":"3"}}');
    writeFileSync(at('.gitignore'), 'pharn/.run/\n');
    const r = await jsonRun();
    expect(r.models).toEqual({ outcome: 'none', reasons: [] });
    expect(r.absentUpstream).toEqual([
      { surface: 'features-readme', path: 'pharn/features/README.md' },
    ]);
    expect(r.prettierignore.action).toBe('create');
    expect(r.prettierignore.entries).toEqual(
      expect.arrayContaining(['/pharn.config.json', '/pharn.records.json']),
    );
    expect(r.gitignore).toEqual({
      action: 'append',
      entries: ['pharn/.backup/'],
    });
    expect(exists('.prettierignore')).toBe(false);
    expect(read('.gitignore')).toBe('pharn/.run/\n');
  });

  it('--json alone is the JSON dry run: the same one object, nothing written', async () => {
    const before = snapshot();
    expect(await run(() => runInit({ json: true }))).toBeNull();
    expectNoClack();
    const implied = jsonOut<Report>();
    expect(snapshot()).toEqual(before);
    clearOutput();
    expect(implied).toEqual(await jsonRun());
    expect(implied.schemaVersion).toBe(1);
  });

  it('sends the proxy notice to stderr, not stdout', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.invalid:8080');
    await jsonRun();
    expect(stderr().join('\n')).toMatch(/prox/i);
  });

  describe('failures: stdout empty, stderr one plain line, exit 1', () => {
    it.each<{
      name: string;
      setup?: () => void;
      opts?: Parameters<typeof runInit>[0];
      says?: string;
      fetches: boolean;
    }>([
      {
        name: 'below the Node floor',
        setup: () => setNodeVersion('20.0.0'),
        fetches: false,
      },
      {
        name: 'without a .git directory',
        setup: () => rmSync(at('.git'), { recursive: true }),
        says: 'git init',
        fetches: false,
      },
      {
        name: 'when the download fails',
        setup: () => {
          failures.tarball = 'throw';
        },
        fetches: true,
      },
      {
        name: 'on a MIN_CLI refusal, after cleaning up the clone',
        setup: () => {
          upstream.tree.MIN_CLI = '999.0.0\n';
        },
        fetches: true,
      },
      {
        name: 'on a destination the pre-flight refuses',
        setup: () => {
          const outside = join(dirname(proj()), 'outside');
          mkdirSync(outside);
          mkdirSync(at('.claude'));
          symlinkSync(outside, at('.claude/commands'));
        },
        fetches: true,
      },
    ])('$name', async ({ setup, opts, says, fetches }) => {
      setup?.();
      expect(
        await run(() => runInit(opts ?? { dryRun: true, json: true })),
      ).toBe(1);
      expect(stdout()).toEqual([]);
      expectNoClack();
      const err = stderr().join('\n');
      expect(err).not.toBe('');
      expect(err).not.toMatch(/[│┌└◇●▲■]/);
      if (says) expect(err).toContain(says);
      expect(downloaded()).toBe(fetches);
      expect(readdirSync(clones)).toEqual([]);
    });
  });
});
