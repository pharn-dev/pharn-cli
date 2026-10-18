import { styleText } from 'node:util';
import picocolors from 'picocolors';

// ---------------------------------------------------------------------------
// The ONE colour rule (F-28). Every coloured string pharn prints goes through
// the instance below; no other src/ file imports picocolors (pinned by
// tests/color.test.ts).
//
// Why not picocolors' default export: it decides on its own — on when
// FORCE_COLOR holds ANY non-empty value (so FORCE_COLOR=0 turns it ON) or when
// CI is set, whatever stdout is — while @clack/prompts, which draws the rest of
// the screen, colours through node:util `styleText`, which validates
// process.stdout on every call. Under `CI=1` or `FORCE_COLOR=0` with stdout
// piped, that left clack's chrome plain and pharn's own lines full of raw
// escape sequences.
//
// So the rule is not re-implemented here: it IS styleText's own check, asked of
// the same stream clack's calls default to. Node's rule, measured on 24.13.1:
//   - FORCE_COLOR set: colour iff it is '', '1', 'true', '2' or '3' (so '0' and
//     'false' mean off), on any stream, and NO_COLOR is then ignored;
//   - otherwise: colour only on a terminal whose colour depth exceeds 2 bits —
//     NO_COLOR, NODE_DISABLE_COLORS and TERM=dumb each turn it off, and CI by
//     itself turns nothing on.
// Decided once, at load, as picocolors' own default is.
// ---------------------------------------------------------------------------

/** Whether `stream` takes colour, by exactly the check @clack/prompts relies on. */
export function colorEnabled(
  stream: NodeJS.WritableStream = process.stdout,
): boolean {
  return styleText('red', 'x', { stream }) !== 'x';
}

const pc = picocolors.createColors(colorEnabled());

export default pc;
