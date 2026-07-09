import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import type { WizardConfig } from '../src/types.js';
import {
  DEFAULT_MODEL_ROUTING,
  ModelRoutingError,
} from '../src/lib/model-routing.js';
import { SeamConfigError } from '../src/lib/seam-config.js';

const { existsSync } = vi.hoisted(() => ({ existsSync: vi.fn() }));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync,
}));

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchAndInstall = vi.fn();
vi.mock('../src/lib/installer.js', () => ({ fetchAndInstall }));

const writePharnConfig = vi.fn();
const readPharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  configPath: (cwd: string) => `${cwd}/pharn.config.json`,
  readPharnConfig,
  writePharnConfig,
  toInstalledModules: (m: { name: string; version: string }[]) =>
    m.map(({ name, version }) => ({ name, version })),
  // Real config-error discriminator so the invalid-existing-config branch is faithful.
  isConfigValidationError: (e: unknown) =>
    e instanceof ModelRoutingError || e instanceof SeamConfigError,
}));

const { runInstall } = await import('../src/steps/install.js');
const prompts = await import('@clack/prompts');

const config: WizardConfig = {
  modules: ['pharn-pipeline'],
  stackPack: 'pharn-stack-nextjs',
  constitution: 'standard',
  isMultiTenant: true,
};

const okResult = {
  skillsVersion: '0.68.1',
  commit: 'deadbeef',
  resolved: [
    { name: 'pharn-core', version: '0.2.0' },
    { name: 'pharn-pipeline', version: '0.5.0' },
  ],
};

describe('runInstall', () => {
  stubProcessExit();
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    fetchAndInstall.mockReset();
    writePharnConfig.mockReset();
    readPharnConfig.mockReset();
    existsSync.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('installs and writes the config when none exists', async () => {
    existsSync.mockReturnValue(false);
    fetchAndInstall.mockResolvedValue(okResult);

    await runInstall(config);

    expect(fetchAndInstall).toHaveBeenCalledWith({
      claudeDir: '/proj/.claude',
      selected: ['pharn-pipeline', 'pharn-stack-nextjs'],
      constitution: 'standard',
      isMultiTenant: true,
    });
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect(written).toMatchObject({
      skillsVersion: '0.68.1',
      commit: 'deadbeef',
      repo: 'pharn-dev/pharn-oss',
      constitution: 'standard',
      isMultiTenant: true,
      modules: [
        { name: 'pharn-core', version: '0.2.0' },
        { name: 'pharn-pipeline', version: '0.5.0' },
      ],
    });
    // Model routing is written on every fresh install with sensible defaults.
    expect(written.models).toEqual(DEFAULT_MODEL_ROUTING);
    // Legacy install: the schemaVersion 2 fields are omitted entirely.
    expect(written.stackAnswers).toBeUndefined();
    expect(written.installedSkills).toBeUndefined();
    expect(prompts.outro).toHaveBeenCalled();
  });

  it('persists the schemaVersion 2 fields and passes skills to fetchAndInstall', async () => {
    existsSync.mockReturnValue(false);
    fetchAndInstall.mockResolvedValue(okResult);
    const v2Config: WizardConfig = {
      modules: ['pharn-pipeline'],
      stackPack: 'pharn-stack-nextjs',
      constitution: 'standard',
      isMultiTenant: true,
      stackAnswers: { database: 'supabase', orm: 'drizzle', payments: 'skip' },
      installedSkills: [
        { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
        { skill: 'stripe', from: 'pharn-skills-payments/skills/stripe' },
      ],
    };

    await runInstall(v2Config);

    expect(fetchAndInstall).toHaveBeenCalledWith({
      claudeDir: '/proj/.claude',
      selected: ['pharn-pipeline', 'pharn-stack-nextjs'],
      constitution: 'standard',
      wizardSkills: v2Config.installedSkills,
      isMultiTenant: true,
    });
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect(written.stackAnswers).toEqual(v2Config.stackAnswers);
    expect(written.installedSkills).toEqual(v2Config.installedSkills);
  });

  it('forwards and persists isMultiTenant: false', async () => {
    existsSync.mockReturnValue(false);
    fetchAndInstall.mockResolvedValue(okResult);

    await runInstall({ ...config, isMultiTenant: false });

    expect(fetchAndInstall).toHaveBeenCalledWith(
      expect.objectContaining({ isMultiTenant: false }),
    );
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect(written.isMultiTenant).toBe(false);
  });

  it('overwrites after confirmation when a config already exists', async () => {
    existsSync.mockReturnValue(true);
    readPharnConfig.mockReturnValue({ skillsVersion: '0.1.0' });
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    fetchAndInstall.mockResolvedValue(okResult);

    await runInstall(config);

    expect(prompts.log.info).toHaveBeenCalled();
    expect(writePharnConfig).toHaveBeenCalled();
  });

  it('cancels when the user declines to overwrite', async () => {
    existsSync.mockReturnValue(true);
    readPharnConfig.mockReturnValue({ skillsVersion: '0.1.0' });
    vi.mocked(prompts.confirm).mockResolvedValue(false);

    await expect(runInstall(config)).rejects.toMatchObject(new ProcessExit(0));
    expect(fetchAndInstall).not.toHaveBeenCalled();
  });

  it('warns (naming it) and still offers overwrite when the existing config is INVALID (BUG 1)', async () => {
    // Mirrors init.ts's confirmOverwriteIfExists (identical tolerate-and-warn
    // branch): a present-but-invalid config must be NAMED, never crash and never
    // be silently treated as absent (then clobbered).
    existsSync.mockReturnValue(true);
    readPharnConfig.mockImplementationOnce(() => {
      throw new SeamConfigError('seam.resolutionOrder must contain "ask"');
    });
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    fetchAndInstall.mockResolvedValue(okResult);

    await runInstall(config);

    const warn = String(vi.mocked(prompts.log.warn).mock.calls[0]?.[0] ?? '');
    expect(warn).toMatch(/invalid/);
    expect(warn).toMatch(/ask/);
    expect(writePharnConfig).toHaveBeenCalled(); // proceeded, did not crash
  });

  it('exits(1) when the install fails', async () => {
    existsSync.mockReturnValue(false);
    fetchAndInstall.mockRejectedValue(new Error('network down'));

    await expect(runInstall(config)).rejects.toMatchObject(new ProcessExit(1));
    expect(prompts.log.error).toHaveBeenCalled();
  });
});
