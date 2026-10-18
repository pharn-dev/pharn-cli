import { describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';

vi.mock('@clack/prompts', () => ({
  log: { info: vi.fn() },
}));

const { cancelAndExit } = await import('../src/lib/confirm.js');
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
