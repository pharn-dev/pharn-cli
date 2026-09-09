import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import * as prompts from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessExit,
  restoreTTY,
  setTTY,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';
import { LOCK_FILE } from '../src/lib/project-lock.js';

// The end-to-end half of the lock: the four write commands must REFUSE while
// one is held, and must leave the project byte-identical when they do.
//
// Separate file on purpose. tests/add.test.ts and friends run against the fake
// cwd `/proj` with the lock passed through, so they can pin the WIRING but not
// the refusal; and tests/project-lock.test.ts covers the module in isolation
// but not its effect on a command. This is the seam between them, and it runs
// against real directories.

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), step: vi.fn() },
  confirm: vi.fn(async () => true),
  isCancel: () => false,
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
  groupMultiselect: vi.fn(),
}));

const loadArchetypeConfigOrExit = vi.fn();
const writePharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  loadArchetypeConfigOrExit,
  writePharnConfig,
}));

// The whole point of the suites below: `fetchRepo` is the ~2.5 MB tarball
// download, and the assertion is that a refused run never reaches it. Mocking it
// is the only way to say "not called" about a function whose real form would go
// to the network — and it also keeps this file offline.
const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

// `update` checks the remote SKILLS_VERSION BEFORE it takes the lock, so an
// un-mocked one here would make this suite perform real egress. Spread from the
// actual module so `readSkillsVersion` (a local file read) keeps its real
// behaviour — only the network call is replaced.
const fetchRemoteSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', async () => ({
  ...(await vi.importActual<typeof import('../src/lib/skills-version.js')>(
    '../src/lib/skills-version.js',
  )),
  fetchRemoteSkillsVersion,
}));

const { runRemove } = await import('../src/commands/remove.js');
const { runAdd } = await import('../src/commands/add.js');
const { runUpdate } = await import('../src/commands/update.js');
const { runInit } = await import('../src/commands/init.js');

/** The archetype config every suite below loads. */
function archetypeConfig() {
  return {
    pharnVersion: '0.4.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: null,
    installedAt: '2026-01-01T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller' }],
    layout: 'flat',
    modules: [],
  };
}

/** A lock held by THIS process — alive by definition, so never stale. */
function holdLock(dir: string, command = 'update'): void {
  writeFileSync(
    join(dir, LOCK_FILE),
    JSON.stringify({
      pid: process.pid,
      host: hostname(),
      command,
      startedAt: new Date().toISOString(),
    }),
    'utf8',
  );
}

describe('a held lock refuses a writing command', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  let proj = '';

  beforeEach(() => {
    proj = tmp.path();
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    writePharnConfig.mockReset();
    loadArchetypeConfigOrExit.mockReturnValue({
      pharnVersion: '0.4.0',
      skillsVersion: '1.0.0',
      repo: 'pharn-dev/pharn-oss',
      commit: null,
      installedAt: '2026-01-01T00:00:00.000Z',
      archetypes: ['ssr'],
      capabilities: [{ name: 'a11y', role: 'griller' }],
      layout: 'flat',
      modules: [],
    });
  });

  it('`remove` refuses, writes no config, and leaves the capability on disk', async () => {
    const capFile = join(proj, 'pharn-pipeline/grillers/a11y/a11y.md');
    writeFileSync(join(proj, 'placeholder'), 'x');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(proj, 'pharn-pipeline/grillers/a11y'), { recursive: true });
    writeFileSync(capFile, 'CAP');
    holdLock(proj);

    await expect(runRemove('a11y')).rejects.toMatchObject(new ProcessExit(1));

    // Nothing was deleted, and no config was persisted.
    expect(readFileSync(capFile, 'utf8')).toBe('CAP');
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('does not remove the lock it refused on', async () => {
    holdLock(proj);
    await expect(runRemove('a11y')).rejects.toMatchObject(new ProcessExit(1));

    // A refusal that cleared the lock would be worse than no lock at all: the
    // holder would then be running unprotected.
    expect(existsSync(join(proj, LOCK_FILE))).toBe(true);
    const held = JSON.parse(
      readFileSync(join(proj, LOCK_FILE), 'utf8'),
    ) as Record<string, unknown>;
    expect(held.pid).toBe(process.pid);
  });

  it('leaves no lock behind after a normal run', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(proj, 'pharn-pipeline/grillers/a11y'), { recursive: true });
    writeFileSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'CAP');

    await runRemove('a11y');

    expect(writePharnConfig).toHaveBeenCalledTimes(1);
    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
  });

  it('breaks a stale lock rather than wedging the project forever', async () => {
    // The holder was SIGKILLed a week ago. Refusing forever would make the
    // project permanently unusable, which is the worse failure.
    writeFileSync(
      join(proj, LOCK_FILE),
      JSON.stringify({
        pid: process.pid,
        host: hostname(),
        command: 'update',
        startedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      }),
      'utf8',
    );
    mkdirSync(join(proj, 'pharn-pipeline/grillers/a11y'), { recursive: true });
    writeFileSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'CAP');

    await runRemove('a11y');

    expect(writePharnConfig).toHaveBeenCalledTimes(1);
    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The acquisition ORDER (audit finding P-9).
//
// `add` and `update` take the lock BEFORE fetchRepo, so a run that will be
// refused never pays for the ~2.5 MB tarball. `init` deliberately does NOT —
// both of its prompts sit between its fetch and its install, so the only slot
// before the fetch is also before both prompts, trading a bounded hold for an
// unbounded one. Each half is pinned here; the init case exists so a later
// "consistency" refactor has to argue with a test rather than with a comment.
// ---------------------------------------------------------------------------
describe('a held lock refuses BEFORE the download', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  let proj = '';

  beforeEach(() => {
    proj = tmp.path();
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    fetchRepo.mockReset();
    fetchRemoteSkillsVersion.mockReset();
    fetchRemoteSkillsVersion.mockResolvedValue('2.0.0');
    writePharnConfig.mockReset();
    loadArchetypeConfigOrExit.mockReturnValue(archetypeConfig());
  });

  afterEach(() => {
    restoreTTY();
  });

  it('`add <name>` refuses without downloading anything', async () => {
    holdLock(proj);

    await expect(runAdd('n-plus-one')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(fetchRepo).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('bare `add` refuses without downloading and without rendering the picker', async () => {
    // The picker path's TTY gate sits before the lock, so this suite has to open
    // the terminal or the run exits on the usage error and never reaches it.
    setTTY(true, true);
    holdLock(proj);

    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));

    expect(fetchRepo).not.toHaveBeenCalled();
    // The multi-select lives INSIDE the locked fn, so a refusal must never
    // present a menu the user would pick from only to be turned away.
    expect(vi.mocked(prompts.groupMultiselect)).not.toHaveBeenCalled();
  });

  it('`update` refuses without downloading — but the version check already ran', async () => {
    holdLock(proj);

    await expect(runUpdate({ yes: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(fetchRepo).not.toHaveBeenCalled();
    // The HONEST claim, pinned as such: moving the lock closes the TARBALL
    // download, not every round-trip. fetchRemoteSkillsVersion runs before the
    // confirm and therefore before the lock, so a refused `update` still makes
    // this one small guarded GET. Asserting it is what keeps the CHANGELOG's
    // wording ("no tarball download") true rather than aspirational.
    expect(fetchRemoteSkillsVersion).toHaveBeenCalledTimes(1);
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('`init` still downloads under a held lock — the deliberately declined move', async () => {
    // init hard-fails without .git and off a TTY, both before the fetch.
    mkdirSync(join(proj, '.git'), { recursive: true });
    setTTY(true, true);
    holdLock(proj);
    fetchRepo.mockRejectedValueOnce(new Error('offline'));

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

    // THE POINT: init pays for the download even when it would be refused
    // later. That cost is accepted (see the note in src/commands/init.ts)
    // because the alternative holds the lock across two open-ended human
    // prompts.
    expect(fetchRepo).toHaveBeenCalledTimes(1);
    // And it left the other process's lock strictly alone.
    expect(existsSync(join(proj, LOCK_FILE))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The other half of moving the lock earlier: the fetch now happens INSIDE the
// locked fn, so its failure must unwind through withProjectLock's finally. It
// used to end in process.exit(1) — which skips every finally — so a lock taken
// before it would have been stranded on every offline / DNS / rate-limit
// failure, the most common failure these commands have.
// ---------------------------------------------------------------------------
describe('a failed download under the lock strands nothing', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  let proj = '';

  beforeEach(() => {
    proj = tmp.path();
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    fetchRepo.mockReset();
    fetchRepo.mockRejectedValue(new Error('offline'));
    fetchRemoteSkillsVersion.mockReset();
    fetchRemoteSkillsVersion.mockResolvedValue('2.0.0');
    writePharnConfig.mockReset();
    loadArchetypeConfigOrExit.mockReturnValue(archetypeConfig());
  });

  afterEach(() => {
    restoreTTY();
  });

  it('`add <name>` releases the lock and still reports the real reason', async () => {
    await expect(runAdd('n-plus-one')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
    // Not a TypeError from a cleanup that dereferenced a clone the failed fetch
    // never produced — the shape the restructure had to avoid.
    const [msg] = vi.mocked(prompts.log.error).mock.calls.at(-1)!;
    expect(msg).toContain('offline');
  });

  it('bare `add` releases the lock when the download fails', async () => {
    setTTY(true, true);

    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));

    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
  });

  it('`update` releases the lock and still reports the real reason', async () => {
    await expect(runUpdate({ yes: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );

    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
    const [msg] = vi.mocked(prompts.log.error).mock.calls.at(-1)!;
    expect(msg).toContain('offline');
  });
});
