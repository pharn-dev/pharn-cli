import { describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import type { ManifestModule } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  multiselect: vi.fn(),
  log: { info: vi.fn() },
}));

const { runModuleSelect } = await import('../src/steps/module-select.js');
const prompts = await import('@clack/prompts');

const optional: ManifestModule[] = [
  {
    name: 'pharn-pipeline',
    version: '0.5.0',
    required: false,
    dependsOn: ['pharn-core'],
    description: 'plan → grill → build pipeline',
  },
];

describe('runModuleSelect', () => {
  stubProcessExit();

  it('returns [] without prompting when there are no optional modules', async () => {
    await expect(runModuleSelect([])).resolves.toEqual([]);
    expect(prompts.multiselect).not.toHaveBeenCalled();
  });

  it('returns the chosen module names', async () => {
    vi.mocked(prompts.multiselect).mockResolvedValue(['pharn-pipeline']);
    await expect(runModuleSelect(optional)).resolves.toEqual([
      'pharn-pipeline',
    ]);
  });

  it('exits when the prompt is cancelled', async () => {
    vi.mocked(prompts.multiselect).mockResolvedValue(CANCEL);
    await expect(runModuleSelect(optional)).rejects.toMatchObject(
      new ProcessExit(0),
    );
  });
});
