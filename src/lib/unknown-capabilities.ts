import { terminalSafe } from './terminal-safe.js';
import type { UnknownCapability } from '../types.js';

// ---------------------------------------------------------------------------
// The ONE renderer for `index.unknown`, so every fetching command NAMES a
// capability the fetch boundary refused, with its reason. Zero unknowns render
// nothing (`null`).
//
// Every rendered field is UNTRUSTED upstream text (`name` may be the very name
// that failed CAPABILITY_NAME_RE), so this module is the containment: unsafe
// characters stripped and each field capped before it reaches the terminal.
// ---------------------------------------------------------------------------

// Long enough for a real validation message, short enough that a hostile name
// cannot flood a terminal.
const MAX_FIELD = 200;
// A hard cap on how many are listed; the count line always states the true total.
const MAX_LISTED = 10;

// The shared display sanitizer (lib/terminal-safe.ts).
function safe(value: string): string {
  return terminalSafe(value, { max: MAX_FIELD });
}

/**
 * Render the skipped-capability warning, or `null` when nothing was skipped.
 * List order is the parse's sorted enumeration order.
 */
export function unknownCapabilitiesWarning(
  unknown: readonly UnknownCapability[],
): string | null {
  if (unknown.length === 0) return null;

  const listed = unknown.slice(0, MAX_LISTED);
  const lines = [
    `${unknown.length} upstream ${unknown.length === 1 ? 'capability' : 'capabilities'} could not be read and ${unknown.length === 1 ? 'was' : 'were'} SKIPPED — not installed:`,
  ];
  for (const u of listed) {
    lines.push(
      `  ${u.role}:${safe(u.name)} (${safe(u.subtree)}) — ${safe(u.reason)}`,
    );
  }
  if (unknown.length > listed.length) {
    lines.push(`  …and ${unknown.length - listed.length} more.`);
  }
  // Context-neutral: the same renderer serves status, which installs nothing.
  lines.push(
    'This usually means pharn-oss changed something your pharn version does not understand yet. Upgrade with `npm install -g @pharn-dev/pharn@latest`.',
  );
  return lines.join('\n');
}
