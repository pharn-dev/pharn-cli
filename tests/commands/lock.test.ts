import { hostname } from 'node:os';
import { sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import {
  config,
  downloaded,
  editConfig,
  exists,
  failures,
  fetchStub,
  installFresh,
  interactive,
  logs,
  read,
  run,
  SECURITY,
  serveTip,
  SHA_V2,
  snapshot,
  useHarness,
  write,
} from '../support/harness.js';
import { LOCK_FILE } from '../../src/lib/project-lock.js';
import { runAdd } from '../../src/commands/add.js';
import { runInit } from '../../src/commands/init.js';
import { runRemove } from '../../src/commands/remove.js';
import { runUpdate } from '../../src/commands/update.js';

// The single-writer lock, end to end: what each writing command does when
// pharn/.lock is held, when it is stale, when the download under it fails, and
// when pharn.config.json changes between the command's read and its lock. The
// module itself is unit-tested in tests/project-lock.test.ts (+ -break).

// A pass-through `node:fs` with ONE hook, run right after the lock file is
// created: the moment between a command's config read and its under-the-lock
// re-check, for the paths that have no prompt to put a concurrent write in.
const fsHooks = vi.hoisted(() => ({
  afterLockCreate: null as null | (() => void),
}));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const openSync = ((path: string, flags: string, mode?: number) => {
    const fd = real.openSync(path, flags, mode);
    if (flags === 'wx' && String(path).endsWith(`${sep}pharn${sep}.lock`)) {
      const hook = fsHooks.afterLockCreate;
      fsHooks.afterLockCreate = null;
      hook?.();
    }
    return fd;
  }) as typeof real.openSync;
  return { ...real, default: { ...real, openSync }, openSync };
});

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

/** A lock held by THIS process — alive by definition, so never stale. */
function holdLock(): void {
  write(
    LOCK_FILE,
    JSON.stringify({
      pid: process.pid,
      host: hostname(),
      command: 'update',
      startedAt: new Date().toISOString(),
    }),
  );
}

const errors = (): string => logs('error').join('\n');

/** What "another run" writes: the config with one more capability. */
const concurrentAdd = (): void =>
  editConfig((c) => {
    c.capabilities.push({ name: 'n-plus-one', role: 'lens', source: 'manual' });
  });

describe('a held lock refuses every writing command, leaving the project as it was', () => {
  // add and remove take the lock BEFORE the download, so a refused run pays
  // nothing. update downloads its plan first (F-24: the confirm names what it
  // changes) and init deliberately downloads before its prompts, so a refusal
  // there has paid for the tarball.
  it.each([
    {
      label: 'remove <name>',
      installed: true,
      command: () => runRemove('security'),
      downloads: false,
    },
    {
      label: 'add <name>',
      installed: true,
      command: () => runAdd('a11y'),
      downloads: false,
    },
    {
      // The picker's multi-select lives under the lock: a refusal never
      // presents a menu (the stub would throw if it did).
      label: 'bare add (the picker)',
      installed: true,
      tty: true,
      command: () => runAdd(undefined),
      downloads: false,
    },
    {
      label: 'update --yes',
      installed: true,
      command: () => runUpdate({ yes: true }),
      downloads: true,
    },
    {
      label: 'init --yes',
      installed: false,
      command: () => runInit({ yes: true }),
      downloads: true,
    },
  ])(
    '$label (downloads first: $downloads)',
    async ({ installed, tty, command, downloads }) => {
      if (installed) await installFresh();
      serveTip(SHA_V2, '2.0.0');
      holdLock();
      if (tty) interactive();
      fetchStub.mockClear();
      const before = snapshot();

      expect(await run(command)).toBe(1);

      // Nothing written or deleted — and the other process's lock is left
      // exactly as it was: clearing it would leave its holder unprotected.
      expect(snapshot()).toEqual(before);
      expect(JSON.parse(read(LOCK_FILE))).toMatchObject({ pid: process.pid });
      expect(downloaded()).toBe(downloads);
      expect(errors()).toContain('Another pharn process');
    },
  );

  it('breaks a stale lock (its holder is gone) rather than wedging the project', async () => {
    await installFresh();
    write(
      LOCK_FILE,
      JSON.stringify({
        pid: 2147483646, // cannot be running: process.kill(pid, 0) → ESRCH
        host: hostname(),
        command: 'update',
        startedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      }),
    );

    expect(await run(() => runRemove('security'))).toBeNull();

    expect(exists(SECURITY)).toBe(false);
    expect(config().capabilities).toEqual([]);
    expect(exists(LOCK_FILE)).toBe(false);
  });
});

// The download runs INSIDE add's locked closure, so its failure must unwind
// through the lock's release (a process.exit there would strand the lock).
describe('a failed download strands no lock and reports the real reason', () => {
  it.each([
    { label: 'add <name>', command: () => runAdd('a11y') },
    { label: 'bare add', tty: true, command: () => runAdd(undefined) },
    { label: 'update --yes', command: () => runUpdate({ yes: true }) },
  ])('$label', async ({ tty, command }) => {
    await installFresh();
    serveTip(SHA_V2, '2.0.0');
    failures.tarball = 'throw';
    if (tty) interactive();
    const before = snapshot();

    expect(await run(command)).toBe(1);

    expect(snapshot()).toEqual(before);
    expect(exists(LOCK_FILE)).toBe(false);
    // The fetch's own failure, not a TypeError from a cleanup of a clone the
    // failed download never produced.
    expect(errors()).toContain('fetch failed');
  });
});

// PHARN-03 (a): each writer re-reads pharn.config.json as the first step under
// the lock. The measured case was a `remove` picker confirmed after a
// concurrent `add`, which dropped the added capability from the config while
// its files and records stayed.
describe('a config rewritten between the read and the lock refuses the writer', () => {
  const changed = (command: string): RegExp =>
    new RegExp(`pharn\\.config\\.json changed while \`pharn ${command}\``);

  it('remove (the picker, after its confirm): nothing deleted, the concurrent write survives', async () => {
    await installFresh();
    interactive({ groupMultiselect: [['griller:security']] });
    vi.mocked(clack.confirm).mockImplementationOnce(async () => {
      concurrentAdd();
      return true;
    });

    expect(await run(() => runRemove(undefined))).toBe(1);

    expect(exists(SECURITY)).toBe(true);
    expect(config().capabilities.map((c) => c.name)).toEqual([
      'security',
      'n-plus-one',
    ]);
    expect(errors()).toMatch(changed('remove'));
    expect(exists(LOCK_FILE)).toBe(false);
  });

  it.each([
    {
      label: 'remove <name>',
      name: 'remove',
      command: () => runRemove('security'),
      downloads: false,
    },
    // add re-checks before it fetches, so the refusal costs no download.
    {
      label: 'add <name>',
      name: 'add',
      command: () => runAdd('a11y'),
      downloads: false,
    },
  ])('$label', async ({ name, command, downloads }) => {
    await installFresh();
    fetchStub.mockClear();
    fsHooks.afterLockCreate = concurrentAdd;

    expect(await run(command)).toBe(1);

    expect(fsHooks.afterLockCreate).toBeNull();
    expect(exists(SECURITY)).toBe(true);
    expect(config().capabilities).toHaveLength(2);
    expect(downloaded()).toBe(downloads);
    expect(errors()).toMatch(changed(name));
    expect(exists(LOCK_FILE)).toBe(false);
  });

  it('update (written while its confirm is open): refused after its one download, nothing written', async () => {
    await installFresh();
    serveTip(SHA_V2, '2.0.0');
    interactive();
    vi.mocked(clack.confirm).mockImplementationOnce(async () => {
      concurrentAdd();
      return true;
    });
    fetchStub.mockClear();

    expect(await run(() => runUpdate())).toBe(1);

    expect(downloaded()).toBe(true);
    expect(read(SECURITY)).toContain('security 1.0.0');
    expect(config().skillsVersion).toBe('1.0.0');
    expect(errors()).toMatch(changed('update'));
    expect(exists(LOCK_FILE)).toBe(false);
  });

  it('a config rewritten to the same content lets the command through (control)', async () => {
    await installFresh();
    const same = read('pharn.config.json');
    fsHooks.afterLockCreate = () => write('pharn.config.json', same);

    expect(await run(() => runRemove('security'))).toBeNull();

    expect(fsHooks.afterLockCreate).toBeNull();
    expect(exists(SECURITY)).toBe(false);
  });
});
