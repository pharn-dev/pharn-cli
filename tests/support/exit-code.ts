import { CliError } from '../../src/lib/cli-error.js';
import { reportCliError } from '../../src/lib/report-error.js';

// Run code that may end the command as the top-level catch (`runCli`,
// src/index.ts) would: a thrown CliError is printed by the REAL
// `reportCliError`, so the stream assertions after it still hold, and surfaces
// as its exit code; a normal return is `null`. Any other throw is rethrown, so
// a bug fails the test instead of reading as exit 1.
//
// Not in tests/helpers.ts: clack-stub.ts imports helpers from INSIDE the
// `@clack/prompts` mock factory, and a src import there would load the real
// clack before the mock exists.

export function exitCodeOf(fn: () => unknown): number | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof CliError) return reportCliError(err);
    throw err;
  }
}

/** `exitCodeOf` for an async `fn`. */
export async function exitCodeOfAsync(
  fn: () => Promise<unknown>,
): Promise<number | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err instanceof CliError) return reportCliError(err);
    throw err;
  }
}
