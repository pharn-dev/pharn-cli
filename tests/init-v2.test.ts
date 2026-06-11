import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';
import { v2Manifest } from './wizard-fixture.js';
import type { WizardConfig } from '../src/types.js';

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

// Real wizard.js (applyDefaults/collectInstalls/collectVendorSkills) runs.
const runPrereqs = vi.fn();
const runFreshCheck = vi.fn(async () => undefined);
const runModeSelect = vi.fn();
const runWizardQuestions = vi.fn();
const runModuleSelect = vi.fn(async () => [] as string[]);
const runStackPackSelect = vi.fn(async () => null);
const runConstitutionSelect = vi.fn(async () => 'standard' as const);
const runVendorConsent = vi.fn(async (c: string[], _initial?: string[]) => c);
const runSummary = vi.fn();
const runInstall = vi.fn<(config: WizardConfig) => Promise<void>>(
  async () => undefined,
);
vi.mock('../src/steps/prereqs.js', () => ({ runPrereqs }));
vi.mock('../src/steps/fresh-check.js', () => ({ runFreshCheck }));
vi.mock('../src/steps/mode-select.js', () => ({ runModeSelect }));
vi.mock('../src/steps/wizard-questions.js', () => ({ runWizardQuestions }));
vi.mock('../src/steps/module-select.js', () => ({ runModuleSelect }));
vi.mock('../src/steps/stackpack-select.js', () => ({ runStackPackSelect }));
vi.mock('../src/steps/constitution-select.js', () => ({
  runConstitutionSelect,
}));
vi.mock('../src/steps/vendor-consent.js', () => ({ runVendorConsent }));
vi.mock('../src/steps/summary.js', () => ({ runSummary }));
vi.mock('../src/steps/install.js', () => ({ runInstall }));

const { runInit } = await import('../src/commands/init.js');

describe('runInit (schemaVersion 2)', () => {
  stubProcessExit();
  afterEach(() => vi.clearAllMocks());

  it('Default mode asks nothing per-tech and installs the wizard defaults', async () => {
    fetchRemoteManifest.mockResolvedValue(v2Manifest());
    runModeSelect.mockResolvedValue('default');
    runSummary.mockResolvedValue('install');

    await runInit();

    expect(runWizardQuestions).not.toHaveBeenCalled();
    expect(runInstall).toHaveBeenCalledTimes(1);
    const config = runInstall.mock.calls[0]![0];
    expect(config.stackAnswers).toEqual({
      database: 'supabase',
      orm: 'drizzle',
      auth: 'better-auth',
      email: 'resend',
      payments: 'stripe',
    });
    // supabase carries a vendorSkill; drizzle/better-auth/resend/stripe install.
    expect(config.vendorSkills).toEqual(['supabase']);
    expect(config.installedSkills?.map((s) => s.skill)).toEqual([
      'drizzle',
      'better-auth',
      'resend',
      'stripe',
    ]);
  });

  it('Custom mode renders the wizard questions', async () => {
    fetchRemoteManifest.mockResolvedValue(v2Manifest());
    runModeSelect.mockResolvedValue('custom');
    runWizardQuestions.mockResolvedValue({
      database: 'neon',
      orm: 'prisma',
      auth: 'clerk',
      email: 'skip',
      payments: 'skip',
    });
    runSummary.mockResolvedValue('install');

    await runInit();

    expect(runWizardQuestions).toHaveBeenCalledTimes(1);
    const config = runInstall.mock.calls[0]![0];
    expect(config.installedSkills?.map((s) => s.skill)).toEqual([
      'neon',
      'prisma',
      'clerk',
    ]);
  });

  it('preserves vendor consent across a summary loop-back', async () => {
    fetchRemoteManifest.mockResolvedValue(v2Manifest());
    runModeSelect.mockResolvedValue('default');
    runSummary.mockResolvedValueOnce('back').mockResolvedValueOnce('install');

    await runInit();

    expect(runVendorConsent).toHaveBeenCalledTimes(2);
    expect(runVendorConsent.mock.calls[0]![1]).toBeUndefined();
    expect(runVendorConsent.mock.calls[1]![1]).toEqual(['supabase']);
  });

  it('cancels from the summary', async () => {
    fetchRemoteManifest.mockResolvedValue(v2Manifest());
    runModeSelect.mockResolvedValue('default');
    runSummary.mockResolvedValue('cancel');
    await expect(runInit()).rejects.toMatchObject(new ProcessExit(0));
    expect(runInstall).not.toHaveBeenCalled();
  });
});
