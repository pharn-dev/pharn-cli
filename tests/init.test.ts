import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), error: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));
vi.mock('../src/lib/banner.js', () => ({ showBanner: vi.fn() }));

const fetchRemoteManifest = vi.fn();
const categorizeModules = vi.fn(() => ({
  core: [],
  optional: [],
  stackPacks: [],
}));
const resolveModules = vi.fn(() => []);
vi.mock('../src/lib/manifest.js', () => ({
  fetchRemoteManifest,
  categorizeModules,
  resolveModules,
}));

const runGitPrereq = vi.fn();
const assertPrerequisites = vi.fn();
const runFreshCheck = vi.fn(async () => undefined);
const runModuleSelect = vi.fn(async () => [] as string[]);
const runStackPackSelect = vi.fn(async () => null);
const runConstitutionSelect = vi.fn(async () => 'standard' as const);
const runMultiTenantSelect = vi.fn(async () => true);
const runSummary = vi.fn();
const runInstall = vi.fn(async () => undefined);
vi.mock('../src/steps/prereqs.js', () => ({
  runGitPrereq,
  assertPrerequisites,
}));
vi.mock('../src/steps/fresh-check.js', () => ({ runFreshCheck }));
vi.mock('../src/steps/module-select.js', () => ({ runModuleSelect }));
vi.mock('../src/steps/stackpack-select.js', () => ({ runStackPackSelect }));
vi.mock('../src/steps/constitution-select.js', () => ({
  runConstitutionSelect,
}));
vi.mock('../src/steps/multitenant-select.js', () => ({ runMultiTenantSelect }));
vi.mock('../src/steps/summary.js', () => ({ runSummary }));
vi.mock('../src/steps/install.js', () => ({ runInstall }));

const { runInit } = await import('../src/commands/init.js');

const manifest = { schemaVersion: 1, skillsVersion: '0.68.1', modules: [] };

describe('runInit', () => {
  stubProcessExit();
  afterEach(() => vi.clearAllMocks());

  it('runs the wizard and installs', async () => {
    fetchRemoteManifest.mockResolvedValue(manifest);
    runSummary.mockResolvedValue('install');

    await runInit();

    expect(runGitPrereq).toHaveBeenCalled();
    // Package prerequisites are checked on the install path, not up front.
    expect(assertPrerequisites).toHaveBeenCalledTimes(1);
    expect(runInstall).toHaveBeenCalledTimes(1);
  });

  it('loops back then installs, preserving previous answers', async () => {
    fetchRemoteManifest.mockResolvedValue(manifest);
    runSummary.mockResolvedValueOnce('back').mockResolvedValueOnce('install');

    await runInit();

    expect(runModuleSelect).toHaveBeenCalledTimes(2);
    expect(runInstall).toHaveBeenCalledTimes(1);
  });

  it('cancels from the summary', async () => {
    fetchRemoteManifest.mockResolvedValue(manifest);
    runSummary.mockResolvedValue('cancel');

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(0));
    expect(assertPrerequisites).not.toHaveBeenCalled();
    expect(runInstall).not.toHaveBeenCalled();
  });

  it('exits(1) when the manifest cannot be loaded', async () => {
    fetchRemoteManifest.mockRejectedValue(new Error('offline'));

    await expect(runInit()).rejects.toMatchObject(new ProcessExit(1));
  });
});
