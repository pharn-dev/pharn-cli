import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';

// Archetype is now the DEFAULT (and only) init flow. runInit() drives it with no
// module catalog / manifest fetch. These are command-level control-flow tests
// with the archetype deps mocked; the fixture install e2e lives in
// tests/init-archetype.test.ts (the engine, unchanged by this increment).

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
}));
vi.mock('../src/lib/banner.js', () => ({ showBanner: vi.fn() }));

const runGitPrereq = vi.fn();
const runFreshCheck = vi.fn(async () => undefined);
vi.mock('../src/steps/prereqs.js', () => ({ runGitPrereq }));
vi.mock('../src/steps/fresh-check.js', () => ({ runFreshCheck }));

const detectArchetypesFromProject = vi.fn(() => ({ archetypes: ['ssr'] }));
vi.mock('../src/lib/detect-archetype.js', () => ({
  detectArchetypesFromProject,
}));

const cleanup = vi.fn();
const fetchRepo = vi.fn(async () => ({
  dir: '/fake/repo',
  sha: 'sha123',
  cleanup,
}));
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

const parseCapabilityIndex = vi.fn(() => ({ capabilities: [] }));
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const resolveCapabilities = vi.fn(() => ({ selected: [], skipped: [] }));
vi.mock('../src/lib/resolve-capabilities.js', () => ({ resolveCapabilities }));

const runArchetypeSummary = vi.fn(
  async (): Promise<'install' | 'cancel'> => 'install',
);
vi.mock('../src/steps/archetype-summary.js', () => ({ runArchetypeSummary }));

const runInstallArchetype = vi.fn(async () => undefined);
vi.mock('../src/steps/install-archetype.js', () => ({ runInstallArchetype }));

// No existing config → confirmOverwriteIfExists returns true without prompting.
vi.mock('../src/lib/pharn-config.js', () => ({
  configPath: () => '/__no_such_dir__/pharn.config.json',
  readPharnConfig: vi.fn(),
  isConfigValidationError: () => false,
}));

const { runInit } = await import('../src/commands/init.js');

describe('runInit (archetype default)', () => {
  stubProcessExit();
  afterEach(() => vi.clearAllMocks());

  it('drives the archetype flow and installs — no module/manifest fetch', async () => {
    runArchetypeSummary.mockResolvedValue('install');

    await runInit();

    expect(runGitPrereq).toHaveBeenCalledTimes(1);
    expect(runFreshCheck).toHaveBeenCalledTimes(1);
    // The archetype pipeline is taken: detect → fetch → index → resolve → summary.
    expect(detectArchetypesFromProject).toHaveBeenCalledTimes(1);
    expect(fetchRepo).toHaveBeenCalledTimes(1);
    expect(parseCapabilityIndex).toHaveBeenCalledWith('/fake/repo');
    expect(resolveCapabilities).toHaveBeenCalledTimes(1);
    expect(runArchetypeSummary).toHaveBeenCalledTimes(1);
    // Install ran with the pinned SHA; the temp clone was cleaned up.
    expect(runInstallArchetype).toHaveBeenCalledTimes(1);
    expect(runInstallArchetype).toHaveBeenCalledWith(
      '/fake/repo',
      expect.any(String),
      ['ssr'],
      { selected: [], skipped: [] },
      'sha123',
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('cancels from the summary without installing', async () => {
    runArchetypeSummary.mockResolvedValue('cancel');

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(0));

    expect(runInstallArchetype).not.toHaveBeenCalled();
    // Cleanup still runs in the finally, before the cancel exit.
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('exits(1) when PHARN cannot be fetched', async () => {
    fetchRepo.mockRejectedValueOnce(new Error('offline'));

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));

    expect(runInstallArchetype).not.toHaveBeenCalled();
  });

  // no-404 regression guard (grill #2, sharpened): a static assertion that init
  // no longer imports the module manifest — the source of the old default's 404.
  it('init.ts imports no module manifest (static no-404 guard)', () => {
    const here = fileURLToPath(import.meta.url);
    const src = readFileSync(
      join(here, '..', '..', 'src', 'commands', 'init.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/from ['"][^'"]*manifest\.js['"]/);
    expect(src).not.toContain('fetchRemoteManifest');
  });
});
