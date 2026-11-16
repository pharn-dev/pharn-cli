import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as clack from '@clack/prompts';
import {
  CANCEL,
  restoreNodeVersion,
  restoreTTY,
  setNodeVersion,
  setTTY,
} from '../helpers.js';
import {
  A11Y,
  AGENT,
  backupFiles,
  capability,
  editConfig,
  editRecords,
  exists,
  failures,
  fetched,
  downloaded,
  flatTree,
  FLOOR,
  HOOK,
  interactive,
  jsonOut,
  lastOutro,
  N_PLUS_ONE,
  notes,
  printed,
  RELEASE_URL,
  SETTINGS,
  stderr,
  at,
  CONSTITUTION,
  clearOutput,
  config,
  fetchStub,
  HOOK_SETTINGS,
  installFresh,
  PHARN_GITIGNORE_BLOCK,
  PLAN_COMMAND,
  projectFiles,
  proj,
  read,
  records,
  rootEntries,
  run,
  SECURITY,
  serveTip,
  sha256,
  SHA_V1,
  SHA_V1_LATER,
  SHA_V2,
  snapshot,
  stdout,
  tarballUrl,
  upstream,
  upstreamTree7,
  upstreamTree,
  useHarness,
  UPSTREAM_MODELS,
  VERSION_URL,
  write,
  type Config,
  type Records,
  type Tree,
} from '../support/harness.js';
import { runAdd } from '../../src/commands/add.js';
import { runUpdate } from '../../src/commands/update.js';
import { runRemove } from '../../src/commands/remove.js';
import { runStatus } from '../../src/commands/status.js';
import { runList } from '../../src/commands/list.js';
import { runUninstall } from '../../src/commands/uninstall.js';
import {
  MODELS_RECORD_KEY,
  modelsRecordHash,
} from '../../src/lib/install-records.js';
import { PHARN_VERSION } from '../../src/version.js';
// Spied on (never mocked) to count planner calls per run.
import * as updatePlanModule from '../../src/lib/update-plan.js';

// A pass-through `node:fs/promises` whose `rename` a test can intercept: the
// state files (pharn.config.json, pharn.records.json) are written temp-then-
// rename through it (lib/atomic-write.ts), so a failing CONFIG write can be
// driven without a src mock. Untouched, it behaves exactly like the real one.
const fsHooks = vi.hoisted(() => ({
  rename: null as null | ((from: string, to: string) => void),
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  const rename = async (from: string, to: string): Promise<void> => {
    fsHooks.rename?.(String(from), String(to));
    return real.rename(from, to);
  };
  return { ...real, default: { ...real, rename }, rename };
});

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

interface MigrationJson {
  status: string;
  plan: {
    rootMigration: {
      docs: { rel: string; action: string }[];
      moves: { from: string; to: string; action: string }[];
      scratchNotice: boolean;
      gitignoreHints: string[];
    } | null;
  } | null;
}

const tarballFetches = (): number =>
  fetched().filter((u) => u === tarballUrl(upstream.sha)).length;

/** What an older CLI left: the install, minus the agent and its record. */
function dropAgentAsAnOlderCliWould(): void {
  rmSync(at('.claude/agents'), { recursive: true });
  editRecords((r) => {
    delete r.files[AGENT];
  });
}

async function strictStatus(): Promise<StatusJson> {
  clearOutput();
  expect(await run(() => runStatus({ json: true, strict: true }))).toBeNull();
  return jsonOut<StatusJson>();
}

describe('pharn update, end to end', () => {
  it('init and update keep pharn/.run/ and pharn/.backup/ in .gitignore, idempotently', async () => {
    writeFileSync(at('.gitignore'), 'node_modules\r\ndist\r\n');
    await installFresh();
    const full =
      'node_modules\r\ndist\r\n# PHARN run state and update backups (added by pharn)\r\npharn/.run/\r\npharn/.backup/\r\n';
    expect(read('.gitignore')).toBe(full);

    const installed = read('pharn.config.json');
    const { installedAt } = JSON.parse(installed);
    expect(JSON.parse(installed)).not.toHaveProperty('updatedAt');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.gitignore')).toBe(full);
    // The early return: nothing re-applied, so the config was not rewritten.
    expect(read('pharn.config.json')).toBe(installed);

    writeFileSync(at('.gitignore'), full.replace('pharn/.backup/\r\n', ''));
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.gitignore')).toBe(
      full.replace('pharn/.backup/\r\n', '') + 'pharn/.backup/\r\n',
    );
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('.gitignore')).toBe(
      full.replace('pharn/.backup/\r\n', '') + 'pharn/.backup/\r\n',
    );
    // The re-opened run rewrote the config: it records this CLI and the time of
    // the update, and keeps the first install's date.
    const updated = JSON.parse(read('pharn.config.json'));
    expect(updated.installedAt).toBe(installedAt);
    expect(updated.pharnVersion).toBe(PHARN_VERSION);
    expect(typeof updated.updatedAt).toBe('string');
    expect(new Date(updated.updatedAt).toISOString()).toBe(updated.updatedAt);
  });

  // 0.17.0 (lib/prettierignore.ts): in a project that uses Prettier, init
  // makes `.prettierignore` cover every file it wrote — checked with Prettier's
  // own matcher, not pharn's — a same-version update changes nothing, status
  it('update --yes upgrades a clean file, skips an edited one, and withholds the bump', async () => {
    await installFresh();
    const v1Constitution = records().files[CONSTITUTION];
    writeFileSync(at(CONSTITUTION), `my own constitution\n`);

    serveTip(SHA_V2, '2.0.0');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();

    // The clean file is upgraded and re-recorded at what landed.
    expect(read(SECURITY)).toContain('security 2.0.0');
    const rec = records();
    expect(rec.files[SECURITY]).toBe(sha256(SECURITY));
    // The edited file is the user's: kept byte for byte, its record unchanged,
    // so the next run still reads it as `modified`.
    expect(read(CONSTITUTION)).toBe(`my own constitution\n`);
    expect(rec.files[CONSTITUTION]).toBe(v1Constitution);

    // A skip withholds the version bump (the recorded version stays true) and
    // names the version every other file is already at.
    const cfg = config();
    expect(cfg.skillsVersion).toBe('1.0.0');
    expect(cfg.commit).toBe(SHA_V1);
    expect(cfg.pendingSkillsVersion).toBe('2.0.0');
    expect(rec).toMatchObject({ skillsVersion: '1.0.0', commit: SHA_V1 });
    expect(existsSync(at('pharn/.backup'))).toBe(false);
  });

  // CORE-160: a config with no `commit` key used to load as `commit: undefined`,
  // which never equals the store's `null`, so the store was ignored and every
  // differing file read `unverifiable`; a withheld run then stamped the store
  // with `undefined`, JSON.stringify dropped the key, and the store read invalid.
  describe('a config without commit keeps the records store usable (CORE-160)', () => {
    const dropConfigCommit = (): void => {
      const cfg = config() as Partial<Config>;
      delete cfg.commit;
      writeFileSync(at('pharn.config.json'), JSON.stringify(cfg, null, 2));
    };
    const restampStore = (edit: (r: Partial<Records>) => void): void => {
      const rec = records() as Partial<Records>;
      edit(rec);
      writeFileSync(at('pharn.records.json'), JSON.stringify(rec, null, 2));
    };

    it('update uses a store stamped commit null: clean files upgrade, the withheld store keeps commit null', async () => {
      await installFresh();
      dropConfigCommit();
      restampStore((r) => {
        r.commit = null;
      });
      writeFileSync(at(CONSTITUTION), `my own constitution\n`);

      serveTip(SHA_V2, '2.0.0');
      expect(await run(() => runUpdate({ yes: true }))).toBeNull();

      // The store was used: the clean file is an upgrade, not `unverifiable`.
      expect(read(SECURITY)).toContain('security 2.0.0');
      expect(read(CONSTITUTION)).toBe(`my own constitution\n`);
      const cfg = config();
      expect(cfg.skillsVersion).toBe('1.0.0');
      expect(cfg.pendingSkillsVersion).toBe('2.0.0');
      // The withheld run stamps both files with an explicit `null`, so the
      // store still reads back valid and usable next run.
      expect(cfg).toHaveProperty('commit', null);
      const rec = records();
      expect(rec).toHaveProperty('commit', null);
      expect(rec.skillsVersion).toBe('1.0.0');
      expect(rec.files[SECURITY]).toBe(sha256(SECURITY));
      expect(existsSync(at('pharn/.backup'))).toBe(false);
    });

    it('update reads a store an earlier CLI wrote with no commit key as usable', async () => {
      await installFresh();
      dropConfigCommit();
      restampStore((r) => {
        delete r.commit;
      });

      serveTip(SHA_V2, '2.0.0');
      expect(await run(() => runUpdate({ yes: true }))).toBeNull();

      // Every clean file upgraded, so the bump lands and nothing was skipped.
      expect(read(SECURITY)).toContain('security 2.0.0');
      expect(config()).toMatchObject({
        skillsVersion: '2.0.0',
        commit: SHA_V2,
      });
      expect(config().pendingSkillsVersion).toBeUndefined();
      expect(records()).toMatchObject({
        skillsVersion: '2.0.0',
        commit: SHA_V2,
      });
      expect(existsSync(at('pharn/.backup'))).toBe(false);
    });
  });

  // CORE-162: once a kept edit withholds the bump, every later run re-plans —
  // and a run whose plan changes nothing asks nothing and writes nothing.
  it('a second update over a kept edit asks nothing and writes nothing', async () => {
    await installFresh();
    writeFileSync(at(CONSTITUTION), `my own constitution\n`);
    serveTip(SHA_V2, '2.0.0');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(config().pendingSkillsVersion).toBe('2.0.0');

    const before = {
      tree: snapshot(),
      config: read('pharn.config.json'),
      records: read('pharn.records.json'),
    };
    vi.mocked(clack.note).mockClear();
    vi.mocked(clack.outro).mockClear();
    // An interactive terminal and NO --yes: the throwing confirm would fail
    // the run if it were reached.
    setTTY(true, true);
    try {
      expect(await run(() => runUpdate())).toBeNull();
    } finally {
      restoreTTY();
    }

    expect(clack.confirm).not.toHaveBeenCalled();
    expect(read('pharn.config.json')).toBe(before.config);
    expect(read('pharn.records.json')).toBe(before.records);
    expect(snapshot()).toEqual(before.tree);
    // The kept edit is still named, and the run ends saying so.
    const skipped = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'SKIPPED')
      .map(([body]) => String(body))
      .join('\n');
    expect(skipped).toContain(CONSTITUTION);
    expect(String(vi.mocked(clack.outro).mock.calls.at(-1)?.[0])).toContain(
      'Nothing to change.',
    );
  });

  it('update --force lists every file it will overwrite before it asks, then records the run', async () => {
    await installFresh();
    writeFileSync(at(CONSTITUTION), `my own constitution\n`);
    serveTip(SHA_V2, '2.0.0');
    const order: string[] = [];
    vi.mocked(clack.note).mockImplementation((body, title) => {
      order.push(`note ${String(title)}: ${String(body)}`);
    });
    vi.mocked(clack.confirm).mockImplementationOnce(() => {
      order.push('confirm');
      return Promise.resolve(true);
    });
    setTTY(true, true);
    try {
      expect(await run(() => runUpdate({ force: true }))).toBeNull();
    } finally {
      restoreTTY();
      vi.mocked(clack.note).mockReset();
    }

    const confirmAt = order.indexOf('confirm');
    const listAt = order.findIndex(
      (e) => e.startsWith('note OVERWRITE:') && e.includes(CONSTITUTION),
    );
    expect(confirmAt).toBeGreaterThan(-1);
    expect(listAt).toBeGreaterThan(-1);
    expect(listAt).toBeLessThan(confirmAt);
    expect(order[listAt]).toContain('WILL OVERWRITE (--force) — modified');
    // A run that writes still records itself.
    expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');
    const cfg = JSON.parse(read('pharn.config.json')) as {
      updatedAt?: string;
      pharnVersion?: string;
    };
    expect(typeof cfg.updatedAt).toBe('string');
    expect(cfg.pharnVersion).toBe(PHARN_VERSION);
  });

  // CORE-161, the reviewed repro: a torn `add` (records written stamped for a
  // commit the config never reached, the config write lost), then upstream
  // releases. A recorded hash proves authorship whatever the stamp, so the
  // unedited files upgrade, the edited one skips as `modified`, nothing is
  // `unrecorded` or `unverifiable` — on this run or the next — and no
  // `--force` is needed.
  it('update --yes after a torn add and an upstream bump upgrades clean files without --force', async () => {
    await installFresh();
    const configBefore = read('pharn.config.json');
    serveTip(SHA_V1_LATER, '1.0.0');
    expect(await run(() => runAdd('a11y'))).toBeNull();
    // The torn half: the store carries the add, the config never did.
    writeFileSync(at('pharn.config.json'), configBefore);
    expect(records().commit).toBe(SHA_V1_LATER);
    expect(config().commit).toBe(SHA_V1);
    const v1Constitution = records().files[CONSTITUTION];
    writeFileSync(at(CONSTITUTION), 'my own constitution\n');

    serveTip(SHA_V2, '2.0.0');
    const skippedNotes = (): string =>
      vi
        .mocked(clack.note)
        .mock.calls.filter(([, title]) => title === 'SKIPPED')
        .map(([body]) => String(body))
        .join('\n');
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();

    // Unedited files upgrade: the store still proves pharn wrote them.
    expect(read(SECURITY)).toContain('security 2.0.0');
    expect(read(PLAN_COMMAND)).toBe('plan\n');
    expect(records().files[SECURITY]).toBe(sha256(SECURITY));
    // The edited file is the user's: kept, its record carried.
    expect(read(CONSTITUTION)).toBe('my own constitution\n');
    expect(records().files[CONSTITUTION]).toBe(v1Constitution);
    const first = skippedNotes();
    expect(first).toContain('MODIFIED');
    expect(first).toContain(CONSTITUTION);
    expect(first).not.toContain('UNRECORDED');
    expect(first).not.toContain('UNVERIFIABLE');
    expect(config().pendingSkillsVersion).toBe('2.0.0');
    expect(existsSync(at('pharn/.backup'))).toBe(false);

    // The next run reads the same: still only the user's edit, never
    // `unrecorded`.
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    const second = skippedNotes();
    expect(second).toContain('MODIFIED');
    expect(second).not.toContain('UNRECORDED');
    expect(second).not.toContain('UNVERIFIABLE');
    expect(read(CONSTITUTION)).toBe('my own constitution\n');
    expect(existsSync(at('pharn/.backup'))).toBe(false);
  });

  // 0.18.0, the measured mixed-version failure: a NEW floor file beside an
  // EDITED one. The executable unit (floor + hooks + pharn-* commands) is
  // written all or none, so nothing in it lands; everything else still
  // upgrades, the bump is withheld, the version it applied is recorded as
  // pending (the only blocker is the user's edit, CORE-159), and the run exits 0.
  it('update --yes holds the whole executable unit when one floor file is edited', async () => {
    await installFresh();
    const OLD = 'pharn/floor/validate.mjs';
    const NEW = 'pharn/floor/worktree-fingerprint.mjs';
    writeFileSync(at(OLD), 'export const mine = 1;\n');
    const before = {
      hook: read('.claude/hooks/guard.cjs'),
      command: read(PLAN_COMMAND),
      records: records(),
    };

    serveTip(SHA_V2, '2.0.0');
    upstream.tree[OLD] = 'export const STATE_ROOT_SEGMENT = 1;\n';
    upstream.tree[NEW] =
      "import { STATE_ROOT_SEGMENT } from './validate.mjs';\n";
    upstream.tree['.claude/hooks/guard.cjs'] = 'module.exports = { v: 2 };\n';
    upstream.tree[PLAN_COMMAND] = 'plan 2.0.0\n';
    vi.mocked(clack.note).mockClear();

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();

    // No unit file was written: the edited one is the user's, the new one is
    // absent, and the clean hook and command stay at 1.0.0.
    expect(read(OLD)).toBe('export const mine = 1;\n');
    expect(existsSync(at(NEW))).toBe(false);
    expect(read('.claude/hooks/guard.cjs')).toBe(before.hook);
    expect(read(PLAN_COMMAND)).toBe(before.command);
    // Outside the unit, files still upgrade.
    expect(read(SECURITY)).toContain('security 2.0.0');
    expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');

    // The held files keep their old records; the new one gets none.
    const rec = records();
    expect(rec.files['.claude/hooks/guard.cjs']).toBe(
      before.records.files['.claude/hooks/guard.cjs'],
    );
    expect(rec.files[PLAN_COMMAND]).toBe(before.records.files[PLAN_COMMAND]);
    expect(NEW in rec.files).toBe(false);

    // The version is withheld. CORE-159 inverts the 0.18.0 "nothing pending":
    // the hold's only blocker is the user's edit, so 2.0.0 is recorded as
    // pending and `pharn add` keeps working.
    const cfg = config();
    expect(cfg.skillsVersion).toBe('1.0.0');
    expect(cfg.pendingSkillsVersion).toBe('2.0.0');

    // Named before the apply (future tense) and in the report after it.
    const unitNotes = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'EXECUTABLE UNIT')
      .map(([body]) => String(body));
    expect(unitNotes).toHaveLength(2);
    expect(unitNotes[0]).toContain('would be skipped');
    expect(unitNotes[1]).toContain('were skipped');
    for (const body of unitNotes) {
      expect(body).toContain(`modified     ${OLD}`);
      expect(body).toContain('So 3 other unit file(s)');
      expect(body).toContain('`pharn update --force`');
    }
    const skipped = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'SKIPPED')
      .map(([body]) => String(body))
      .join('\n');
    expect(skipped).toContain('HELD');
    expect(skipped).toContain(NEW);

    // --force then writes the unit whole, backing up the edited file first.
    expect(await run(() => runUpdate({ yes: true, force: true }))).toBeNull();
    expect(read(OLD)).toBe('export const STATE_ROOT_SEGMENT = 1;\n');
    expect(existsSync(at(NEW))).toBe(true);
    expect(config().skillsVersion).toBe('2.0.0');
    const backups = readdirSync(at('pharn/.backup'));
    expect(backups).toHaveLength(1);
    expect(
      readFileSync(join(at('pharn/.backup'), backups[0]!, OLD), 'utf8'),
    ).toBe('export const mine = 1;\n');
  });

  it('names every blocking unit file, sorted, when several are edited', async () => {
    await installFresh();
    writeFileSync(at(PLAN_COMMAND), 'my own plan\n');
    writeFileSync(at(HOOK), 'module.exports = { mine: 1 };\n');
    writeFileSync(at(FLOOR), 'export const mine = 1;\n');
    serveTip(SHA_V2, '2.0.0');
    upstream.tree[FLOOR] = 'export const v = 2;\n';
    upstream.tree['pharn/floor/new.mjs'] = 'export {};\n';
    clearOutput();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    const body = notes('EXECUTABLE UNIT').at(-1) ?? '';
    const at1 = body.indexOf(PLAN_COMMAND);
    const at2 = body.indexOf(HOOK);
    const at3 = body.indexOf(FLOOR);
    expect(at1).toBeGreaterThan(-1);
    expect(at1).toBeLessThan(at2);
    expect(at2).toBeLessThan(at3);
    expect(read(FLOOR)).toBe('export const mine = 1;\n');
    expect(config().pendingSkillsVersion).toBe('2.0.0');
  });

  // CORE-159: a hold caused only by the user's own edit no longer locks out
  // `pharn add`. Edit a command and delete a hook, move upstream: the unit is
  // held (the hook stays missing, named), 2.0.0 is pending, and `add` installs
  // at it without touching the unit or the stamp. Reverting the edit lets the
  // next update finish: the hook comes back and the pending version clears.
  it('update --yes over a held unit records the pending version; add works; a revert finishes the upgrade', async () => {
    await installFresh();
    const HOOK = '.claude/hooks/guard.cjs';
    const FLOOR = 'pharn/floor/validate.mjs';
    const original = read(PLAN_COMMAND);
    writeFileSync(at(PLAN_COMMAND), 'my own plan\n');
    rmSync(at(HOOK));

    serveTip(SHA_V2, '2.0.0');
    upstream.tree[FLOOR] = 'export const v = 2;\n';
    upstream.tree[HOOK] = 'module.exports = { v: 2 };\n';
    vi.mocked(clack.note).mockClear();

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();

    // Held: the edit is kept, the hook is not restored, the floor stays v1.
    expect(read(PLAN_COMMAND)).toBe('my own plan\n');
    expect(existsSync(at(HOOK))).toBe(false);
    expect(read(FLOOR)).toBe('export {};\n');
    expect(read(SECURITY)).toContain('security 2.0.0');
    const unitNotes = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'EXECUTABLE UNIT')
      .map(([body]) => String(body));
    expect(unitNotes).toHaveLength(2);
    expect(unitNotes[0]).toContain('would stay missing until the hold ends');
    expect(unitNotes[1]).toContain('stay missing until the hold ends');
    for (const body of unitNotes) {
      expect(body).toContain(`modified     ${PLAN_COMMAND}`);
      expect(body).toContain(`  ${HOOK}`);
    }
    let cfg = config();
    expect(cfg.skillsVersion).toBe('1.0.0');
    expect(cfg.commit).toBe(SHA_V1);
    expect(cfg.pendingSkillsVersion).toBe('2.0.0');

    // `add` installs at the pending version, keeping the config's own stamp
    // and leaving the held unit exactly as it was.
    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(read(A11Y)).toContain('a11y');
    cfg = config();
    expect(cfg.capabilities).toContainEqual({
      name: 'a11y',
      role: 'griller',
      source: 'manual',
    });
    expect(cfg).toMatchObject({
      skillsVersion: '1.0.0',
      commit: SHA_V1,
      pendingSkillsVersion: '2.0.0',
    });
    expect(records()).toMatchObject({ skillsVersion: '1.0.0', commit: SHA_V1 });
    expect(records().files[A11Y]).toBe(sha256(A11Y));
    expect(read(PLAN_COMMAND)).toBe('my own plan\n');
    expect(existsSync(at(HOOK))).toBe(false);
    expect(read(FLOOR)).toBe('export {};\n');

    // Revert the edit: the next update completes and clears the pending version.
    writeFileSync(at(PLAN_COMMAND), original);
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read(HOOK)).toBe('module.exports = { v: 2 };\n');
    expect(read(FLOOR)).toBe('export const v = 2;\n');
    expect(read(A11Y)).toContain('a11y');
    cfg = config();
    expect(cfg.skillsVersion).toBe('2.0.0');
    expect(cfg.commit).toBe(SHA_V2);
    expect(cfg.pendingSkillsVersion).toBeUndefined();
    expect(records()).toMatchObject({ skillsVersion: '2.0.0', commit: SHA_V2 });
  });
  it('a seam block pharn-oss owns stops no command and survives update, add and remove verbatim', async () => {
    await installFresh();
    // A fresh install writes none: pharn-oss materializes its own default.
    expect(read('pharn.config.json')).not.toContain('"seam"');
    const seam = {
      note: 'tuned by hand',
      resolutionOrder: ['model', 'ask', 'ask', 'guess'],
      haltOnUnknown: false,
    };
    const raw = JSON.parse(read('pharn.config.json')) as Record<
      string,
      unknown
    >;
    writeFileSync(
      at('pharn.config.json'),
      `${JSON.stringify({ ...raw, seam }, null, 2)}\n`,
    );
    const seamOf = (): string =>
      JSON.stringify(
        (JSON.parse(read('pharn.config.json')) as { seam?: unknown }).seam,
      );
    const expected = JSON.stringify(seam);

    clearOutput();
    expect(await run(() => runList({ json: true }))).toBeNull();
    expect(stdout()).toHaveLength(1);
    expect(JSON.parse(stdout()[0] ?? '')).toMatchObject({
      archetypes: ['lib'],
    });

    clearOutput();
    expect(await run(() => runStatus({ json: true, strict: true }))).toBeNull();
    const status = JSON.parse(stdout()[0] ?? '') as StatusJson;
    expect(status.strict.failed).toBe(false);
    expect(process.exitCode).toBeUndefined();

    serveTip(SHA_V2, '2.0.0');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(config().skillsVersion).toBe('2.0.0');
    expect(seamOf()).toBe(expected);

    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(config().capabilities).toContainEqual({
      name: 'a11y',
      role: 'griller',
      source: 'manual',
    });
    expect(seamOf()).toBe(expected);

    expect(await run(() => runRemove('a11y'))).toBeNull();
    expect(existsSync(at('pharn/pharn-pipeline/grillers/a11y'))).toBe(false);
    expect(seamOf()).toBe(expected);
  });
  it('status advises a plain update for a missing file; update --yes restores it and keeps the edit', async () => {
    await installFresh();
    const FLOOR = 'pharn/floor/validate.mjs';
    rmSync(at(PLAN_COMMAND));
    writeFileSync(at(FLOOR), 'export const mine = 1;\n');
    const edited = readFileSync(at(FLOOR));

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runStatus({}))).toBeNull();
    const drift = stripVTControlCharacters(
      String(
        vi.mocked(clack.note).mock.calls.find(([, t]) => t === 'DRIFT')?.[0],
      ),
    );
    expect(drift).toContain('MISSING (expected but absent)');
    expect(drift).toContain(PLAN_COMMAND);
    expect(drift).toContain(
      'Run `pharn update` to restore them (files you edited are kept).',
    );
    expect(drift.indexOf('`pharn update` to restore')).toBeLessThan(
      drift.indexOf('pharn update --force'),
    );

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read(PLAN_COMMAND)).toBe('plan\n');
    expect(readFileSync(at(FLOOR)).equals(edited)).toBe(true);
    // Nothing was overwritten, so nothing was backed up.
    expect(existsSync(at('pharn/.backup'))).toBe(false);
    // The run was at the current version: no upgrade to finish.
    const warned = vi
      .mocked(clack.log.warn)
      .mock.calls.map(([m]) => stripVTControlCharacters(String(m)))
      .join('\n');
    expect(warned).toContain('already at skills v1.0.0');
    expect(warned).not.toContain('finish the upgrade');

    clearOutput();
    expect(await run(() => runStatus({ json: true, strict: true }))).toBeNull();
    const after = JSON.parse(stdout()[0] ?? '') as StatusJson;
    expect(after.drift?.missing).toEqual([]);
    // The kept edit is still drift, so --strict still fails on it.
    expect(after.drift?.modified).toEqual([FLOOR]);
    expect(after.strict.failed).toBe(true);
    expect(process.exitCode).toBe(1);
  });
  it('update, add and remove keep the record and never touch the file; it is never an orphan', async () => {
    await installFresh();
    const hash = sha256(SETTINGS);
    expect(records().files[SETTINGS]).toBe(hash);

    serveTip(SHA_V2, '2.0.0');
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    expect(stdout().at(-1)).not.toContain(SETTINGS);
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(config().skillsVersion).toBe('2.0.0');
    expect(records().files[SETTINGS]).toBe(hash);
    expect(read(SETTINGS)).toBe(HOOK_SETTINGS);

    expect(await run(() => runAdd('a11y'))).toBeNull();
    expect(records().files[SETTINGS]).toBe(hash);
    expect(await run(() => runRemove('a11y'))).toBeNull();
    expect(records().files[SETTINGS]).toBe(hash);
    expect(read(SETTINGS)).toBe(HOOK_SETTINGS);

    expect(await run(() => runStatus({ json: true }))).toBeNull();
    const status = JSON.parse(stdout().at(-1) ?? '') as {
      orphans: unknown[] | null;
    };
    expect(status.orphans).toEqual([]);
  });
  it('deleting it never re-opens update; the next run that plans drops the record once, and the run after asks and writes nothing', async () => {
    await installFresh();
    rmSync(at(SETTINGS));

    // Same version: the early return holds — no download, nothing written.
    const before = read('pharn.records.json');
    fetchStub.mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(downloaded()).toBe(false);
    expect(read('pharn.records.json')).toBe(before);

    // A newer upstream: the run plans, does not restore the file (update never
    // writes it), and drops its record.
    serveTip(SHA_V2, '2.0.0');
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(existsSync(at(SETTINGS))).toBe(false);
    expect(records().files).not.toHaveProperty(SETTINGS);

    // The next run that plans (--force skips the same-version early return)
    // over that state changes nothing: in a terminal, without --yes, it never
    // reaches the confirm (the mocked prompt throws), and writes nothing.
    const settledRecords = read('pharn.records.json');
    const settledConfig = read('pharn.config.json');
    setTTY(true, true);
    fetchStub.mockClear();
    vi.mocked(clack.confirm).mockClear();
    expect(await run(() => runUpdate({ force: true }))).toBeNull();
    expect(downloaded()).toBe(true);
    expect(vi.mocked(clack.confirm)).not.toHaveBeenCalled();
    expect(read('pharn.records.json')).toBe(settledRecords);
    expect(read('pharn.config.json')).toBe(settledConfig);
    expect(existsSync(at(SETTINGS))).toBe(false);
  });
  it('a deleted agent fails status --strict, and plain update --yes restores it', async () => {
    await installFresh();
    rmSync(at(AGENT));
    const drifted = await strictStatus();
    expect(drifted.drift?.missing).toEqual([AGENT]);
    expect(drifted.strict.failed).toBe(true);
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read(AGENT)).toBe('review lens agent 1.0.0\n');
    const clean = await strictStatus();
    expect(clean.drift?.missing).toEqual([]);
    expect(clean.strict.failed).toBe(false);
  });

  it('an install at 6.64.0+ an older CLI made without it: plain update --yes adds it, then early-returns', async () => {
    serveTip(SHA_V1, '6.64.0');
    await installFresh();
    dropAgentAsAnOlderCliWould();
    expect((await strictStatus()).drift?.missing).toEqual([AGENT]);
    process.exitCode = undefined;

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    const header = vi
      .mocked(clack.note)
      .mock.calls.map(([body]) => String(body))
      .join('\n');
    expect(header).toContain('.claude/agents/ has no PHARN agent definition');
    expect(read(AGENT)).toBe('review lens agent 6.64.0\n');
    expect(records().files[AGENT]).toBe(sha256(AGENT));
    expect((await strictStatus()).strict.failed).toBe(false);

    // Bounded: the next run finds the agent and early-returns, no download.
    const before = tarballFetches();
    vi.mocked(clack.outro).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(tarballFetches()).toBe(before);
    expect(String(vi.mocked(clack.outro).mock.calls.at(-1)?.[0])).toContain(
      'Already up to date',
    );
  });

  it('below 6.64.0 a missing, unrecorded agent does not re-open update', async () => {
    await installFresh();
    dropAgentAsAnOlderCliWould();
    const before = tarballFetches();
    vi.mocked(clack.outro).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(tarballFetches()).toBe(before);
    expect(String(vi.mocked(clack.outro).mock.calls.at(-1)?.[0])).toContain(
      'Already up to date',
    );
    expect(existsSync(at(AGENT))).toBe(false);
  });
  describe('a hostile pharn.records.json reaches the terminal escaped', () => {
    const CSI = '\u009b';
    const RLO = '\u202e';
    const ESC = '\u001b';

    /** Everything the commands handed to clack, one string. */
    const printed = (): string =>
      [clack.note, clack.outro, clack.log.info, clack.log.warn, clack.log.error]
        .flatMap((fn) => (fn as Mock).mock.calls as unknown[][])
        .map((args) => args.map(String).join(' '))
        .join('\n');

    const clearPrinted = (): void => {
      for (const fn of [
        clack.note,
        clack.outro,
        clack.log.info,
        clack.log.warn,
        clack.log.error,
      ])
        (fn as Mock).mockClear();
    };

    const expectNoRaw = (text: string): void => {
      expect(text).not.toContain(CSI);
      expect(text).not.toContain(RLO);
      expect(text).not.toContain(ESC);
    };

    /** Rewrite the store pharn wrote, changed by `edit`. */
    const plantStore = (edit: (r: Records) => void): void => {
      const r = records();
      edit(r);
      writeFileSync(at('pharn.records.json'), JSON.stringify(r, null, 2));
    };

    // CORE-161: the stamp no longer gates the baseline, so no note quotes it —
    // a hostile stamp is never printed, raw or otherwise, even when upstream
    // moves and the run plans.
    it('a hostile stamp is never printed: update (newer upstream) names no stamp, --json carries no note', async () => {
      await installFresh();
      plantStore((r) => {
        r.skillsVersion = `1.0.0${CSI}2J${RLO}x${ESC}[31m`;
      });
      serveTip(SHA_V2, '2.0.0');

      clearPrinted();
      expect(await run(() => runUpdate({ dryRun: true }))).toBeNull();
      expectNoRaw(printed());
      expect(printed()).not.toContain('2J');

      clearOutput();
      expect(
        await run(() => runUpdate({ dryRun: true, json: true })),
      ).toBeNull();
      expect(stdout()).toHaveLength(1);
      expectNoRaw(stdout()[0]!);
      const report = JSON.parse(stdout()[0]!) as {
        plan: { recordsNote: string | null };
      };
      expect(report.plan.recordsNote).toBeNull();

      clearPrinted();
      expect(await run(() => runUpdate({ yes: true }))).toBeNull();
      expectNoRaw(printed());
      expect(printed()).not.toContain('2J');
    });

    it('a hostile key in an invalid store: update (newer upstream) and uninstall print it escaped', async () => {
      await installFresh();
      const plant = (): void =>
        plantStore((r) => {
          r.files[`pharn/x${CSI}2J${RLO}y${ESC}[31m.md`] = 'not-a-sha256';
        });
      const shown = 'invalid hash for "pharn/x\\u009b2J\\u202ey\\u001b[31m.md"';
      // An invalid store does not re-open the same-version early return, so
      // upstream moves: the run gets far enough to print the note.
      serveTip(SHA_V2, '2.0.0');
      plant();

      clearPrinted();
      expect(await run(() => runUpdate({ dryRun: true }))).toBeNull();
      expect(printed()).toContain(shown);
      expectNoRaw(printed());

      clearPrinted();
      expect(await run(() => runUpdate({ yes: true }))).toBeNull();
      expect(printed()).toContain(shown);
      expectNoRaw(printed());

      // update rewrote the store; plant the hostile one again.
      plant();
      clearPrinted();
      expect(await run(() => runUninstall({ yes: true }))).toBe(1);
      expect(printed()).toContain(shown);
      expectNoRaw(printed());
      expect(existsSync(at('pharn.config.json'))).toBe(true);
    });
  });
  async function oldInstallWithUserData(): Promise<void> {
    serveTip(SHA_V1, '6.9.0');
    await installFresh();
    expect(records().files['THREAT-MODEL.md']).toBeDefined();
    expect(records().files['LIMITS.md']).toBeDefined();
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/lessons-learned.md'), 'lesson\n');
    writeFileSync(at('pharn.spec-template.md'), 'template\n');
    mkdirSync(at('.pharn'));
    writeFileSync(at('.pharn/ci.yml'), 'threshold: 90\n');
    writeFileSync(at('.pharn/writes-scope.json'), '{}\n');
    writeFileSync(at('.gitignore'), 'node_modules\n.pharn/\n.pharn-backup\n');
  }

  it('previews, then retires the root docs, leaves the user data with a hint, and status is clean right after', async () => {
    await oldInstallWithUserData();
    serveTip(SHA_V2, '7.0.0', { tree: upstreamTree7('7.0.0') });

    clearOutput();
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    const preview = JSON.parse(stdout()[0] ?? '') as MigrationJson;
    // `moves` stays in the report (schemaVersion 1) and is always empty: the
    // user data is never moved (CORE-158); the hint is text-only.
    expect(preview.plan?.rootMigration).toEqual({
      docs: [
        { rel: 'THREAT-MODEL.md', action: 'delete' },
        { rel: 'LIMITS.md', action: 'delete' },
      ],
      moves: [],
      scratchNotice: true,
      gitignoreHints: ['pharn/.run/', 'pharn/.backup/'],
    });
    // Nothing of the user's data is backed up: nothing of it is touched.
    const previewBackups = (
      JSON.parse(stdout()[0] ?? '') as { plan: { backups: string[] } }
    ).plan.backups;
    expect(previewBackups).not.toContain('memory-bank/lessons-learned.md');
    expect(previewBackups).not.toContain('pharn.spec-template.md');
    // The preview wrote nothing.
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(true);
    expect(existsSync(at('memory-bank'))).toBe(true);

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();

    // Named BEFORE it is applied (the confirm's note, printed under --yes too),
    // then reported after. Both carry the hint, never a move.
    const migrationNotes = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'ROOT MIGRATION')
      .map(([body]) => String(body));
    expect(migrationNotes).toHaveLength(2);
    expect(migrationNotes[0]).toContain('WOULD DELETE THREAT-MODEL.md');
    expect(migrationNotes[1]).toContain('deleted THREAT-MODEL.md');
    for (const body of migrationNotes) {
      expect(body).not.toContain('MOVE');
      expect(body).toContain(
        "If it is PHARN's, move it: git mv memory-bank pharn/memory-bank (or mv, if git does not track it).",
      );
      expect(body).toContain(
        'git mv pharn.spec-template.md pharn/spec-template.md',
      );
    }

    // The docs: gone from the root, at pharn/, and recorded there only.
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
    expect(existsSync(at('LIMITS.md'))).toBe(false);
    expect(read('pharn/THREAT-MODEL.md')).toBe('threat model\n');
    expect(read('pharn/LIMITS.md')).toBe('limits\n');
    const files = records().files;
    expect(files['THREAT-MODEL.md']).toBeUndefined();
    expect(files['LIMITS.md']).toBeUndefined();
    expect(files['pharn/THREAT-MODEL.md']).toBe(
      sha256('pharn/THREAT-MODEL.md'),
    );
    expect(files['pharn/LIMITS.md']).toBe(sha256('pharn/LIMITS.md'));
    expect(config().skillsVersion).toBe('7.0.0');

    // The user's data: left exactly where and as it was (CORE-158) — not
    // moved, not copied, not backed up.
    expect(read('memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(read('pharn.spec-template.md')).toBe('template\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
    expect(existsSync(at('pharn/spec-template.md'))).toBe(false);
    expect(
      projectFiles().filter((f) => f.startsWith('pharn/.backup/')),
    ).toEqual([]);
    // The scratch dir is only noticed. The user's .gitignore lines are kept
    // byte for byte (the old names are hinted at, never rewritten) and pharn's
    // block is appended after them (lib/gitignore.ts).
    expect(read('.pharn/writes-scope.json')).toBe('{}\n');
    expect(read('.gitignore')).toBe(
      `node_modules\n.pharn/\n.pharn-backup\n${PHARN_GITIGNORE_BLOCK}`,
    );

    // Nothing of pharn's at the root but .claude/, pharn/ and the JSON files;
    // `.gitignore` and `.pharn/` are the user's and pharn-oss's, and
    // `memory-bank/` and the template are the user's to place.
    expect(rootEntries()).toEqual([
      '.claude',
      '.gitignore',
      '.pharn',
      'memory-bank',
      'pharn',
      'pharn.config.json',
      'pharn.records.json',
      'pharn.spec-template.md',
    ]);

    // status is clean immediately after: no drift, no orphans, --strict passes.
    clearOutput();
    expect(await run(() => runStatus({ json: true, strict: true }))).toBeNull();
    const status = JSON.parse(stdout()[0] ?? '') as StatusJson & {
      orphans: unknown[] | null;
    };
    expect(status.drift).toMatchObject({ modified: [], missing: [] });
    expect(status.orphans).toEqual([]);
    expect(status.strict.failed).toBe(false);
    expect(process.exitCode).toBeUndefined();

    // And the next update has nothing left to do (the same-version return).
    const before = read('pharn.records.json');
    fetchStub.mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('pharn.records.json')).toBe(before);
    expect(
      fetchStub.mock.calls.some(([u]) =>
        String(u).startsWith('https://codeload'),
      ),
    ).toBe(false);
  });

  it('keeps an edited root doc as an orphan; with memory-bank/ at both places it says merge by hand and exits 0', async () => {
    await oldInstallWithUserData();
    writeFileSync(at('LIMITS.md'), 'my limits\n');
    mkdirSync(at('pharn/memory-bank'));
    writeFileSync(at('pharn/memory-bank/other.md'), 'other\n');
    serveTip(SHA_V2, '7.0.0', { tree: upstreamTree7('7.0.0') });

    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    // Both copies present is not a failure any more (CORE-158).
    expect(process.exitCode).toBeUndefined();

    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
    expect(read('LIMITS.md')).toBe('my limits\n');
    // Kept docs keep their record: still a listed orphan.
    expect(records().files['LIMITS.md']).toBeDefined();
    // Never merged: both trees untouched. The template is not moved either,
    // although its destination is free.
    expect(read('memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(readdirSync(at('pharn/memory-bank'))).toEqual(['other.md']);
    expect(read('pharn.spec-template.md')).toBe('template\n');
    expect(existsSync(at('pharn/spec-template.md'))).toBe(false);

    const notes = vi
      .mocked(clack.note)
      .mock.calls.filter(([, title]) => title === 'ROOT MIGRATION')
      .map(([body]) => String(body))
      .join('\n');
    expect(notes).toContain(
      'merge it into pharn/memory-bank/ by hand, then delete memory-bank/.',
    );
    // Never a `git mv` that would nest memory-bank/ inside the existing copy.
    expect(notes).not.toContain('git mv memory-bank');
    expect(notes).toContain(
      'git mv pharn.spec-template.md pharn/spec-template.md',
    );
  });

  it('update --force leaves the user data where it is too', async () => {
    await oldInstallWithUserData();
    serveTip(SHA_V2, '7.0.0', { tree: upstreamTree7('7.0.0') });
    expect(await run(() => runUpdate({ yes: true, force: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();
    expect(read('memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(read('pharn.spec-template.md')).toBe('template\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
    expect(existsSync(at('pharn/spec-template.md'))).toBe(false);
    // The record-proved root docs are still retired.
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
  });

  it('is inert against a pre-7.0 tree: nothing moves, and the report says null', async () => {
    await oldInstallWithUserData();
    serveTip(SHA_V2, '6.9.1');
    clearOutput();
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    expect(
      (JSON.parse(stdout()[0] ?? '') as MigrationJson).plan?.rootMigration,
    ).toBeNull();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(read('THREAT-MODEL.md')).toBe('threat model\n');
    expect(read('memory-bank/lessons-learned.md')).toBe('lesson\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
    expect(records().files['THREAT-MODEL.md']).toBeDefined();
  });

  it('re-opens the same-version return for root docs an older CLI left on a 7.x install', async () => {
    // What 0.13.0 leaves after updating to 7.0.0: config and records at 7.0.0,
    // the root docs still recorded (carried as orphans), no pharn/ docs.
    serveTip(SHA_V1, '6.9.0');
    await installFresh();
    const stamp = { skillsVersion: '7.0.0', commit: SHA_V2 };
    writeFileSync(
      at('pharn.config.json'),
      JSON.stringify({ ...config(), ...stamp }, null, 2),
    );
    writeFileSync(
      at('pharn.records.json'),
      JSON.stringify({ ...records(), ...stamp }, null, 2),
    );
    serveTip(SHA_V2, '7.0.0', { tree: upstreamTree7('7.0.0') });

    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(existsSync(at('THREAT-MODEL.md'))).toBe(false);
    expect(existsSync(at('LIMITS.md'))).toBe(false);
    expect(records().files['pharn/LIMITS.md']).toBeDefined();
  });

  it('does NOT re-open the same-version return for user data at the root of a 7.x install', async () => {
    serveTip(SHA_V1, '7.0.0', { tree: upstreamTree7('7.0.0') });
    await installFresh();
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/canon.md'), 'canon\n');
    const before = read('pharn.records.json');
    fetchStub.mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();
    // "Already up to date": no download, nothing rewritten, nothing moved.
    expect(
      fetchStub.mock.calls.some(([u]) =>
        String(u).startsWith('https://codeload'),
      ),
    ).toBe(false);
    expect(read('pharn.records.json')).toBe(before);
    expect(read('memory-bank/canon.md')).toBe('canon\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
  });

  it('a plan whose only root-migration content is a user-data hint changes nothing: no write, the hint printed', async () => {
    serveTip(SHA_V1, '7.0.0', { tree: upstreamTree7('7.0.0') });
    await installFresh();
    mkdirSync(at('memory-bank'));
    writeFileSync(at('memory-bank/canon.md'), 'canon\n');
    // `--force` skips the same-version early return, so the run plans; with
    // every file at upstream, the hint is all the root migration has.
    clearOutput();
    expect(
      await run(() => runUpdate({ dryRun: true, json: true, force: true })),
    ).toBeNull();
    expect(
      (JSON.parse(stdout()[0] ?? '') as MigrationJson).plan?.rootMigration,
    ).toEqual({
      docs: [
        { rel: 'THREAT-MODEL.md', action: 'absent' },
        { rel: 'LIMITS.md', action: 'absent' },
      ],
      moves: [],
      scratchNotice: false,
      gitignoreHints: [],
    });
    const configBefore = read('pharn.config.json');
    const recordsBefore = read('pharn.records.json');
    vi.mocked(clack.note).mockClear();
    expect(await run(() => runUpdate({ yes: true, force: true }))).toBeNull();
    expect(process.exitCode).toBeUndefined();
    // changesNothing: neither state file is rewritten (no `updatedAt`).
    expect(read('pharn.config.json')).toBe(configBefore);
    expect(read('pharn.records.json')).toBe(recordsBefore);
    expect(read('memory-bank/canon.md')).toBe('canon\n');
    expect(existsSync(at('pharn/memory-bank'))).toBe(false);
    expect(
      vi
        .mocked(clack.note)
        .mock.calls.filter(([, title]) => title === 'ROOT MIGRATION')
        .map(([body]) => String(body))
        .join('\n'),
    ).toContain('git mv memory-bank pharn/memory-bank');
  });
  it('points at an old root .pharn-backup/ and leaves it alone', async () => {
    await installFresh();
    mkdirSync(at('.pharn-backup/20261001-120000'), { recursive: true });
    writeFileSync(at('.pharn-backup/20261001-120000/x.md'), 'old\n');
    serveTip(SHA_V2, '2.0.0');
    vi.mocked(clack.log.info).mockClear();
    expect(await run(() => runUpdate({ yes: true }))).toBeNull();
    expect(
      vi
        .mocked(clack.log.info)
        .mock.calls.some(([m]) =>
          String(m).startsWith('.pharn-backup/ holds backups'),
        ),
    ).toBe(true);
    expect(read('.pharn-backup/20261001-120000/x.md')).toBe('old\n');
  });
});

// ---------------------------------------------------------------------------
// The REAL run's behaviour (docs/commands/update.md), on the harness: the gates
// before any network call, the confirm, the early returns and what re-opens
// them, the per-file decisions, membership, frozen capabilities, orphans, the
// models block, --force and its backup, failures part-way, and layout moves.
// `--dry-run` is tests/commands/update-dry-run.test.ts; lock refusals are
// tests/commands/lock.test.ts.
// ---------------------------------------------------------------------------

afterEach(() => {
  fsHooks.rename = null;
  restoreNodeVersion();
});

const asRoot = process.getuid?.() === 0;

/** `init --yes`, then forget its output and its fetches. */
async function installed(
  init: Parameters<typeof installFresh>[0] = {},
): Promise<void> {
  await installFresh(init);
  clearOutput();
  fetchStub.mockClear();
}

/** `init --yes` (with `init`) at 1.0.0, then upstream at 2.0.0, edited by `edit`. */
async function bumped(
  edit?: (t: Tree) => void,
  init: Parameters<typeof installFresh>[0] = {},
): Promise<void> {
  await installed(init);
  serveTip(SHA_V2, '2.0.0');
  edit?.(upstream.tree);
}

const updateYes = (opts: Parameters<typeof runUpdate>[0] = {}) =>
  run(() => runUpdate({ yes: true, ...opts }));

const upToDate = (v = '1.0.0'): string => `Already up to date (skills v${v}).`;

const DEBUG_HINT = 'PHARN_DEBUG';
const PROXY = 'will not use it';
const CHANNEL_NOTICE =
  'Verified releases are now the default for new installs. This install keeps following pharn-oss main; run `pharn update --ref latest` to switch (recorded on first use).';

// The default every published pharn through 0.6.0 wrote.
const OLD_DEFAULT = {
  default: { model: 'sonnet-5', effort: 'high' },
  stages: {
    plan: { model: 'opus-4-8', effort: 'max' },
    review: { model: 'opus-4-8', effort: 'high' },
  },
};
// OLD_DEFAULT in the current format.
const OLD_DEFAULT_CONVERTED = {
  stages: {
    default: { model: 'sonnet', effort: 'high' },
    plan: { model: 'opus', effort: 'max' },
    review: { model: 'opus', effort: 'high' },
  },
};

/** The first argument of every call to one clack log level, colour stripped. */
const logged = (level: 'info' | 'warn' | 'error'): string[] =>
  (clack.log[level] as unknown as Mock).mock.calls.map((c) =>
    stripVTControlCharacters(String(c[0])),
  );

/** The `{ output }` stream of every call to one log level whose text has `needle`. */
const streamsOf = (level: 'info' | 'warn' | 'error', needle: string) =>
  (clack.log[level] as unknown as Mock).mock.calls
    .filter((c) => stripVTControlCharacters(String(c[0])).includes(needle))
    .map((c) => (c[1] as { output?: unknown } | undefined)?.output);

/** Send temp clones to a directory of the test's own; returns its lister. */
function isolateClones(): { dir: string; list: () => string[] } {
  const dir = join(proj(), '..', 'clones');
  mkdirSync(dir);
  vi.stubEnv('TMPDIR', dir);
  return { dir, list: () => readdirSync(dir) };
}

/** Every spinner start/stop, in call order. */
function spinnerEvents(): string[] {
  const events: [number, string][] = [];
  for (const r of vi.mocked(clack.spinner).mock.results) {
    const s = r.value as { start: Mock; stop: Mock };
    for (const kind of ['start', 'stop'] as const)
      s[kind].mock.calls.forEach((c, i) =>
        events.push([
          s[kind].mock.invocationCallOrder[i]!,
          `${kind}: ${String(c[0] ?? '')}`,
        ]),
      );
  }
  return events
    .sort((a, b) => a[0] - b[0])
    .map(([order, e]) => `${order} ${e}`);
}

/** The call order of the first note titled `title`. */
const noteOrder = (title: string): number => {
  const calls = vi.mocked(clack.note).mock;
  return calls.invocationCallOrder[
    calls.calls.findIndex(([, t]) => t === title)
  ]!;
};

describe('update refuses before any network call, writing nothing', () => {
  it.each([
    ['Node 22.18.0', '22.18.0', ['24.2.0', '22.18.0', 'Nothing was written']],
    ['an unparseable Node version', '', ['could not read']],
  ])('on %s, --yes --force included', async (_l, node, says) => {
    await bumped();
    const before = snapshot();
    fetchStub.mockClear();
    setNodeVersion(node);
    expect(await updateYes({ force: true })).toBe(1);
    for (const s of says) expect(logged('error').join('\n')).toContain(s);
    expect(streamsOf('error', says[0]!)).toEqual([process.stderr]);
    expect(fetched()).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  it.each<[string, [boolean, boolean], Parameters<typeof runUpdate>[0]]>([
    ['neither stream a TTY', [false, false], {}],
    ['only stdin a TTY', [true, false], {}],
    ['--force without --yes', [false, false], { force: true }],
  ])(
    'off an interactive terminal (%s): exit 1, both ways out named, no proxy note, no hint',
    async (_l, [stdinTTY, stdoutTTY], opts) => {
      await bumped();
      write(CONSTITUTION, 'mine\n');
      const before = snapshot();
      fetchStub.mockClear();
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      setTTY(stdinTTY, stdoutTTY);
      expect(await run(() => runUpdate(opts))).toBe(1);
      const err = logged('error').join('\n');
      expect(err).toContain('interactive terminal');
      expect(err).toContain('--yes');
      expect(printed()).not.toContain(DEBUG_HINT);
      expect(printed()).not.toContain(PROXY);
      expect(fetched()).toEqual([]);
      expect(snapshot()).toEqual(before);
    },
  );

  it.each([
    [
      'no pharn.config.json',
      () => rmSync(at('pharn.config.json')),
      'Run `pharn init` first',
    ],
    [
      'a pre-archetype (module) config',
      () =>
        writeFileSync(
          at('pharn.config.json'),
          JSON.stringify({ skillsVersion: '1.0.0', modules: ['core'] }),
        ),
      'legacy module layout',
    ],
  ])(
    'on %s — that error wins over the TTY gate and the proxy note',
    async (_l, arrange, says) => {
      await installed();
      arrange();
      fetchStub.mockClear();
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      setTTY(false, false);
      expect(await run(() => runUpdate())).toBe(1);
      expect(printed()).toContain(says);
      expect(printed()).not.toContain('interactive terminal');
      expect(printed()).not.toContain(PROXY);
      expect(fetched()).toEqual([]);
    },
  );

  it('refuses a clone whose product-command name fails the allowlist', async () => {
    await bumped((t) => {
      t['.claude/commands/pharn-Weird_Name.md'] = 'weird\n';
    });
    const before = snapshot();
    expect(await updateYes()).toBe(1);
    expect(printed()).toContain('pharn-Weird_Name.md');
    expect(snapshot()).toEqual(before);
  });
});

describe('a failed fetch exits 1 before the confirm, writing nothing and leaving no clone', () => {
  it.each<[string, Parameters<typeof installFresh>[0], () => void, string]>([
    [
      'the version check (main)',
      { ref: 'main' },
      () => {
        failures.version = 'throw';
      },
      'fetch failed',
    ],
    [
      'the download',
      {},
      () => {
        failures.tarball = 'throw';
      },
      'fetch failed',
    ],
    [
      'the release resolve (none published)',
      {},
      () => serveTip(SHA_V2, '2.0.0', { published: false }),
      '--ref main',
    ],
  ])('%s', async (_l, init, arrange, says) => {
    await bumped(undefined, init);
    arrange();
    const clones = isolateClones();
    const before = snapshot();
    fetchStub.mockClear();
    interactive();
    expect(await run(() => runUpdate())).toBe(1);
    expect(logged('error').join('\n')).toContain(says);
    expect(streamsOf('error', says)).toEqual([process.stderr]);
    if (says === 'fetch failed') {
      // An exception-derived failure offers the debug switch, on stderr.
      expect(streamsOf('info', DEBUG_HINT)).toEqual([process.stderr]);
    }
    expect(clack.confirm).not.toHaveBeenCalled();
    expect(downloaded()).toBe(failures.tarball !== undefined);
    expect(snapshot()).toEqual(before);
    expect(clones.list()).toEqual([]);
  });

  it('dumps the error itself instead of the hint under PHARN_DEBUG=1', async () => {
    await bumped();
    failures.tarball = 'throw';
    vi.stubEnv('PHARN_DEBUG', '1');
    expect(await updateYes()).toBe(1);
    expect(stderr().join('\n')).toContain('TypeError: fetch failed');
    expect(logged('info').join('\n')).not.toContain(DEBUG_HINT);
  });

  it.each([
    ['a too-old CLI (MIN_CLI 99.0.0): exit 1 before the confirm', '99.0.0\n'],
    ['a garbage MIN_CLI: a warning, then a normal update', 'not-a-version\n'],
    ['a satisfied MIN_CLI: silence, then a normal update', '0.0.1\n'],
  ])('%s', async (label, minCli) => {
    await bumped((t) => {
      t.MIN_CLI = minCli;
    });
    const clones = isolateClones();
    const before = snapshot();
    if (label.startsWith('a too-old')) {
      interactive();
      expect(await run(() => runUpdate())).toBe(1);
      const err = logged('error').join('\n');
      expect(err).toContain('too old');
      expect(err).toContain('99.0.0');
      expect(printed()).not.toContain(DEBUG_HINT);
      expect(clack.confirm).not.toHaveBeenCalled();
      expect(snapshot()).toEqual(before);
      expect(exists('pharn/.lock')).toBe(false);
    } else {
      expect(await updateYes()).toBeNull();
      expect(read(SECURITY)).toContain('security 2.0.0');
      expect(logged('warn').join('\n').includes('MIN_CLI')).toBe(
        label.startsWith('a garbage'),
      );
    }
    expect(clones.list()).toEqual([]);
  });
});

describe('the confirm', () => {
  const A11Y_DIR = 'pharn/pharn-pipeline/grillers/a11y';

  it.each([
    ['declining', false],
    ['Ctrl-C', CANCEL],
  ])(
    '%s exits 0 after one download: nothing written or deleted, no lock, no clone left',
    async (_l, answer) => {
      // An install that would also DELETE a dropped capability's directory.
      await installed({ archetypes: ['ssr'] });
      editConfig((c) => {
        c.archetypes = ['lib'];
      });
      serveTip(SHA_V2, '2.0.0');
      const clones = isolateClones();
      const before = snapshot();
      fetchStub.mockClear();
      interactive({ confirm: [answer] });
      expect(await run(() => runUpdate())).toBe(0);
      expect(fetched().filter((u) => u === tarballUrl(SHA_V2))).toHaveLength(1);
      expect(exists(A11Y_DIR)).toBe(true);
      expect(snapshot()).toEqual(before);
      expect(clones.list()).toEqual([]);
    },
  );

  it('asks "Apply this update?" (default Yes), downloads once, and leaves no lock or clone', async () => {
    await bumped();
    const clones = isolateClones();
    fetchStub.mockClear();
    interactive({ confirm: [true] });
    expect(await run(() => runUpdate())).toBeNull();
    expect(clack.confirm).toHaveBeenCalledWith({
      message: 'Apply this update?',
      initialValue: true,
    });
    expect(fetched().filter((u) => u === tarballUrl(SHA_V2))).toHaveLength(1);
    expect(read(SECURITY)).toContain('security 2.0.0');
    expect(exists('pharn/.lock')).toBe(false);
    expect(clones.list()).toEqual([]);
    // No proxy variable set, no proxy note.
    expect(printed()).not.toContain(PROXY);
  });

  it('asks with the overwrite wording under --force', async () => {
    await bumped();
    interactive({ confirm: [true] });
    expect(await run(() => runUpdate({ force: true }))).toBeNull();
    expect(clack.confirm).toHaveBeenCalledWith({
      message: 'Apply this update and overwrite your changes?',
      initialValue: true,
    });
  });

  it.each([
    ['off a TTY', false],
    ['in a TTY', true],
  ])(
    '--yes %s runs the whole update without asking — the notes still print',
    async (_l, tty) => {
      await bumped();
      setTTY(tty, tty);
      expect(await updateYes()).toBeNull();
      expect(clack.confirm).not.toHaveBeenCalled();
      expect(printed()).toContain('v1.0.0 → v2.0.0');
      expect(read(SECURITY)).toContain('security 2.0.0');
      expect(config()).toMatchObject({
        skillsVersion: '2.0.0',
        commit: SHA_V2,
      });
      expect(lastOutro()).not.toBe('');
    },
  );

  // C5.2: the lock is taken before the plan and held across the confirm, so
  // the run plans ONCE — the confirmed plan is the applied plan.
  it.each([
    ['answered at the confirm', false],
    ['--yes', true],
  ])('plans exactly once per run (%s)', async (_l, yes) => {
    await bumped();
    const planner = vi.spyOn(updatePlanModule, 'buildUpdatePlan');
    if (yes) setTTY(false, false);
    else interactive({ confirm: [true] });
    expect(await run(() => runUpdate({ yes }))).toBeNull();
    expect(planner).toHaveBeenCalledTimes(1);
    expect(read(SECURITY)).toContain('security 2.0.0');
  });

  it.each([
    ['', {}],
    [' (--force too)', { force: true }],
  ])(
    'a file edited while the confirm is open stops the run before anything is written%s',
    async (_l, opts) => {
      await bumped();
      const cfg = read('pharn.config.json');
      const rec = read('pharn.records.json');
      setTTY(true, true);
      vi.mocked(clack.confirm).mockImplementationOnce(async () => {
        write(CONSTITUTION, 'edited while the confirm was open\n');
        return true;
      });
      expect(await run(() => runUpdate(opts))).toBe(1);
      // The edit is kept, and nothing else moved: no file, record, config or
      // backup — the confirmed plan no longer describes the disk.
      expect(read(CONSTITUTION)).toBe('edited while the confirm was open\n');
      expect(read(SECURITY)).toContain('security 1.0.0');
      expect(read('pharn.config.json')).toBe(cfg);
      expect(read('pharn.records.json')).toBe(rec);
      expect(exists('pharn/.backup')).toBe(false);
      expect(exists('pharn/.lock')).toBe(false);
      const said = printed();
      expect(said).toContain(
        'A file changed while `pharn update` was waiting for your answer:',
      );
      expect(said).toContain(`  ${CONSTITUTION}`);
      expect(said).toContain('Nothing was written, and your edit is kept.');
      expect(said).not.toContain(DEBUG_HINT);

      // The re-run plans the edit as the user's and keeps it.
      clearOutput();
      expect(await updateYes()).toBeNull();
      expect(read(CONSTITUTION)).toBe('edited while the confirm was open\n');
      expect(read(SECURITY)).toContain('security 2.0.0');
    },
  );
});

describe('the proxy notice', () => {
  it.each<[string, () => void, number | null]>([
    ['the full update', () => serveTip(SHA_V2, '2.0.0'), null],
    ['the up-to-date early return, which still fetches', () => undefined, null],
    [
      'a fetch that then fails',
      () => {
        failures.release = 'throw';
      },
      1,
    ],
  ])(
    'is printed once, before the first fetch, on %s',
    async (_l, arrange, code) => {
      await installed();
      arrange();
      vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
      vi.stubEnv('HTTPS_PROXY', 'http://proxy.internal:3128');
      clearOutput();
      fetchStub.mockClear();
      expect(await updateYes()).toBe(code);
      const warn = vi.mocked(clack.log.warn).mock;
      const at = warn.calls.findIndex(([m]) => String(m).includes(PROXY));
      expect(logged('warn').filter((m) => m.includes(PROXY))).toHaveLength(1);
      expect(warn.invocationCallOrder[at]!).toBeLessThan(
        fetchStub.mock.invocationCallOrder[0]!,
      );
    },
  );
});

describe('the same-version early return', () => {
  it('says "Already up to date" without downloading or rewriting anything', async () => {
    await installed();
    const before = snapshot();
    fetchStub.mockClear();
    setTTY(false, false);
    expect(await updateYes()).toBeNull();
    expect(lastOutro()).toBe(upToDate());
    expect(downloaded()).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it.each<[string, () => void, string, () => void]>([
    [
      'a recorded file that is gone',
      () => rmSync(at(CONSTITUTION)),
      `${CONSTITUTION} is missing — this run re-applies the install, restoring it if upstream still ships it.`,
      () => expect(read(CONSTITUTION)).toBe('constitution 1.0.0\n'),
    ],
    [
      'a capability directory that is gone, with no records store',
      () => {
        rmSync(at('pharn.records.json'));
        rmSync(at('pharn/pharn-pipeline/grillers/security'), {
          recursive: true,
        });
      },
      'pharn/pharn-pipeline/grillers/security is missing',
      () => expect(read(SECURITY)).toContain('security 1.0.0'),
    ],
    [
      ".gitignore without pharn's lines",
      () => writeFileSync(at('.gitignore'), 'node_modules\n'),
      ".gitignore does not yet keep PHARN's run state and backups out of git — this run re-applies the install and adds them.",
      () => {
        expect(read('.gitignore')).toBe(
          `node_modules\n${PHARN_GITIGNORE_BLOCK}`,
        );
        expect(logged('info')).toContain(
          "Added pharn/.run/, pharn/.backup/ to .gitignore (PHARN's run state and update backups).",
        );
      },
    ],
    [
      'a Prettier project whose .prettierignore does not cover pharn',
      () => writeFileSync(at('.prettierrc'), '{}\n'),
      '.prettierignore does not yet cover the files pharn installs and rewrites — this run re-applies the install and adds them.',
      () => {
        expect(read('.prettierignore')).toMatch(
          /^# Files installed and rewritten by pharn \(added by pharn\)\n/,
        );
        expect(read('.prettierignore')).toContain('/pharn.config.json\n');
        expect(
          logged('info').some((m) =>
            m.startsWith('Created .prettierignore with '),
          ),
        ).toBe(true);
      },
    ],
    [
      'a models block in the pre-0.7.0 format',
      () =>
        editConfig((c) => {
          c.models = OLD_DEFAULT;
        }),
      'Your models block is in the format pharn wrote before 0.7.0 — this run converts it.',
      () => expect(config().models).toEqual(UPSTREAM_MODELS),
    ],
  ])(
    're-opens for %s; the run repairs it, and the next run returns early again',
    async (_l, arrange, says, check) => {
      await installed();
      arrange();
      clearOutput();
      fetchStub.mockClear();
      expect(await updateYes()).toBeNull();
      expect(downloaded()).toBe(true);
      expect(printed()).toContain(says);
      check();
      expect(exists('pharn/.backup')).toBe(false);

      clearOutput();
      fetchStub.mockClear();
      expect(await updateYes()).toBeNull();
      expect(downloaded()).toBe(false);
      expect(lastOutro()).toBe(upToDate());
    },
  );

  it.each<[string, () => void]>([
    [
      'a symlinked .gitignore (the run could not write it)',
      () => {
        const outside = join(proj(), '..', 'outside-gitignore');
        writeFileSync(outside, 'node_modules\n');
        rmSync(at('.gitignore'));
        symlinkSync(outside, at('.gitignore'));
      },
    ],
    [
      'a .gitignore that is a directory',
      () => {
        rmSync(at('.gitignore'));
        mkdirSync(at('.gitignore'));
      },
    ],
    [
      'a symlinked .prettierignore in a Prettier project',
      () => {
        writeFileSync(at('.prettierrc'), '{}\n');
        const outside = join(proj(), '..', 'outside-prettierignore');
        writeFileSync(outside, 'dist/\n');
        symlinkSync(outside, at('.prettierignore'));
      },
    ],
    [
      'a Prettier project with no records store (nothing says what pharn wrote)',
      () => {
        writeFileSync(at('.prettierrc'), '{}\n');
        rmSync(at('pharn.records.json'));
      },
    ],
    [
      'a recorded capability directory behind a symlink',
      () => {
        const outside = join(proj(), '..', 'outside');
        mkdirSync(outside);
        rmSync(at('pharn/pharn-pipeline/grillers/security'), {
          recursive: true,
        });
        symlinkSync(outside, at('pharn/pharn-pipeline/grillers/security'));
      },
    ],
    ['an absent records store', () => rmSync(at('pharn.records.json'))],
    [
      'a corrupt records store (left byte for byte)',
      () => writeFileSync(at('pharn.records.json'), '{ not json'),
    ],
    [
      'a records store stamped for another install state (a torn add)',
      () =>
        editRecords((r) => {
          r.commit = SHA_V1_LATER;
        }),
    ],
  ])('does not re-open for %s', async (_l, arrange) => {
    await installed();
    arrange();
    const before = snapshot();
    fetchStub.mockClear();
    expect(await updateYes()).toBeNull();
    expect(downloaded()).toBe(false);
    expect(lastOutro()).toBe(upToDate());
    expect(snapshot()).toEqual(before);
  });

  it('a capability `remove`d at the current version stays removed until --force re-applies the install', async () => {
    await installed();
    expect(await run(() => runRemove('security'))).toBeNull();
    fetchStub.mockClear();
    expect(await updateYes()).toBeNull();
    expect(lastOutro()).toBe(upToDate());
    expect(exists(SECURITY)).toBe(false);

    expect(await updateYes({ force: true })).toBeNull();
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(config().capabilities).toEqual([
      { name: 'security', role: 'griller', source: 'auto' },
    ]);
  });
});

describe('an install ahead of its source', () => {
  /** Installed at 2.0.0 (then `edit`ed); the source now offers 1.0.0. */
  async function ahead(
    init: Parameters<typeof installFresh>[0],
    edit?: (c: Config) => void,
  ): Promise<void> {
    serveTip(SHA_V2, '2.0.0');
    await installed(init);
    if (edit) editConfig(edit);
    serveTip(SHA_V1, '1.0.0');
  }

  it.each<
    [
      string,
      Parameters<typeof installFresh>[0],
      ((c: Config) => void) | undefined,
      Parameters<typeof runUpdate>[0],
      string[],
    ]
  >([
    [
      'the latest verified release',
      {},
      undefined,
      {},
      [
        'ahead of the latest verified release (v1.0.0)',
        '`pharn update --ref main` switches back to main',
        '`pharn update --force` goes back to v1.0.0',
      ],
    ],
    [
      'main (main moved back)',
      { ref: 'main' },
      undefined,
      {},
      [
        'Your install (skills v2.0.0) is newer than pharn-oss main (v1.0.0) — main has moved back',
        'Nothing changed',
        '`pharn update --force` downgrades to v1.0.0',
      ],
    ],
    [
      'main, by its pending version',
      { ref: 'main' },
      (c) => {
        c.skillsVersion = '0.9.0';
        c.pendingSkillsVersion = '2.0.0';
      },
      {},
      [
        '(skills v0.9.0, partly upgraded to v2.0.0) is newer than pharn-oss main',
      ],
    ],
    [
      'main, with a frozen capability to re-check',
      { ref: 'main' },
      (c) => {
        c.frozenCapabilities = ['griller:backwards-compat'];
      },
      {},
      ['newer than pharn-oss main'],
    ],
    [
      'main, with a models block to convert',
      { ref: 'main' },
      (c) => {
        c.models = OLD_DEFAULT;
      },
      {},
      ['newer than pharn-oss main'],
    ],
    [
      'main, on a switch from the release channel (not recorded)',
      {},
      undefined,
      { ref: 'main' },
      ['newer than pharn-oss main'],
    ],
  ])(
    'refuses the downgrade from %s: exit 0, no download, nothing written — --yes included',
    async (_l, init, edit, opts, says) => {
      await ahead(init, edit);
      const before = snapshot();
      fetchStub.mockClear();
      expect(await updateYes(opts)).toBeNull();
      for (const s of says) expect(lastOutro()).toContain(s);
      expect(downloaded()).toBe(false);
      expect(snapshot()).toEqual(before);
    },
  );

  it.each([
    ['the release', {}],
    ['main', { ref: 'main' as const }],
  ])('--force goes back to %s', async (_l, init) => {
    await ahead(init);
    expect(await updateYes({ force: true })).toBeNull();
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(config().skillsVersion).toBe('1.0.0');
  });

  it('a pending version BEHIND main still upgrades, and a complete run clears it', async () => {
    await installed({ ref: 'main' });
    editConfig((c) => {
      c.pendingSkillsVersion = '1.0.5';
    });
    serveTip(SHA_V2, '2.0.0');
    expect(await updateYes()).toBeNull();
    expect(config().skillsVersion).toBe('2.0.0');
    expect(config().pendingSkillsVersion).toBeUndefined();
  });
});

describe('the channel', () => {
  const notices = (): number =>
    logged('info').filter((m) => m === CHANNEL_NOTICE).length;

  it('an install on main is told once per run that it stays on main, early return included', async () => {
    await installed({ ref: 'main' });
    clearOutput();
    expect(await updateYes()).toBeNull();
    expect(lastOutro()).toBe(upToDate());
    expect(notices()).toBe(1);
  });

  it('prints no notice for a release install, or for an explicit --ref', async () => {
    await installed();
    clearOutput();
    expect(await updateYes()).toBeNull();
    expect(notices()).toBe(0);
    editConfig((c) => {
      delete c.ref;
    });
    expect(await updateYes({ ref: 'main' })).toBeNull();
    expect(notices()).toBe(0);
  });

  it('--ref latest moves a main install to the release, recorded even at the same version; --ref main moves it back', async () => {
    await installed({ ref: 'main' });
    fetchStub.mockClear();
    clearOutput();
    expect(await updateYes({ ref: 'latest' })).toBeNull();
    expect(downloaded()).toBe(true);
    expect(fetched()).toContain(RELEASE_URL);
    expect(config().ref).toBe('latest');
    expect(printed()).toContain('verified release v1.0.0');

    // Recorded, so a plain run follows the release from now on.
    fetchStub.mockClear();
    expect(await updateYes()).toBeNull();
    expect(lastOutro()).toBe(upToDate());
    expect(fetched()).toContain(RELEASE_URL);
    expect(fetched()).not.toContain(VERSION_URL);

    expect(await updateYes({ ref: 'main' })).toBeNull();
    expect(config().ref).toBeUndefined();
  });
});

describe('per-file decisions on a version bump', () => {
  it('upgrades clean files, restores deleted ones with their parents, keeps an edit under MODIFIED, and records the run', async () => {
    await bumped();
    const { installedAt } = config();
    rmSync(at('pharn/pharn-pipeline'), { recursive: true });
    write(CONSTITUTION, 'mine\n');
    const before = Date.now();
    expect(await updateYes()).toBeNull();
    expect(read(SECURITY)).toContain('security 2.0.0');
    expect(records().files[SECURITY]).toBe(sha256(SECURITY));
    expect(read(CONSTITUTION)).toBe('mine\n');
    const skipped = notes('SKIPPED').join('\n');
    expect(skipped).toContain('MODIFIED');
    expect(skipped).toContain(CONSTITUTION);
    expect(skipped).toContain('--force');
    // The withheld run still rewrote the config: this CLI, the time, the
    // first install's date kept, and the membership it merged.
    const cfg = config();
    expect(cfg).toMatchObject({
      skillsVersion: '1.0.0',
      pendingSkillsVersion: '2.0.0',
      pharnVersion: PHARN_VERSION,
      installedAt,
    });
    expect(Date.parse(cfg.updatedAt!)).toBeGreaterThanOrEqual(before);
    expect(new Date(cfg.updatedAt!).toISOString()).toBe(cfg.updatedAt);
  });

  it('with no records store every differing file is UNVERIFIABLE and kept, and nothing is pending', async () => {
    await bumped();
    rmSync(at('pharn.records.json'));
    expect(await updateYes()).toBeNull();
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(notes('SKIPPED').join('\n')).toContain('UNVERIFIABLE');
    expect(config().skillsVersion).toBe('1.0.0');
    expect(config().pendingSkillsVersion).toBeUndefined();
  });

  it('a file of yours where upstream starts shipping one is an UNRECORDED skip, recorded as pending', async () => {
    const NEW = 'pharn/pharn-contracts/seam-config.md';
    await bumped((t) => {
      t[NEW] = 'seam config\n';
    });
    write(NEW, 'my own notes\n');
    expect(await updateYes()).toBeNull();
    expect(read(NEW)).toBe('my own notes\n');
    const skipped = notes('SKIPPED').join('\n');
    expect(skipped).toContain('UNRECORDED');
    expect(skipped).toContain(NEW);
    expect(config()).toMatchObject({
      skillsVersion: '1.0.0',
      pendingSkillsVersion: '2.0.0',
    });
  });

  it('names a corrupt records store by name', async () => {
    await bumped();
    writeFileSync(at('pharn.records.json'), 'not json{');
    expect(await updateYes()).toBeNull();
    expect(logged('warn').join('\n')).toContain('pharn.records.json');
  });

  it('a `..`-in-basename file in a capability upgrades like any other', async () => {
    const ODD = 'pharn/pharn-pipeline/grillers/security/migration..v2.md';
    upstream.tree[ODD] = 'odd v1\n';
    await installed();
    serveTip(SHA_V2, '2.0.0');
    upstream.tree[ODD] = 'odd v2\n';
    expect(await updateYes()).toBeNull();
    expect(read(ODD)).toBe('odd v2\n');
    expect(notes('SKIPPED')).toEqual([]);
    expect(config().skillsVersion).toBe('2.0.0');
  });

  it.each([
    { force: false, edit: false },
    { force: true, edit: false },
    { force: false, edit: true },
    { force: true, edit: true },
  ])(
    'a file where a directory belongs is UNREADABLE, and --force is advised only for what it can clear (%j)',
    async ({ force, edit }) => {
      await bumped();
      rmSync(at('pharn/pharn-pipeline'), { recursive: true });
      write('pharn/pharn-pipeline', 'a FILE where a directory belongs');
      if (edit) write(CONSTITUTION, 'mine\n');
      expect(await updateYes({ force })).toBeNull();
      const skipped = notes('SKIPPED').join('\n');
      const withheld = logged('warn').find((m) =>
        m.includes('still recorded as skills v'),
      );
      expect(skipped).toContain('UNREADABLE');
      expect(skipped).toContain(
        '--force cannot clear the UNREADABLE paths above.',
      );
      expect(config().skillsVersion).toBe('1.0.0');
      if (edit && !force) {
        expect(skipped).toContain('MODIFIED');
        expect(skipped.indexOf('Re-run with --force')).toBeGreaterThan(-1);
        expect(skipped.indexOf('Re-run with --force')).toBeLessThan(
          skipped.indexOf('--force cannot clear'),
        );
        expect(withheld).toContain('or re-run with --force');
      } else {
        expect(skipped).toContain('Inspect each path by hand');
        expect(skipped).not.toContain('Re-run with --force');
        expect(skipped).not.toContain('MODIFIED');
        expect(withheld).toContain('resolve them to finish the upgrade');
        expect(withheld).not.toContain('--force');
      }
      if (edit && force)
        expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');
    },
  );

  it('a hook under a symlinked .claude/hooks is an UNREADABLE skip: nothing goes through the link', async () => {
    await bumped((t) => {
      t[HOOK] = 'module.exports = { v: 2 };\n';
    });
    const outside = join(proj(), '..', 'dotfiles-hooks');
    mkdirSync(outside);
    rmSync(at('.claude/hooks'), { recursive: true });
    symlinkSync(outside, at('.claude/hooks'));
    expect(await updateYes()).toBeNull();
    const skipped = notes('SKIPPED').join('\n');
    expect(skipped).toContain('UNREADABLE');
    expect(skipped).toContain(HOOK);
    expect(readdirSync(outside)).toEqual([]);
    expect(read(SECURITY)).toContain('security 2.0.0');
    expect(config().skillsVersion).toBe('1.0.0');
  });

  it('copies a new .mjs hook but never its .test.mjs, deletes no file upstream stopped shipping, and never writes settings.json', async () => {
    await bumped((t) => {
      t['.claude/hooks/loop.mjs'] = 'esm\n';
      t['.claude/hooks/loop.test.mjs'] = 'TEST\n';
      t[SETTINGS] = '{"upstream":true}';
    });
    write('pharn/pharn-pipeline/grillers/security/legacy.md', 'mine\n');
    expect(await updateYes()).toBeNull();
    expect(read('.claude/hooks/loop.mjs')).toBe('esm\n');
    expect(exists('.claude/hooks/loop.test.mjs')).toBe(false);
    expect(read('pharn/pharn-pipeline/grillers/security/legacy.md')).toBe(
      'mine\n',
    );
    expect(read(SETTINGS)).toBe(HOOK_SETTINGS);
  });

  it('names an upstream hook the project does not wire, and leaves settings.json byte for byte', async () => {
    await bumped((t) => {
      t[SETTINGS] = JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node',
                  args: ['.claude/hooks/require-loop-record.cjs'],
                },
              ],
            },
          ],
        },
      });
    });
    expect(await updateYes()).toBeNull();
    expect(notes('HOOKS').join('\n')).toContain(
      'Stop: {"type":"command","command":"node","args":[".claude/hooks/require-loop-record.cjs"]}',
    );
    expect(read(SETTINGS)).toBe(HOOK_SETTINGS);
  });

  it('prints no HOOKS note when upstream ships no settings.json, and no NOT SHIPPED note for a complete clone', async () => {
    await bumped((t) => {
      delete t[SETTINGS];
    });
    expect(await updateYes()).toBeNull();
    expect(notes('HOOKS')).toEqual([]);
    expect(notes('NOT SHIPPED')).toEqual([]);
  });

  it('names each declared surface the clone does not ship, and still records the new version', async () => {
    await bumped((t) => {
      delete t[FLOOR];
      delete t['pharn/floor/validate.test.mjs'];
      delete t.LICENSE;
      delete t['LIMITS.md'];
    });
    expect(await updateYes()).toBeNull();
    const notShipped = notes('NOT SHIPPED').join('\n');
    expect(notShipped).toContain('(floor)');
    expect(notShipped).toContain('(license)');
    expect(notShipped).toContain('(trusted-doc)');
    expect(notShipped).not.toContain('(hooks)');
    expect(notShipped).not.toContain('(commands)');
    expect(config().skillsVersion).toBe('2.0.0');
  });
});

describe('capability membership', () => {
  const A11Y_DIR = 'pharn/pharn-pipeline/grillers/a11y';
  const A11Y_NOTES = `${A11Y_DIR}/NOTES.md`;
  const SECURITY_ONLY = [{ name: 'security', role: 'griller', source: 'auto' }];

  /** An `ssr` install (security + a11y) now recorded as `lib`: a11y is dropped. */
  async function droppedA11y(withNotes = true): Promise<void> {
    await installed({ archetypes: ['ssr'] });
    editConfig((c) => {
      c.archetypes = ['lib'];
    });
    if (withNotes) write(A11Y_NOTES, 'my notes\n');
    serveTip(SHA_V2, '2.0.0');
  }
  const backupDir = (): string =>
    `pharn/.backup/${readdirSync(at('pharn/.backup'))[0]!}`;

  it('drops a capability the archetypes no longer select: named before the confirm (default No), backed up, deleted, its records pruned', async () => {
    await droppedA11y();
    interactive({ confirm: [true] });
    expect(await run(() => runUpdate())).toBeNull();

    expect(clack.confirm).toHaveBeenCalledWith({
      message: 'Apply this update? It deletes 1 capability directory.',
      initialValue: false,
    });
    const [preview, report] = notes('CAPABILITIES');
    expect(preview).toContain('griller:a11y — directory would be deleted');
    expect(preview).toContain('1 file(s) would be backed up first');
    expect(noteOrder('CAPABILITIES')).toBeLessThan(
      vi.mocked(clack.confirm).mock.invocationCallOrder[0]!,
    );
    expect(report).toContain('griller:a11y — directory deleted');
    expect(report).toContain('1 file(s) backed up first');

    expect(exists(A11Y_DIR)).toBe(false);
    // pharn's own unchanged bytes are not saved — `add` can write them again.
    expect(backupFiles()).toEqual([A11Y_NOTES]);
    expect(logged('info')).toContain(
      `Backed up 1 file(s) to ${backupDir()} before removing.`,
    );
    expect(
      Object.keys(records().files).filter((k) => k.startsWith(A11Y_DIR)),
    ).toEqual([]);
    expect(notes('ORPHANED').join('\n')).not.toContain(A11Y_DIR);
    expect(config().capabilities).toEqual(SECURITY_ONLY);
  });

  it('under --force composes its wording with the deletion count, and makes ONE backup for overwrites and removals', async () => {
    await droppedA11y();
    write(CONSTITUTION, 'mine\n');
    interactive({ confirm: [true] });
    expect(await run(() => runUpdate({ force: true }))).toBeNull();
    expect(clack.confirm).toHaveBeenCalledWith({
      message:
        'Apply this update and overwrite your changes? It deletes 1 capability directory.',
      initialValue: false,
    });
    expect(backupFiles().sort()).toEqual([A11Y_NOTES, CONSTITUTION].sort());
    expect(logged('info')).toContain(
      `Backed up 2 file(s) to ${backupDir()} before overwriting and removing.`,
    );
  });

  it.each<[string, () => void]>([
    ['an edited recorded file', () => write(A11Y, 'MY EDIT\n')],
    [
      'every file when the records store is not usable',
      () => rmSync(at('pharn.records.json')),
    ],
  ])('backs up %s too', async (_l, arrange) => {
    await droppedA11y();
    arrange();
    expect(await updateYes()).toBeNull();
    expect(backupFiles()).toEqual(expect.arrayContaining([A11Y, A11Y_NOTES]));
    expect(exists(A11Y_DIR)).toBe(false);
  });

  it('an already-gone directory keeps the default Yes, backs up nothing, and is named "already gone"', async () => {
    await droppedA11y(false);
    rmSync(at(A11Y_DIR), { recursive: true });
    interactive({ confirm: [true] });
    expect(await run(() => runUpdate())).toBeNull();
    expect(clack.confirm).toHaveBeenCalledWith({
      message: 'Apply this update?',
      initialValue: true,
    });
    expect(exists('pharn/.backup')).toBe(false);
    expect(notes('CAPABILITIES').at(-1)).toContain(
      'griller:a11y — already gone',
    );
  });

  it('--yes prints the same preview and deletes nothing else: a stray file in a kept capability and settings.json stay', async () => {
    await droppedA11y();
    const stray = 'pharn/pharn-pipeline/grillers/security/MINE.md';
    write(stray, 'kept capability, my file\n');
    expect(await updateYes()).toBeNull();
    expect(notes('CAPABILITIES')[0]).toContain(
      'griller:a11y — directory would be deleted',
    );
    expect(exists(A11Y_DIR)).toBe(false);
    expect(read(stray)).toBe('kept capability, my file\n');
    expect(read(SETTINGS)).toBe(HOOK_SETTINGS);
  });

  it.each<[string, () => string]>([
    [
      'the backup cannot be made (a symlinked pharn/.backup)',
      () => {
        const outside = join(proj(), '..', 'outside-backup');
        mkdirSync(outside);
        symlinkSync(outside, at('pharn/.backup'));
        return '';
      },
    ],
    [
      'the directory sits behind a symlinked component (refused before the confirm)',
      () => {
        const outside = join(proj(), '..', 'shared-grillers');
        mkdirSync(outside);
        for (const name of ['security', 'a11y'])
          writeFileSync(join(outside, `${name}.keep`), 'not this project');
        rmSync(at('pharn/pharn-pipeline/grillers'), { recursive: true });
        symlinkSync(outside, at('pharn/pharn-pipeline/grillers'));
        return 'pharn/pharn-pipeline/grillers is a symbolic link';
      },
    ],
  ])(
    'refuses the whole run when %s: exit 1, nothing deleted or written',
    async (_l, arrange) => {
      await droppedA11y();
      const says = arrange();
      const before = snapshot();
      interactive();
      expect(await run(() => runUpdate())).toBe(1);
      if (says) {
        expect(printed()).toContain(says);
        expect(printed()).not.toContain(DEBUG_HINT);
        expect(clack.confirm).not.toHaveBeenCalled();
      }
      expect(snapshot()).toEqual(before);
    },
  );

  it.skipIf(asRoot)(
    'a delete that fails stops the run before any write, naming the backup',
    async () => {
      await droppedA11y();
      chmodSync(at(A11Y_DIR), 0o555);
      try {
        expect(await updateYes()).toBe(1);
      } finally {
        chmodSync(at(A11Y_DIR), 0o755);
      }
      expect(read(CONSTITUTION)).toBe('constitution 1.0.0\n');
      expect(config().skillsVersion).toBe('1.0.0');
      expect(config().updatedAt).toBeUndefined();
      const said = printed();
      expect(said).toContain('stopped part-way');
      expect(said).toContain('removed');
      expect(said).toContain(backupDir());
    },
  );

  it('a directory that comes back while the confirm is open is not deleted (the plan did not name it)', async () => {
    await droppedA11y(false);
    rmSync(at(A11Y_DIR), { recursive: true });
    setTTY(true, true);
    vi.mocked(clack.confirm).mockImplementationOnce(async () => {
      write(A11Y_NOTES, 'my notes\n'); // the directory comes back meanwhile
      return true;
    });
    expect(await run(() => runUpdate())).toBeNull();
    // What was confirmed is what is applied: the drop is recorded, and the
    // directory the plan saw absent is left alone with the notes in it.
    expect(read(A11Y_NOTES)).toBe('my notes\n');
    expect(config().capabilities.map((c) => c.name)).not.toContain('a11y');
    expect(exists('pharn/.backup')).toBe(false);
    expect(printed()).not.toContain(DEBUG_HINT);
  });

  it('a file added to a dropped directory while the confirm is open is backed up before the delete', async () => {
    await droppedA11y(false);
    setTTY(true, true);
    vi.mocked(clack.confirm).mockImplementationOnce(async () => {
      write(A11Y_NOTES, 'written while the confirm was open\n');
      return true;
    });
    expect(await run(() => runUpdate())).toBeNull();
    expect(exists(A11Y_DIR)).toBe(false);
    expect(backupFiles()).toContain(A11Y_NOTES);
    const dir = `pharn/.backup/${readdirSync(at('pharn/.backup'))[0]!}`;
    expect(read(`${dir}/${A11Y_NOTES}`)).toBe(
      'written while the confirm was open\n',
    );
  });

  it('adds a newly selected capability, named before the confirm (default Yes), even when a skip withholds the bump', async () => {
    await installed();
    editConfig((c) => {
      c.capabilities = [];
    });
    write(CONSTITUTION, 'mine\n');
    serveTip(SHA_V2, '2.0.0');
    interactive({ confirm: [true] });
    expect(await run(() => runUpdate())).toBeNull();
    expect(notes('CAPABILITIES')[0]).toContain('ADDED');
    expect(notes('CAPABILITIES')[0]).toContain('griller:security');
    expect(noteOrder('CAPABILITIES')).toBeLessThan(
      vi.mocked(clack.confirm).mock.invocationCallOrder[0]!,
    );
    expect(clack.confirm).toHaveBeenCalledWith({
      message: 'Apply this update?',
      initialValue: true,
    });
    expect(config()).toMatchObject({
      capabilities: SECURITY_ONLY,
      skillsVersion: '1.0.0',
      pendingSkillsVersion: '2.0.0',
    });
  });

  it('keeps a legacy (source-less) manual entry as manual, upgrades its files, and a second run reports no change', async () => {
    await installed();
    expect(await run(() => runAdd('n-plus-one'))).toBeNull();
    editConfig((c) => {
      delete c.capabilities.find((x) => x.name === 'n-plus-one')!.source;
    });
    serveTip(SHA_V2, '2.0.0');
    upstream.tree[N_PLUS_ONE] = capability(
      'lens',
      '["backend"]',
      'n-plus-one 2.0.0',
    );
    expect(await updateYes()).toBeNull();
    const caps = [
      ...SECURITY_ONLY,
      { name: 'n-plus-one', role: 'lens', source: 'manual' },
    ];
    expect(config().capabilities).toEqual(caps);
    expect(read(N_PLUS_ONE)).toContain('n-plus-one 2.0.0');
    expect(records().files[N_PLUS_ONE]).toBe(sha256(N_PLUS_ONE));
    expect(notes('CAPABILITIES').at(-1)).toContain('lens:n-plus-one');
    expect(notes('CAPABILITIES').at(-1)).toContain('KEPT');

    clearOutput();
    expect(await updateYes({ force: true })).toBeNull();
    expect(config().capabilities).toEqual(caps);
    expect(notes('CAPABILITIES')).toEqual([]);
  });

  it.each<[string, () => void, (skipped: string) => void]>([
    [
      'an edited file is a MODIFIED skip',
      () => write(N_PLUS_ONE, 'MY LOCAL EDIT\n'),
      (skipped) => {
        expect(read(N_PLUS_ONE)).toBe('MY LOCAL EDIT\n');
        expect(skipped).toContain('MODIFIED');
        expect(skipped).toContain(N_PLUS_ONE);
      },
    ],
    [
      'a deleted file is restored',
      () => rmSync(at(N_PLUS_ONE)),
      () => expect(read(N_PLUS_ONE)).toContain('n-plus-one 2.0.0'),
    ],
  ])('a manual capability: %s', async (_l, arrange, check) => {
    await installed();
    expect(await run(() => runAdd('n-plus-one'))).toBeNull();
    arrange();
    serveTip(SHA_V2, '2.0.0');
    upstream.tree[N_PLUS_ONE] = capability(
      'lens',
      '["backend"]',
      'n-plus-one 2.0.0',
    );
    expect(await updateYes()).toBeNull();
    check(notes('SKIPPED').join('\n'));
  });

  it('drops a manual entry upstream no longer ships: named, its directory deleted after backing up what pharn cannot prove', async () => {
    await installed();
    expect(await run(() => runAdd('n-plus-one'))).toBeNull();
    const NOTES_FILE = 'pharn/pharn-review/n-plus-one/NOTES.md';
    write(NOTES_FILE, 'my bytes\n');
    serveTip(SHA_V2, '2.0.0');
    delete upstream.tree[N_PLUS_ONE];
    upstream.tree['pharn/pharn-review/other/other.md'] = capability(
      'lens',
      '["backend"]',
      'another lens',
    );
    expect(await updateYes()).toBeNull();
    expect(config().capabilities).toEqual(SECURITY_ONLY);
    const report = notes('CAPABILITIES').at(-1)!;
    expect(report).toContain('lens:n-plus-one');
    expect(report).toContain('no longer exists upstream');
    expect(exists('pharn/pharn-review/n-plus-one')).toBe(false);
    expect(backupFiles()).toEqual([NOTES_FILE]);
  });
});

describe('a capability upstream ships but this pharn cannot parse (frozen)', () => {
  const FROZEN_DIR = 'pharn/pharn-pipeline/grillers/backwards-compat';
  const FROZEN_FILE = `${FROZEN_DIR}/backwards-compat.md`;
  const FROZEN_EXTRA = `${FROZEN_DIR}/evals/cases/one.md`;
  const PARSED = capability(
    'griller',
    '["universal"]',
    'parsed upstream content',
  );

  /** Installed and recorded at 1.0.0; upstream at 2.0.0 ships it unparseable. */
  async function frozen(): Promise<void> {
    await installed();
    write(FROZEN_FILE, 'installed at v1\n');
    editConfig((c) => {
      c.capabilities.push({
        name: 'backwards-compat',
        role: 'griller',
        source: 'auto',
      });
    });
    editRecords((r) => {
      r.files[FROZEN_FILE] = sha256(FROZEN_FILE);
    });
    serveTip(SHA_V2, '2.0.0');
    upstream.tree[FROZEN_FILE] = capability(
      'auditor',
      '["universal"]',
      'WIP upstream content',
    );
    upstream.tree[FROZEN_EXTRA] = 'WIP eval case\n';
    // A second unparseable capability this project never had.
    upstream.tree['pharn/pharn-review/never-installed/never-installed.md'] =
      capability('lens', '["nowhere"]', 'never');
  }

  it('writes nothing under it, keeps its entry and records, reports KEPT, bumps the version, lists only it — and re-checks it at the same version', async () => {
    await frozen();
    const recorded = records().files[FROZEN_FILE];
    expect(await updateYes()).toBeNull();
    expect(read(FROZEN_FILE)).toBe('installed at v1\n');
    expect(exists(FROZEN_EXTRA)).toBe(false);
    expect(records().files[FROZEN_FILE]).toBe(recorded);
    expect(config().capabilities).toContainEqual({
      name: 'backwards-compat',
      role: 'griller',
      source: 'auto',
    });
    const report = notes('CAPABILITIES').at(-1)!;
    expect(report).toContain('griller:backwards-compat');
    expect(report).toContain('KEPT');
    expect(report).not.toContain('REMOVED');
    const warned = logged('warn').join('\n');
    expect(warned).toContain('backwards-compat');
    expect(warned).toContain('invalid role');
    expect(warned).not.toContain('still recorded as skills');
    expect(config()).toMatchObject({
      skillsVersion: '2.0.0',
      commit: SHA_V2,
      frozenCapabilities: ['griller:backwards-compat'],
    });

    fetchStub.mockClear();
    clearOutput();
    expect(await updateYes()).toBeNull();
    expect(downloaded()).toBe(true);
    expect(lastOutro()).not.toContain('Already up to date');
    expect(notes('CAPABILITIES').at(-1)).toContain('KEPT');
    expect(config().frozenCapabilities).toEqual(['griller:backwards-compat']);
  });

  it('once it parses again its files are refreshed and the list clears; while its own file is skipped it stays listed and re-checked', async () => {
    await frozen();
    expect(await updateYes()).toBeNull();
    upstream.tree[FROZEN_FILE] = PARSED;
    write(FROZEN_FILE, 'my local edit\n');

    expect(await updateYes()).toBeNull();
    expect(read(FROZEN_FILE)).toBe('my local edit\n');
    expect(config().frozenCapabilities).toEqual(['griller:backwards-compat']);
    expect(config().skillsVersion).toBe('2.0.0');
    expect(config().pendingSkillsVersion).toBeUndefined();

    fetchStub.mockClear();
    expect(await updateYes()).toBeNull();
    expect(downloaded()).toBe(true);
    expect(config().frozenCapabilities).toEqual(['griller:backwards-compat']);

    write(FROZEN_FILE, 'installed at v1\n');
    expect(await updateYes()).toBeNull();
    expect(read(FROZEN_FILE)).toBe(PARSED);
    expect(config().frozenCapabilities).toBeUndefined();
  });

  it.each<[string, () => void, (c: Config) => void]>([
    [
      'a skip under another path',
      () => {
        upstream.tree[FROZEN_FILE] = PARSED;
        write(CONSTITUTION, 'my edit\n');
      },
      () => expect(read(FROZEN_FILE)).toBe(PARSED),
    ],
    [
      'the merge dropping the entry',
      () => {
        upstream.tree[FROZEN_FILE] = capability(
          'griller',
          '["backend"]',
          'parsed',
        );
        write(FROZEN_FILE, 'my local edit\n');
      },
      (c) => expect(c.capabilities.map((x) => x.name)).toEqual(['security']),
    ],
  ])(
    'a formerly frozen capability leaves the list on %s',
    async (_l, arrange, check) => {
      await frozen();
      expect(await updateYes()).toBeNull();
      arrange();
      expect(await updateYes()).toBeNull();
      check(config());
      expect(config().frozenCapabilities).toBeUndefined();
    },
  );
});

describe('orphaned files (upstream stopped shipping them)', () => {
  it('names an unchanged orphan, keeps it and its record, bumps the version, lists it until it is gone, then one run drops its record', async () => {
    await bumped((t) => {
      delete t[PLAN_COMMAND];
    });
    const recorded = records().files[PLAN_COMMAND];
    expect(await updateYes()).toBeNull();
    expect(read(PLAN_COMMAND)).toBe('plan\n');
    expect(records().files[PLAN_COMMAND]).toBe(recorded);
    const [orphaned] = notes('ORPHANED');
    expect(orphaned).toContain('UNCHANGED');
    expect(orphaned).toContain(PLAN_COMMAND);
    expect(orphaned).toContain('git rm');
    expect(notes('SKIPPED')).toEqual([]);
    expect(config().skillsVersion).toBe('2.0.0');

    serveTip('4'.repeat(40), '3.0.0');
    delete upstream.tree[PLAN_COMMAND];
    clearOutput();
    expect(await updateYes()).toBeNull();
    expect(notes('ORPHANED')[0]).toContain(PLAN_COMMAND);
    expect(records().files[PLAN_COMMAND]).toBeDefined();

    // Deleted at the current version: one run drops the record, restores nothing.
    rmSync(at(PLAN_COMMAND));
    clearOutput();
    expect(await updateYes()).toBeNull();
    expect(printed()).toContain(`${PLAN_COMMAND} is missing`);
    expect(printed()).toContain('if upstream still ships it');
    expect(exists(PLAN_COMMAND)).toBe(false);
    expect(records().files[PLAN_COMMAND]).toBeUndefined();
    expect(notes('ORPHANED')).toEqual([]);
    clearOutput();
    expect(await updateYes()).toBeNull();
    expect(lastOutro()).toBe(upToDate('3.0.0'));
  });

  it('names an edited orphan EDITED, and a path upstream ships again upgrades from the carried record', async () => {
    await bumped((t) => {
      delete t[PLAN_COMMAND];
    });
    write(PLAN_COMMAND, 'MY EDIT\n');
    expect(await updateYes()).toBeNull();
    const [orphaned] = notes('ORPHANED');
    expect(orphaned).toContain('EDITED');
    expect(orphaned).toContain('review before deleting');
    expect(orphaned).not.toContain('UNCHANGED');
    expect(read(PLAN_COMMAND)).toBe('MY EDIT\n');

    write(PLAN_COMMAND, 'plan\n');
    serveTip('4'.repeat(40), '3.0.0');
    upstream.tree[PLAN_COMMAND] = 'plan v3\n';
    expect(await updateYes()).toBeNull();
    expect(read(PLAN_COMMAND)).toBe('plan v3\n');
    expect(config().skillsVersion).toBe('3.0.0');
  });
});

describe('the models block', () => {
  const EDITED = {
    stages: {
      default: { model: 'haiku', effort: 'low' },
      review: { model: 'fable', effort: 'max' },
    },
  };
  const REJECTED = {
    stages: { default: UPSTREAM_MODELS.stages.default, deploy: {} },
  };

  interface Row {
    name: string;
    // `undefined`: no block in the config.
    mine: unknown;
    // `undefined`: no record; `'init'`: the record init wrote is kept.
    recorded?: unknown;
    // `null`: pharn-oss ships no block.
    theirs?: unknown;
    noStore?: boolean;
    force?: boolean;
    after: unknown;
    record?: 'theirs' | 'none' | 'recorded';
    says: string[];
  }

  it.each<Row>([
    {
      name: 'the default an earlier pharn wrote is replaced with pharn-oss’s',
      mine: OLD_DEFAULT,
      after: UPSTREAM_MODELS,
      record: 'theirs',
      says: [
        "Replaced the models block an earlier pharn wrote with pharn-oss's.",
        'check-model-config.mjs agreement',
      ],
    },
    {
      name: 'an edited old-format block is converted and kept, unrecorded',
      mine: {
        default: { model: 'haiku-4-5', effort: 'low' },
        stages: { review: { model: 'fable-5', effort: 'max' } },
      },
      after: EDITED,
      record: 'none',
      says: [
        'Kept your models block — pharn has no record of writing it.',
        'Converted your models block from the format pharn wrote before 0.7.0,',
        'stage "review" model "fable-5" → "fable"',
        "--force replaces it with pharn-oss's",
      ],
    },
    {
      name: 'what cannot be converted is named and left as it is',
      mine: {
        default: { model: 'gpt-4', effort: 'high' },
        stages: { plan: { model: 'opus-4-8', effort: 'max' } },
      },
      after: {
        stages: {
          default: { model: 'gpt-4', effort: 'high' },
          plan: { model: 'opus', effort: 'max' },
        },
      },
      says: [
        "pharn-oss's rules still reject your models block — left as is,",
        'stage "default" model "gpt-4"',
      ],
    },
    {
      name: 'a missing block is restored with pharn-oss’s',
      mine: undefined,
      after: UPSTREAM_MODELS,
      record: 'theirs',
      says: ["Your config had no models block — wrote pharn-oss's."],
    },
    {
      name: 'a block still at its recorded hash moves to the current one',
      mine: { stages: { default: { model: 'opus', effort: 'low' } } },
      recorded: { stages: { default: { model: 'opus', effort: 'low' } } },
      after: UPSTREAM_MODELS,
      record: 'theirs',
      says: ["Moved your models block to pharn-oss's current one: you had"],
    },
    {
      name: 'a block the user changed is kept, its record carried',
      mine: EDITED,
      recorded: { stages: {} },
      after: EDITED,
      record: 'recorded',
      says: ['Kept your models block — you changed it since pharn wrote it.'],
    },
    {
      name: 'a block already pharn-oss’s says nothing',
      mine: UPSTREAM_MODELS,
      recorded: 'init',
      after: UPSTREAM_MODELS,
      record: 'theirs',
      says: [],
    },
    {
      name: 'with no usable records store, a block pharn cannot prove is kept',
      mine: EDITED,
      noStore: true,
      after: EDITED,
      says: [
        'Kept your models block — no usable pharn.records.json to check it.',
      ],
    },
    {
      name: 'pharn-oss shipping none, an old-format block is still converted',
      mine: OLD_DEFAULT,
      theirs: null,
      after: OLD_DEFAULT_CONVERTED,
      says: [
        'pharn-oss ships no models block, so yours is kept.',
        'Converted your models block',
      ],
    },
    {
      name: 'pharn-oss shipping none and yours needing nothing says nothing',
      mine: UPSTREAM_MODELS,
      recorded: 'init',
      theirs: null,
      after: UPSTREAM_MODELS,
      says: [],
    },
    {
      name: 'a block pharn-oss’s rules reject is not applied, and why is named',
      mine: OLD_DEFAULT,
      theirs: REJECTED,
      after: OLD_DEFAULT_CONVERTED,
      says: [
        "pharn-oss's models block was not applied; this pharn rejects it:",
        'stage "deploy" is not a product stage',
        'upgrade pharn',
      ],
    },
  ])('$name', async (row) => {
    await installed();
    editConfig((c) => {
      if (row.mine === undefined) delete c.models;
      else c.models = row.mine;
    });
    if (row.noStore) rmSync(at('pharn.records.json'));
    else if (row.recorded !== 'init')
      editRecords((r) => {
        if (row.recorded === undefined) delete r.files[MODELS_RECORD_KEY];
        else r.files[MODELS_RECORD_KEY] = modelsRecordHash(row.recorded);
      });
    serveTip(SHA_V2, '2.0.0');
    if (row.theirs === null) delete upstream.tree['pharn.config.json'];
    else if (row.theirs !== undefined)
      upstream.tree['pharn.config.json'] = JSON.stringify({
        models: row.theirs,
      });

    expect(await updateYes({ force: row.force })).toBeNull();

    expect(config().models).toEqual(row.after);
    const note = notes('MODELS').join('\n');
    if (row.says.length === 0) expect(notes('MODELS')).toEqual([]);
    for (const s of row.says) expect(note).toContain(s);
    // The note's own lines (not the indented details) fit an 80-column box.
    for (const line of note.split('\n'))
      if (!line.startsWith('  ')) expect(line.length).toBeLessThanOrEqual(70);
    if (row.record === 'theirs')
      expect(records().files[MODELS_RECORD_KEY]).toBe(
        modelsRecordHash(UPSTREAM_MODELS),
      );
    if (row.record === 'none')
      expect(records().files[MODELS_RECORD_KEY]).toBeUndefined();
    if (row.record === 'recorded')
      expect(records().files[MODELS_RECORD_KEY]).toBe(
        modelsRecordHash(row.recorded),
      );
    // The block is configuration, not bytes of a version: it withholds nothing.
    if (!row.noStore) expect(config().skillsVersion).toBe('2.0.0');
  });

  it('a kept block keeps its place in the file; --force replaces it after backing up the config', async () => {
    await installed();
    editConfig((c) => {
      c.models = EDITED;
    });
    editRecords((r) => {
      r.files[MODELS_RECORD_KEY] = modelsRecordHash({ stages: {} });
    });
    // Its place among the keys pharn always writes (`ref` and `updatedAt` are
    // re-added by the rewrite, so they are left out of the comparison).
    const keys = (): string[] =>
      Object.keys(JSON.parse(read('pharn.config.json'))).filter(
        (k) => k !== 'ref' && k !== 'updatedAt',
      );
    const at0 = keys().indexOf('models');
    serveTip(SHA_V2, '2.0.0');
    expect(await updateYes()).toBeNull();
    expect(keys().indexOf('models')).toBe(at0);

    serveTip('4'.repeat(40), '3.0.0');
    clearOutput();
    expect(await updateYes({ force: true })).toBeNull();
    expect(config().models).toEqual(UPSTREAM_MODELS);
    expect(
      JSON.parse(
        read(
          `pharn/.backup/${readdirSync(at('pharn/.backup'))[0]!}/pharn.config.json`,
        ),
      ).models,
    ).toEqual(EDITED);
    const note = notes('MODELS').join('\n');
    expect(note).toContain(
      "Replaced your models block with pharn-oss's (--force).",
    );
    expect(note).toContain('pharn/.backup/');
  });

  it('closes the same-version gate once it wrote a block, even one in a convertible shape', async () => {
    const shaped = {
      default: { model: 'sonnet', effort: 'high' },
      stages: UPSTREAM_MODELS.stages,
    };
    upstream.tree['pharn.config.json'] = JSON.stringify({ models: shaped });
    await installed();
    editConfig((c) => {
      c.models = OLD_DEFAULT;
    });
    expect(await updateYes()).toBeNull();
    expect(config().models).toEqual(shaped);
    fetchStub.mockClear();
    expect(await updateYes()).toBeNull();
    expect(downloaded()).toBe(false);
    expect(lastOutro()).toBe(upToDate());
  });

  it('replaces an old default it had to convert once pharn-oss’s block is usable again', async () => {
    await installed();
    editConfig((c) => {
      c.models = OLD_DEFAULT;
    });
    serveTip(SHA_V2, '2.0.0');
    upstream.tree['pharn.config.json'] = JSON.stringify({ models: REJECTED });
    expect(await updateYes()).toBeNull();
    expect(config().models).toEqual(OLD_DEFAULT_CONVERTED);

    serveTip('4'.repeat(40), '3.0.0');
    clearOutput();
    expect(await updateYes()).toBeNull();
    expect(config().models).toEqual(UPSTREAM_MODELS);
    expect(notes('MODELS').join('\n')).toContain(
      "Moved your models block to pharn-oss's current one: you had",
    );
  });
});

describe('a run that changes nothing asks nothing and writes nothing', () => {
  /** A bump withheld by a kept edit; then the config is reshaped by `edit`. */
  async function afterWithheld(
    tree: (v: string) => Tree,
    init: Parameters<typeof installFresh>[0],
    edit: (c: Config) => void,
  ): Promise<string> {
    serveTip(SHA_V1, '1.0.0', { tree: tree('1.0.0') });
    await installed(init);
    const doc = config().layout === 'pharn' ? CONSTITUTION : 'CONSTITUTION.md';
    write(doc, 'mine\n');
    serveTip(SHA_V2, '2.0.0', { tree: tree('2.0.0') });
    expect(await updateYes()).toBeNull();
    expect(config().pendingSkillsVersion).toBe('2.0.0');
    editConfig(edit);
    return doc;
  }

  it.each<
    [
      string,
      (v: string) => Tree,
      Parameters<typeof installFresh>[0],
      (c: Config) => void,
    ]
  >([
    [
      'a config with no layout key over a flat clone',
      flatTree,
      {},
      (c) => {
        delete (c as Partial<Config>).layout;
      },
    ],
    [
      'a config with no commit key',
      upstreamTree,
      {},
      (c) => {
        // As a config of an install that never knew its commit: the store
        // beside it is stamped `commit: null` too (CORE-160).
        delete (c as Partial<Config>).commit;
        editRecords((r) => {
          r.commit = null;
        });
      },
    ],
    [
      'a ref other than "latest" on main (dropped at load)',
      upstreamTree7,
      { ref: 'main' },
      (c) => {
        c.ref = 'bogus';
      },
    ],
    [
      'a seam block in the user’s own key order',
      upstreamTree7,
      {},
      (c) => {
        c.seam = {
          haltOnUnknown: true,
          resolutionOrder: ['pinned-docs', 'ask'],
        };
      },
    ],
  ])('%s', async (_l, tree, init, edit) => {
    const doc = await afterWithheld(tree, init, edit);
    const cfg = read('pharn.config.json');
    const rec = read('pharn.records.json');
    const before = snapshot();
    interactive();
    clearOutput();
    expect(await run(() => runUpdate())).toBeNull();
    expect(clack.confirm).not.toHaveBeenCalled();
    expect(read('pharn.config.json')).toBe(cfg);
    expect(read('pharn.records.json')).toBe(rec);
    expect(snapshot()).toEqual(before);
    expect(notes('SKIPPED').join('\n')).toContain(doc);
    expect(lastOutro()).toContain('Nothing to change.');
  });

  it('a file put back with upstream bytes while the confirm is open is not an edit: the confirmed plan applies', async () => {
    await afterWithheld(upstreamTree7, {}, () => undefined);
    const cfg = read('pharn.config.json');
    const hook = read(HOOK);
    const hookRecord = records().files[HOOK];
    rmSync(at(HOOK));
    setTTY(true, true);
    vi.mocked(clack.confirm).mockImplementationOnce(async () => {
      writeFileSync(at(HOOK), hook); // the work is done while the prompt is open
      return true;
    });
    expect(await run(() => runUpdate())).toBeNull();
    expect(clack.confirm).toHaveBeenCalledTimes(1);
    // Byte-identical to what the plan would write, so nothing is lost and the
    // run is not refused; the record still names those bytes.
    expect(read(HOOK)).toBe(hook);
    expect(records().files[HOOK]).toBe(hookRecord);
    expect(records().files[HOOK]).toBe(sha256(HOOK));
    expect(config().updatedAt).not.toBe(JSON.parse(cfg).updatedAt);
    expect(printed()).not.toContain('changed while `pharn update`');
  });
});

describe('--force', () => {
  it('backs up an edit before overwriting it, names the backup once with no spinner running, and advances the version', async () => {
    await bumped();
    write(CONSTITUTION, 'mine\n');
    expect(await updateYes({ force: true })).toBeNull();
    expect(backupFiles()).toEqual([CONSTITUTION]);
    const dir = `pharn/.backup/${readdirSync(at('pharn/.backup'))[0]!}`;
    expect(read(`${dir}/${CONSTITUTION}`)).toBe('mine\n');
    expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');
    expect(records().files[CONSTITUTION]).toBe(sha256(CONSTITUTION));
    expect(config().skillsVersion).toBe('2.0.0');
    // Named once, on stdout; init's .gitignore already covers the backups.
    expect(streamsOf('info', 'Backed up')).toEqual([process.stdout]);
    expect(logged('info').join('\n')).toContain(
      `Backed up 1 file(s) to ${dir}`,
    );
    expect(logged('info').join('\n')).not.toContain('not gitignored');
    // The last spinner event before the notice STOPPED a spinner, and the
    // writes ran under one started after it.
    const info = vi.mocked(clack.log.info).mock;
    const noticeAt =
      info.invocationCallOrder[
        info.calls.findIndex(([m]) => String(m).startsWith('Backed up'))
      ]!;
    const events = spinnerEvents();
    const beforeNotice = events.filter(
      (e) => Number(e.split(' ')[0]) < noticeAt,
    );
    const afterNotice = events.filter(
      (e) => Number(e.split(' ')[0]) > noticeAt,
    );
    expect(beforeNotice.at(-1)).toMatch(/^\d+ stop: /);
    expect(beforeNotice.at(-1)).not.toContain('Backed up');
    expect(afterNotice.some((e) => / start: /.test(e))).toBe(true);
  });

  it.each<[string, () => void, boolean, string | null]>([
    [
      'it creates .gitignore when there is none',
      () => rmSync(at('.gitignore')),
      false,
      "Created .gitignore with pharn/.run/, pharn/.backup/ (PHARN's run state and update backups).",
    ],
    [
      'it advises gitignoring the backups when .gitignore cannot be written',
      () => {
        rmSync(at('.gitignore'));
        mkdirSync(at('.gitignore'));
      },
      true,
      null,
    ],
  ])('around the backup notice, %s', async (_l, arrange, advised, created) => {
    await bumped();
    write(CONSTITUTION, 'mine\n');
    arrange();
    expect(await updateYes({ force: true })).toBeNull();
    const info = logged('info').join('\n');
    expect(info).toContain('Backed up 1 file(s)');
    expect(info.includes('not gitignored')).toBe(advised);
    if (created) {
      expect(info).toContain(created);
      expect(read('.gitignore')).toBe(PHARN_GITIGNORE_BLOCK);
    }
  });

  it('bypasses the same-version early return, and makes no backup when nothing needs one', async () => {
    await installed();
    write(CONSTITUTION, 'mine\n');
    expect(await updateYes({ force: true })).toBeNull();
    expect(read(CONSTITUTION)).toBe('constitution 1.0.0\n');
    expect(backupFiles()).toEqual([CONSTITUTION]);
    expect(await updateYes({ force: true })).toBeNull();
    expect(readdirSync(at('pharn/.backup'))).toHaveLength(1);
  });

  it('aborts without touching any original when the backup cannot be written', async () => {
    await bumped();
    write(CONSTITUTION, 'mine\n');
    write('pharn/.backup', 'not a directory');
    expect(await updateYes({ force: true })).toBe(1);
    expect(read(CONSTITUTION)).toBe('mine\n');
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(printed()).not.toContain('Backed up');
  });

  it.skipIf(asRoot)(
    'a write that fails after the backup names it on stdout at creation and on stderr after the abort, and the hint once',
    async () => {
      await bumped((t) => {
        t[HOOK] = 'module.exports = { v: 2 };\n';
      });
      write(CONSTITUTION, 'mine\n');
      write(HOOK, 'my hook\n');
      rmSync(at('.gitignore'));
      mkdirSync(at('.gitignore'));
      chmodSync(at('.claude/hooks'), 0o555);
      try {
        expect(await updateYes({ force: true })).toBe(1);
      } finally {
        chmodSync(at('.claude/hooks'), 0o755);
      }
      const dir = `pharn/.backup/${readdirSync(at('pharn/.backup'))[0]!}`;
      expect(read(`${dir}/${HOOK}`)).toBe('my hook\n');
      const said = printed();
      expect(said).toContain('Backed up 2 file(s)');
      expect(said).toContain('stopped part-way');
      expect(streamsOf('info', dir)).toEqual([process.stdout, process.stderr]);
      expect(
        logged('info').filter((m) => m.includes('not gitignored')),
      ).toHaveLength(1);
      expect(
        (
          vi.mocked(clack.log.warn).mock.calls.at(-1)?.[1] as {
            output?: unknown;
          }
        )?.output,
      ).toBe(process.stderr);
    },
  );

  it('a failed CONFIG write still names the backup, and leaves records that describe the disk', async () => {
    await bumped();
    write(CONSTITUTION, 'mine\n');
    fsHooks.rename = (_from, to) => {
      if (to.endsWith('pharn.config.json'))
        throw Object.assign(new Error('EACCES: permission denied'), {
          code: 'EACCES',
        });
    };
    expect(await updateYes({ force: true })).toBe(1);
    expect(backupFiles()).toEqual([CONSTITUTION]);
    const dir = `pharn/.backup/${readdirSync(at('pharn/.backup'))[0]!}`;
    expect(printed()).toContain(dir);
    expect(
      streamsOf('info', 'Backed up').filter((s) => s === process.stdout),
    ).toHaveLength(1);
    // Records are written BEFORE the config, so they still describe the disk.
    expect(records().files[CONSTITUTION]).toBe(sha256(CONSTITUTION));
    expect(config().skillsVersion).toBe('1.0.0');
  });
});

describe('a run that fails part-way', () => {
  it('without --force names no backup, and its records still describe what landed', async () => {
    await bumped();
    fsHooks.rename = (_from, to) => {
      if (to.endsWith('pharn.config.json'))
        throw Object.assign(new Error('EACCES: permission denied'), {
          code: 'EACCES',
        });
    };
    expect(await updateYes()).toBe(1);
    expect(exists('pharn/.backup')).toBe(false);
    expect(printed()).not.toContain('pharn/.backup');
    expect(printed()).not.toContain('stopped part-way');
    expect(read(SECURITY)).toContain('security 2.0.0');
    expect(records().files[SECURITY]).toBe(sha256(SECURITY));
  });

  it.skipIf(asRoot)(
    'records the files it already wrote when a write throws mid-loop; the config is not rewritten',
    async () => {
      await bumped((t) => {
        t[HOOK] = 'module.exports = { v: 2 };\n';
      });
      const hookRecord = records().files[HOOK];
      chmodSync(at('.claude/hooks'), 0o555);
      try {
        expect(await updateYes()).toBe(1);
      } finally {
        chmodSync(at('.claude/hooks'), 0o755);
      }
      expect(read(SECURITY)).toContain('security 2.0.0');
      expect(records().files[SECURITY]).toBe(sha256(SECURITY));
      expect(read(HOOK)).toBe('module.exports = {};\n');
      expect(records().files[HOOK]).toBe(hookRecord);
      expect(records().skillsVersion).toBe('1.0.0');
      expect(config().skillsVersion).toBe('1.0.0');
      expect(config().updatedAt).toBeUndefined();
    },
  );

  it.skipIf(asRoot)(
    'never mints a records store from a partial failure when there was none',
    async () => {
      await bumped();
      rmSync(at('pharn.records.json'));
      const dir = at('pharn/pharn-pipeline/grillers/security');
      rmSync(dir, { recursive: true });
      mkdirSync(dir);
      chmodSync(dir, 0o555);
      try {
        expect(await updateYes()).toBe(1);
      } finally {
        chmodSync(dir, 0o755);
      }
      expect(exists('pharn.records.json')).toBe(false);
    },
  );
});

describe('a layout move', () => {
  it('flat → pharn/: records the clone’s layout, installs pharn-core, and warns about the abandoned flat tree', async () => {
    serveTip(SHA_V1, '1.0.0', { tree: flatTree('1.0.0') });
    await installed();
    expect(config().layout).toBe('flat');
    serveTip(SHA_V2, '2.0.0');
    expect(await updateYes()).toBeNull();
    expect(config().layout).toBe('pharn');
    expect(read(SECURITY)).toContain('security 2.0.0');
    const core = 'pharn/pharn-core/seam-resolver/SKILL.md';
    expect(read(core)).toBe('seam resolver\n');
    expect(records().files[core]).toBe(sha256(core));
    expect(logged('warn').join('\n')).toContain('pharn/ layout');
    expect(read('pharn-pipeline/grillers/security/security.md')).toContain(
      'security 1.0.0',
    );
  });

  it('pharn/ → flat: records flat and warns about the abandoned pharn/ tree', async () => {
    await installed();
    serveTip(SHA_V2, '2.0.0', { tree: flatTree('2.0.0') });
    expect(await updateYes()).toBeNull();
    expect(config().layout).toBe('flat');
    const warned = logged('warn').join('\n');
    expect(warned).toContain('pharn/ tree');
    expect(warned).not.toContain('moved to the pharn/ layout');
    expect(read('pharn/pharn-contracts/finding-shape.md')).toBe(
      'finding shape\n',
    );
  });
});
