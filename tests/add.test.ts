import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  groupMultiselect: vi.fn(),
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

// capability-address.js and capability-picker.js are intentionally NOT mocked —
// add uses the real parseCapabilityArg (name / role:name parsing) and the real
// buildAddSelection / interactiveAllowed (available = index − installed).
const { runAdd } = await import('../src/commands/add.js');
const prompts = await import('@clack/prompts');

// process.std*.isTTY drives the bare-invocation guard; set it per test, restore
// after (Node reports undefined off a TTY, which reads as non-interactive).
const origStdin = process.stdin.isTTY;
const origStdout = process.stdout.isTTY;
function setTTY(stdin?: boolean, stdout?: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', {
    value: stdin,
    configurable: true,
  });
  Object.defineProperty(process.stdout, 'isTTY', {
    value: stdout,
    configurable: true,
  });
}

describe('runAdd (archetype)', () => {
  stubProcessExit();
  beforeEach(() => vi.spyOn(process, 'cwd').mockReturnValue('/proj'));
  afterEach(() => {
    vi.clearAllMocks();
    setTTY(origStdin, origStdout);
  });

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

  it('exits(1) on an invalid role prefix, before any fetch', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    await expect(runAdd('bogus:x')).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  // --- bare `pharn add` (no arg): interactive picker / non-TTY guard ----------

  it('no-arg in a NON-TTY exits(1) before any fetch (never prompts)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    setTTY(false, false);

    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));

    expect(fetchRepo).not.toHaveBeenCalled();
    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
  });

  it('no-arg in a TTY installs each pick via the per-name path, threading config', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig()); // installed: security
    mockClone();
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue([
      'griller:a11y',
      'lens:n-plus-one',
    ]);

    await runAdd(undefined);

    expect(installCapabilityDirs).toHaveBeenNthCalledWith(1, '/repo', '/proj', [
      { name: 'a11y', role: 'griller' },
    ]);
    expect(installCapabilityDirs).toHaveBeenNthCalledWith(2, '/repo', '/proj', [
      { name: 'n-plus-one', role: 'lens' },
    ]);
    // grill F1: the FINAL persisted config holds ALL picks, not just the last.
    const written = writePharnConfig.mock.calls.at(-1)![1] as PharnConfig;
    expect(written.capabilities).toEqual([
      { name: 'security', role: 'griller' },
      { name: 'a11y', role: 'griller' },
      { name: 'n-plus-one', role: 'lens' },
    ]);
  });

  it('no-arg in a TTY with everything installed exits 0 without prompting', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      archConfig([
        { name: 'a11y', role: 'griller' },
        { name: 'security', role: 'griller' },
        { name: 'n-plus-one', role: 'lens' },
      ]),
    );
    const cleanup = mockClone();
    setTTY(true, true);

    await runAdd(undefined);

    expect(prompts.groupMultiselect).not.toHaveBeenCalled();
    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith(
      'All available capabilities are already installed.',
    );
    expect(cleanup).toHaveBeenCalled();
  });

  it('no-arg in a TTY with an empty selection installs nothing (no config write)', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(archConfig());
    mockClone();
    setTTY(true, true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue([]);

    await runAdd(undefined);

    expect(installCapabilityDirs).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });
});
