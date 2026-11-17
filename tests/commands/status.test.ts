import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as clack from '@clack/prompts';
import { restoreNodeVersion, setNodeVersion } from '../helpers.js';
import {
  at,
  capability,
  clearOutput,
  CONSTITUTION,
  downloaded,
  editConfig,
  editRecords,
  exists,
  failures,
  fetched,
  fetchStub,
  flatTree,
  HOOK,
  HOOK_SETTINGS,
  installFresh,
  jsonOut,
  lastOutro,
  logs,
  manifestTree,
  NEW_SURFACE,
  notes,
  printed,
  noteTitles,
  PLAN_COMMAND,
  read,
  RELEASE_URL,
  run,
  serveTip,
  SETTINGS,
  SHA_V1,
  SHA_V2,
  stderr,
  stdout,
  tarballUrl,
  upstream,
  useHarness,
  VERSION_URL,
  write,
} from '../support/harness.js';
import { runStatus } from '../../src/commands/status.js';
import { LOCK_FILE } from '../../src/lib/project-lock.js';
import { runList } from '../../src/commands/list.js';
import { runUpdate } from '../../src/commands/update.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();
afterEach(() => restoreNodeVersion());

// ---------------------------------------------------------------------------
// `pharn status` end to end: a real install (`init --yes`), then states made by
// editing the project or serving another upstream — never by stubbing the
// diff, the index, the hook wiring or the manifest. docs/commands/status.md.
// ---------------------------------------------------------------------------

/** The slice of the `status --json` report these cases read. */
interface StatusJson {
  schemaVersion: number;
  node: { floor: string; running: string; status: string };
  version: {
    installed: string;
    latest: string;
    outdated: boolean;
    ahead: boolean;
    channel: string;
    source: { kind: string; tag: string | null };
  };
  archetypes: string[];
  capabilities: { count: number };
  layout: { recorded: string; upstream: string | null };
  drift: {
    okCount: number;
    modified: string[];
    missing: string[];
    unreadable: { rel: string; reason: string }[];
    absentUpstream: { surface: string; path: string }[];
  } | null;
  hooks: {
    status: string;
    missing: { command: string }[];
    localOnly: unknown[];
  } | null;
  unknownCapabilities: { role: string; name: string; reason: string }[] | null;
  orphans: { path: string; state: string }[] | null;
  models: { verdict: string; conversionNeeded: boolean } | null;
  prettierignore: unknown;
  strict: { enabled: boolean; failed: boolean };
}

/** `pharn status` in text mode; its exit code (`null` on a normal return). */
async function status(
  opts: Parameters<typeof runStatus>[0] = {},
): Promise<number | null> {
  clearAll();
  return run(() => runStatus(opts));
}

/** `pharn status --json`; the one report it printed and the exit code it set. */
async function statusJson(
  opts: Parameters<typeof runStatus>[0] = {},
): Promise<{ report: StatusJson; exitCode: number | undefined }> {
  clearAll();
  process.exitCode = undefined;
  // A finding never calls process.exit under --json: the report is flushed.
  expect(await run(() => runStatus({ json: true, ...opts }))).toBeNull();
  const exitCode = process.exitCode as number | undefined;
  process.exitCode = undefined;
  return { report: jsonOut<StatusJson>(), exitCode };
}

const note = (title: string): string => notes(title).join('\n');

/** Forget all output, the spinner calls included. */
function clearAll(): void {
  clearOutput();
  vi.mocked(clack.spinner).mockClear();
}

/** No clack chrome at all — a `--json` run writes the report and nothing else. */
function expectNoClack(): void {
  for (const fn of [
    clack.intro,
    clack.outro,
    clack.note,
    clack.spinner,
    clack.log.warn,
    clack.log.info,
    clack.log.error,
  ])
    expect(fn as unknown as Mock).not.toHaveBeenCalled();
}

/** A file pharn recorded writing that upstream ships no longer (an orphan). */
const OLD_COMMAND = '.claude/commands/pharn-old.md';
async function installWithOrphan(): Promise<void> {
  upstream.tree[OLD_COMMAND] = 'old command\n';
  await installFresh();
  serveTip(SHA_V1, '1.0.0');
}

describe('pharn status, end to end', () => {
  // A reader never takes the lock: every writer now holds it across its
  // prompts (C5.2), and `status --strict` must stay runnable meanwhile.
  it('reports under a held lock, leaving it in place', async () => {
    await installFresh();
    const lock = JSON.stringify({
      pid: process.pid,
      host: hostname(),
      command: 'update',
      startedAt: new Date().toISOString(),
    });
    write(LOCK_FILE, lock);
    const { report, exitCode } = await statusJson();
    expect(report.version).toMatchObject({ installed: '1.0.0' });
    expect(exitCode).toBeUndefined();
    expect(read(LOCK_FILE)).toBe(lock);
  });

  it('status --json prints one report: current, no drift, then the edit it finds', async () => {
    await installFresh();
    setNodeVersion('24.13.1');
    const { report: clean, exitCode } = await statusJson();
    expect(clean).toMatchObject({
      schemaVersion: 1,
      node: { floor: '24.2.0', running: '24.13.1', status: 'ok' },
      version: { installed: '1.0.0', latest: '1.0.0', outdated: false },
      archetypes: ['lib'],
      capabilities: { count: 1 },
      layout: { recorded: 'pharn', upstream: 'pharn' },
      drift: { modified: [], missing: [], absentUpstream: [] },
      hooks: { status: 'match', missing: [] },
      unknownCapabilities: [],
      orphans: [],
      models: { verdict: 'valid', conversionNeeded: false },
      strict: { enabled: false, failed: false },
    });
    expect(exitCode).toBeUndefined();
    expect(stderr()).toEqual([]);
    expectNoClack();

    writeFileSync(at(PLAN_COMMAND), `edited\n`);
    rmSync(at('LIMITS.md'));
    const { report: drifted } = await statusJson();
    expect(drifted.drift?.modified).toEqual([PLAN_COMMAND]);
    expect(drifted.drift?.missing).toEqual(['LIMITS.md']);
    // status is read-only: nothing it reported was put back.
    expect(read(PLAN_COMMAND)).toBe(`edited\n`);
    expect(exists('LIMITS.md')).toBe(false);
  });

  it('text: a clean install prints VERSION, NODE, MODELS and "No drift", downloads once, and changes nothing', async () => {
    await installFresh();
    fetchStub.mockClear();
    setNodeVersion('24.13.1');
    expect(await status()).toBeNull();

    expect(fetched().filter((u) => u.startsWith(tarballUrl('')))).toHaveLength(
      1,
    );
    expect(noteTitles()).toEqual(['NODE', 'VERSION', 'MODELS', 'DRIFT']);
    expect(note('NODE')).toContain('>= 24.2.0');
    expect(note('NODE')).toContain('v24.13.1');
    expect(note('NODE')).not.toContain('MISMATCH');
    const version = note('VERSION');
    expect(version).toContain('v1.0.0');
    expect(version).toContain('(no newer verified release)');
    expect(version).toMatch(/Channel\s+latest — verified releases/);
    expect(version).toMatch(/Source\s+verified release v1\.0\.0/);
    expect(version).toMatch(/Archetypes\s+lib/);
    expect(version).toMatch(/Capabilities\s+1/);
    expect(note('DRIFT')).toMatch(
      /^No drift — \d+ file\(s\) match pharn-dev\/pharn-oss@v1\.0\.0\.$/,
    );
    expect(lastOutro()).toContain('Read-only — nothing changed.');
  });

  // Text and --json are two renderings of ONE report: every list and count the
  // text prints is the report's, and the text exit is `report.strict.failed`.
  it('text renders the --json report: same drift, orphans and counts, and --strict exits on report.strict.failed', async () => {
    await installWithOrphan();
    writeFileSync(at(PLAN_COMMAND), `edited\n`);
    rmSync(at('LIMITS.md'));

    const { report, exitCode } = await statusJson({ strict: true });
    expect(report.strict).toEqual({ enabled: true, failed: true });
    expect(exitCode).toBe(1);
    expect(report.drift).toMatchObject({
      modified: [PLAN_COMMAND],
      missing: ['LIMITS.md'],
    });
    expect(report.orphans?.map((o) => o.path)).toEqual([OLD_COMMAND]);

    expect(await status({ strict: true })).toBe(
      report.strict.failed ? 1 : null,
    );
    const drift = note('DRIFT');
    for (const path of [...report.drift!.modified, ...report.drift!.missing]) {
      expect(drift).toContain(`  ${path}`);
    }
    expect(drift).toContain(`${report.drift!.okCount} file(s) match`);
    for (const { path } of report.orphans!) {
      expect(note('ORPHANED')).toContain(path);
    }
    const version = note('VERSION');
    expect(version).toContain(`v${report.version.installed}`);
    expect(version).toMatch(
      new RegExp(`Capabilities\\s+${report.capabilities.count}`),
    );
    expect(version).toMatch(
      new RegExp(`Archetypes\\s+${report.archetypes.join(', ')}`),
    );

    // Without --strict neither fails, from the same report.
    expect((await statusJson()).report.strict.failed).toBe(false);
    expect(await status()).toBeNull();
  });

  // --- the channel ----------------------------------------------------------

  describe('the channel the config records', () => {
    it('main: --no-drift reads the tip SKILLS_VERSION only, names the channel, and reports behind as outdated', async () => {
      await installFresh({ ref: 'main' });
      fetchStub.mockClear();
      expect(await status({ drift: false })).toBeNull();
      expect(fetched()).toEqual([VERSION_URL]);
      const version = note('VERSION');
      expect(version).toContain('(up to date)');
      expect(version).toContain('main (tip)');
      expect(version).toMatch(
        /Channel\s+main — the pharn-oss tip \(`pharn update --ref latest` follows verified releases\)/,
      );
      expect(noteTitles()).not.toContain('DRIFT');
      expect(lastOutro()).toContain('(drift check skipped)');

      serveTip(SHA_V2, '1.1.0');
      expect(await status({ drift: false })).toBeNull();
      expect(note('VERSION')).toContain(
        'v1.0.0 → v1.1.0 (update available, run `pharn update`)',
      );
      expect(await status({ drift: false, strict: true })).toBe(1);
      // The drift path compares against the tip.
      expect(await status()).toBeNull();
      expect(note('DRIFT')).toContain('DIFFERS FROM pharn-dev/pharn-oss@main');
    });

    it('latest: --no-drift makes ONE request (the release) and names a newer verified release', async () => {
      await installFresh();
      serveTip(SHA_V2, '1.1.0');
      fetchStub.mockClear();
      expect(await status({ drift: false })).toBeNull();
      expect(fetched()).toEqual([RELEASE_URL]);
      expect(note('VERSION')).toContain(
        'v1.0.0 → v1.1.0 (newer verified release v1.1.0 — run `pharn update`)',
      );
      expect(note('VERSION')).not.toContain('update available');

      const { report, exitCode } = await statusJson({
        drift: false,
        strict: true,
      });
      expect(report.version).toMatchObject({
        channel: 'latest',
        source: { kind: 'release', tag: 'v1.1.0' },
        latest: '1.1.0',
        outdated: true,
      });
      expect(report).toMatchObject({
        drift: null,
        hooks: null,
        unknownCapabilities: null,
        orphans: null,
        strict: { enabled: true, failed: true },
      });
      expect(exitCode).toBe(1);
      expect(downloaded()).toBe(false);
    });

    it.each([
      {
        channel: 'latest',
        ref: undefined,
        text: 'ahead of the latest verified release v1.0.0 — installed from main',
      },
      {
        channel: 'main',
        ref: 'main' as const,
        text: 'ahead of pharn-oss main (v1.0.0) — main has moved back; `pharn update --force` downgrades',
      },
    ])(
      'an install AHEAD of $channel is ahead, not outdated, and --strict passes',
      async ({ ref, text, channel }) => {
        await installFresh(ref ? { ref } : {});
        editConfig((c) => {
          c.skillsVersion = '1.2.0';
        });
        expect(await status({ drift: false, strict: true })).toBeNull();
        expect(note('VERSION')).toContain(text);
        expect(note('VERSION')).not.toContain('update available');
        expect(note('VERSION')).not.toContain('newer verified release');

        const { report, exitCode } = await statusJson({
          drift: false,
          strict: true,
        });
        expect(report.version).toMatchObject({
          channel,
          installed: '1.2.0',
          latest: '1.0.0',
          ahead: true,
          outdated: false,
        });
        expect(exitCode).toBeUndefined();
      },
    );
  });

  // --- --strict: which findings fail it, and which never do ------------------

  /** A state made on top of a fresh install, and the status options to run it with. */
  interface StrictRow {
    name: string;
    make: () => void | Promise<void>;
    opts?: { drift?: boolean };
    fails: boolean;
  }
  const strictRows: StrictRow[] = [
    {
      name: 'outdated',
      make: () => serveTip(SHA_V2, '2.0.0'),
      opts: { drift: false },
      fails: true,
    },
    {
      name: 'a differing file',
      make: () => write(PLAN_COMMAND, 'edited\n'),
      fails: true,
    },
    {
      name: 'a missing file',
      make: () => rmSync(at('LIMITS.md')),
      fails: true,
    },
    {
      name: 'an unreadable path (a directory where a file belongs)',
      make: () => {
        rmSync(at(CONSTITUTION));
        mkdirSync(at(CONSTITUTION));
      },
      fails: true,
    },
    {
      name: 'a surface upstream does not ship',
      make: () => {
        delete upstream.tree[HOOK];
      },
      fails: true,
    },
    {
      name: 'a layout mismatch',
      make: () => serveTip(SHA_V1, '1.0.0', { tree: flatTree('1.0.0') }),
      fails: true,
    },
    {
      name: 'an unwired upstream hook',
      make: () => write(SETTINGS, '{}\n'),
      fails: true,
    },
    {
      name: 'hooks wired only in settings.local.json',
      make: () => {
        write(SETTINGS, '{"permissions":{"allow":[]}}\n');
        write('.claude/settings.local.json', HOOK_SETTINGS);
      },
      fails: false,
    },
    { name: 'an orphan', make: () => {}, fails: false },
    {
      name: 'a models block pharn-oss rejects',
      make: () =>
        editConfig((c) => {
          c.models = { stages: { bogus: { model: 'opus', effort: 'high' } } };
        }),
      fails: false,
    },
    {
      name: 'a Node below the floor',
      make: () => setNodeVersion('22.18.0'),
      fails: false,
    },
    {
      name: 'a .prettierignore that does not cover pharn',
      make: () => write('.prettierignore', 'dist/\n'),
      fails: false,
    },
    {
      name: 'an install ahead of its source',
      make: () =>
        editConfig((c) => {
          c.skillsVersion = '1.2.0';
        }),
      opts: { drift: false },
      fails: false,
    },
  ];

  it.each(strictRows)(
    '--strict on $name: fails=$fails (text exit and --json exitCode agree)',
    async ({ name, make, opts = {}, fails }) => {
      if (name === 'an orphan') await installWithOrphan();
      else await installFresh();
      await make();

      // Without --strict a finding is a report: exit 0.
      expect(await status(opts)).toBeNull();
      expect(await status({ ...opts, strict: true })).toBe(fails ? 1 : null);

      const { report, exitCode } = await statusJson({ ...opts, strict: true });
      expect(report.strict).toEqual({ enabled: true, failed: fails });
      expect(exitCode).toBe(fails ? 1 : undefined);
      // The report is printed either way, and nothing goes to clack.
      expectNoClack();
    },
  );

  // --- the DRIFT section ----------------------------------------------------

  it('DRIFT lists DIFFERS → MISSING → UNREADABLE, each with what to do; nothing is changed', async () => {
    await installFresh();
    write(PLAN_COMMAND, 'edited\n');
    rmSync(at('LIMITS.md'));
    rmSync(at(CONSTITUTION));
    symlinkSync('elsewhere.md', at(CONSTITUTION));
    expect(await status()).toBeNull();

    const drift = note('DRIFT');
    expect(drift).toContain('DIFFERS FROM pharn-dev/pharn-oss@v1.0.0');
    expect(drift).not.toContain('LOCALLY MODIFIED');
    expect(drift).toContain("keeps files you've edited");
    expect(drift).toContain('`--force` overwrites edits too');
    expect(drift).toContain('pharn/.backup/');
    expect(drift).toContain(
      'Run `pharn update` to restore them (files you edited are kept).',
    );
    // A plain update restores them at any version: no `--force` fallback.
    expect(drift).not.toContain('"Already up to date"');
    expect(drift).not.toContain('pharn update --force');
    expect(drift).toContain('not yet in pharn.config.json');
    expect(drift).toContain('additive-only');
    expect(drift).toMatch(/UNREADABLE — not a regular readable file/);
    expect(drift).toMatch(new RegExp(`${CONSTITUTION} — .*symlink`));
    expect(drift).not.toContain('No drift');
    const differs = drift.indexOf('DIFFERS FROM');
    const missing = drift.indexOf('MISSING');
    expect(differs).toBeLessThan(missing);
    expect(missing).toBeLessThan(drift.indexOf('UNREADABLE'));
    expect(drift).toMatch(
      /\d+ file\(s\) match pharn-dev\/pharn-oss@v1\.0\.0\./,
    );

    const { report } = await statusJson();
    expect(report.drift?.unreadable).toEqual([
      { rel: CONSTITUTION, reason: expect.stringContaining('symlink') },
    ]);

    // Without an unreadable path the subsection is omitted.
    rmSync(at(CONSTITUTION));
    write(CONSTITUTION, 'constitution 1.0.0\n');
    expect(await status()).toBeNull();
    expect(note('DRIFT')).not.toContain('UNREADABLE');
  });

  it('NOT SHIPPED UPSTREAM names each surface the clone ships nothing for, in text and --json', async () => {
    await installFresh();
    delete upstream.tree[HOOK];
    delete upstream.tree['pharn/pharn-core/seam-resolver/SKILL.md'];
    expect(await status()).toBeNull();
    const drift = note('DRIFT');
    expect(drift).toContain(
      'NOT SHIPPED UPSTREAM — pharn-dev/pharn-oss@v1.0.0 has no file here',
    );
    expect(drift).toContain('.claude/hooks (hooks)');
    expect(drift).toContain('pharn/pharn-core (core)');
    expect(drift).not.toContain('No drift');

    const { report } = await statusJson();
    expect(report.drift?.absentUpstream).toEqual(
      expect.arrayContaining([
        { surface: 'hooks', path: '.claude/hooks' },
        { surface: 'core', path: 'pharn/pharn-core' },
      ]),
    );
  });

  // CORE-167: a recorded layout upstream no longer ships.
  it('a layout mismatch prints LAYOUT instead of DRIFT, compares nothing, and still checks the hooks', async () => {
    serveTip(SHA_V1, '1.0.0', { tree: flatTree('1.0.0') });
    await installFresh();
    expect(await status()).toBeNull();
    expect(noteTitles()).not.toContain('LAYOUT');
    expect(note('DRIFT')).toContain('No drift');

    serveTip(SHA_V1, '1.0.0');
    write(SETTINGS, '{}\n');
    expect(await status()).toBeNull();
    expect(noteTitles()).not.toContain('DRIFT');
    expect(noteTitles()).not.toContain('ORPHANED');
    const layout = note('LAYOUT');
    expect(layout).toContain(
      'Recorded at the flat layout; pharn-oss now ships the pharn layout.',
    );
    expect(layout).toContain('Drift is not checked across layouts');
    expect(layout).toContain(
      'Run `pharn update` to move the install; drift is checked after the move.',
    );
    // A plain update moves it at any version: no `--force` fallback.
    expect(layout).not.toContain('"Already up to date"');
    expect(layout).not.toContain('--force');
    expect(layout).toContain('`pharn status --strict` fails');
    // Layout-independent: the hook wiring is still checked.
    expect(note('HOOKS')).toContain('node .claude/hooks/guard.cjs');

    const { report } = await statusJson();
    expect(report).toMatchObject({
      layout: { recorded: 'flat', upstream: 'pharn' },
      drift: null,
      orphans: null,
      hooks: { status: 'missing' },
      unknownCapabilities: [],
      strict: { enabled: false, failed: false },
    });
  });

  // --- HOOKS, ORPHANED, PRETTIER, frozen ------------------------------------

  it('HOOKS names an unwired upstream hook as its JSON, says when hooks reach only this user, and is silent when wired', async () => {
    await installFresh();
    expect(await status()).toBeNull();
    expect(noteTitles()).not.toContain('HOOKS');

    write(SETTINGS, '{}\n');
    expect(await status()).toBeNull();
    expect(note('HOOKS')).toContain(
      'PreToolUse [Write]: {"type":"command","command":"node .claude/hooks/guard.cjs"}',
    );
    expect(note('DRIFT')).toContain('No drift');

    write('.claude/settings.local.json', HOOK_SETTINGS);
    expect(await status()).toBeNull();
    expect(note('HOOKS')).toContain('settings.local.json');
    expect(note('HOOKS')).toContain('not for teammates or CI');
    const { report } = await statusJson();
    expect(report.hooks?.status).toBe('local-only');
  });

  it('ORPHANED names a recorded file upstream stopped shipping — also from a store stamped for another state — and only with a usable store', async () => {
    await installWithOrphan();
    expect(await status()).toBeNull();
    const orphaned = note('ORPHANED');
    expect(orphaned).toContain('UNCHANGED');
    expect(orphaned).toContain(OLD_COMMAND);
    expect(orphaned).not.toContain(PLAN_COMMAND);
    expect(note('DRIFT')).toContain('No drift');

    editRecords((r) => {
      r.skillsVersion = '0.9.0';
    });
    write(OLD_COMMAND, 'MY EDIT\n');
    expect(await status()).toBeNull();
    expect(note('ORPHANED')).toContain(OLD_COMMAND);
    const { report } = await statusJson({ strict: true });
    expect(report.orphans).toEqual([{ path: OLD_COMMAND, state: 'edited' }]);

    // --no-drift never reads for orphans.
    expect(await status({ drift: false })).toBeNull();
    expect(noteTitles()).not.toContain('ORPHANED');
    expect((await statusJson({ drift: false })).report.orphans).toBeNull();

    // No usable store: nothing to name a file by.
    writeFileSync(at('pharn.records.json'), '{ not json');
    expect(await status()).toBeNull();
    expect(noteTitles()).not.toContain('ORPHANED');
    expect((await statusJson()).report.orphans).toBeNull();
  });

  it.each([{}, { drift: false }])(
    'PRETTIER names the lines .prettierignore lacks and pharn update (%j), and is silent once covered',
    async (opts) => {
      await installFresh();
      expect(await status(opts)).toBeNull();
      expect(noteTitles()).not.toContain('PRETTIER');

      write('.prettierignore', 'dist/\n');
      expect(await status(opts)).toBeNull();
      const body = note('PRETTIER');
      expect(body).toContain('.prettierignore does not cover');
      expect(body).toContain(`/${PLAN_COMMAND}`);
      expect(body).toContain('/pharn.config.json');
      expect(body).toContain('pharn update adds them.');
      const { report } = await statusJson(opts);
      expect(report.prettierignore).toMatchObject({ action: 'append' });

      // A plain `update` adds them, at the same version too.
      expect(await run(() => runUpdate({ yes: true }))).toBeNull();
      expect(await status(opts)).toBeNull();
      expect(noteTitles()).not.toContain('PRETTIER');
    },
  );

  it('a frozen capability (upstream ships it, pharn cannot parse it) is named, left out of the diff, and never fails --strict', async () => {
    const FROZEN = 'pharn/pharn-pipeline/grillers/backwards-compat';
    upstream.tree[`${FROZEN}/backwards-compat.md`] = 'no frontmatter here\n';
    // A lens of the same name that parses: the (name, role) pair is the key.
    upstream.tree['pharn/pharn-review/backwards-compat/backwards-compat.md'] =
      capability('lens', '["backend"]', 'lens');
    await installFresh();
    editConfig((c) => {
      c.capabilities.push(
        { name: 'backwards-compat', role: 'griller', source: 'auto' },
        { name: 'backwards-compat', role: 'lens', source: 'manual' },
      );
    });

    expect(await status({ strict: true })).toBe(1);
    const warned = logs('warn').join('\n');
    expect(warned).toContain('could not be read');
    expect(warned).toContain('backwards-compat');
    const drift = note('DRIFT');
    // The lens is compared (its files are missing); the griller is not.
    expect(drift).toContain(
      'pharn/pharn-review/backwards-compat/backwards-compat.md',
    );
    expect(drift).not.toContain(FROZEN);

    editConfig((c) => {
      c.capabilities = c.capabilities.filter((x) => x.role !== 'lens');
    });
    expect(await status({ strict: true })).toBeNull();
    const { report, exitCode } = await statusJson({ strict: true });
    expect(report.unknownCapabilities).toEqual([
      expect.objectContaining({
        role: 'griller',
        name: 'backwards-compat',
        reason: expect.any(String),
      }),
    ]);
    expect(exitCode).toBeUndefined();

    // A whole clone that parsed: no warning.
    serveTip(SHA_V1, '1.0.0');
    expect(await status()).toBeNull();
    expect(logs('warn').join('\n')).not.toContain('could not be read');
  });

  // --- MODELS (local: --no-drift is enough) ---------------------------------

  const ESC = '\u001b';
  const RLO = '\u202e';
  const LS = '\u2028';
  it.each([
    {
      name: 'resolved stages, a stage without its own entry marked (default)',
      models: {
        stages: {
          default: { model: 'sonnet', effort: 'high' },
          plan: { model: 'opus', effort: 'high' },
          review: { model: 'claude-opus-4-8', effort: 'xhigh' },
        },
      },
      verdict: 'valid',
      has: [
        'default          sonnet · high',
        'plan             opus · high',
        'review           claude-opus-4-8 · xhigh',
        'triage           sonnet · high  (default)',
        'ac-test          sonnet · high  (default)',
        '/pharn-ship and /pharn-loop read this block to pick the model they',
        'Effort is never',
        "A stage you run directly uses its command's own model:/effort:",
        'node pharn/floor/check-model-config.mjs agreement',
      ],
      hasNot: ['not this block', 'no installed stage reads'],
    },
    {
      name: 'a flat install points at the checker under .dev/floor',
      layout: 'flat',
      models: { stages: { default: { model: 'opus', effort: 'low' } } },
      verdict: 'valid',
      has: ['node .dev/floor/check-model-config.mjs agreement'],
      hasNot: [],
    },
    {
      name: 'the pre-0.7.0 format is converted by pharn update',
      models: {
        default: { model: 'sonnet-5', effort: 'high' },
        stages: { plan: { model: 'opus-4-8', effort: 'max' } },
      },
      verdict: 'old-format',
      has: [
        'In the format pharn wrote before 0.7.0',
        '`pharn update` converts it',
      ],
      hasNot: ['sonnet-5 · high'],
    },
    {
      name: "pharn-oss's rules reject it, printed terminal-safe",
      models: {
        stages: {
          default: { model: 'sonnet', effort: 'high' },
          [`pl${ESC}[2Kan`]: { model: 'opus', effort: 'high' },
          review: { model: `${RLO}opus`, effort: 'high' },
        },
      },
      verdict: 'invalid',
      has: [
        "pharn-oss's rules reject this block:",
        'is not a product stage',
        'is not an alias',
        'node pharn/floor/check-model-config.mjs validate',
      ],
      hasNot: [RLO, `${ESC}[2K`],
    },
    {
      name: 'no stages declared',
      models: {},
      verdict: 'no-stages',
      has: ['Declares no stages'],
      hasNot: [],
    },
  ])('MODELS: $name', async ({ models, layout, verdict, has, hasNot }) => {
    await installFresh();
    editConfig((c) => {
      c.models = models;
      if (layout) c.layout = layout;
    });
    // Never a --strict input: the block's verdict is pharn-oss's checker's.
    expect(await status({ drift: false, strict: true })).toBeNull();
    const body = note('MODELS');
    for (const s of has) expect(body).toContain(s);
    for (const s of hasNot) expect(body).not.toContain(s);
    if (verdict === 'old-format')
      for (const line of body.split('\n'))
        expect(line.length).toBeLessThanOrEqual(70);
    expect((await statusJson({ drift: false })).report.models).toMatchObject({
      verdict,
    });
  });

  it('MODELS is omitted when the config carries no models block', async () => {
    await installFresh();
    editConfig((c) => {
      delete c.models;
    });
    expect(await status({ drift: false })).toBeNull();
    expect(noteTitles()).not.toContain('MODELS');
    expect((await statusJson({ drift: false })).report.models).toBeNull();
  });

  // --- NODE -----------------------------------------------------------------

  it.each([
    { node: '24.2.0', status: 'ok', has: ['v24.2.0'], mismatch: false },
    {
      node: '22.18.0',
      status: 'below',
      has: ['>= 24.2.0', 'v22.18.0'],
      mismatch: true,
    },
    { node: 'garbage', status: null, has: ['"garbage"'], mismatch: true },
  ])(
    'NODE on Node $node: reported, never fatal, never a --strict input',
    async ({ node, status: verdict, has, mismatch }) => {
      await installFresh();
      setNodeVersion(node);
      expect(await status({ drift: false, strict: true })).toBeNull();
      const body = note('NODE');
      for (const s of has) expect(body).toContain(s);
      expect(body.includes('MISMATCH')).toBe(mismatch);
      const { report, exitCode } = await statusJson({ strict: true });
      if (verdict) expect(report.node.status).toBe(verdict);
      else expect(report.node.status).not.toBe('ok');
      expect(exitCode).toBeUndefined();
    },
  );

  it('NODE renders before any fetch, so it survives a failed one', async () => {
    await installFresh();
    setNodeVersion('22.18.0');
    failures.release = 403;
    expect(await status({ drift: false })).toBe(1);
    expect(note('NODE')).toContain('MISMATCH');
  });

  // --- failures -------------------------------------------------------------

  const failureRows = [
    {
      name: 'the release cannot be resolved (--no-drift)',
      fail: () => (failures.release = 403),
      opts: { drift: false },
      says: 'Could not resolve the latest verified pharn-dev/pharn-oss release',
    },
    {
      name: 'the release cannot be resolved (drift)',
      fail: () => (failures.release = 403),
      opts: {},
      says: 'Could not resolve the latest verified pharn-dev/pharn-oss release',
    },
    {
      name: 'the tip SKILLS_VERSION cannot be read (main, --no-drift)',
      ref: 'main' as const,
      fail: () => (failures.version = 'throw' as const),
      opts: { drift: false },
      says: 'Could not reach https://raw.githubusercontent.com',
    },
    {
      name: 'the tarball cannot be downloaded',
      fail: () => (failures.tarball = 'throw' as const),
      opts: {},
      says: 'fetch failed',
    },
    {
      name: 'the clone carries a hook name pharn refuses',
      fail: () => {
        upstream.tree['.claude/hooks/bad@name.cjs'] = 'x\n';
      },
      opts: {},
      says: 'bad@name.cjs',
    },
  ];

  it.each(failureRows)(
    'exits 1 when $name: text names it with the PHARN_DEBUG hint; --json leaves stdout empty',
    async ({ ref, fail, opts, says }) => {
      await installFresh(ref ? { ref } : {});
      fail();

      expect(await status(opts)).toBe(1);
      expect(logs('error').join('\n')).toContain(says);
      expect(logs('info').join('\n')).toContain('PHARN_DEBUG=1');

      clearAll();
      expect(await run(() => runStatus({ json: true, ...opts }))).toBe(1);
      expect(stdout()).toEqual([]);
      expect(stderr().join('\n')).toContain(says);
      expect(stderr().join('\n')).toContain(
        'Re-run with PHARN_DEBUG=1 for full error output.',
      );
      expectNoClack();
    },
  );

  it('a release that cannot be resolved downloads nothing; PHARN_DEBUG swaps the hint for the error itself', async () => {
    await installFresh();
    failures.release = 404;
    fetchStub.mockClear();
    expect(await status()).toBe(1);
    expect(downloaded()).toBe(false);

    vi.stubEnv('PHARN_DEBUG', '1');
    clearAll();
    expect(await run(() => runStatus({ json: true }))).toBe(1);
    expect(stdout()).toEqual([]);
    expect(stderr().join('\n')).not.toContain('Re-run with PHARN_DEBUG');
    expect(stderr().length).toBeGreaterThan(1);
  });

  // --- proxy notice ---------------------------------------------------------

  it.each([{}, { drift: false }])(
    'warns once about a configured proxy before the first fetch (%j); --json puts it on stderr',
    async (opts) => {
      await installFresh();
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      vi.stubEnv('HTTPS_PROXY', 'http://proxy.internal:3128');
      fetchStub.mockClear();
      expect(await status(opts)).toBeNull();
      const warns = vi.mocked(clack.log.warn).mock;
      const notices = warns.calls.filter(([m]) =>
        String(m).includes('will not use it'),
      );
      expect(notices).toHaveLength(1);
      expect(warns.invocationCallOrder[0]).toBeLessThan(
        fetchStub.mock.invocationCallOrder[0]!,
      );

      fetchStub.mockClear();
      clearAll();
      vi.mocked(console.error).mockClear();
      expect(await run(() => runStatus({ json: true, ...opts }))).toBeNull();
      expect(stderr().join('\n')).toContain('will not use it');
      expect(stdout().join('\n')).not.toContain('proxy');
      expect(vi.mocked(console.error).mock.invocationCallOrder[0]).toBeLessThan(
        fetchStub.mock.invocationCallOrder[0]!,
      );
      expectNoClack();
    },
  );

  it('says nothing about a proxy when none is set, and warns even when the fetch then fails', async () => {
    await installFresh();
    expect(await status()).toBeNull();
    expect(logs('warn').join('\n')).not.toContain('will not use it');

    vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
    failures.release = 'throw';
    expect(await status({ drift: false })).toBe(1);
    expect(logs('warn').join('\n')).toContain('will not use it');
  });

  // --- hostile upstream text ------------------------------------------------

  it('--json escapes a hostile upstream string on stdout, and it parses back exactly', async () => {
    await installFresh();
    const hostile = `node x${ESC}[2J${RLO}${LS}y`;
    upstream.tree[SETTINGS] = JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: hostile }] }],
      },
    });
    const { report } = await statusJson();
    for (const raw of [ESC, RLO, LS]) expect(stdout()[0]).not.toContain(raw);
    expect(report.hooks?.missing.map((h) => h.command)).toEqual([hostile]);
  });

  // --- configs no command may act on ----------------------------------------

  it('a pre-archetype config is refused before any request', async () => {
    write(
      'pharn.config.json',
      JSON.stringify({ skillsVersion: '1.0.0', modules: [] }),
    );
    expect(await status()).toBe(1);
    expect(logs('error').join('\n')).toContain(
      'legacy module layout (pre-archetype)',
    );
    expect(fetched()).toEqual([]);
  });

  // F-05: a hand-edited `archetypes` is a named refusal (exit 1) in every
  // command that loads the config — never a TypeError, never a fetch.
  describe('an invalid `archetypes` is refused by name, before any request', () => {
    const withArchetypes = async (value: unknown): Promise<void> => {
      await installFresh();
      editConfig((c) => {
        (c as Record<string, unknown>).archetypes = value;
      });
      fetchStub.mockClear();
    };

    it.each([
      ['list', () => runList()],
      ['status', () => runStatus()],
    ])('`%s` (text) exits 1 naming the field', async (_cmd, command) => {
      await withArchetypes('ssr');
      clearAll();
      expect(await run(command)).toBe(1);
      expect(logs('error').join('\n')).toMatch(
        /pharn\.config\.json: archetypes must be/,
      );
      expect(printed()).not.toMatch(/TypeError/);
      expect(fetched()).toEqual([]);
    });

    it.each([
      ['list --json', () => runList({ json: true })],
      ['status --json', () => runStatus({ json: true })],
      [
        'update --dry-run --json',
        () => runUpdate({ dryRun: true, json: true }),
      ],
    ])(
      '`%s` exits 1 with the message on stderr and stdout empty',
      async (_cmd, command) => {
        await withArchetypes('ssr');
        clearAll();
        expect(await run(command)).toBe(1);
        expect(stdout()).toEqual([]);
        expect(stderr().join('\n')).toMatch(
          /pharn\.config\.json: archetypes must be/,
        );
        expect(stderr().join('\n')).not.toMatch(/TypeError/);
        expect(clack.log.error).not.toHaveBeenCalled();
        expect(fetched()).toEqual([]);
      },
    );

    it('an unknown archetype is refused too, never a silent narrowing', async () => {
      await withArchetypes(['ssr', 'bogus']);
      clearAll();
      expect(await run(() => runStatus({ json: true }))).toBe(1);
      expect(stdout()).toEqual([]);
      expect(stderr().join('\n')).toMatch(/archetypes\[1\].*"bogus"/);
    });
  });
});

// CORE-194: status compares against the manifest's install set.
describe('status after an install from pharn-install.json', () => {
  it('reports no drift, then an edit to a new-surface file', async () => {
    serveTip(SHA_V1, '7.20.0', { tree: manifestTree('7.20.0') });
    await installFresh();
    const { report: clean } = await statusJson();
    expect(clean.drift).toMatchObject({
      modified: [],
      missing: [],
      absentUpstream: [],
    });
    writeFileSync(at(NEW_SURFACE), 'edited\n');
    const { report: drifted } = await statusJson();
    expect(drifted.drift?.modified).toEqual([NEW_SURFACE]);
  });
});
