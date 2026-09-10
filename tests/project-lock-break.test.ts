import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// The break race — `withProjectLock`'s one formerly-unverified path.
//
// The old break was `rmSync(lock, { force: true })` then `tryCreate`, and the
// delete never re-checked what it deleted. Two processes could each judge the
// same corpse stale and the second's delete would land on the first's fresh,
// LIVE lock:
//
//     B: rm → B: create (B holds) → C: rm (B's live lock) → C: create (C holds)
//
// The break is now rename → re-verify the moved bytes → create.
//
// WHAT THESE TESTS DO AND DO NOT SHOW — stated up front, because a race test
// that overclaims is worse than none. They do NOT run two OS processes: the
// interleave is supplied by a seam around `renameSync` that performs the REAL
// syscall and lets a test place the other process's write at the exact
// instruction the race needs. That pins this code's BEHAVIOUR at each point of
// the interleave. It does not prove `rename(2)`'s single-winner atomicity — that
// is the kernel's to provide, and it is what the whole design rests on.
// ---------------------------------------------------------------------------

/** Where a test injects the other process's write, relative to the real rename. */
const seam: { before: (() => void) | null; after: (() => void) | null } = {
  before: null,
  after: null,
};

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    default: real,
    renameSync: (from: string, to: string): void => {
      seam.before?.();
      real.renameSync(from, to);
      seam.after?.();
    },
  };
});

const {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = await import('node:fs');
const { hostname, tmpdir } = await import('node:os');
const { join } = await import('node:path');
const { LOCK_FILE, ProjectLockedError, withProjectLock } =
  await import('../src/lib/project-lock.js');

function lockPath(dir: string): string {
  return join(dir, LOCK_FILE);
}

/** Looser than the production allowlist on purpose — a stray of ANY shape fails. */
function lockSiblings(dir: string): string[] {
  return readdirSync(dir).filter(
    (n) => n !== LOCK_FILE && n.startsWith(`${LOCK_FILE}.`),
  );
}

function write(dir: string, data: unknown): void {
  writeFileSync(lockPath(dir), JSON.stringify(data), 'utf8');
}

/**
 * The rejection, or a failure if the call RESOLVED.
 *
 * `.catch(assert)` would let a run that wrongly succeeds pass silently — the
 * assertions simply never execute. Every message check below goes through here.
 */
async function refusalOf(p: Promise<unknown>): Promise<Error> {
  const err = await p.then(
    () => null,
    (e: Error) => e,
  );
  expect(err).toBeInstanceOf(ProjectLockedError);
  return err!;
}

/** A lock that is provably a corpse: its pid cannot be running on this host. */
const STALE = {
  pid: 2147483646,
  host: hostname(),
  command: 'update',
  startedAt: new Date().toISOString(),
};

/** Another process's LIVE lock — this process's own pid is alive by definition. */
function live(command: string): Record<string, unknown> {
  return {
    pid: process.pid,
    host: hostname(),
    command,
    startedAt: new Date().toISOString(),
  };
}

describe('withProjectLock — breaking a stale lock under a race', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pharn-lock-race-'));
    write(dir, STALE);
  });

  afterEach(() => {
    seam.before = null;
    seam.after = null;
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses when another breaker moved the corpse first (rename → ENOENT)', async () => {
    // The other breaker won step 1 and has not created its lock yet, so our
    // rename finds no source. We do not hold the lock, so we refuse — the
    // contract is fail-fast, never retry.
    seam.before = () => rmSync(lockPath(dir), { force: true });

    let ran = false;
    const err = await refusalOf(
      withProjectLock(dir, 'add', () => {
        ran = true;
      }),
    );

    expect(ran).toBe(false);
    // Nothing to name yet, so the refusal falls back to the generic wording —
    // but it still tells the user which file to delete.
    expect(err.message).toContain('another pharn process');
    expect(err.message).toContain(LOCK_FILE);
    expect(lockSiblings(dir)).toEqual([]);
  });

  it('re-verifies: a payload that CHANGED under us is restored, not replaced', async () => {
    // THE BUG, exactly. Between our staleness judgement and our rename, the other
    // breaker removed the corpse and created its own live lock — so the file our
    // rename moves is not the file we judged. The old rmSync deleted it anyway
    // and both processes ended up holding.
    const winner = live('update');
    seam.before = () => write(dir, winner);

    let ran = false;
    await expect(
      withProjectLock(dir, 'add', () => {
        ran = true;
      }),
    ).rejects.toThrow(ProjectLockedError);

    expect(ran).toBe(false);
    // The live lock is back under its canonical name, byte-for-byte.
    expect(existsSync(lockPath(dir))).toBe(true);
    expect(JSON.parse(readFileSync(lockPath(dir), 'utf8'))).toEqual(winner);
    expect(lockSiblings(dir)).toEqual([]);
  });

  it('names the holder it restored in the refusal', async () => {
    const winner = live('remove');
    seam.before = () => write(dir, winner);

    const err = await refusalOf(withProjectLock(dir, 'add', () => undefined));

    expect(err.message).toContain(String(winner.pid));
    expect(err.message).toContain('remove');
    expect(err.message).toContain(LOCK_FILE);
  });

  it('refuses when a third process takes the lock after a VERIFIED break', async () => {
    // Our rename moved the real corpse (the re-verify passes), but someone
    // created a lock in the gap before our tryCreate. Refuse rather than loop,
    // and leave their lock strictly alone.
    const third = live('init');
    seam.after = () => write(dir, third);

    let ran = false;
    await expect(
      withProjectLock(dir, 'update', () => {
        ran = true;
      }),
    ).rejects.toThrow(ProjectLockedError);

    expect(ran).toBe(false);
    expect(JSON.parse(readFileSync(lockPath(dir), 'utf8'))).toEqual(third);
    // The corpse we verified is worthless, and it goes.
    expect(lockSiblings(dir)).toEqual([]);
  });

  it('the restore never CLOBBERS a lock a third process took in the gap', async () => {
    // Both hazards at once: the bytes changed under us (so we hold a live lock we
    // had no right to move), AND a third process occupied the canonical name
    // before we could put it back. `link(2)` is create-or-fail, so the restore
    // fails rather than overwriting — which is the whole reason it is a link and
    // not a rename back.
    const moved = live('update');
    const third = live('init');
    seam.before = () => write(dir, moved);
    seam.after = () => write(dir, third);

    await expect(withProjectLock(dir, 'add', () => undefined)).rejects.toThrow(
      ProjectLockedError,
    );

    expect(JSON.parse(readFileSync(lockPath(dir), 'utf8'))).toEqual(third);
    expect(lockSiblings(dir)).toEqual([]);
  });

  it('still breaks and takes a stale lock when nothing races it', async () => {
    // The control: the seam is inert, so this is the ordinary break. Without it
    // the tests above could all pass on a break that never works.
    let ran = false;
    await withProjectLock(dir, 'add', () => {
      ran = true;
      expect(JSON.parse(readFileSync(lockPath(dir), 'utf8'))).toMatchObject({
        pid: process.pid,
        command: 'add',
      });
    });

    expect(ran).toBe(true);
    expect(existsSync(lockPath(dir))).toBe(false);
    expect(lockSiblings(dir)).toEqual([]);
  });
});
