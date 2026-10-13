import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';

// F-05, end to end through the REAL config loader: a hand-edited `archetypes`
// used to reach `list` / `status` / `update` unvalidated, so `"ssr"` (a string,
// not an array) died on `.join` with a raw TypeError and a stack. Each command
// must now refuse with the named `ArchetypesError` message and exit 1 — before
// any clone or fetch (the network modules below fail the test if reached).

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), message: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
  confirm: vi.fn(),
  isCancel: () => false,
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
}));
const unreachable = (name: string) =>
  vi.fn(() => {
    throw new Error(`${name} must not be reached`);
  });
vi.mock('../src/lib/repo.js', () => ({ fetchRepo: unreachable('fetchRepo') }));
vi.mock('../src/lib/release.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/release.js')>()),
  resolveSource: unreachable('resolveSource'),
}));
vi.mock('../src/lib/skills-version.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/skills-version.js')>()),
  fetchRemoteSkillsVersion: unreachable('fetchRemoteSkillsVersion'),
}));

const { runList } = await import('../src/commands/list.js');
const { runStatus } = await import('../src/commands/status.js');
const { runUpdate } = await import('../src/commands/update.js');
const prompts = await import('@clack/prompts');

const BAD = {
  pharnVersion: '0.12.0',
  skillsVersion: '1.0.0',
  repo: 'pharn-dev/pharn-oss',
  commit: null,
  modules: [],
  installedAt: '2026-10-13T00:00:00.000Z',
  archetypes: 'ssr',
  capabilities: [{ name: 'a11y', role: 'griller' }],
};

describe('a non-array `archetypes` is a named refusal, never a stack', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    writeFileSync(join(tmp.path(), 'pharn.config.json'), JSON.stringify(BAD));
    vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    stdout = [];
    stderr = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      stdout.push(a.map(String).join(' '));
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      stderr.push(a.map(String).join(' '));
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const clackErrors = (): string =>
    vi
      .mocked(prompts.log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');

  it.each([
    ['list', () => runList()],
    ['status', () => runStatus()],
  ])('`%s` exits 1 naming the field (text mode)', async (_cmd, run) => {
    await expect(run()).rejects.toMatchObject(new ProcessExit(1));
    expect(clackErrors()).toMatch(/pharn\.config\.json: archetypes must be/);
    expect(clackErrors()).not.toMatch(/TypeError/);
  });

  it.each([
    ['list --json', () => runList({ json: true })],
    ['status --json', () => runStatus({ json: true })],
    ['update --dry-run --json', () => runUpdate({ dryRun: true, json: true })],
  ])(
    '`%s` exits 1 with the message on stderr and stdout EMPTY',
    async (_cmd, run) => {
      await expect(run()).rejects.toMatchObject(new ProcessExit(1));
      expect(stdout).toEqual([]);
      expect(stderr.join('\n')).toMatch(
        /pharn\.config\.json: archetypes must be/,
      );
      expect(stderr.join('\n')).not.toMatch(/TypeError/);
      expect(prompts.log.error).not.toHaveBeenCalled();
    },
  );

  it('an unknown archetype is refused too, never a silent narrowing', async () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({ ...BAD, archetypes: ['ssr', 'bogus'] }),
    );
    await expect(runStatus({ json: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(stdout).toEqual([]);
    expect(stderr.join('\n')).toMatch(/archetypes\[1\].*"bogus"/);
  });
});
