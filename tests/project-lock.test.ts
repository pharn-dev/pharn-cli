import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  LOCK_FILE,
  ProjectLockedError,
  withProjectLock,
} from '../src/lib/project-lock.js';

// Nothing serialized the four commands that write project state, so two pharn
// runs in one project could interleave: A backs up and overwrites F, B — planned
// against the pre-A snapshot — overwrites F again and persists records claiming
// its own hash, then A persists ITS records and config last. The store then
// disagrees with disk UNDER A MATCHING STAMP, which is exactly the state the
// stamp check exists to detect. The stamp only catches an interleave that SPLITS
// one process's records/config pair; when a pair lands last and intact the
// result is a silently-wrong drift baseline.
//
// The contract here is fail-fast with a named refusal, never wait: no retry
// loop, no backoff. And it must break a STALE lock rather than wedging a project
// forever, while never deleting a lock it does not own.

function lockPath(dir: string): string {
  return join(dir, LOCK_FILE);
}

function payload(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(lockPath(dir), 'utf8')) as Record<
    string,
    unknown
  >;
}

/**
 * Everything sitting next to the lock under a `.pharn.lock.`-prefixed name.
 *
 * Deliberately looser than the production `CORPSE_RE`: "the break left nothing
 * behind" has to fail on a stray with an UNEXPECTED name too, or the assertion
 * only tests the names we already thought of.
 */
function lockSiblings(dir: string): string[] {
  return readdirSync(dir)
    .filter((n) => n !== LOCK_FILE && n.startsWith(`${LOCK_FILE}.`))
    .sort();
}

/** A corpse-shaped file, aged so the sweep's age bound is the thing under test. */
function plantCorpse(dir: string, name: string, ageMs: number): void {
  const p = join(dir, name);
  writeFileSync(p, 'corpse', 'utf8');
  const when = new Date(Date.now() - ageMs);
  utimesSync(p, when, when);
}

/** A lock file with an arbitrary payload, as a hand-edit or a crashed run leaves. */
function plantLock(dir: string, data: unknown): void {
  writeFileSync(
    lockPath(dir),
    typeof data === 'string' ? data : JSON.stringify(data),
    'utf8',
  );
}

describe('withProjectLock', () => {
  const tmp = useTmpDir();

  it('acquires, runs, and leaves no file behind', async () => {
    const dir = tmp.path();
    let sawLock = false;
    const result = await withProjectLock(dir, 'update', () => {
      sawLock = existsSync(lockPath(dir));
      return 'done';
    });

    expect(sawLock).toBe(true);
    expect(result).toBe('done');
    expect(existsSync(lockPath(dir))).toBe(false);
  });

  it('records pid, host, command and start time', async () => {
    const dir = tmp.path();
    await withProjectLock(dir, 'add', () => {
      const held = payload(dir);
      expect(held.pid).toBe(process.pid);
      expect(held.host).toBe(hostname());
      expect(held.command).toBe('add');
      expect(typeof held.startedAt).toBe('string');
    });
  });

  it('releases when the wrapped function throws, and rethrows it', async () => {
    const dir = tmp.path();
    await expect(
      withProjectLock(dir, 'update', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(existsSync(lockPath(dir))).toBe(false);
  });

  it('refuses when a LIVE lock is held, naming the pid and the escape', async () => {
    const dir = tmp.path();
    // This process is alive by definition, so a same-host lock naming it is live.
    plantLock(dir, {
      pid: process.pid,
      host: hostname(),
      command: 'update',
      startedAt: new Date().toISOString(),
    });

    let ran = false;
    await expect(
      withProjectLock(dir, 'add', () => {
        ran = true;
      }),
    ).rejects.toThrow(ProjectLockedError);

    expect(ran).toBe(false);
    // The refusal must be actionable: what is held, by whom, and how to clear it.
    await withProjectLock(dir, 'add', () => undefined).catch((err: Error) => {
      expect(err.message).toContain(LOCK_FILE);
      expect(err.message).toContain(String(process.pid));
      expect(err.message).toContain('update');
    });

    // ...and a refusal must NEVER delete the lock it refused on.
    expect(existsSync(lockPath(dir))).toBe(true);
    expect(payload(dir).pid).toBe(process.pid);
  });

  it('breaks a lock whose startedAt is older than the stale window', async () => {
    const dir = tmp.path();
    plantLock(dir, {
      pid: process.pid, // alive — so ONLY the age can justify the break
      host: hostname(),
      command: 'update',
      startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });

    let ran = false;
    await withProjectLock(dir, 'update', () => {
      ran = true;
      expect(payload(dir).command).toBe('update');
    });

    expect(ran).toBe(true);
    expect(existsSync(lockPath(dir))).toBe(false);
  });

  it('breaks a same-host lock whose pid is dead', async () => {
    const dir = tmp.path();
    // A pid that cannot be running: process.kill(pid, 0) throws ESRCH.
    plantLock(dir, {
      pid: 2147483646,
      host: hostname(),
      command: 'add',
      startedAt: new Date().toISOString(),
    });

    let ran = false;
    await withProjectLock(dir, 'remove', () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('does NOT break a live lock from another host on liveness grounds', async () => {
    const dir = tmp.path();
    // A dead-looking pid, but on a DIFFERENT host — this process cannot know
    // whether that pid is running there, so pid liveness must not be consulted.
    // Only the age rule may break it.
    plantLock(dir, {
      pid: 2147483646,
      host: `${hostname()}-elsewhere`,
      command: 'update',
      startedAt: new Date().toISOString(),
    });

    await expect(
      withProjectLock(dir, 'update', () => undefined),
    ).rejects.toThrow(ProjectLockedError);
  });

  it.each([
    ['unparseable JSON', 'not json at all'],
    ['a JSON scalar', '42'],
    ['an object with no pid', JSON.stringify({ host: hostname() })],
    ['a non-integer pid', JSON.stringify({ pid: 1.5, host: hostname() })],
    ['a negative pid', JSON.stringify({ pid: -1, host: hostname() })],
    ['a non-string startedAt', JSON.stringify({ pid: 1, startedAt: 7 })],
  ])('treats %s as stale and breaks it', async (_label, body) => {
    const dir = tmp.path();
    plantLock(dir, body);

    let ran = false;
    await withProjectLock(dir, 'init', () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(existsSync(lockPath(dir))).toBe(false);
  });

  it('never signals an arbitrary pid from a hand-edited lock', async () => {
    // pid 1 is init/launchd — alive on every platform. A malformed lock must be
    // rejected on SHAPE before any value reaches process.kill, so validation
    // order is what is under test here: a hand-edited file must not be able to
    // turn `pharn` into a signal-sending primitive.
    const dir = tmp.path();
    plantLock(dir, { pid: '1', host: hostname(), startedAt: 'nope' });

    let ran = false;
    await withProjectLock(dir, 'init', () => {
      ran = true;
    });
    // A string pid is not the expected shape → stale → broken, without ever
    // being passed to process.kill.
    expect(ran).toBe(true);
  });

  it('does not delete a lock another process took after ours vanished', async () => {
    const dir = tmp.path();
    const foreign = {
      pid: 2147483645,
      host: `${hostname()}-other`,
      command: 'add',
      startedAt: new Date().toISOString(),
    };

    await withProjectLock(dir, 'update', () => {
      // Simulate our lock being removed and a different process taking one.
      plantLock(dir, foreign);
    });

    // Release re-reads and finds a pid that is not ours, so it leaves it alone.
    expect(existsSync(lockPath(dir))).toBe(true);
    expect(payload(dir).pid).toBe(foreign.pid);
  });

  it('is idempotent when the lock file is already gone at release', async () => {
    const dir = tmp.path();
    await expect(
      withProjectLock(dir, 'update', () => {
        // Something else cleaned up mid-run; release must not throw.
        rmSync(lockPath(dir), { force: true });
      }),
    ).resolves.toBeUndefined();
  });

  it('serializes: a second acquire inside the first is refused', async () => {
    const dir = tmp.path();
    await withProjectLock(dir, 'update', async () => {
      await expect(
        withProjectLock(dir, 'add', () => undefined),
      ).rejects.toThrow(ProjectLockedError);
    });
    expect(existsSync(lockPath(dir))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // The break is now rename → re-verify → create, so it moves the corpse aside
  // before replacing it. These are the consequences a user can SEE: nothing left
  // in their project root, and a lock path that is not a file no longer wedges
  // them. The interleave the rename exists to survive is driven from a
  // renameSync seam in tests/project-lock-break.test.ts.
  // -------------------------------------------------------------------------

  it('leaves no corpse behind after breaking a stale lock', async () => {
    const dir = tmp.path();
    plantLock(dir, {
      pid: 2147483646, // dead on this host → stale
      host: hostname(),
      command: 'update',
      startedAt: new Date().toISOString(),
    });

    await withProjectLock(dir, 'add', () => undefined);

    expect(lockSiblings(dir)).toEqual([]);
    expect(existsSync(lockPath(dir))).toBe(false);
  });

  it('sweeps an AGED corpse, and leaves a fresh one and a non-matching neighbour', async () => {
    const dir = tmp.path();
    // A corpse from a run killed between its rename and its tidy — nothing else
    // would ever remove this, which is why the break sweeps.
    plantCorpse(dir, '.pharn.lock.4821.deadbeef', 48 * 60 * 60 * 1000);
    // A corpse seconds old may belong to a breaker racing us RIGHT NOW, mid-verify.
    plantCorpse(dir, '.pharn.lock.4822.cafef00d', 0);
    // Prefixed, but not corpse-shaped: the sweep matches an allowlist, not a prefix.
    writeFileSync(join(dir, '.pharn.lock.keepme'), 'mine', 'utf8');
    plantLock(dir, 'not json at all'); // malformed → stale → break → sweep

    await withProjectLock(dir, 'init', () => undefined);

    expect(lockSiblings(dir)).toEqual([
      '.pharn.lock.4822.cafef00d',
      '.pharn.lock.keepme',
    ]);
  });

  it('does NOT sweep on an uncontended acquire', async () => {
    const dir = tmp.path();
    plantCorpse(dir, '.pharn.lock.4821.deadbeef', 48 * 60 * 60 * 1000);

    // No lock present, so tryCreate wins outright and the break path never runs.
    // The uncontended acquire stays two syscalls: nobody pays a directory listing
    // for a lock that was never contended.
    await withProjectLock(dir, 'update', () => undefined);

    expect(lockSiblings(dir)).toEqual(['.pharn.lock.4821.deadbeef']);
  });

  it('does not wedge when the lock path is a DIRECTORY', async () => {
    const dir = tmp.path();
    // A hand-made mistake the old rmSync(force) could never clear: force does not
    // imply recursive, so the delete threw ERR_FS_EISDIR on every run and the
    // project refused forever — hazard #1 (wedging) in this file's own header.
    mkdirSync(lockPath(dir));

    let ran = false;
    await withProjectLock(dir, 'add', () => {
      ran = true;
    });

    expect(ran).toBe(true);
    // Moved aside under a corpse name, never recursively deleted: pharn does not
    // remove a directory a user put there.
    const left = lockSiblings(dir);
    expect(left).toHaveLength(1);
    expect(statSync(join(dir, left[0]!)).isDirectory()).toBe(true);
  });
});
