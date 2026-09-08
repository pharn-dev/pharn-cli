import type { UnknownCapability } from '../types.js';

// ---------------------------------------------------------------------------
// The ONE renderer for `index.unknown` — the "no silent skips" surface (P5).
//
// Every fetching command (init, add ×2, update, status) calls this immediately
// after its parse, so a capability the fetch boundary refused is NAMED with its
// reason at every call site. Zero unknowns render NOTHING (`null`), which is what
// keeps a healthy clone exactly as quiet as it was before this feature existed.
//
// Trust (P2): all three rendered fields are UNTRUSTED upstream text. `name` may
// be the very directory name that failed CAPABILITY_NAME_RE, and `reason` is a
// validation message that interpolates it raw — so collecting them into a list
// makes a hostile clone a repeatable terminal-control-sequence vector. This
// module is the containment: control characters are stripped and each field is
// length-capped BEFORE it reaches the terminal. Centralising it here (rather than
// formatting the list at four call sites) is what makes that guarantee hold by
// construction.
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/g;
// Long enough that a real validation message survives intact (the longest one
// this repo produces is ~120 chars), short enough that a hostile 5MB dir name
// cannot flood a terminal.
const MAX_FIELD = 200;
// A hard cap on how many are listed; the count line always states the true total.
const MAX_LISTED = 10;

function safe(value: string): string {
  const stripped = value.replace(CONTROL_CHARS_RE, '');
  return stripped.length > MAX_FIELD
    ? `${stripped.slice(0, MAX_FIELD)}…`
    : stripped;
}

/**
 * Render the skipped-capability warning, or `null` when nothing was skipped.
 * Deterministic (P5): the list order is the parse's own sorted enumeration order,
 * and the same input always renders the same string.
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
  // Deliberately context-neutral: the SAME renderer serves init, add, update and
  // status, and status installs nothing — a closing clause about what "installed
  // normally" would be wrong in a quarter of its uses.
  lines.push(
    'This usually means pharn-oss changed something your pharn version does not understand yet. Upgrade with `npm install -g @pharn-dev/pharn@latest`.',
  );
  return lines.join('\n');
}
