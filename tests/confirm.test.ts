import { describe, expect, it, vi } from 'vitest';
import { exitCodeOf } from './support/exit-code.js';

vi.mock('@clack/prompts', () => ({
  log: { info: vi.fn() },
}));

const { CliError } = await import('../src/lib/cli-error.js');
const prompts = await import('@clack/prompts');

// A cancelled prompt ends the command through the one exit point: the cancel
// form of CliError, printed by the top-level catch on stdout, exit 0. The
// describe keeps the name of the helper this replaced (`cancelAndExit`), so
// the same two behaviours are tracked as the same two tests.
describe('cancelAndExit', () => {
  it('logs the default message and exits with code 0', () => {
    expect(
      exitCodeOf(() => {
        throw CliError.cancel();
      }),
    ).toBe(0);
    expect(prompts.log.info).toHaveBeenCalledWith(
      'Cancelled. Nothing was changed.',
    );
  });

  it('forwards a custom message', () => {
    expect(
      exitCodeOf(() => {
        throw CliError.cancel('bye');
      }),
    ).toBe(0);
    expect(prompts.log.info).toHaveBeenCalledWith('bye');
  });
});
