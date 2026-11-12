// ---------------------------------------------------------------------------
// The ONE display sanitizer for text that may carry untrusted bytes (names and
// messages derived from the fetched archive or from a hand-editable project
// file such as pharn.records.json). A terminal INTERPRETS what it is
// given: an ESC/CSI sequence can erase a line or fake an "OK", an OSC sequence
// can write the clipboard, and a Unicode format character (U+202E RIGHT-TO-LEFT
// OVERRIDE, U+200B ZERO WIDTH SPACE, …) can make a printed name read as
// something it is not. So every such character is removed before display.
//
// Display only (P2): the result is never used as a path or compared against
// anything — refusing an unsafe NAME is the extractor's and `assertSafeString`'s
// job (`hasUnsafeChars`). Escape the untrusted VALUE, never a whole line: pharn's
// own colour codes use ESC, and stripping a line would leave a literal `[33m`.
// ---------------------------------------------------------------------------

// THE unsafe-character set — the one definition in src/ (a static test in
// tests/terminal-safe.test.ts fails on a second one):
//   - C0 controls (U+0000–U+001F) and DEL + C1 controls (U+007F–U+009F): ESC,
//     the 8-bit CSI U+009B, BEL, CR, … — the bytes a terminal acts on;
//   - every Unicode format character (`\p{Cf}`): bidi overrides and isolates
//     (U+202E, U+2066), zero-width characters, the byte-order mark — they can
//     make a printed name read as something it is not;
//   - U+2028 / U+2029, the line and paragraph separators: not format
//     characters, but they still move text.
// Everything below derives from it: `terminalSafe` strips it, `hasUnsafeChars`
// tests for it, `escapeUnsafe` escapes it, and `assertSafeString` (validate.ts)
// rejects a name over it. Built from code points, so no such character sits in
// this file, and no `v` flag (the build targets ES2022).
const UNSAFE_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029],
];
const codePoint = (cp: number): string => `\\u{${cp.toString(16)}}`;
const UNSAFE_CLASS = `[${UNSAFE_RANGES.map(
  ([lo, hi]) => `${codePoint(lo)}-${codePoint(hi)}`,
).join('')}\\p{Cf}]`;
// Global, for `replace` (which resets `lastIndex` itself).
const UNSAFE_RE = new RegExp(UNSAFE_CLASS, 'gu');
// Non-global, for `test`: a /g regex carries `lastIndex` between calls.
const UNSAFE_TEST_RE = new RegExp(UNSAFE_CLASS, 'u');

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
  const { keepNewlines, max } = options;
  const stripped = value.replace(UNSAFE_RE, (ch) =>
    keepNewlines && (ch === '\n' || ch === '\t') ? ch : '',
  );
  return max !== undefined && stripped.length > max
    ? `${stripped.slice(0, max)}…`
    : stripped;
}

/** True when `value` holds any character of the unsafe set. */
export function hasUnsafeChars(value: string): boolean {
  return UNSAFE_TEST_RE.test(value);
}

/**
 * Each UTF-16 unit of each unsafe character as `\uXXXX`. Inside a JSON string
 * these are JSON escapes, so the printed text parses back to the EXACT original
 * string; outside one they are just visible text. The escaping counterpart of
 * `terminalSafe`, for output that must stay lossless (JSON, paste-ready hooks).
 */
export function escapeUnsafe(text: string): string {
  return text.replace(UNSAFE_RE, (ch) =>
    [...Array(ch.length).keys()]
      .map((i) => `\\u${ch.charCodeAt(i).toString(16).padStart(4, '0')}`)
      .join(''),
  );
}
