import { describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import type { ManifestModule, WizardConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  note: vi.fn(),
  select: vi.fn(),
  log: { info: vi.fn() },
}));

const { runSummary } = await import('../src/steps/summary.js');
const prompts = await import('@clack/prompts');

const config: WizardConfig = {
  modules: ['pharn-pipeline'],
  stackPack: 'pharn-stack-nextjs',
  constitution: 'standard',
};
const resolved: ManifestModule[] = [
  {
    name: 'pharn-core',
    version: '0.2.0',
    required: true,
    dependsOn: [],
    description: 'core',
  },
];

describe('runSummary', () => {
  stubProcessExit();

  it.each(['install', 'back', 'cancel'] as const)(
    'returns the %s action',
    async (action) => {
      vi.mocked(prompts.select).mockResolvedValue(action);
      await expect(runSummary(config, resolved, '0.68.1')).resolves.toBe(
        action,
      );
      expect(prompts.note).toHaveBeenCalled();
    },
  );

  it('exits when the prompt is cancelled', async () => {
    vi.mocked(prompts.select).mockResolvedValue(CANCEL);
    await expect(runSummary(config, resolved, '0.68.1')).rejects.toMatchObject(
      new ProcessExit(0),
    );
  });

  it('renders the stack pack row (named pack and None)', async () => {
    vi.mocked(prompts.select).mockResolvedValue('install');
    await runSummary(config, resolved, '0.68.1');
    let note = vi.mocked(prompts.note).mock.calls.at(-1)![0] as string;
    expect(note).toContain('Stack pack');
    expect(note).toContain('pharn-stack-nextjs');

    await runSummary({ ...config, stackPack: null }, resolved, '0.68.1');
    note = vi.mocked(prompts.note).mock.calls.at(-1)![0] as string;
    expect(note).toMatch(/Stack pack\s+None/);
  });

  it('renders the skills and vendor blocks for a schemaVersion 2 config', async () => {
    vi.mocked(prompts.select).mockResolvedValue('install');
    const v2: WizardConfig = {
      ...config,
      stackAnswers: { orm: 'drizzle', database: 'supabase' },
      installedSkills: [
        { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
      ],
      vendorSkills: ['supabase'],
    };
    await runSummary(v2, resolved, '0.69.0');
    const note = vi.mocked(prompts.note).mock.calls.at(-1)![0] as string;
    expect(note).toContain('SKILLS (selected)');
    expect(note).toContain('drizzle');
    expect(note).toContain('VENDOR SKILLS (recorded)');
    expect(note).toContain('supabase');
  });
});
