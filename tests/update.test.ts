import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import { v2Manifest } from './wizard-fixture.js';
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

const fetchRemoteManifest = vi.fn();
vi.mock('../src/lib/manifest.js', () => ({ fetchRemoteManifest }));

const fetchAndInstall = vi.fn();
vi.mock('../src/lib/installer.js', () => ({ fetchAndInstall }));

const fetchRepo = vi.fn();
const fetchCommitSha = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo, fetchCommitSha }));

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

const readPharnConfig = vi.fn();
const writePharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  readPharnConfig,
  writePharnConfig,
  isArchetypeConfig: (c: PharnConfig) => Array.isArray(c.capabilities),
  toInstalledModules: (m: { name: string; version: string }[]) =>
    m.map(({ name, version }) => ({ name, version })),
}));

const { runUpdate } = await import('../src/commands/update.js');
const prompts = await import('@clack/prompts');

const config: PharnConfig = {
  pharnVersion: '0.2.0',
  skillsVersion: '0.68.0',
  repo: 'pharn-dev/pharn-oss',
  commit: 'old',
  constitution: 'standard',
  modules: [{ name: 'pharn-core', version: '0.2.0' }],
  installedAt: '2026-06-11T00:00:00.000Z',
};

function manifest(skillsVersion: string, coreVersion = '0.2.0') {
  return {
    schemaVersion: 1,
    skillsVersion,
    modules: [{ name: 'pharn-core', version: coreVersion }],
  };
}

describe('runUpdate', () => {
  stubProcessExit();
  beforeEach(() => vi.spyOn(process, 'cwd').mockReturnValue('/proj'));
  afterEach(() => vi.clearAllMocks());

  it('exits(1) when there is no config', async () => {
    readPharnConfig.mockReturnValue(null);
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
  });

  it('reports when already up to date', async () => {
    readPharnConfig.mockReturnValue(config);
    fetchRemoteManifest.mockResolvedValue(manifest('0.68.0'));
    await runUpdate();
    expect(prompts.outro).toHaveBeenCalledWith(
      'Already up to date (skills v0.68.0).',
    );
    expect(fetchAndInstall).not.toHaveBeenCalled();
  });

  it('re-fetches modules after confirmation', async () => {
    readPharnConfig.mockReturnValue(config);
    fetchRemoteManifest.mockResolvedValue(manifest('0.68.1', '0.3.0'));
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    fetchAndInstall.mockResolvedValue({
      skillsVersion: '0.68.1',
      commit: 'new',
      resolved: [{ name: 'pharn-core', version: '0.3.0' }],
    });

    await runUpdate();

    expect(prompts.note).toHaveBeenCalled();
    expect(fetchAndInstall).toHaveBeenCalledWith({
      claudeDir: '/proj/.claude',
      selected: ['pharn-core'],
      wizardSkills: [],
    });
    expect(writePharnConfig).toHaveBeenCalled();
  });

  it('cancels when the user declines', async () => {
    readPharnConfig.mockReturnValue(config);
    fetchRemoteManifest.mockResolvedValue(manifest('0.68.1'));
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(0));
    expect(fetchAndInstall).not.toHaveBeenCalled();
  });

  it('exits(1) when the manifest check fails', async () => {
    readPharnConfig.mockReturnValue(config);
    fetchRemoteManifest.mockRejectedValue(new Error('offline'));
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
  });

  it('exits(1) when re-fetching modules fails', async () => {
    readPharnConfig.mockReturnValue(config);
    fetchRemoteManifest.mockResolvedValue(manifest('0.68.1', '0.3.0'));
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    fetchAndInstall.mockRejectedValue(new Error('boom'));
    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(1));
  });

  it('re-resolves installed skills, dropping ones that no longer exist upstream', async () => {
    readPharnConfig.mockReturnValue({
      ...config,
      installedSkills: [
        { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
        { skill: 'ghost', from: 'pharn-skills-orm/skills/ghost' },
      ],
    });
    fetchRemoteManifest.mockResolvedValue(v2Manifest());
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    fetchAndInstall.mockResolvedValue({
      skillsVersion: '0.69.0',
      commit: 'new',
      resolved: [{ name: 'pharn-core', version: '0.2.0' }],
      installedSkills: [],
    });

    await runUpdate();

    // ghost has no matching wizard option → reported and dropped.
    expect(prompts.log.warn).toHaveBeenCalled();
    const [[opts]] = fetchAndInstall.mock.calls as unknown as [
      [{ wizardSkills: { skill: string }[] }],
    ];
    expect(opts.wizardSkills.map((s) => s.skill)).toEqual(['drizzle']);
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect((written as PharnConfig).installedSkills).toEqual([
      { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
    ]);
  });
});

describe('runUpdate (archetype)', () => {
  stubProcessExit();
  beforeEach(() => vi.spyOn(process, 'cwd').mockReturnValue('/proj'));
  afterEach(() => vi.clearAllMocks());

  const archConfig: PharnConfig = {
    ...config,
    skillsVersion: '1.0.0',
    modules: [],
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller' }],
  };

  it('reports already up to date without cloning', async () => {
    readPharnConfig.mockReturnValue(archConfig);
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    await runUpdate();

    expect(prompts.outro).toHaveBeenCalledWith(
      'Already up to date (skills v1.0.0).',
    );
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(fetchRemoteManifest).not.toHaveBeenCalled();
  });

  it('re-resolves + re-copies capabilities after confirmation', async () => {
    readPharnConfig.mockReturnValue(archConfig);
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    parseCapabilityIndex.mockReturnValue({ capabilities: [] });
    resolveCapabilities.mockReturnValue({
      selected: [
        { name: 'a11y', role: 'griller', matched: ['ssr'] },
        { name: 'security', role: 'griller', matched: 'universal' },
      ],
      skipped: [],
    });
    readSkillsVersion.mockReturnValue('1.1.0');
    fetchCommitSha.mockResolvedValue('sha');

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
    readPharnConfig.mockReturnValue(archConfig);
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    vi.mocked(prompts.confirm).mockResolvedValue(false);

    await expect(runUpdate()).rejects.toMatchObject(new ProcessExit(0));
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(installCapabilities).not.toHaveBeenCalled();
  });
});
