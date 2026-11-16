// ---------------------------------------------------------------------------
// The ONE display sanitizer for text that may carry untrusted bytes (from the
// fetched archive or a hand-editable project file). A terminal INTERPRETS what
// it is given: an ESC/CSI sequence can erase a line or fake an "OK", an OSC
// sequence can write the clipboard, and a format character (U+202E, U+200B)
// can make a name read as something it is not.
//
// Display only: refusing an unsafe NAME is the extractor's and
// `assertSafeString`'s job. Escape the untrusted VALUE, never a whole line:
// pharn's own colour codes use ESC.
// ---------------------------------------------------------------------------

// THE unsafe-character set — the one definition in src/ (the unsafe-character
// rule in eslint.config.mjs fails on a second one):
//   - C0 controls, DEL and C1 controls (U+0000–U+001F, U+007F–U+009F);
//   - every Unicode format character (`\p{Cf}`): bidi overrides, zero-width
//     characters, the byte-order mark;
//   - U+2028 / U+2029, which still move text.
// `terminalSafe` strips it, `hasUnsafeChars` tests for it, `escapeUnsafe`
// escapes it, `assertSafeString` rejects over it. Built from code points, so
// no such character sits in this file; no `v` flag (the build targets ES2022).
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
 * Each UTF-16 unit of each unsafe character as `\uXXXX` — inside a JSON string
 * a JSON escape, so the text parses back to the EXACT original. The lossless
 * counterpart of `terminalSafe` (JSON, paste-ready hooks).
 */
export function escapeUnsafe(text: string): string {
  return text.replace(UNSAFE_RE, (ch) =>
    [...Array(ch.length).keys()]
      .map((i) => `\\u${ch.charCodeAt(i).toString(16).padStart(4, '0')}`)
      .join(''),
  );
}
