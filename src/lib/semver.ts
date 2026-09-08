// ---------------------------------------------------------------------------
// Version ordering — the pure primitive behind the MIN_CLI handshake
// (lib/min-cli-gate.ts). No I/O, no deps, no clock.
//
// It compares the THREE-PART NUMERIC CORE and nothing else. That is a deliberate
// narrowing, not an oversight: VERSION_RE (lib/validate.ts) admits a trailing
// `-suffix`, and PHARN_VERSION is read straight from package.json and may carry
// one, so a naive `split('.').map(Number)` turns `1.2.3-rc.1` into `[1, 2, NaN]`
// and every comparison against it silently becomes false. Defining the case
// explicitly is the alternative: a PRERELEASE COMPARES EQUAL TO ITS RELEASE, so
// `1.2.3-rc.1` and `1.2.3` refuse in neither direction.
//
// P5: total and deterministic. An unparseable side yields `null` rather than a
// throw or a guess — the caller reads that as "no constraint", which is the only
// safe reading for a gate whose whole purpose is to avoid bricking the fleet.
// ---------------------------------------------------------------------------

// The numeric core, anchored: exactly three dot-separated runs of digits,
// optionally followed by a prerelease suffix that this module ignores. Anchoring
// is what rejects `v1.2.3`, `1.2`, `1.2.3.4`, and any whitespace padding —
// nothing is coerced.
const CORE_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

function core(version: string): [number, number, number] | null {
  const match = CORE_RE.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Compare two versions by their numeric core.
 *
 * Returns `1` when `a` is newer, `-1` when `b` is newer, `0` when the cores are
 * equal (a prerelease is EQUAL to its release), and `null` when either side is
 * not a three-part numeric version — never a throw.
 */
export function compareVersionCore(a: string, b: string): -1 | 0 | 1 | null {
  const left = core(a);
  const right = core(b);
  if (left === null || right === null) return null;
  for (let i = 0; i < 3; i++) {
    const l = left[i]!;
    const r = right[i]!;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}
