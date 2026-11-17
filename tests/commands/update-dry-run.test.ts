import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import { restoreNodeVersion, setNodeVersion } from '../helpers.js';
import {
  AGENT,
  at,
  capability,
  clearOutput,
  fetchStub,
  CONSTITUTION,
  downloaded,
  editConfig,
  editRecords,
  exists,
  failures,
  fetched,
  legacyInstall,
  HOOK,
  installFresh,
  jsonOut,
  lastOutro,
  logs,
  notes,
  noteTitles,
  PLAN_COMMAND,
  printed,
  proj,
  projectFiles,
  read,
  run,
  SECURITY,
  serveTip,
  SETTINGS,
  SHA_V2,
  snapshot,
  stderr,
  stdout,
  upstream,
  useHarness,
  VERSION_URL,
  write,
} from '../support/harness.js';
import { runUpdate } from '../../src/commands/update.js';
import { FLAT_LAYOUT_MESSAGE } from '../../src/lib/pharn-config.js';
import { runAdd } from '../../src/commands/add.js';
import {
  MODELS_RECORD_KEY,
  modelsRecordHash,
} from '../../src/lib/install-records.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();
afterEach(() => restoreNodeVersion());

// ---------------------------------------------------------------------------
// `pharn update --dry-run [--json] [--compact]` against a real project seeded
// by a real `init --yes` at 1.0.0. The preview rides the real run's planner and
// must reach no write: every case that plans compares a whole-tree snapshot
// (dotfiles, the lock file, empty dirs) before and after. No terminal is open
// (the harness default), so a prompt reached would also fail the run.
// ---------------------------------------------------------------------------

// The --json report is an open schema; cases read the slice they pin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

type Opts = Parameters<typeof runUpdate>[0];

const ARCH = 'pharn/ARCHITECTURE.md';
const CORE_SKILL = 'pharn/pharn-core/seam-resolver/SKILL.md';
const STALE_DIR = 'pharn/pharn-review/stale';
const FROZEN_FILE =
  'pharn/pharn-pipeline/grillers/backwards-compat/backwards-compat.md';
const NEW_FLOOR = 'pharn/floor/new-cli.mjs';
// The block every published pharn before 0.7.0 wrote. Since CORE-188 it is
// pharn's only when its record says so; otherwise a block pharn-oss's rules
// reject, kept as the user's.
const LEGACY_MODELS = {
  default: { model: 'sonnet-5', effort: 'high' },
  stages: {
    plan: { model: 'opus-4-8', effort: 'max' },
    review: { model: 'opus-4-8', effort: 'high' },
  },
};
// An old-format block someone edited: kept as it is, its REDs named.
const EDITED_LEGACY_MODELS = {
  ...LEGACY_MODELS,
  stages: { ...LEGACY_MODELS.stages, mine: 1 },
};
const NEW_UPSTREAM_MODELS = {
  stages: { default: { model: 'opus', effort: 'max' } },
};
const STOP_HOOK = {
  hooks: [{ type: 'command', command: 'node', args: ['.claude/hooks/x.cjs'] }],
};
const ESC = '\u001b';

/** Upstream moves to 2.0.0 (CONSTITUTION, SECURITY and AGENT change). */
const v2 = (): void => serveTip(SHA_V2, '2.0.0');

/** Forget the output and requests of the seeding commands. */
function fresh(): void {
  clearOutput();
  fetchStub.mockClear();
  vi.mocked(clack.spinner).mockClear();
}

/** Upstream stops shipping n-plus-one (another lens keeps the subtree). */
function dropLensUpstream(): void {
  delete upstream.tree['pharn/pharn-review/n-plus-one/n-plus-one.md'];
  upstream.tree['pharn/pharn-review/other/other.md'] = capability(
    'lens',
    '["backend"]',
    'other',
  );
}

/** A dry run; returns the exit code (null on a normal return). */
function dry(opts: Opts = {}): Promise<number | null> {
  fresh();
  return run(() => runUpdate({ ...opts, dryRun: true }));
}

/** A JSON dry run that must succeed; returns the ONE object it printed. */
async function dryJson(opts: Opts = {}): Promise<Json> {
  fresh();
  expect(
    await run(() => runUpdate({ ...opts, dryRun: true, json: true })),
  ).toBe(null);
  return jsonOut<Json>();
}

const planNote = (): string => notes('PLAN').join('\n');
const note = (title: string): string => notes(title).join('\n');
const warned = (): string => logs('warn').join('\n');
const informed = (): string => logs('info').join('\n');

/** Under --json nothing may reach clack: every call of it writes to stdout. */
function expectClackSilent(): void {
  expect(noteTitles()).toEqual([]);
  expect(vi.mocked(clack.intro)).not.toHaveBeenCalled();
  expect(vi.mocked(clack.outro)).not.toHaveBeenCalled();
  expect(vi.mocked(clack.spinner)).not.toHaveBeenCalled();
  for (const level of ['info', 'warn', 'error', 'success'] as const)
    expect(logs(level)).toEqual([]);
}

/** A manual entry for a capability whose directory holds a file of the user's. */
function staleCapability(): void {
  editConfig((c) => {
    c.capabilities.push({ name: 'stale', role: 'lens', source: 'auto' });
  });
  write(`${STALE_DIR}/stale.md`, 'stale v1');
  write(`${STALE_DIR}/NOTES.md`, 'my notes');
}

/** An entry upstream ships but this CLI cannot parse (an unknown applies token). */
function frozenCapability(token = 'mobile'): void {
  editConfig((c) => {
    c.capabilities.push({
      name: 'backwards-compat',
      role: 'griller',
      source: 'auto',
    });
  });
  upstream.tree[FROZEN_FILE] = capability('griller', `["${token}"]`, 'wip');
}

/** Edit CONSTITUTION, and drop PLAN_COMMAND's record while editing it. */
function modifiedAndUnrecorded(): void {
  write(CONSTITUTION, 'MY EDIT');
  write(PLAN_COMMAND, 'MY CMD EDIT');
  editRecords((r) => {
    delete r.files[PLAN_COMMAND];
  });
}

describe('pharn update --dry-run (text): writes nothing, asks nothing', () => {
  // One row per kind of plan a real run would apply. Each must leave the tree
  // byte-identical — no backup dir, no lock — and print the preview.
  it.each<{
    name: string;
    opts?: Opts;
    setup: () => void | Promise<void>;
    expect: () => void;
  }>([
    {
      name: 'a clean upgrade',
      setup: v2,
      expect: () => {
        expect(planNote()).toContain('WOULD WRITE — updated');
        expect(planNote()).toContain(CONSTITUTION);
        expect(lastOutro()).toContain('Nothing was changed');
        expect(informed()).toContain('Would record skills v2.0.0.');
      },
    },
    {
      name: 'a clean upgrade with --yes (moot)',
      opts: { yes: true },
      setup: v2,
      expect: () => expect(lastOutro()).toContain('Dry run'),
    },
    {
      name: '--force over modified and unrecorded files',
      opts: { force: true },
      setup: () => {
        v2();
        modifiedAndUnrecorded();
      },
      expect: () => {
        expect(planNote()).toContain('WOULD OVERWRITE (--force) — modified');
        expect(planNote()).toContain('WOULD OVERWRITE (--force) — unrecorded');
        expect(planNote()).toContain(
          'WOULD BACK UP 2 file(s) to pharn/.backup/<timestamp>/',
        );
        expect(lastOutro()).toContain('Run `pharn update --force` to apply');
      },
    },
    {
      name: 'an unusable records store (every difference unverifiable)',
      setup: () => {
        v2();
        write('pharn.records.json', '{not json');
        write(CONSTITUTION, 'MY EDIT');
      },
      expect: () => {
        expect(note('SKIPPED')).toContain('UNVERIFIABLE');
        expect(warned()).toContain('⚠');
      },
    },
    {
      name: 'a dropped capability whose directory holds a file of the user’s',
      setup: () => {
        v2();
        staleCapability();
      },
      expect: () => {
        expect(planNote()).toContain(
          'WOULD DELETE — directories of capabilities dropped from your config',
        );
        expect(planNote()).toContain(`${STALE_DIR}/`);
        expect(planNote()).toContain(`${STALE_DIR}/NOTES.md`);
        expect(note('CAPABILITIES')).toContain(
          'lens:stale — directory would be deleted (2 file(s) would be backed up first)',
        );
        expect(lastOutro()).toContain('delete 1 directory');
        expect(read(`${STALE_DIR}/NOTES.md`)).toBe('my notes');
      },
    },
    {
      name: 'a dropped capability whose directory is already gone',
      setup: () => {
        v2();
        editConfig((c) => {
          c.capabilities.push({ name: 'stale', role: 'lens', source: 'auto' });
        });
      },
      expect: () =>
        expect(note('CAPABILITIES')).toContain('lens:stale — already gone'),
    },
    {
      name: 'a file upstream stopped shipping (ORPHANED) and a surface it no longer ships (NOT SHIPPED)',
      setup: () => {
        v2();
        delete upstream.tree[CORE_SKILL];
      },
      expect: () => {
        expect(note('ORPHANED')).toContain('UNCHANGED');
        expect(note('ORPHANED')).toContain(CORE_SKILL);
        expect(note('NOT SHIPPED')).toContain('pharn/pharn-core (core)');
        expect(note('NOT SHIPPED')).not.toContain('(hooks)');
        expect(read(CORE_SKILL)).toBe('seam resolver\n');
      },
    },
    {
      // v0.21.0: no layout move exists (a flat install is refused at load), so
      // the preview warns of none, and the lock file is left untouched.
      name: 'a flat → pharn layout migration, with a lock file left untouched',
      setup: () => {
        v2();
        write('pharn/.lock', '{"pid":1}');
      },
      expect: () => {
        expect(warned()).not.toContain('would move to the pharn/ layout');
        expect(read('pharn/.lock')).toBe('{"pid":1}');
      },
    },
  ])('$name', async ({ opts, setup, expect: check }) => {
    await installFresh();
    await setup();
    const before = snapshot();
    expect(await dry(opts)).toBeNull();
    expect(snapshot()).toEqual(before);
    expect(exists('pharn/.backup')).toBe(false);
    check();
  });

  it('a flat → pharn migration previews the move and the features README relocation', async () => {
    // v0.21.0: no move is previewed — a flat clone is refused before the plan,
    // nothing written. The features README relocation is still previewed for
    // an install that recorded the root copy.
    await installFresh();
    serveTip(SHA_V2, '2.0.0', { seal: false });
    const before = snapshot();
    expect(await dry()).toBe(1);
    expect(snapshot()).toEqual(before);
    expect(warned()).not.toContain('would move to the pharn/ layout');
    expect(printed()).toContain('ships no pharn-install.json');

    v2();
    editRecords((r) => {
      r.files['features/README.md'] = r.files['pharn/features/README.md']!;
    });
    write('features/README.md', 'features\n');
    const recorded = snapshot();
    expect(await dry()).toBeNull();
    expect(snapshot()).toEqual(recorded);
    expect(warned()).toContain('features/README.md');
    expect((await dryJson()).plan.featuresReadmeRelocation).toBe(true);
  });

  // CORE-155: the flat layout is deprecated in v0.20.0, removed in v0.22.0.
  // Every fetched pharn-oss is the pharn layout, so a flat install's preview
  // is always the move.
  it('DEPRECATED: a flat install is told once in the preview of its move; --json carries nothing of it', async () => {
    // v0.21.0: no DEPRECATED note — the dry run refuses a flat install (exit
    // 1, before any download) with the one re-run-init message; --json too.
    await installFresh();
    legacyInstall('flat');
    const before = snapshot();
    fetchStub.mockClear();
    expect(await dry()).toBe(1);
    expect(notes('DEPRECATED')).toHaveLength(0);
    expect(printed()).toContain(FLAT_LAYOUT_MESSAGE);
    expect(printed()).toContain('removed in v0.21.0');
    expect(downloaded()).toBe(false);

    // A pharn clone does not change that: the recorded layout is refused.
    serveTip(SHA_V2, '2.0.0');
    expect(await dry()).toBe(1);
    expect(notes('DEPRECATED')).toHaveLength(0);
    expect(warned()).not.toContain('would move to the pharn/ layout');

    // --json: nothing on stdout, the one plain line on stderr, no clack.
    fresh();
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBe(1);
    expect(stdout()).toEqual([]);
    expect(stdout().join('\n')).not.toMatch(/deprecat/i);
    expect(stderr().join('\n')).toContain(FLAT_LAYOUT_MESSAGE);
    expectClackSilent();
    expect(snapshot()).toEqual(before);
  });

  it('DEPRECATED is not printed for a pharn install', async () => {
    await installFresh();
    expect(await dry()).toBeNull();
    expect(noteTitles()).not.toContain('DEPRECATED');
  });
});

describe('pharn update --dry-run (text): early returns and refusals', () => {
  it('at the current version says Up to date after one download', async () => {
    await installFresh();
    const before = snapshot();
    expect(await dry()).toBeNull();
    expect(lastOutro()).toContain('Dry run — Up to date.');
    expect(lastOutro()).toContain(
      'A real run would ask nothing and write nothing.',
    );
    expect(downloaded()).toBe(true);
    // An empty plan prints no header note (no "Preview only" banner).
    expect(printed()).not.toContain('Skills version');
    expect(snapshot()).toEqual(before);
  });

  it.each<{ name: string; opts?: Opts; setup: () => void }>([
    {
      name: '--force at the current version',
      opts: { force: true },
      setup: () => {},
    },
    {
      name: 'a file missing at the current version',
      setup: () => rmSync(at('pharn/LIMITS.md')),
    },
  ])('plans (downloads) instead of returning early: $name', async (row) => {
    await installFresh();
    row.setup();
    const before = snapshot();
    expect(await dry(row.opts)).toBeNull();
    expect(downloaded()).toBe(true);
    expect(lastOutro()).toContain('Dry run');
    expect(lastOutro()).not.toContain('Already up to date');
    expect(snapshot()).toEqual(before);
  });

  it('reports an install ahead of the verified release, exits 0 and downloads nothing', async () => {
    await installFresh();
    editConfig((c) => {
      c.skillsVersion = '2.0.0';
    });
    expect(await dry()).toBeNull();
    expect(lastOutro()).toContain('ahead of the latest verified release');
    expect(downloaded()).toBe(false);
  });

  it('reports an install ahead of main (main moved back); --force previews the downgrade', async () => {
    await installFresh({ ref: 'main' });
    editConfig((c) => {
      c.skillsVersion = '2.0.0';
    });
    const before = snapshot();
    expect(await dry()).toBeNull();
    expect(lastOutro()).toContain(
      'newer than pharn-oss main (v1.0.0) — main has moved back',
    );
    expect(lastOutro()).toContain('pharn update --force');
    expect(downloaded()).toBe(false);
    expect(snapshot()).toEqual(before);

    expect(await dry({ force: true })).toBeNull();
    expect(downloaded()).toBe(true);
    expect(lastOutro()).toContain('Dry run');
  });

  it.each<{
    name: string;
    setup: () => void;
    error: string;
    download: boolean;
  }>([
    {
      name: 'the release cannot be resolved',
      setup: () => serveTip(SHA_V2, '2.0.0', { published: false }),
      error: 'release',
      download: false,
    },
    {
      name: 'the download fails',
      setup: () => {
        v2();
        failures.tarball = 'throw';
      },
      error: 'fetch failed',
      download: true,
    },
    {
      name: 'the clone needs a newer CLI (MIN_CLI)',
      setup: () => {
        v2();
        upstream.tree.MIN_CLI = '99.0.0\n';
      },
      error: '99.0.0',
      download: true,
    },
  ])('exits 1, writing nothing, when $name', async (row) => {
    await installFresh();
    row.setup();
    const before = snapshot();
    expect(await dry()).toBe(1);
    expect(snapshot()).toEqual(before);
    expect(logs('error').join('\n')).toContain(row.error);
    expect(downloaded()).toBe(row.download);
  });

  it('exits 1 when planning fails on the clone (no SKILLS_VERSION in it)', async () => {
    await installFresh({ ref: 'main' });
    v2();
    delete upstream.tree.SKILLS_VERSION;
    fresh();
    // The main channel asks raw SKILLS_VERSION first; only the clone lacks it.
    fetchStub.mockImplementationOnce(async () => new Response('2.0.0\n'));
    const before = snapshot();
    expect(await run(() => runUpdate({ dryRun: true }))).toBe(1);
    expect(fetched()[0]).toBe(VERSION_URL);
    expect(downloaded()).toBe(true);
    expect(snapshot()).toEqual(before);
    expect(logs('error').join('\n')).not.toBe('');
  });

  it('warns about a garbage MIN_CLI and still previews', async () => {
    await installFresh();
    v2();
    upstream.tree.MIN_CLI = 'not-a-version\n';
    expect(await dry()).toBeNull();
    expect(warned()).toContain('MIN_CLI');
    expect(lastOutro()).toContain('Dry run');
  });
});

describe('pharn update --dry-run (text): what it reports', () => {
  it('lists restored and updated writes, counts them, and says how to apply', async () => {
    await installFresh();
    v2();
    rmSync(at('pharn/LIMITS.md'));
    expect(await dry()).toBeNull();
    expect(planNote()).toContain('WOULD WRITE — restored');
    expect(planNote()).toContain('pharn/LIMITS.md');
    expect(planNote()).toContain('WOULD WRITE — updated');
    expect(lastOutro()).toContain('would write 4');
    expect(lastOutro()).toContain('Run `pharn update` to apply');
  });

  it('names the state files when they are all a run would change (CORE-162)', async () => {
    await installFresh();
    editRecords((r) => {
      delete r.files['pharn/LIMITS.md'];
    });
    expect(await dry({ force: true })).toBeNull();
    expect(planNote()).toContain('Would rewrite only pharn.records.json.');
    expect(planNote()).not.toContain('Nothing would be written');
    expect(lastOutro()).toContain('Run `pharn update --force` to apply');
  });

  it('says nothing would be written, and ends with the verdict, when the plan changes nothing', async () => {
    await installFresh();
    expect(await dry({ force: true })).toBeNull();
    expect(planNote()).toContain('Nothing would be written');
    expect(planNote()).not.toContain('Would rewrite only');
    expect(lastOutro()).toContain('Dry run — Up to date.');
    expect(lastOutro()).not.toContain('to apply');
  });

  it('a kept edit a real run already withheld for ends "Nothing to change." after SKIPPED', async () => {
    await installFresh();
    write(CONSTITUTION, 'MY EDIT');
    v2();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(await dry()).toBeNull();
    expect(note('SKIPPED')).toContain(CONSTITUTION);
    expect(planNote()).toContain('Nothing would be written');
    expect(lastOutro()).toContain('Dry run — Nothing to change.');
  });

  it('previews the .gitignore it would create at the current version, writing nothing', async () => {
    await installFresh();
    rmSync(at('.gitignore'));
    const before = snapshot();
    expect(await dry()).toBeNull();
    expect(snapshot()).toEqual(before);
    expect(planNote()).toContain(
      ".gitignore: would create it with pharn/.run/, pharn/.backup/ (PHARN's run state and update backups).",
    );
    expect(planNote()).not.toContain('Nothing would be written');
  });

  it('lists a skip, withholds the version and records it as pending', async () => {
    await installFresh();
    v2();
    write(CONSTITUTION, 'MY EDIT');
    expect(await dry()).toBeNull();
    expect(note('SKIPPED')).toContain('MODIFIED');
    expect(note('SKIPPED')).toContain('Run `pharn update --force`');
    expect(warned()).toContain('would stay recorded as skills v1.0.0');
    expect(informed()).toContain('v2.0.0 as pending');
  });

  // CORE-163: at the same version a skip withholds no upgrade.
  it('does not speak of finishing an upgrade when a skip happens at the current version', async () => {
    await installFresh();
    rmSync(at('pharn/LIMITS.md'));
    write(CONSTITUTION, 'MY EDIT');
    expect(await dry()).toBeNull();
    expect(note('SKIPPED')).toContain('MODIFIED');
    expect(warned()).toContain(
      '1 file(s) would be skipped; your install is already at skills v1.0.0, so there is no upgrade to finish — run with --force to overwrite them (backed up to pharn/.backup/ first), or keep them as they are.',
    );
    expect(warned()).not.toContain('finish the upgrade.');
    expect(warned()).not.toContain('would stay recorded');
  });

  it.each<{
    name: string;
    opts?: Opts;
    setup: () => void;
    says: string | null;
  }>([
    {
      name: 'a deleted block is restored',
      setup: () =>
        editConfig((c) => {
          delete c.models;
        }),
      says: "would write pharn-oss's",
    },
    {
      name: 'a block pharn wrote and the user never changed moves',
      setup: () => {
        upstream.tree['pharn.config.json'] = JSON.stringify({
          models: NEW_UPSTREAM_MODELS,
        });
      },
      says: 'Would move your models block',
    },
    {
      name: 'the block an earlier pharn wrote moves when its record proves it pharn’s',
      setup: () => {
        editConfig((c) => {
          c.models = LEGACY_MODELS;
        });
        editRecords((r) => {
          r.files[MODELS_RECORD_KEY] = modelsRecordHash(LEGACY_MODELS);
        });
      },
      says: 'Would move your models block',
    },
    {
      name: 'an edited old-format block is kept as it is, with how to replace it',
      setup: () =>
        editConfig((c) => {
          c.models = EDITED_LEGACY_MODELS;
        }),
      says: 'Replace it by hand, or delete the `models` key from',
    },
    {
      name: 'upstream ships no block: an old-format one is kept as it is',
      setup: () => {
        upstream.tree['pharn.config.json'] = '{}';
        editConfig((c) => {
          c.models = EDITED_LEGACY_MODELS;
        });
      },
      says: 'pharn-oss ships no models block, so yours is kept.',
    },
    {
      name: 'upstream ships no block: a current one is kept silently',
      setup: () => {
        upstream.tree['pharn.config.json'] = '{}';
      },
      says: null,
    },
    {
      name: 'an edited block is replaced under --force, its config backed up',
      opts: { force: true },
      setup: () => {
        editConfig((c) => {
          c.models = { stages: { default: { model: 'haiku', effort: 'low' } } };
        });
        upstream.tree['pharn.config.json'] = JSON.stringify({
          models: NEW_UPSTREAM_MODELS,
        });
      },
      says: 'Would replace your models block',
    },
  ])('MODELS: $name', async (row) => {
    await installFresh();
    v2();
    row.setup();
    const before = snapshot();
    expect(await dry(row.opts)).toBeNull();
    expect(snapshot()).toEqual(before);
    if (row.says === null) expect(notes('MODELS')).toEqual([]);
    else expect(note('MODELS')).toContain(row.says);
    if (row.opts?.force) {
      expect(planNote()).toContain('WOULD BACK UP');
      expect(planNote()).toContain('pharn.config.json');
    }
  });

  // CORE-188: `replacedLegacyDefault` and `conversion` stay in `plan.models`
  // as schemaVersion-1 constants, in their place, over an old-format block
  // too — which is kept, its REDs in `problems`.
  it('MODELS --json: an old-format block is kept; the conversion keys stay constants', async () => {
    await installFresh();
    v2();
    editConfig((c) => {
      c.models = LEGACY_MODELS;
    });
    const json = await dryJson();
    expect(json.status).toBe('planned');
    expect(Object.keys(json.plan.models)).toEqual([
      'outcome',
      'label',
      'replacedLegacyDefault',
      'backup',
      'conversion',
      'problems',
      'upstreamReasons',
    ]);
    expect(json.plan.models).toMatchObject({
      outcome: 'kept',
      label: 'modified',
      replacedLegacyDefault: false,
      backup: false,
      conversion: null,
    });
    expect(json.plan.models.problems).toContain(
      'stage "plan" model "opus-4-8" is not an alias {sonnet, opus, haiku, fable, inherit} nor a claude-* id',
    );
  });

  it('reports a hook upstream wires that the project does not', async () => {
    await installFresh();
    v2();
    const settings = JSON.parse(upstream.tree[SETTINGS]!) as {
      hooks: Record<string, unknown>;
    };
    settings.hooks.Stop = [STOP_HOOK];
    upstream.tree[SETTINGS] = JSON.stringify(settings);
    expect(await dry()).toBeNull();
    expect(note('HOOKS')).toContain('x.cjs');
  });

  it('names a capability it cannot parse, keeps it, and leaves its files out of the plan', async () => {
    await installFresh();
    v2();
    frozenCapability();
    expect(await dry()).toBeNull();
    expect(planNote()).not.toContain(FROZEN_FILE);
    expect(note('CAPABILITIES')).toContain('griller:backwards-compat');
    expect(informed()).toContain('griller:backwards-compat');
    expect(warned()).toContain('backwards-compat');
  });

  it('names a manual capability upstream no longer ships', async () => {
    await installFresh();
    expect(await run(() => runAdd('n-plus-one'))).toBeNull();
    v2();
    dropLensUpstream();
    expect(await dry()).toBeNull();
    expect(note('CAPABILITIES')).toContain('lens:n-plus-one');
  });

  it('names an executable-unit hold in future tense', async () => {
    await installFresh();
    v2();
    write(HOOK, 'hook, edited');
    upstream.tree[NEW_FLOOR] = 'new v2';
    expect(await dry()).toBeNull();
    expect(note('EXECUTABLE UNIT')).toContain(`modified     ${HOOK}`);
    expect(note('EXECUTABLE UNIT')).toContain('would be skipped');
    expect(note('SKIPPED')).toContain('HELD');
  });

  it('shows the channel a --ref switch would record, writing nothing', async () => {
    await installFresh({ ref: 'main' });
    v2();
    const before = snapshot();
    expect(await dry({ ref: 'latest' })).toBeNull();
    expect(planNote()).toContain('Would record channel: latest');
    expect(snapshot()).toEqual(before);
  });
});

describe('pharn update --dry-run: parity with the real run', () => {
  /** The PLAN note's paths under the headings matching `heading`. */
  function listed(heading: RegExp): string[] {
    const out: string[] = [];
    let on = false;
    for (const l of planNote()
      .split('\n')
      .map((s) => s.trim())) {
      if (heading.test(l)) on = true;
      else if (l === '' || /^(WOULD|UNCHANGED|Would|Nothing)/.test(l))
        on = false;
      else if (on) out.push(l);
    }
    return out.sort();
  }
  const planned = (): { writes: string[]; backups: string[] } => ({
    writes: [...listed(/^WOULD WRITE/), ...listed(/^WOULD OVERWRITE/)].sort(),
    backups: listed(/^WOULD BACK UP/),
  });
  /** Files whose bytes a run created or changed, the state files excluded. */
  function changed(before: string[]): string[] {
    const was = new Set(before);
    return snapshot()
      .filter((e) => e.startsWith('f ') && !was.has(e))
      .map((e) => e.split(' ')[1]!)
      .filter(
        (p) =>
          !p.startsWith('pharn/.backup/') &&
          p !== 'pharn.config.json' &&
          p !== 'pharn.records.json',
      )
      .sort();
  }
  const backedUp = (): string[] =>
    projectFiles()
      .filter((f) => f.startsWith('pharn/.backup/'))
      .map((f) => f.split('/').slice(3).join('/'))
      .sort();

  it('--force writes and backs up exactly what the preview listed', async () => {
    await installFresh();
    v2();
    modifiedAndUnrecorded();
    rmSync(at('pharn/LIMITS.md'));
    const before = snapshot();
    expect(await dry({ force: true })).toBeNull();
    const plan = planned();
    expect(snapshot()).toEqual(before);

    expect(await run(() => runUpdate({ force: true, yes: true }))).toBeNull();
    expect(changed(before)).toEqual(plan.writes);
    expect(backedUp()).toEqual(plan.backups);
  });

  it('deletes and backs up exactly what the preview listed for a dropped capability', async () => {
    await installFresh();
    v2();
    staleCapability();
    expect(await dry()).toBeNull();
    const plan = planned();
    expect(
      planNote()
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.endsWith('/')),
    ).toEqual([`${STALE_DIR}/`]);

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(exists(STALE_DIR)).toBe(false);
    expect(backedUp()).toEqual(plan.backups);
  });

  it('skips exactly what the preview skipped (no --force)', async () => {
    await installFresh();
    v2();
    write(CONSTITUTION, 'MY EDIT');
    const before = snapshot();
    expect(await dry()).toBeNull();
    const previewSkipped = note('SKIPPED');
    const plan = planned();

    fresh();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    // The listing is identical; only the one line of advice changes tense.
    const listing = (t: string): string => t.split('\n\n')[0]!;
    expect(listing(note('SKIPPED'))).toBe(listing(previewSkipped));
    expect(changed(before)).toEqual(plan.writes);
    expect(read(CONSTITUTION)).toBe('MY EDIT');
  });

  it('the JSON plan carries the numbers the text outro prints', async () => {
    await installFresh();
    v2();
    write(CONSTITUTION, 'MY EDIT');
    expect(await dry()).toBeNull();
    const outro = lastOutro();
    const { plan } = await dryJson();
    expect(plan.counts).toMatchObject({ updated: 2, forced: 0, skipped: 1 });
    expect(outro).toContain(
      `would write ${plan.writes.length} · back up ${plan.backups.length} · unchanged ${plan.counts.ok} · skipped ${plan.counts.skipped}`,
    );
  });
});

describe('pharn update --dry-run --json', () => {
  it('prints ONE schemaVersion 1 object and nothing else, and writes nothing', async () => {
    await installFresh();
    v2();
    write('pharn/.lock', '{"pid":1}');
    const before = snapshot();
    fresh();
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    expect(stdout()).toHaveLength(1);
    expect(stdout()[0]!.startsWith('{\n  "schemaVersion": 1,')).toBe(true);
    expect(stderr()).toEqual([]);
    expectClackSilent();
    expect(snapshot()).toEqual(before);
    const json = jsonOut<Json>();
    expect(json).toMatchObject({
      schemaVersion: 1,
      command: 'update',
      dryRun: true,
      status: 'planned',
      force: false,
      channel: 'latest',
      channelChange: null,
      source: { kind: 'release', tag: 'v2.0.0' },
      archetypes: ['lib'],
      version: {
        installed: '1.0.0',
        latest: '2.0.0',
        recorded: '2.0.0',
        withheld: false,
        pending: null,
      },
    });
    expect([...json.plan.writes].sort()).toEqual(
      [AGENT, CONSTITUTION, SECURITY].sort(),
    );
    expect(json.plan.counts).toMatchObject({ updated: 3, skipped: 0 });
    // The keys present only when non-empty are absent; rootMigration is
    // always present (null when nothing applies).
    for (const key of [
      'orphans',
      'absentUpstream',
      'executableUnit',
      'gitignore',
      'prettierignore',
      'changesNothing',
    ])
      expect(json.plan, key).not.toHaveProperty(key);
    expect(json.plan.capabilities).not.toHaveProperty('removals');
    expect(json.plan.rootMigration).toBeNull();
    expect(json).not.toHaveProperty('compact');
    expect(json.plan).not.toHaveProperty('filesOmitted');
  });

  it('lists a restored file, and skips an edit without --force (pending recorded)', async () => {
    await installFresh();
    v2();
    write(CONSTITUTION, 'MY EDIT');
    rmSync(at('pharn/LIMITS.md'));
    const json = await dryJson();
    const byRel = Object.fromEntries(
      json.plan.files.map((f: { rel: string }) => [f.rel, f]),
    );
    expect(byRel['pharn/LIMITS.md']).toMatchObject({
      action: 'write',
      label: 'restored',
    });
    expect(byRel[CONSTITUTION]).toMatchObject({
      action: 'skip',
      label: 'modified',
      forced: false,
      backup: false,
    });
    expect(json.plan.skipped).toEqual([
      { label: 'modified', rels: [CONSTITUTION] },
    ]);
    expect(json.plan.backups).toEqual([]);
    expect(json.version).toMatchObject({
      recorded: '1.0.0',
      withheld: true,
      pending: '2.0.0',
    });
  });

  it('--force: forced writes and their backups; an unusable store reads unverifiable with a note', async () => {
    await installFresh();
    v2();
    modifiedAndUnrecorded();
    const json = await dryJson({ force: true });
    expect(json.force).toBe(true);
    const forced = json.plan.files.filter((f: { forced: boolean }) => f.forced);
    expect(forced.map((f: { label: string }) => f.label).sort()).toEqual([
      'modified',
      'unrecorded',
    ]);
    expect([...json.plan.backups].sort()).toEqual(
      [CONSTITUTION, PLAN_COMMAND].sort(),
    );
    expect(json.plan.counts.forced).toBe(2);
    expect(json.plan.recordsNote).toBeNull();

    write('pharn.records.json', '{not json');
    const again = await dryJson({ force: true });
    expect(again.plan.files.map((f: { label: string }) => f.label)).toContain(
      'unverifiable',
    );
    expect(again.plan.recordsNote).toEqual(expect.any(String));
  });

  it('reports a dropped manual capability, a restored models block and a hook upstream wires', async () => {
    await installFresh();
    expect(await run(() => runAdd('n-plus-one'))).toBeNull();
    v2();
    dropLensUpstream();
    editConfig((c) => {
      delete c.models;
    });
    const settings = JSON.parse(upstream.tree[SETTINGS]!) as {
      hooks: Record<string, unknown>;
    };
    settings.hooks.Stop = [STOP_HOOK];
    upstream.tree[SETTINGS] = JSON.stringify(settings);
    const json = await dryJson();
    expect(json.plan.capabilities.changes).toEqual([
      {
        role: 'lens',
        name: 'n-plus-one',
        source: 'manual',
        reason: 'dropped-gone',
      },
    ]);
    expect(json.plan.models).toMatchObject({ outcome: 'restored' });
    expect(JSON.stringify(json.plan.models)).not.toContain('"next"');
    expect(json.plan.hooks.status).toBe('missing');
    expect(json.plan.hooks.missing[0]).toMatchObject({
      event: 'Stop',
      command: 'node',
      args: ['.claude/hooks/x.cjs'],
    });
  });

  it('names a capability it cannot parse, structured on stdout and as prose on stderr', async () => {
    await installFresh();
    v2();
    frozenCapability();
    fresh();
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    const json = jsonOut<Json>();
    expectClackSilent();
    expect(json.plan.frozenCapabilities).toEqual(['griller:backwards-compat']);
    expect(json.plan.unknownCapabilities).toEqual([
      expect.objectContaining({
        role: 'griller',
        name: 'backwards-compat',
        subtree: 'pharn/pharn-pipeline/grillers',
      }),
    ]);
    expect(json.plan.writes).not.toContain(FROZEN_FILE);
    expect(stderr().join('\n')).toContain('backwards-compat');
  });

  it('escapes a hostile string from upstream once, and it parses back exactly', async () => {
    await installFresh();
    v2();
    frozenCapability(`evil${ESC}[31m`);
    const json = await dryJson();
    expect(stdout()[0]).not.toContain(ESC);
    expect(JSON.stringify(json.plan.unknownCapabilities)).not.toBe('[]');
  });

  it('reports a layout migration', async () => {
    // v0.21.0: there is no layout migration to report. `abandonedLayout` is a
    // schemaVersion-1 constant, null; a flat clone is refused, stdout empty.
    await installFresh();
    serveTip(SHA_V2, '2.0.0', { seal: false });
    fresh();
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBe(1);
    expect(stdout()).toEqual([]);
    expect(stderr().join('\n')).toContain('ships no pharn-install.json');
    v2();
    expect((await dryJson()).plan).toMatchObject({
      layout: 'pharn',
      abandonedLayout: null,
      rootMigration: null,
    });
  });

  it('records the channel switch and the release tag under --ref latest', async () => {
    await installFresh({ ref: 'main' });
    v2();
    const json = await dryJson({ ref: 'latest' });
    expect(json.channel).toBe('latest');
    expect(json.channelChange).toEqual({ from: 'main', to: 'latest' });
    expect(json.source).toEqual({ kind: 'release', tag: 'v2.0.0' });
  });

  // The keys present ONLY when non-empty (absent in the default report above).
  it.each<{
    key: string;
    opts?: Opts;
    setup: () => void;
    value: (plan: Json) => unknown;
    expected: unknown;
  }>([
    {
      key: 'capabilities.removals',
      setup: () => {
        v2();
        staleCapability();
      },
      value: (p) => p.capabilities.removals,
      expected: [
        {
          role: 'lens',
          name: 'stale',
          reason: 'dropped-unselected',
          dir: STALE_DIR,
          present: true,
          backups: [`${STALE_DIR}/NOTES.md`, `${STALE_DIR}/stale.md`],
        },
      ],
    },
    {
      key: 'orphans',
      setup: () => {
        v2();
        delete upstream.tree[CORE_SKILL];
        write(CORE_SKILL, 'MY EDIT');
      },
      value: (p) => p.orphans,
      expected: [{ path: CORE_SKILL, state: 'edited' }],
    },
    {
      key: 'absentUpstream',
      setup: () => {
        v2();
        delete upstream.tree[CORE_SKILL];
      },
      value: (p) => p.absentUpstream,
      expected: [{ surface: 'core', path: 'pharn/pharn-core' }],
    },
    {
      key: 'executableUnit',
      setup: () => {
        v2();
        write(HOOK, 'hook, edited');
        upstream.tree[NEW_FLOOR] = 'new v2';
      },
      value: (p) => p.executableUnit,
      expected: {
        blocking: [{ rel: HOOK, label: 'modified' }],
        held: [NEW_FLOOR],
      },
    },
    {
      key: 'gitignore (append, at the current version)',
      setup: () => write('.gitignore', 'pharn/.run/\n'),
      value: (p) => p.gitignore,
      expected: { action: 'append', entries: ['pharn/.backup/'] },
    },
    {
      key: 'gitignore (refused: not a file)',
      setup: () => {
        v2();
        rmSync(at('.gitignore'));
        mkdirSync(at('.gitignore'));
      },
      value: (p) => p.gitignore,
      expected: {
        action: 'refused',
        reason: 'not-a-file',
        entries: ['pharn/.run/', 'pharn/.backup/'],
      },
    },
    {
      key: 'prettierignore',
      setup: () => {
        v2();
        write('.prettierignore', 'dist/\n');
      },
      value: (p) => p.prettierignore.entries.includes('/pharn.config.json'),
      expected: true,
    },
  ])('carries plan.$key only when there is something to say', async (row) => {
    await installFresh();
    row.setup();
    const before = snapshot();
    const json = await dryJson(row.opts);
    expect(json.status).toBe('planned');
    expect(row.value(json.plan)).toEqual(row.expected);
    expect(snapshot()).toEqual(before);
  });

  it('an orphan is not a file decision and --compact never filters it', async () => {
    await installFresh();
    v2();
    delete upstream.tree[CORE_SKILL];
    write(CORE_SKILL, 'MY EDIT');
    const json = await dryJson();
    expect(json.plan.files.map((f: { rel: string }) => f.rel)).not.toContain(
      CORE_SKILL,
    );
    expect(json.version.withheld).toBe(false);
    expect((await dryJson({ compact: true })).plan.orphans).toEqual(
      json.plan.orphans,
    );
  });

  describe('early returns: plan null', () => {
    it.each<{
      status: string;
      ref?: 'main';
      installed: string;
      version: Record<string, unknown>;
      source: Record<string, unknown>;
    }>([
      {
        status: 'ahead-of-release',
        installed: '2.0.0',
        version: { installed: '2.0.0', latest: '1.0.0' },
        source: { kind: 'release', tag: 'v1.0.0' },
      },
      {
        status: 'ahead-of-main',
        ref: 'main',
        installed: '2.0.0',
        version: { installed: '2.0.0', latest: '1.0.0' },
        source: { kind: 'main', tag: null },
      },
    ])(
      '$status (also marked under --compact), downloading nothing',
      async (row) => {
        await installFresh(row.ref ? { ref: row.ref } : {});
        editConfig((c) => {
          c.skillsVersion = row.installed;
        });
        fresh();
        expect(
          await run(() => runUpdate({ dryRun: true, json: true })),
        ).toBeNull();
        expectClackSilent();
        expect(jsonOut<Json>()).toMatchObject({
          schemaVersion: 1,
          status: row.status,
          plan: null,
          version: row.version,
          source: row.source,
        });
        expect(downloaded()).toBe(false);
        expect(await dryJson({ compact: true })).toMatchObject({
          status: row.status,
          compact: true,
          plan: null,
        });
      },
    );

    // `up-to-date` is an empty plan (lib/update-next.ts `changesNothing`): the
    // run downloads and plans, then reports the early-return shape.
    it.each<{ name: string; opts: NonNullable<Opts> }>([
      { name: 'a plain run', opts: {} },
      { name: '--force with nothing to overwrite', opts: { force: true } },
    ])(
      'up-to-date (also marked under --compact): one download, plan null — $name',
      async (row) => {
        await installFresh();
        const before = snapshot();
        fresh();
        expect(
          await run(() => runUpdate({ ...row.opts, dryRun: true, json: true })),
        ).toBeNull();
        expectClackSilent();
        expect(jsonOut<Json>()).toMatchObject({
          schemaVersion: 1,
          status: 'up-to-date',
          force: row.opts.force ?? false,
          plan: null,
          version: {
            installed: '1.0.0',
            latest: '1.0.0',
            recorded: null,
            withheld: null,
            pending: null,
          },
          source: { kind: 'release', tag: 'v1.0.0' },
        });
        expect(stdout().join('\n')).not.toContain('changesNothing');
        expect(downloaded()).toBe(true);
        expect(await dryJson({ ...row.opts, compact: true })).toMatchObject({
          status: 'up-to-date',
          compact: true,
          plan: null,
        });
        expect(snapshot()).toEqual(before);
      },
    );

    it.each<{
      name: string;
      ref?: 'main';
      opts?: Opts;
      setup: () => void;
      check?: (json: Json) => void;
    }>([
      {
        // With an edit to overwrite: an empty `--force` plan is `up-to-date`.
        name: '--force at the current version',
        opts: { force: true },
        setup: () => write(CONSTITUTION, 'MY EDIT'),
        check: (json) =>
          expect(
            json.plan.files.find(
              (f: { rel: string }) => f.rel === CONSTITUTION,
            ),
          ).toMatchObject({ action: 'write', forced: true }),
      },
      {
        name: 'a frozen capability recorded in the config',
        setup: () =>
          editConfig((c) => {
            c.frozenCapabilities = ['griller:old'];
          }),
      },
      {
        // An old-format block is kept as the user's, which changes nothing;
        // deleting its key, as the MODELS note says, plans the restore.
        name: 'an old-format models block whose key was deleted (restored)',
        setup: () =>
          editConfig((c) => {
            delete c.models;
          }),
        check: (json) =>
          expect(json.plan.models).toMatchObject({
            outcome: 'restored',
            replacedLegacyDefault: false,
            conversion: null,
          }),
      },
      {
        name: 'a recorded file missing at the current version',
        setup: () => rmSync(at('pharn/LIMITS.md')),
        check: (json) =>
          expect(
            json.plan.files.find(
              (f: { rel: string }) => f.rel === 'pharn/LIMITS.md',
            ),
          ).toMatchObject({ action: 'write', label: 'restored' }),
      },
      {
        name: 'a --ref switch at the current version',
        ref: 'main',
        opts: { ref: 'latest' },
        setup: () => {},
        check: (json) =>
          expect(json.channelChange).toEqual({ from: 'main', to: 'latest' }),
      },
      {
        name: '--force over an install ahead of the release',
        opts: { force: true },
        setup: () =>
          editConfig((c) => {
            c.skillsVersion = '2.0.0';
          }),
      },
      {
        name: '--force over an install ahead of main',
        ref: 'main',
        opts: { force: true },
        setup: () =>
          editConfig((c) => {
            c.skillsVersion = '2.0.0';
          }),
      },
    ])('is planned instead: $name', async (row) => {
      await installFresh(row.ref ? { ref: row.ref } : {});
      row.setup();
      const json = await dryJson(row.opts);
      expect(json.status).toBe('planned');
      expect(downloaded()).toBe(true);
      row.check?.(json);
    });
  });

  describe('--json implies --dry-run, --compact implies --json', () => {
    it.each<[string, Opts, Opts]>([
      ['--json alone', { json: true }, {}],
      ['--compact alone', { compact: true }, { compact: true }],
      [
        '--compact --dry-run',
        { compact: true, dryRun: true },
        { compact: true },
      ],
    ])(
      '%s prints the same one-object plan as the explicit JSON dry run and writes nothing',
      async (_name, alone, explicit) => {
        await installFresh();
        v2();
        const before = snapshot();
        fresh();
        expect(await run(() => runUpdate(alone))).toBeNull();
        expectClackSilent();
        const implied = jsonOut<Json>();
        expect(snapshot()).toEqual(before);
        clearOutput();
        expect(implied).toEqual(await dryJson(explicit));
        expect(implied.status).toBe('planned');
      },
    );
  });

  describe('--compact', () => {
    // CONSTITUTION, SECURITY and AGENT are clean upgrades, ARCHITECTURE is an
    // edit that would be skipped, everything else already matches (noop).
    async function mixed(): Promise<void> {
      await installFresh();
      v2();
      write(ARCH, 'MY EDIT');
    }

    it('omits the noop entries, keeps the rest, and says so; the default run carries neither marker', async () => {
      await mixed();
      const full = await dryJson();
      expect(full).not.toHaveProperty('compact');
      expect(full.plan).not.toHaveProperty('filesOmitted');
      const json = await dryJson({ compact: true });
      expect(json.compact).toBe(true);
      expect(json.plan.files.map((f: { rel: string }) => f.rel).sort()).toEqual(
        [AGENT, ARCH, CONSTITUTION, SECURITY].sort(),
      );
      expect(json.plan.filesOmitted).toEqual({
        action: 'noop',
        count: json.plan.counts.ok,
      });
      expect(json.plan.counts.ok).toBeGreaterThan(0);
      // Everything but the list and the two markers is the full report.
      const strip = (r: Json): unknown => {
        const { compact: _c, plan, ...rest } = r;
        const { files: _f, filesOmitted: _o, ...planRest } = plan;
        return { ...rest, plan: planRest };
      };
      expect(strip(json)).toEqual(strip(full));
    });

    it('keeps forced entries under --force', async () => {
      await mixed();
      const json = await dryJson({ compact: true, force: true });
      expect(
        json.plan.files
          .filter((f: { forced: boolean }) => f.forced)
          .map((f: { rel: string }) => f.rel),
      ).toEqual([ARCH]);
      expect(
        json.plan.files.some((f: { action: string }) => f.action === 'noop'),
      ).toBe(false);
    });
  });

  describe('failures: stdout empty, a plain stderr line, exit 1', () => {
    it.each<{
      name: string;
      opts?: Opts;
      setup: () => void;
      stderr: string;
      network: boolean;
    }>([
      {
        name: 'a release that cannot be resolved',
        setup: () => serveTip(SHA_V2, '2.0.0', { published: false }),
        stderr: 'release',
        network: true,
      },
      {
        name: 'a failed download',
        setup: () => {
          v2();
          failures.tarball = 'throw';
        },
        stderr: 'fetch failed',
        network: true,
      },
      {
        name: 'a MIN_CLI refusal',
        setup: () => {
          v2();
          upstream.tree.MIN_CLI = '99.0.0\n';
        },
        stderr: '99.0.0',
        network: true,
      },
      {
        name: 'a dropped capability behind a symlinked component',
        setup: () => {
          v2();
          editConfig((c) => {
            c.capabilities.push({
              name: 'stale',
              role: 'lens',
              source: 'auto',
            });
          });
          const outside = join(proj(), '..', 'shared-review');
          mkdirSync(join(outside, 'stale'), { recursive: true });
          symlinkSync(outside, at('pharn/pharn-review'));
        },
        stderr: 'pharn/pharn-review is a symbolic link',
        network: true,
      },
      {
        name: 'a Node below the floor, before the config load and any request',
        setup: () => setNodeVersion('22.0.0'),
        stderr: '24.2.0',
        network: false,
      },
      {
        name: 'a missing config, read json-aware',
        setup: () => rmSync(at('pharn.config.json')),
        stderr: 'pharn init',
        network: false,
      },
    ])('$name', async (row) => {
      await installFresh();
      row.setup();
      const before = snapshot();
      fresh();
      expect(
        await run(() => runUpdate({ dryRun: true, json: true, ...row.opts })),
      ).toBe(1);
      expect(stdout()).toEqual([]);
      const err = stderr().join('\n');
      expect(err).toContain(row.stderr);
      // No clack framing glyphs on stderr, and nothing through clack at all.
      expect(err).not.toMatch(/[│┌└◇●▲■]/);
      expectClackSilent();
      expect(fetched().length > 0).toBe(row.network);
      expect(snapshot()).toEqual(before);
    });

    it('a curated refusal carries no PHARN_DEBUG hint; a failure does, and PHARN_DEBUG dumps the cause instead', async () => {
      await installFresh();
      v2();
      failures.tarball = 'throw';
      fresh();
      expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBe(1);
      expect(stderr().join('\n')).toContain('PHARN_DEBUG');

      vi.stubEnv('PHARN_DEBUG', '1');
      fresh();
      expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBe(1);
      expect(stdout()).toEqual([]);
      expect(
        stderr().some((l) => l.startsWith('TypeError: fetch failed')),
      ).toBe(true);
    });
  });

  it('warns about a garbage MIN_CLI and the proxy on stderr, and still prints the plan', async () => {
    await installFresh();
    v2();
    upstream.tree.MIN_CLI = 'not-a-version\n';
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.invalid:3128');
    fresh();
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    expect(jsonOut<Json>().status).toBe('planned');
    const err = stderr().join('\n');
    expect(err).toContain('MIN_CLI');
    expect(err).toMatch(/proxy/i);
    expectClackSilent();
  });
});
