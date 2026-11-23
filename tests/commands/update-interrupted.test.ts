import { readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT,
  at,
  backupFiles,
  clearOutput,
  config,
  CONSTITUTION,
  editRecords,
  exists,
  installFresh,
  jsonOut,
  notes,
  noteTitles,
  read,
  records,
  run,
  SECURITY,
  serveTip,
  sha256,
  SHA_V2,
  SHA_V3,
  useHarness,
  write,
} from '../support/harness.js';
import { runUpdate } from '../../src/commands/update.js';
// Spied on (never mocked) to read the plan the healing run applied.
import * as updatePlanModule from '../../src/lib/update-plan.js';

// An `update` interrupted after its file copies but before its closing record
// store: every file is at the new version while the store and the config are
// still the old ones. A plain re-run must heal it even when upstream releases
// again in between, which needs the store to have announced the new hashes
// (`incoming`) before the first copy.
//
// The interruption is driven by failing the closing store's `rename`, which
// leaves the same disk state as Ctrl-C: the copy loop is synchronous, so a
// signal is handled (lib/fatal-signal.ts) at the first await after it, which is
// that same closing store write. The real-signal path itself is pinned by
// tests/project-lock.test.ts.

// A pass-through `node:fs/promises` whose `rename` a test can intercept (the
// state files are written temp-then-rename through it, lib/atomic-write.ts).
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

afterEach(() => {
  fsHooks.rename = null;
});

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const CHANGED = [CONSTITUTION, SECURITY, AGENT];
const updateYes = (opts: Parameters<typeof runUpdate>[0] = {}) =>
  run(() => runUpdate({ yes: true, ...opts }));

/**
 * init at 1.0.0, then an `update` to 2.0.0 that stops after the copies: the
 * store's rename fails once CONSTITUTION already holds the 2.0.0 bytes.
 */
async function interruptedAt2(
  opts: Parameters<typeof runUpdate>[0] = {},
): Promise<void> {
  await installFresh();
  serveTip(SHA_V2, '2.0.0');
  fsHooks.rename = (_from, to) => {
    if (
      to.endsWith('pharn.records.json') &&
      readFileSync(at(CONSTITUTION), 'utf8') === 'constitution 2.0.0\n'
    )
      throw Object.assign(new Error('EINTR: interrupted'), { code: 'EINTR' });
  };
  expect(await updateYes(opts)).toBe(1);
  fsHooks.rename = null;
  clearOutput();
}

/** Every changed file at `version`, recorded by its dest hash; nothing pending. */
function expectHealedAt(version: string): void {
  expect(read(CONSTITUTION)).toBe(`constitution ${version}\n`);
  expect(read(SECURITY)).toContain(`security ${version}`);
  expect(read(AGENT)).toBe(`review lens agent ${version}\n`);
  for (const rel of CHANGED) expect(records().files[rel]).toBe(sha256(rel));
  expect(records()).not.toHaveProperty('incoming');
  expect(records().skillsVersion).toBe(version);
  expect(config().skillsVersion).toBe(version);
  expect(noteTitles()).not.toContain('SKIPPED');
}

describe('an update interrupted after its writes, before its records', () => {
  it('leaves files new and the config old, with the new hashes announced', async () => {
    await interruptedAt2();
    expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');
    expect(config().skillsVersion).toBe('1.0.0');
    const store = records() as unknown as {
      files: Record<string, string>;
      incoming?: Record<string, string>;
    };
    expect(store.files[CONSTITUTION]).toBe(sha('constitution 1.0.0\n'));
    expect(store.incoming?.[CONSTITUTION]).toBe(sha256(CONSTITUTION));
  });

  it('upstream releases again: a plain update --yes finishes, no MODIFIED, no --force, no backup', async () => {
    await interruptedAt2();
    serveTip(SHA_V3, '3.0.0');
    expect(await updateYes()).toBeNull();
    expectHealedAt('3.0.0');
    expect(exists('pharn/.backup')).toBe(false);
  });

  it('the planner settles the announced hashes: the healing plan updates every changed file and skips none', async () => {
    await interruptedAt2();
    serveTip(SHA_V3, '3.0.0');
    const planner = vi.spyOn(updatePlanModule, 'buildUpdatePlan');
    expect(await updateYes()).toBeNull();
    expect(planner).toHaveBeenCalledTimes(1);
    const { apply } = planner.mock.results[0]!.value as ReturnType<
      typeof updatePlanModule.buildUpdatePlan
    >;
    expect(apply.plan.counts.skipped).toBe(0);
    expect(apply.plan.writes).toEqual(expect.arrayContaining(CHANGED));
    // The baseline the plan used is the announced 2.0.0 hash, not the 1.0.0 record.
    expect(apply.records?.[CONSTITUTION]).toBe(sha('constitution 2.0.0\n'));
    planner.mockRestore();
  });

  it('no new release: a plain re-run heals the store and the config', async () => {
    await interruptedAt2();
    expect(await updateYes()).toBeNull();
    expectHealedAt('2.0.0');
  });

  it('the dry run previews the healing run: every changed file written, none skipped', async () => {
    await interruptedAt2();
    serveTip(SHA_V3, '3.0.0');
    expect(await run(() => runUpdate({ dryRun: true, json: true }))).toBeNull();
    const json = jsonOut<{
      plan: { writes: string[]; counts: { skipped: number } };
    }>();
    expect(json.plan.counts.skipped).toBe(0);
    expect(json.plan.writes).toEqual(expect.arrayContaining(CHANGED));
  });

  it('a --force write is announced too, so its interruption heals the same way', async () => {
    await installFresh();
    write(CONSTITUTION, 'mine\n');
    clearOutput();
    serveTip(SHA_V2, '2.0.0');
    fsHooks.rename = (_from, to) => {
      if (
        to.endsWith('pharn.records.json') &&
        readFileSync(at(CONSTITUTION), 'utf8') === 'constitution 2.0.0\n'
      )
        throw Object.assign(new Error('EINTR: interrupted'), { code: 'EINTR' });
    };
    expect(await updateYes({ force: true })).toBe(1);
    fsHooks.rename = null;
    expect(backupFiles()).toEqual([CONSTITUTION]);
    clearOutput();
    serveTip(SHA_V3, '3.0.0');
    expect(await updateYes()).toBeNull();
    expectHealedAt('3.0.0');
  });

  it('an edit made after the interruption is still MODIFIED, and --force still backs it up', async () => {
    await interruptedAt2();
    write(CONSTITUTION, 'mine\n');
    serveTip(SHA_V3, '3.0.0');
    expect(await updateYes()).toBeNull();
    expect(read(CONSTITUTION)).toBe('mine\n');
    const skipped = notes('SKIPPED').join('\n');
    expect(skipped).toContain('MODIFIED');
    expect(skipped).toContain(CONSTITUTION);
    expect(read(SECURITY)).toContain('security 3.0.0');
    expect(exists('pharn/.backup')).toBe(false);

    clearOutput();
    expect(await updateYes({ force: true })).toBeNull();
    expect(backupFiles()).toEqual([CONSTITUTION]);
    expectHealedAt('3.0.0');
  });

  it('a file deleted after the interruption is restored; its incoming hash settles nothing', async () => {
    await interruptedAt2();
    rmSync(at(AGENT));
    serveTip(SHA_V3, '3.0.0');
    expect(await updateYes()).toBeNull();
    expectHealedAt('3.0.0');
  });

  it('a malformed `incoming` is ignored as a whole: the store stays usable, the files read as MODIFIED', async () => {
    await interruptedAt2();
    editRecords((r) => {
      const incoming = (r as unknown as { incoming: Record<string, string> })
        .incoming;
      incoming[CONSTITUTION] = 'not-a-hash';
    });
    serveTip(SHA_V3, '3.0.0');
    expect(await updateYes()).toBeNull();
    const skipped = notes('SKIPPED').join('\n');
    expect(skipped).toContain('MODIFIED');
    expect(skipped).not.toContain('UNVERIFIABLE');
    for (const rel of CHANGED) expect(skipped).toContain(rel);
    expect(read(CONSTITUTION)).toBe('constitution 2.0.0\n');
    // The next store write drops it.
    expect(records()).not.toHaveProperty('incoming');
  });
});

describe('an update that completes', () => {
  it('writes a store with no `incoming` key', async () => {
    await installFresh();
    serveTip(SHA_V2, '2.0.0');
    expect(await updateYes()).toBeNull();
    expect(records()).not.toHaveProperty('incoming');
    expect(records().files[CONSTITUTION]).toBe(sha256(CONSTITUTION));
  });
});
