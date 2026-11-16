import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it, vi, type Mock } from 'vitest';
import * as clack from '@clack/prompts';
import { restoreTTY, setTTY } from '../helpers.js';
import {
  A11Y,
  AGENT,
  editRecords,
  fetched,
  downloaded,
  jsonOut,
  SETTINGS,
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
  useHarness,
  type Config,
  type Records,
} from '../support/harness.js';
import { runAdd } from '../../src/commands/add.js';
import { runUpdate } from '../../src/commands/update.js';
import { runRemove } from '../../src/commands/remove.js';
import { runStatus } from '../../src/commands/status.js';
import { runList } from '../../src/commands/list.js';
import { runUninstall } from '../../src/commands/uninstall.js';
import { PHARN_VERSION } from '../../src/version.js';

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
