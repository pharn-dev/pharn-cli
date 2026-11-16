// ---------------------------------------------------------------------------
// The one error type a command ends with. Commands, steps and lib code THROW a
// CliError instead of exiting; `runCli` (src/index.ts) catches it once, prints
// it through `reportCliError` (lib/report-error.ts) and sets `process.exitCode`.
// Because nothing exits mid-command, every `finally` runs: the temp clone is
// removed and the project lock released on a refusal, a failure and a cancel
// alike.
//
// A CliError carries HOW it is printed, decided where the failure is
// understood, so the top level adds no wording of its own:
//
//   refusal   `⚠ <message>`, no PHARN_DEBUG hint (a policy refusal names its fix)
//   failure   `⚠ <message>` plus the hint, or the original under PHARN_DEBUG
//   error     one line, no glyph (a precondition: TTY, git, Node, config, args)
//   cancel    `log.info(<message>)` on stdout, exit 0
//   reported  nothing: the site printed a multi-line note first
//
// `json: true` (the `--json` modes) prints the same text as plain stderr lines,
// with no clack chrome, so stdout stays the one report.
// ---------------------------------------------------------------------------

export type CliErrorForm =
  'refusal' | 'failure' | 'error' | 'cancel' | 'reported';

/**
 * A caught exception, BOXED: `throw undefined` is legal, so a bare
 * `err?: unknown` could not tell a curated refusal from an exception whose
 * value is `undefined`. The box's presence is what earns the PHARN_DEBUG hint.
 */
export interface FatalCause {
  err: unknown;
}

interface OutputOpts {
  // The `--json` mode: plain stderr lines, no clack.
  json?: boolean;
}

export const CANCEL_MESSAGE = 'Cancelled. Nothing was changed.';

export class CliError extends Error {
  readonly exitCode: number;
  readonly form: CliErrorForm;
  readonly plain: boolean;
  readonly fatalCause: FatalCause | undefined;

  private constructor(
    form: CliErrorForm,
    message: string,
    exitCode: number,
    opts: { plain?: boolean; fatalCause?: FatalCause } = {},
  ) {
    super(message);
    this.name = 'CliError';
    this.form = form;
    this.exitCode = exitCode;
    this.plain = opts.plain ?? false;
    this.fatalCause = opts.fatalCause;
  }

  /** A policy refusal: `⚠ <message>`, exit 1, no PHARN_DEBUG hint. */
  static refusal(message: string, opts: OutputOpts = {}): CliError {
    return new CliError('refusal', message, 1, { plain: opts.json });
  }

  /**
   * A failure caused by `err`: `⚠ <message>` (default: the error's own
   * message), exit 1, plus the PHARN_DEBUG affordance. An `err` that is already
   * a CliError is returned unchanged, so a refusal or a cancel thrown deeper
   * down is never re-labelled a failure by an outer catch.
   */
  static failure(
    err: unknown,
    opts: OutputOpts & { message?: string } = {},
  ): CliError {
    if (err instanceof CliError) return err;
    return new CliError('failure', opts.message ?? errorMessage(err), 1, {
      plain: opts.json,
      fatalCause: { err },
    });
  }

  /** A precondition the user can fix: one line with no glyph, exit 1. */
  static error(message: string, opts: OutputOpts = {}): CliError {
    return new CliError('error', message, 1, { plain: opts.json });
  }

  /** The user said no: `log.info(<message>)`, exit 0. */
  static cancel(message: string = CANCEL_MESSAGE): CliError {
    return new CliError('cancel', message, 0);
  }

  /** The site already printed everything the user needs; only the code is left. */
  static reported(exitCode = 1): CliError {
    return new CliError('reported', '', exitCode);
  }
}

/**
 * The message of a caught `unknown`. `String(err)` can itself throw (a
 * null-prototype object, a hostile `toString`), and this is the last thing
 * between a failure and the user, so it names the class of value instead of
 * crashing inside the reporter.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return 'an unstringifiable value was thrown';
  }
}
