import { describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';

vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn() },
}));

const { cancelAndExit, warnAndConfirm } = await import('../src/lib/confirm.js');
const prompts = await import('@clack/prompts');

describe('cancelAndExit', () => {
  stubProcessExit();

  it('logs the default message and exits with code 0', () => {
    expect(() => cancelAndExit()).toThrow(new ProcessExit(0));
    expect(prompts.log.info).toHaveBeenCalledWith(
      'Cancelled. Nothing was changed.',
    );
  });

  it('forwards a custom message', () => {
    expect(() => cancelAndExit('bye')).toThrow(new ProcessExit(0));
    expect(prompts.log.info).toHaveBeenCalledWith('bye');
  });
});

describe('warnAndConfirm', () => {
  stubProcessExit();

  it('returns without exiting when the user confirms', async () => {
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await expect(warnAndConfirm('w', 'q', true)).resolves.toBeUndefined();
    expect(prompts.log.warn).toHaveBeenCalledWith('w');
  });

  it('exits when the user declines', async () => {
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(warnAndConfirm('w', 'q', true)).rejects.toMatchObject(
      new ProcessExit(0),
    );
  });

  it('exits when the prompt is cancelled', async () => {
    vi.mocked(prompts.confirm).mockResolvedValue(CANCEL as unknown as boolean);
    await expect(warnAndConfirm('w', 'q', false)).rejects.toMatchObject(
      new ProcessExit(0),
    );
  });
});
