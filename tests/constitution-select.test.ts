import { describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  select: vi.fn(),
  log: { info: vi.fn() },
}));

const { runConstitutionSelect } =
  await import('../src/steps/constitution-select.js');
const prompts = await import('@clack/prompts');

describe('runConstitutionSelect', () => {
  stubProcessExit();

  it.each(['gdpr-strict', 'standard', 'minimal'] as const)(
    'returns the %s variant',
    async (variant) => {
      vi.mocked(prompts.select).mockResolvedValue(variant);
      await expect(runConstitutionSelect()).resolves.toBe(variant);
    },
  );

  it('exits when the prompt is cancelled', async () => {
    vi.mocked(prompts.select).mockResolvedValue(CANCEL);
    await expect(runConstitutionSelect()).rejects.toMatchObject(
      new ProcessExit(0),
    );
  });
});
