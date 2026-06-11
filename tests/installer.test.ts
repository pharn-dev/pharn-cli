import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManifestModule } from '../src/types.js';

const cleanup = vi.fn();
const fetchRepo = vi.fn(async () => ({ dir: '/tmp/repo', cleanup }));
const fetchCommitSha = vi.fn(async () => 'sha123');
const readManifest = vi.fn(() => ({
  schemaVersion: 1,
  skillsVersion: '0.68.1',
  modules: [],
}));
const resolved: ManifestModule[] = [
  {
    name: 'pharn-core',
    version: '0.2.0',
    required: true,
    dependsOn: [],
    description: 'core',
  },
];
const resolveModules = vi.fn(() => resolved);
const installModule = vi.fn();
const installSkills = vi.fn();
const assertSkillSourcesExist = vi.fn();
const materializeCore = vi.fn();

vi.mock('../src/lib/repo.js', () => ({ fetchRepo, fetchCommitSha }));
vi.mock('../src/lib/manifest.js', () => ({ readManifest, resolveModules }));
vi.mock('../src/lib/install-modules.js', () => ({
  installModule,
  installSkills,
  assertSkillSourcesExist,
  materializeCore,
}));

const { fetchAndInstall } = await import('../src/lib/installer.js');

describe('fetchAndInstall', () => {
  afterEach(() => vi.clearAllMocks());

  it('installs each resolved module and materializes core when a constitution is given', async () => {
    const result = await fetchAndInstall({
      claudeDir: '/proj/.claude',
      selected: [],
      constitution: 'standard',
    });

    expect(installModule).toHaveBeenCalledTimes(resolved.length);
    expect(installModule).toHaveBeenCalledWith(
      '/tmp/repo',
      '/proj/.claude',
      resolved[0],
    );
    expect(materializeCore).toHaveBeenCalledWith(
      '/tmp/repo',
      '/proj/.claude',
      'standard',
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      skillsVersion: '0.68.1',
      commit: 'sha123',
      resolved,
      installedSkills: [],
    });
  });

  it('skips materializeCore when no constitution is given', async () => {
    await fetchAndInstall({ claudeDir: '/proj/.claude', selected: [] });
    expect(materializeCore).not.toHaveBeenCalled();
  });

  it('validates skill sources before any module copy, then installs them', async () => {
    const wizardSkills = [
      { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
    ];
    const result = await fetchAndInstall({
      claudeDir: '/proj/.claude',
      selected: [],
      wizardSkills,
    });

    expect(assertSkillSourcesExist).toHaveBeenCalledWith(
      '/tmp/repo',
      wizardSkills,
    );
    expect(installSkills).toHaveBeenCalledWith(
      '/tmp/repo',
      '/proj/.claude',
      wizardSkills,
    );
    expect(result.installedSkills).toEqual(wizardSkills);
  });

  it('fails before copying any module when a skill source is missing', async () => {
    assertSkillSourcesExist.mockImplementationOnce(() => {
      throw new Error('missing skill source');
    });
    await expect(
      fetchAndInstall({
        claudeDir: '/proj/.claude',
        selected: [],
        wizardSkills: [
          { skill: 'ghost', from: 'pharn-skills-orm/skills/ghost' },
        ],
      }),
    ).rejects.toThrow('missing skill source');
    expect(installModule).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('always cleans up, even when a module fails to install', async () => {
    installModule.mockImplementationOnce(() => {
      throw new Error('copy failed');
    });
    await expect(
      fetchAndInstall({ claudeDir: '/proj/.claude', selected: [] }),
    ).rejects.toThrow('copy failed');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
