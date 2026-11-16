import { escapeUnsafe } from './terminal-safe.js';

// ---------------------------------------------------------------------------
// The ONE serializer behind every `--json` report (`status`, `update
// --dry-run`). A report is built as a plain object by a pure function and
// printed once, here, so the stdout contract — exactly one object, every
// character a terminal would interpret escaped — has a single place to live.
// ---------------------------------------------------------------------------

/** `value` cut to `max` characters, with an ellipsis when it was cut. */
export function cap(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * The report as the text written to stdout: two-space indented JSON, then
 * every unsafe character as a `\uXXXX` escape. Lossless: `JSON.stringify`
 * escapes `\n`/`\r`/`\t` inside strings, so every remaining unsafe character
 * sits inside a string where `\u` is a JSON escape. The `\n` between lines is
 * structural; it is split on, not escaped.
 */
export function serializeJsonReport(report: object): string {
  return JSON.stringify(report, null, 2)
    .split('\n')
    .map(escapeUnsafe)
    .join('\n');
}
