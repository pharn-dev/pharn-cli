import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The reporter is the ONE place the CLI turns a failure into user-visible
// output, so the mock is what lets every axis below be asserted rather than
// printed into the test runner.
vi.mock('@clack/prompts', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { log } = await import('@clack/prompts');
const { errorMessage, logError, reportFatal, PHARN_DEBUG_HINT } =
  await import('../src/lib/report-error.js');

const srcDir = join(fileURLToPath(import.meta.url), '..', '..', 'src');
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.ts') ? [p] : [];
  });

describe('report-error', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  const realDebug = process.env.PHARN_DEBUG;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.PHARN_DEBUG;
  });
  afterEach(() => {
    if (realDebug === undefined) delete process.env.PHARN_DEBUG;
    else process.env.PHARN_DEBUG = realDebug;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // --- the stream (FABLE 5.2, second bullet) --------------------------------
  //
  // @clack/prompts defaults log.* to process.stdout, so before this every fatal
  // message landed on stdout: `pharn update --yes > out.log 2> err.log` left the
  // operator grepping an empty file for the cause.

  it('writes an error-level message to STDERR, not stdout', () => {
    logError('boom');
    expect(log.error).toHaveBeenCalledWith('boom', {
      output: process.stderr,
    });
  });

  it('does not reword the message it is given', () => {
    logError('No pharn.config.json found. Run `pharn init` first.');
    expect(vi.mocked(log.error).mock.calls[0]![0]).toBe(
      'No pharn.config.json found. Run `pharn init` first.',
    );
  });

  // --- the hint axis (FABLE 4.6) --------------------------------------------
  //
  // Passing the error is the SINGLE axis that marks "this came from an
  // exception". It is what keeps the hint off a curated refusal (a bad
  // argument, a version-gate refusal, the non-TTY message), where there is no
  // stack to dump and the hint would be a lie.

  it('prefixes a fatal with the warning glyph', () => {
    reportFatal('Update failed.');
    expect(log.error).toHaveBeenCalledWith('⚠ Update failed.', {
      output: process.stderr,
    });
  });

  it('prints NO PHARN_DEBUG hint for a curated refusal (no error passed)', () => {
    reportFatal('Skills version mismatch: run `pharn update` first.');
    expect(log.info).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('prints the PHARN_DEBUG hint when an exception is passed', () => {
    reportFatal('Could not reach github.com', new Error('ENOTFOUND'));
    expect(log.info).toHaveBeenCalledWith(PHARN_DEBUG_HINT, {
      output: process.stderr,
    });
    // The hint travels with its error: it is part of the fatal message, so it
    // must not be the one line of it left on stdout.
    expect(vi.mocked(log.info).mock.calls[0]![1]).toEqual({
      output: process.stderr,
    });
  });

  it('dumps the error and suppresses the hint when PHARN_DEBUG is set', () => {
    process.env.PHARN_DEBUG = '1';
    const err = new Error('ENOTFOUND');
    reportFatal('Could not reach github.com', err);
    expect(errSpy).toHaveBeenCalledWith(err);
    // The hint would be noise next to the stack it is offering to print.
    expect(log.info).not.toHaveBeenCalled();
  });

  // --- errorMessage ---------------------------------------------------------

  it('reads an Error message, and stringifies anything else', () => {
    expect(errorMessage(new Error('nope'))).toBe('nope');
    expect(errorMessage('a bare string')).toBe('a bare string');
    expect(errorMessage(undefined)).toBe('undefined');
  });

  // --- structural pins ------------------------------------------------------
  //
  // Best-effort text scans, in the spirit of tests/init.test.ts's isTTY pin:
  // they reduce a class of regressions (a hand-rolled copy re-appearing), they
  // do not eliminate it (an aliased import would slip past). Labeled, not sold
  // as absolute.

  it('is the ONLY src/** file that calls log.error(', () => {
    const home = join(srcDir, 'lib', 'report-error.ts');
    const offenders = walk(srcDir).filter(
      (f) => f !== home && readFileSync(f, 'utf8').includes('log.error('),
    );
    expect(offenders).toEqual([]);
  });

  it('is the ONLY src/** file carrying the PHARN_DEBUG hint literal', () => {
    const home = join(srcDir, 'lib', 'report-error.ts');
    const offenders = walk(srcDir).filter(
      (f) =>
        f !== home &&
        readFileSync(f, 'utf8').includes('Re-run with PHARN_DEBUG'),
    );
    expect(offenders).toEqual([]);
  });

  // Nine hand-rolled `if (process.env.PHARN_DEBUG) console.error(err)` copies
  // collapsed into this one. A future command that wants the dump must pass its
  // error to the reporter, which is what makes the hint's coverage follow.
  //
  // The scan is for the READ, not the name: several commands legitimately NAME
  // PHARN_DEBUG in a comment explaining why a given refusal deliberately gets no
  // hint, and that prose is the opposite of the regression this pin exists for.
  it('is the ONLY src/** file that reads process.env.PHARN_DEBUG', () => {
    const home = join(srcDir, 'lib', 'report-error.ts');
    const offenders = walk(srcDir).filter(
      (f) =>
        f !== home &&
        readFileSync(f, 'utf8').includes('process.env.PHARN_DEBUG'),
    );
    expect(offenders).toEqual([]);
  });
});
