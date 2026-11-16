import { styleText } from 'node:util';
import picocolors from 'picocolors';

// ---------------------------------------------------------------------------
// The ONE colour rule: every coloured string pharn prints goes through the
// instance below, and no other src/ file imports picocolors (an import ban in
// eslint.config.mjs).
//
// Not picocolors' default export, which colours for `CI` or any non-empty
// FORCE_COLOR (`0` included) whatever stdout is, while @clack/prompts colours
// through node:util `styleText`'s own stream check. So the rule IS styleText's
// check, asked of the same stream clack defaults to (FORCE_COLOR '0'/'false'
// off, otherwise only a colour terminal; NO_COLOR and TERM=dumb off) — pinned
// by tests/color.test.ts. Decided once, at load.
// ---------------------------------------------------------------------------

/** Whether `stream` takes colour, by exactly the check @clack/prompts relies on. */
export function colorEnabled(
  stream: NodeJS.WritableStream = process.stdout,
): boolean {
  return styleText('red', 'x', { stream }) !== 'x';
}

const pc = picocolors.createColors(colorEnabled());

export default pc;
