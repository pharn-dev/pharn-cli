import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';
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

const { runRemove } = await import('../src/commands/remove.js');

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
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(proj, 'pharn-pipeline/grillers/a11y'), { recursive: true });
    writeFileSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'), 'CAP');

    await runRemove('a11y');

    expect(writePharnConfig).toHaveBeenCalledTimes(1);
    expect(existsSync(join(proj, LOCK_FILE))).toBe(false);
  });
});
