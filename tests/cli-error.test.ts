import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The top-level catch's printer (`reportCliError`, run once by `runCli` in
// src/index.ts): what each CliError form prints, on which stream, and the exit
// code it leaves. clack is mocked so every call is asserted, not printed.
vi.mock('@clack/prompts', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { log } = await import('@clack/prompts');
const { CliError } = await import('../src/lib/cli-error.js');
const { PHARN_DEBUG_HINT, reportCliError } =
  await import('../src/lib/report-error.js');

// A stack frame line (`    at fn (file:1:2)`).
const STACK_FRAME = /^\s+at .+/m;

describe('reportCliError (the top-level catch)', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  let outSpy: ReturnType<typeof vi.spyOn>;
  const stderr = (): string =>
    errSpy.mock.calls
      .map((c: unknown[]) =>
        c[0] instanceof Error ? String(c[0].stack) : String(c[0]),
      )
      .join('\n');

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    outSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubEnv('PHARN_DEBUG', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('CliError(0), the cancel: exit 0, one log.info line, nothing on stderr', () => {
    expect(reportCliError(CliError.cancel())).toBe(0);
    expect(log.info).toHaveBeenCalledWith('Cancelled. Nothing was changed.');
    expect(log.error).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('CliError(1), a refusal: exit 1, `⚠ message` on stderr, no PHARN_DEBUG hint', () => {
    expect(reportCliError(CliError.refusal('Locked by another run.'))).toBe(1);
    expect(log.error).toHaveBeenCalledWith('⚠ Locked by another run.', {
      output: process.stderr,
    });
    expect(log.info).not.toHaveBeenCalled();
  });

  it('a failure: exit 1, `⚠ message` plus the hint on stderr', () => {
    const code = reportCliError(CliError.failure(new Error('EACCES: nope')));
    expect(code).toBe(1);
    expect(log.error).toHaveBeenCalledWith('⚠ EACCES: nope', {
      output: process.stderr,
    });
    expect(log.info).toHaveBeenCalledWith(PHARN_DEBUG_HINT, {
      output: process.stderr,
    });
  });

  it('a failure under PHARN_DEBUG dumps the original instead of the hint', () => {
    vi.stubEnv('PHARN_DEBUG', '1');
    const cause = new Error('inner');
    reportCliError(CliError.failure(cause, { message: 'outer' }));
    expect(log.error).toHaveBeenCalledWith('⚠ outer', {
      output: process.stderr,
    });
    expect(errSpy).toHaveBeenCalledWith(cause);
    expect(log.info).not.toHaveBeenCalled();
  });

  it('an error line: exit 1, the message as is (no glyph), on stderr', () => {
    expect(reportCliError(CliError.error('git not found.'))).toBe(1);
    expect(log.error).toHaveBeenCalledWith('git not found.', {
      output: process.stderr,
    });
  });

  it('an already-reported error prints nothing and keeps its code', () => {
    expect(reportCliError(CliError.reported())).toBe(1);
    expect(reportCliError(CliError.reported(2))).toBe(2);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    expect(outSpy).not.toHaveBeenCalled();
  });

  it('the --json forms print plain stderr lines and never touch clack or stdout', () => {
    reportCliError(CliError.refusal('refused', { json: true }));
    reportCliError(CliError.error('bad config', { json: true }));
    reportCliError(CliError.failure(new Error('boom'), { json: true }));
    expect(errSpy.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      '⚠ refused',
      'bad config',
      '⚠ boom',
      PHARN_DEBUG_HINT,
    ]);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
    expect(outSpy).not.toHaveBeenCalled();
  });

  it('an unexpected Error: exit 1, `⚠ message` and the hint as plain stderr, no stack', () => {
    expect(reportCliError(new TypeError('x is undefined'))).toBe(1);
    expect(errSpy.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      '⚠ x is undefined',
      PHARN_DEBUG_HINT,
    ]);
    expect(stderr()).not.toMatch(STACK_FRAME);
    expect(log.error).not.toHaveBeenCalled();
    expect(outSpy).not.toHaveBeenCalled();
  });

  it('an unexpected Error under PHARN_DEBUG=1 prints its stack, not the hint', () => {
    vi.stubEnv('PHARN_DEBUG', '1');
    const err = new TypeError('x is undefined');
    expect(reportCliError(err)).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(err);
    expect(stderr()).toMatch(STACK_FRAME);
    expect(stderr()).not.toContain(PHARN_DEBUG_HINT);
  });

  it('an unexpected non-Error value is still exit 1 with a named message', () => {
    expect(reportCliError(undefined)).toBe(1);
    expect(errSpy.mock.calls[0]![0]).toBe('⚠ undefined');
  });

  it('failure() passes a CliError through, so an inner refusal is never relabelled', () => {
    const inner = CliError.refusal('drifted');
    expect(CliError.failure(inner)).toBe(inner);
    const cancel = CliError.cancel();
    expect(CliError.failure(cancel, { json: true })).toBe(cancel);
  });

  it('a CliError is an Error carrying its exit code', () => {
    const err = CliError.refusal('no');
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ name: 'CliError', message: 'no', exitCode: 1 });
    expect(CliError.cancel()).toMatchObject({ exitCode: 0 });
  });
});
