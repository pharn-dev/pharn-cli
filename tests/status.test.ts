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

  // The DRIFT copy is the user's only pointer from "status found something" to
  // "here is what update will do about it" — it must not promise the old
  // overwrite-by-default behavior.
  it('describes the drift section as DIFFERS FROM @main, not "locally modified"', async () => {
    // The comparison is against upstream HEAD, so a file can differ because
    // UPSTREAM moved — status cannot tell that from a user edit.
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['CONSTITUTION.md'],
      missing: [],
      okCount: 3,
    });

    await runStatus({});

    const drift = noteBody('DRIFT');
    expect(drift).toContain('DIFFERS FROM pharn-dev/pharn-oss@main');
    expect(drift).not.toContain('LOCALLY MODIFIED');
  });

  it('tells the user their edits are KEPT, and names --force + the backup dir', async () => {
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: ['CONSTITUTION.md'],
      missing: [],
      okCount: 3,
    });

    await runStatus({});

    const drift = noteBody('DRIFT');
    expect(drift).toContain("keeps files you've edited");
    expect(drift).toContain('--force');
    expect(drift).toContain('.pharn-backup/');
    // The claim it replaced is gone.
    expect(drift).not.toContain('will overwrite these');
  });

  it('qualifies the MISSING hint with when update actually restores', async () => {
    // update early-returns at the current version, so an unqualified "re-run
    // pharn update to restore them" would be false for an up-to-date install.
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup: vi.fn() });
    readSkillsVersion.mockReturnValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue({
      modified: [],
      missing: ['.claude/hooks/set-writes-scope.cjs'],
      okCount: 3,
    });

    await runStatus({});

    const drift = noteBody('DRIFT');
    expect(drift).toContain('on the next version bump');
    expect(drift).toContain('pharn add');
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

  it('MODELS note renders the per-stage routing from config.models', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        models: {
          default: { model: 'sonnet-5', effort: 'high' },
          stages: { review: { model: 'opus-4-8', effort: 'high' } },
        },
      }),
    );
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');

    await runStatus({ drift: false });

    const models = noteBody('MODELS');
    expect(models).toContain('default   sonnet-5 · high');
    expect(models).toContain('review    opus-4-8 · high');
  });

  it('omits the MODELS note when config.models is absent (legacy archetype config)', async () => {
    // beforeEach returns config() with no `models` block.
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
    await runStatus({ drift: false });
    expect(noteBody('MODELS')).toBe('');
  });

  it('--no-drift --strict exits(1) when the version is behind', async () => {
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    await expect(
      runStatus({ strict: true, drift: false }),
    ).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });
});
