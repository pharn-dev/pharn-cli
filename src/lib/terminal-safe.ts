// ---------------------------------------------------------------------------
// The ONE display sanitizer for text that may carry untrusted bytes (names and
// messages derived from the fetched archive). A terminal INTERPRETS what it is
// given: an ESC/CSI sequence can erase a line or fake an "OK", an OSC sequence
// can write the clipboard, and a Unicode format character (U+202E RIGHT-TO-LEFT
// OVERRIDE, U+200B ZERO WIDTH SPACE, …) can make a printed name read as
// something it is not. So every such character is removed before display.
//
// Display only (P2): the result is never used as a path or compared against
// anything — refusing an unsafe NAME is the extractor's job (`hasUnsafeChars`).
// ---------------------------------------------------------------------------

// C0 controls, DEL, C1 controls, and every Unicode format character (Cf).
// eslint-disable-next-line no-control-regex
const UNSAFE_RE = /[\x00-\x1f\x7f-\x9f\p{Cf}]/gu;
// The same set minus `\t` and `\n`, for multi-line messages.
// eslint-disable-next-line no-control-regex
const UNSAFE_KEEP_WS_RE = /[\x00-\x08\x0b-\x1f\x7f-\x9f\p{Cf}]/gu;

export interface TerminalSafeOptions {
  /** Keep `\n` and `\t` (a multi-line message). Default: strip them too. */
  keepNewlines?: boolean;
  /** Truncate to this many characters (after stripping), marked with `…`. */
  max?: number;
}

export function terminalSafe(
  value: string,
  options: TerminalSafeOptions = {},
): string {
  const stripped = value.replace(
    options.keepNewlines ? UNSAFE_KEEP_WS_RE : UNSAFE_RE,
    '',
  );
  const { max } = options;
  return max !== undefined && stripped.length > max
    ? `${stripped.slice(0, max)}…`
    : stripped;
}

/** True when `value` holds any character `terminalSafe` would strip. */
export function hasUnsafeChars(value: string): boolean {
  // A fresh, non-global test: a /g regex carries lastIndex between calls.
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x1f\x7f-\x9f\p{Cf}]/u.test(value);
}
