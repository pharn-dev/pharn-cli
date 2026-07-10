import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

const diffInstalledCapabilities = vi.fn();
vi.mock('../src/lib/diff.js', () => ({ diffInstalledCapabilities }));

const loadArchetypeConfigOrExit = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({ loadArchetypeConfigOrExit }));

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
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller' }],
    ...extra,
  };
}

// The body string of the note() rendered under the given title.
function noteBody(title: string): string {
  const call = vi.mocked(prompts.note).mock.calls.find((c) => c[1] === title);
  return (call?.[0] as string | undefined) ?? '';
}

const CLEAN = { modified: [] as string[], missing: [] as string[], okCount: 5 };

describe('runStatus (archetype)', () => {
  stubProcessExit();
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    loadArchetypeConfigOrExit.mockReturnValue(config());
  });
  afterEach(() => vi.clearAllMocks());

  it('aborts before any fetch when the config is not an archetype install', async () => {
    // loadArchetypeConfigOrExit prints LEGACY_CONFIG_MESSAGE + exit(1) for a
    // legacy config (asserted in pharn-config.test.ts); here: no network.
    loadArchetypeConfigOrExit.mockImplementationOnce(() => {
      throw new ProcessExit(1);
    });
    await expect(runStatus()).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
  });

  it('--no-drift: version via SKILLS_VERSION fetch, no clone', async () => {
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    await runStatus({ drift: false });

    expect(fetchRemoteSkillsVersion).toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(noteBody('VERSION')).toContain('ssr');
    expect(noteBody('DRIFT')).toBe('');
  });

  it('--no-drift exits(1) when the SKILLS_VERSION fetch fails', async () => {
    fetchRemoteSkillsVersion.mockRejectedValueOnce(new Error('offline'));
    await expect(runStatus({ drift: false })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('default: clones, reads SKILLS_VERSION, diffs capabilities, cleans up', async () => {
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
    expect(noteBody('DRIFT')).toContain('No drift');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('exits(1) and cleans up when the clone cannot be fetched', async () => {
    fetchRepo.mockRejectedValueOnce(new Error('offline'));
    await expect(runStatus({})).rejects.toMatchObject(new ProcessExit(1));
    expect(diffInstalledCapabilities).not.toHaveBeenCalled();
  });

  it('passes the recorded layout: pharn through to the capability diff', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(config({ layout: 'pharn' }));
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

  it('a default (non-strict) run with drift resolves without exiting', async () => {
    const cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['pharn-pipeline/grillers/a11y/a11y.md'],
      missing: [],
      okCount: 3,
    });

    await expect(runStatus({})).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('--no-drift --strict exits(1) when the version is behind', async () => {
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    await expect(
      runStatus({ strict: true, drift: false }),
    ).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });
});
