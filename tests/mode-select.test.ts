import { describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  select: vi.fn(),
  log: { info: vi.fn() },
}));

const { runModeSelect } = await import('../src/steps/mode-select.js');
const prompts = await import('@clack/prompts');

describe('runModeSelect', () => {
  stubProcessExit();

  it.each(['default', 'custom'] as const)('returns %s', async (mode) => {
    vi.mocked(prompts.select).mockResolvedValue(mode);
    await expect(runModeSelect()).resolves.toBe(mode);
  });

  it('exits when cancelled', async () => {
    vi.mocked(prompts.select).mockResolvedValue(CANCEL);
    await expect(runModeSelect()).rejects.toMatchObject(new ProcessExit(0));
  });
});
