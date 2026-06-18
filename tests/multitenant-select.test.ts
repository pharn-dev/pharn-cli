import { describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  log: { info: vi.fn() },
}));

const { runMultiTenantSelect } =
  await import('../src/steps/multitenant-select.js');
const prompts = await import('@clack/prompts');

describe('runMultiTenantSelect', () => {
  stubProcessExit();

  it.each([true, false])('returns the answer (%s)', async (answer) => {
    vi.mocked(prompts.confirm).mockResolvedValue(answer);
    await expect(runMultiTenantSelect()).resolves.toBe(answer);
  });

  it('defaults to true (keeps Principle 2)', async () => {
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await runMultiTenantSelect();
    expect(prompts.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: true }),
    );
  });

  it('seeds the initial value from the prior answer', async () => {
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await runMultiTenantSelect(false);
    expect(prompts.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: false }),
    );
  });

  it('exits when the prompt is cancelled', async () => {
    vi.mocked(prompts.confirm).mockResolvedValue(CANCEL);
    await expect(runMultiTenantSelect()).rejects.toMatchObject(
      new ProcessExit(0),
    );
  });
});
