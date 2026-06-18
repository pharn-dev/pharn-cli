import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import type { WizardConfig } from '../src/types.js';

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

const fetchVendorSkills = vi.fn();
vi.mock('../src/lib/vendor-fetch.js', () => ({ fetchVendorSkills }));

const writePharnConfig = vi.fn();
const readPharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  configPath: (cwd: string) => `${cwd}/pharn.config.json`,
  readPharnConfig,
  writePharnConfig,
  toInstalledModules: (m: { name: string; version: string }[]) =>
    m.map(({ name, version }) => ({ name, version })),
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
    fetchVendorSkills.mockReset();
    fetchVendorSkills.mockResolvedValue({
      fetched: [],
      manual: [],
      failed: [],
    });
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
    // Legacy install: the schemaVersion 2 fields are omitted entirely.
    expect(written.stackAnswers).toBeUndefined();
    expect(written.installedSkills).toBeUndefined();
    expect(written.vendorSkills).toBeUndefined();
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
      vendorSkills: [
        { name: 'supabase', source: 'github:acme/supabase' },
        { name: 'stripe', source: null },
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
    // The consented vendor skills (name + source) are passed to the fetcher;
    // only their names are persisted to pharn.config.json.
    expect(fetchVendorSkills).toHaveBeenCalledWith(
      '/proj/.claude',
      v2Config.vendorSkills,
    );
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect(written.stackAnswers).toEqual(v2Config.stackAnswers);
    expect(written.installedSkills).toEqual(v2Config.installedSkills);
    expect(written.vendorSkills).toEqual(['supabase', 'stripe']);
  });

  it('still writes the config when a vendor fetch fails (non-fatal)', async () => {
    existsSync.mockReturnValue(false);
    fetchAndInstall.mockResolvedValue(okResult);
    fetchVendorSkills.mockResolvedValue({
      fetched: [],
      manual: [],
      failed: [{ name: 'supabase', message: '404' }],
    });
    const v2Config: WizardConfig = {
      ...config,
      vendorSkills: [{ name: 'supabase', source: 'github:acme/supabase' }],
    };

    await runInstall(v2Config);

    expect(prompts.log.warn).toHaveBeenCalled();
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect(written.vendorSkills).toEqual(['supabase']);
    expect(prompts.outro).toHaveBeenCalled();
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

  it('exits(1) when the install fails', async () => {
    existsSync.mockReturnValue(false);
    fetchAndInstall.mockRejectedValue(new Error('network down'));

    await expect(runInstall(config)).rejects.toMatchObject(new ProcessExit(1));
    expect(prompts.log.error).toHaveBeenCalled();
  });
});
