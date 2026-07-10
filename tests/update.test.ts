import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

const fetchRemoteSkillsVersion = vi.fn();
const readSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', () => ({
  fetchRemoteSkillsVersion,
  readSkillsVersion,
}));

const parseCapabilityIndex = vi.fn();
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const resolveCapabilities = vi.fn();
vi.mock('../src/lib/resolve-capabilities.js', () => ({ resolveCapabilities }));

const installCapabilities = vi.fn();
vi.mock('../src/lib/install-capabilities.js', () => ({ installCapabilities }));

const loadArchetypeConfigOrExit = vi.fn();
const writePharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  loadArchetypeConfigOrExit,
  writePharnConfig,
}));

const { runUpdate } = await import('../src/commands/update.js');
const prompts = await import('@clack/prompts');

const archConfig: PharnConfig = {
  pharnVersion: '0.2.0',
  skillsVersion: '1.0.0',
  repo: 'pharn-dev/pharn-oss',
  commit: 'old',
  modules: [],
  installedAt: '2026-06-11T00:00:00.000Z',
  archetypes: ['ssr'],
  capabilities: [{ name: 'a11y', role: 'griller' }],
};

describe('runUpdate (archetype)', () => {
  stubProcessExit();
  beforeEach(() => vi.spyOn(process, 'cwd').mockReturnValue('/proj'));
  afterEach(() => vi.clearAllMocks());

  it('aborts before any fetch when the config is not an archetype install', async () => {
    // loadArchetypeConfigOrExit rejects a legacy (module) config with
    // LEGACY_CONFIG_MESSAGE + exit(1) — that message is asserted in
    // pharn-config.test.ts; here we assert the command never reaches the network.
    loadArchetypeConfigOrExit.mockImplementationOnce(() => {
      throw new ProcessExit(1);
    });
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('reports already up to date without cloning', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig);
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    await runUpdate();

    expect(prompts.outro).toHaveBeenCalledWith(
      'Already up to date (skills v1.0.0).',
    );
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('re-resolves + re-copies capabilities after confirmation', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig);
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    const cleanup = vi.fn();
    // fetchRepo carries the pinned SHA; update records repo.sha as `commit`.
    fetchRepo.mockResolvedValue({ dir: '/repo', sha: 'sha', cleanup });
    parseCapabilityIndex.mockReturnValue({ capabilities: [] });
    resolveCapabilities.mockReturnValue({
      selected: [
        { name: 'a11y', role: 'griller', matched: ['ssr'] },
        { name: 'security', role: 'griller', matched: 'universal' },
      ],
      skipped: [],
    });
    readSkillsVersion.mockReturnValue('1.1.0');

    await runUpdate();

    // Re-resolves the RECORDED archetypes against the fresh index.
    expect(resolveCapabilities).toHaveBeenCalledWith(['ssr'], {
      capabilities: [],
    });
    expect(installCapabilities).toHaveBeenCalledWith(
      '/repo',
      '/proj',
      expect.anything(),
    );
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect((written as PharnConfig).skillsVersion).toBe('1.1.0');
    expect((written as PharnConfig).capabilities).toEqual([
      { name: 'a11y', role: 'griller' },
      { name: 'security', role: 'griller' },
    ]);
    expect(cleanup).toHaveBeenCalled();
  });

  it('cancels when declined — no clone, no copy', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig);
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    vi.mocked(prompts.confirm).mockResolvedValue(false);

    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(0));
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(installCapabilities).not.toHaveBeenCalled();
  });
});
