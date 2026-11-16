import { vi } from 'vitest';
import { CANCEL } from '../helpers.js';

// The `@clack/prompts` stand-in every command suite installs with ONE line:
//
//   vi.mock('@clack/prompts', async () =>
//     (await import('./support/clack-stub.js')).clackStub());
//
// clack is terminal UI, the one boundary the command suites replace besides
// the network. Output calls are plain `vi.fn()`s the harness reads back
// (`notes()`, `logs()`, `printed()` in harness.ts). The three prompts THROW
// unless a test scripts an answer with `mockResolvedValueOnce`, so a prompt a
// path was not expected to reach fails the test instead of being answered by
// a default. `CANCEL` (tests/helpers.ts) is what a scripted Ctrl-C returns.
export function clackStub() {
  const unscripted = (name: string) =>
    vi.fn(async (): Promise<never> => {
      throw new Error(`a test reached an unscripted ${name} prompt`);
    });
  return {
    intro: vi.fn(),
    outro: vi.fn(),
    note: vi.fn(),
    cancel: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      step: vi.fn(),
      message: vi.fn(),
    },
    confirm: unscripted('confirm'),
    select: unscripted('select'),
    groupMultiselect: unscripted('groupMultiselect'),
    isCancel: (value: unknown) => value === CANCEL,
  };
}
