import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';
import type { Manifest, PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRemoteManifest = vi.fn();
const readManifest = vi.fn();
const resolveModules = vi.fn();
vi.mock('../src/lib/manifest.js', () => ({
  fetchRemoteManifest,
  readManifest,
  resolveModules,
}));

const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

const diffInstalled = vi.fn();
const diffInstalledCapabilities = vi.fn();
vi.mock('../src/lib/diff.js', () => ({
  diffInstalled,
  diffInstalledCapabilities,
}));

const loadConfigOrExit = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  loadConfigOrExit,
  isArchetypeConfig: (c: PharnConfig) => Array.isArray(c.capabilities),
}));

const fetchRemoteSkillsVersion = vi.fn();
const readSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', () => ({
  fetchRemoteSkillsVersion,
  readSkillsVersion,
}));

const { runStatus } = await import('../src/commands/status.js');
const prompts = await import('@clack/prompts');

function config(extra: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.2.0',
    skillsVersion: '0.68.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    constitution: 'standard',
    modules: [{ name: 'pharn-core', version: '0.1.0' }],
    installedAt: '2026-06-11T00:00:00.000Z',
    ...extra,
  };
}

function manifest(skillsVersion = '0.68.0', coreVersion = '0.1.0'): Manifest {
  return {
    schemaVersion: 2,
    skillsVersion,
    modules: [
      {
        name: 'pharn-core',
        version: coreVersion,
        required: true,
        dependsOn: [],
        description: 'core',
      },
    ],
  };
}

// The body string of the note() rendered under the given title.
function noteBody(title: string): string {
  const call = vi.mocked(prompts.note).mock.calls.find((c) => c[1] === title);
  return (call?.[0] as string | undefined) ?? '';
}

const CLEAN = { modified: [] as string[], missing: [] as string[], okCount: 5 };

describe('runStatus', () => {
  stubProcessExit();
  let cleanup: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    cleanup = vi.fn();
    loadConfigOrExit.mockReturnValue(config());
    fetchRepo.mockResolvedValue({ dir: '/clone', cleanup });
    readManifest.mockReturnValue(manifest());
    fetchRemoteManifest.mockResolvedValue(manifest());
    resolveModules.mockReturnValue([{ name: 'pharn-core', version: '0.1.0' }]);
    diffInstalled.mockReturnValue(CLEAN);
  });
  afterEach(() => vi.clearAllMocks());

  it('exits(1) when there is no config', async () => {
    loadConfigOrExit.mockImplementationOnce(() => {
      throw new ProcessExit(1);
    });
    await expect(runStatus()).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(fetchRemoteManifest).not.toHaveBeenCalled();
  });

  it('exits(1) when the clone cannot be fetched', async () => {
    fetchRepo.mockRejectedValueOnce(new Error('offline'));
    await expect(runStatus()).rejects.toMatchObject(new ProcessExit(1));
    expect(diffInstalled).not.toHaveBeenCalled();
  });

  it('cleans up the clone and exits(1) when reading the manifest fails', async () => {
    readManifest.mockImplementationOnce(() => {
      throw new Error('bad manifest');
    });
    await expect(runStatus()).rejects.toMatchObject(new ProcessExit(1));
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('prints both sections and cleans up on a normal run', async () => {
    diffInstalled.mockReturnValue({
      modified: ['commands/x.md'],
      missing: ['skills/prisma/SKILL.md'],
      okCount: 3,
    });
    await runStatus();
    expect(noteBody('VERSION')).toContain('Skills version');
    const drift = noteBody('DRIFT');
    expect(drift).toContain('commands/x.md');
    expect(drift).toContain('skills/prisma/SKILL.md');
    expect(drift).toContain('LOCALLY MODIFIED');
    expect(drift).toContain('MISSING');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('reports "No drift" when nothing differs', async () => {
    await runStatus();
    expect(noteBody('DRIFT')).toContain('No drift');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('flags an available update in the version section', async () => {
    readManifest.mockReturnValue(manifest('0.69.0'));
    await runStatus();
    expect(noteBody('VERSION')).toContain('update available');
  });

  it('lists per-module version bumps in the version section', async () => {
    readManifest.mockReturnValue(manifest('0.69.0', '0.2.0'));
    await runStatus();
    const version = noteBody('VERSION');
    expect(version).toContain('MODULE UPDATES');
    expect(version).toContain('pharn-core');
    expect(version).toContain('v0.1.0 → v0.2.0');
  });

  it('--no-drift exits(1) when the manifest fetch fails', async () => {
    fetchRemoteManifest.mockRejectedValueOnce(new Error('offline'));
    await expect(runStatus({ drift: false })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('--no-drift skips the clone and prints only the version section', async () => {
    await runStatus({ drift: false });
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(diffInstalled).not.toHaveBeenCalled();
    expect(fetchRemoteManifest).toHaveBeenCalledTimes(1);
    expect(noteBody('VERSION')).toContain('Skills version');
    expect(noteBody('DRIFT')).toBe('');
  });

  it('--strict exits(1) when drift is present (and still cleans up)', async () => {
    diffInstalled.mockReturnValue({
      modified: ['commands/x.md'],
      missing: [],
      okCount: 1,
    });
    await expect(runStatus({ strict: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('a default (non-strict) run with drift resolves without exiting', async () => {
    diffInstalled.mockReturnValue({
      modified: ['commands/x.md'],
      missing: [],
      okCount: 1,
    });
    await expect(runStatus()).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('--no-drift --strict exits(1) when the version is behind', async () => {
    fetchRemoteManifest.mockResolvedValue(manifest('0.69.0'));
    await expect(
      runStatus({ strict: true, drift: false }),
    ).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });
});

describe('runStatus (archetype)', () => {
  stubProcessExit();
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
  });
  afterEach(() => vi.clearAllMocks());

  const archConfig = (): PharnConfig =>
    config({
      skillsVersion: '1.0.0',
      modules: [],
      archetypes: ['ssr'],
      capabilities: [{ name: 'a11y', role: 'griller' }],
    });

  it('--no-drift: version via SKILLS_VERSION fetch, no manifest fetch, no clone', async () => {
    loadConfigOrExit.mockReturnValue(archConfig());
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    await runStatus({ drift: false });

    expect(fetchRemoteSkillsVersion).toHaveBeenCalled();
    expect(fetchRemoteManifest).not.toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(noteBody('VERSION')).toContain('ssr');
  });

  it('default: clones, reads SKILLS_VERSION, diffs capabilities, cleans up', async () => {
    loadConfigOrExit.mockReturnValue(archConfig());
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(CLEAN);

    await runStatus({});

    expect(readSkillsVersion).toHaveBeenCalledWith('/repo');
    expect(diffInstalledCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({
        repoDir: '/repo',
        projectRoot: '/proj',
        // No recorded layout → flat, the safe default (P7).
        layout: 'flat',
      }),
    );
    // The legacy module-diff path is not taken for an archetype config.
    expect(diffInstalled).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('passes the recorded layout: pharn through to the capability diff', async () => {
    loadConfigOrExit.mockReturnValue(
      config({
        skillsVersion: '1.0.0',
        modules: [],
        archetypes: ['ssr'],
        capabilities: [{ name: 'a11y', role: 'griller' }],
        layout: 'pharn',
      }),
    );
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(CLEAN);

    await runStatus({});

    expect(diffInstalledCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({ layout: 'pharn' }),
    );
    expect(cleanup).toHaveBeenCalled();
  });

  it('--strict exits 1 on capability drift, cleaning up first', async () => {
    loadConfigOrExit.mockReturnValue(archConfig());
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['pharn-pipeline/grillers/a11y/a11y.md'],
      missing: [],
      okCount: 3,
    });

    await expect(runStatus({ strict: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(cleanup).toHaveBeenCalled();
  });
});
