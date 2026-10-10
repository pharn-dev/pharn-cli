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
 * The report as the text written to stdout. Two-space indented JSON, then every
 * character a terminal would interpret (C0, DEL, C1, Unicode format characters,
 * U+2028/2029) as a `\uXXXX` escape. That is lossless and safe by construction:
 * `JSON.stringify` emits only ASCII structure and escapes `\n`, `\r` and `\t`
 * inside strings, so every remaining unsafe character sits inside a string —
 * key or value — where `\u` is a JSON escape, and the output parses back to the
 * exact original. The one raw control character it emits is the `\n` between
 * lines, which is structural; it is split on, not escaped.
 */
export function serializeJsonReport(report: object): string {
  return JSON.stringify(report, null, 2)
    .split('\n')
    .map(escapeUnsafe)
    .join('\n');
}
