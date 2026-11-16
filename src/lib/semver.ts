// ---------------------------------------------------------------------------
// Version ordering (pure). Compares the THREE-PART NUMERIC CORE only: a
// PRERELEASE COMPARES EQUAL TO ITS RELEASE, since VERSION_RE admits a `-suffix`
// that a naive numeric split would turn into NaN. An unparseable side yields
// `null`, which callers read as "no constraint" rather than refuse.
// ---------------------------------------------------------------------------

// The numeric core, anchored (rejects `v1.2.3`, `1.2`, `1.2.3.4`, padding),
// with an ignored optional prerelease suffix.
const CORE_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

function core(version: string): [number, number, number] | null {
  const match = CORE_RE.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Compare two versions by their numeric core: `1` (a newer), `-1` (b newer),
 * `0` (equal cores), or `null` when either side is not a three-part version.
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
