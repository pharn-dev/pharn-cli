import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';

export class ProcessExit extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExit';
  }
}

export function stubProcessExit(): void {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ProcessExit(code as number | undefined);
    });
  });
}

export function useTmpDir(): { path: () => string } {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pharn-test-'));
  });
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  return { path: () => dir };
}

export const CANCEL = Symbol('clack-cancel');

// The real stream flags, captured once at module load — before any test has had
// a chance to redefine them.
const ORIG_STDIN_ISTTY = process.stdin.isTTY;
const ORIG_STDOUT_ISTTY = process.stdout.isTTY;

/**
 * Set `process.std*.isTTY`, which drives every interactive gate in the CLI
 * (`init`, `update`, and the bare `add`/`remove` pickers all route through
 * `interactiveAllowed`). Node reports `undefined` off a TTY — and that is what
 * the vitest runner reports — so under test EVERY gate is closed unless a suite
 * opens it. A command-level suite that expects to reach a prompt must therefore
 * call `setTTY(true, true)`; one exercising the non-TTY refusal leaves it alone
 * or sets it explicitly. Always pair with `restoreTTY()` in `afterEach`.
 */
export function setTTY(stdin?: boolean, stdout?: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', {
    value: stdin,
    configurable: true,
  });
  Object.defineProperty(process.stdout, 'isTTY', {
    value: stdout,
    configurable: true,
  });
}

/** Restore the flags captured at module load. */
export function restoreTTY(): void {
  setTTY(ORIG_STDIN_ISTTY, ORIG_STDOUT_ISTTY);
}
