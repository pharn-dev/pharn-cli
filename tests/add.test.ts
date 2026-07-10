import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

const parseCapabilityIndex = vi.fn();
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const installCapabilityDirs = vi.fn();
vi.mock('../src/lib/install-capabilities.js', () => ({
  installCapabilityDirs,
}));

const readSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', () => ({ readSkillsVersion }));

const loadArchetypeConfigOrExit = vi.fn();
const writePharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  loadArchetypeConfigOrExit,
  writePharnConfig,
}));

// capability-address.js is intentionally NOT mocked — add uses the real
// parseCapabilityArg (name / role:name parsing).
const { runAdd } = await import('../src/commands/add.js');
const prompts = await import('@clack/prompts');

describe('runAdd (archetype)', () => {
  stubProcessExit();
  beforeEach(() => vi.spyOn(process, 'cwd').mockReturnValue('/proj'));
  afterEach(() => vi.clearAllMocks());

  const archConfig = (
    caps: { name: string; role: 'griller' | 'lens' }[] = [
      { name: 'security', role: 'griller' },
    ],
  ): PharnConfig => ({
    pharnVersion: '0.2.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    modules: [],
    installedAt: '2026-07-07T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: caps,
  });

  const index = {
    capabilities: [
      { name: 'a11y', role: 'griller', applies: ['ssr', 'spa'] },
      { name: 'security', role: 'griller', applies: 'universal' },
      { name: 'n-plus-one', role: 'lens', applies: ['backend', 'ssr'] },
    ],
  };

  function mockClone(): ReturnType<typeof vi.fn> {
    const cleanup = vi.fn();
    // fetchRepo carries the pinned SHA; the archetype-add path records repo.sha
    // as `commit`, no separate fetch.
    fetchRepo.mockResolvedValue({ dir: '/repo', sha: 'sha', cleanup });
    parseCapabilityIndex.mockReturnValue(index);
    readSkillsVersion.mockReturnValue('1.0.0');
    return cleanup;
  }

  it('aborts before any fetch when the config is not an archetype install', async () => {
    // loadArchetypeConfigOrExit prints LEGACY_CONFIG_MESSAGE + exit(1) for a
    // legacy config (asserted in pharn-config.test.ts); here: no network.
    loadArchetypeConfigOrExit.mockImplementationOnce(() => {
      throw new ProcessExit(1);
    });
    await expect(runAdd('a11y')).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('installs a capability by name and appends it (archetypes untouched)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    const cleanup = mockClone();

    await runAdd('a11y');

    expect(installCapabilityDirs).toHaveBeenCalledWith('/repo', '/proj', [
      { name: 'a11y', role: 'griller' },
    ]);
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect((written as PharnConfig).capabilities).toEqual([
      { name: 'security', role: 'griller' },
      { name: 'a11y', role: 'griller' },
    ]);
    expect((written as PharnConfig).archetypes).toEqual(['ssr']);
    expect(cleanup).toHaveBeenCalled();
  });

  it('resolves role:name addressing', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();

    await runAdd('lens:n-plus-one');

    expect(installCapabilityDirs).toHaveBeenCalledWith('/repo', '/proj', [
      { name: 'n-plus-one', role: 'lens' },
    ]);
  });

  it('is a no-op when the capability is already installed', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([{ name: 'a11y', role: 'griller' }]),
    );
    const cleanup = mockClone();

    await runAdd('a11y');

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith('a11y is already installed.');
    expect(cleanup).toHaveBeenCalled();
  });

  it('exits(1) listing valid capabilities for an unknown name (cleans up)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    const cleanup = mockClone();

    await expect(runAdd('bogus')).rejects.toMatchObject(new ProcessExit(1));

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('exits(1) with no arg, before any fetch', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('exits(1) on an invalid role prefix, before any fetch', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    await expect(runAdd('bogus:x')).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });
});
