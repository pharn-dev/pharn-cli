import { describe, expect, it } from 'vitest';
import { mergeCapabilities } from '../src/lib/merge-capabilities.js';
import type {
  Archetype,
  InstalledCapability,
  Selection,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// The merge decision table, row by row. Each `row N` test is the matching cell
// of the table documented in src/lib/merge-capabilities.ts — the tests MIRROR the
// doc-comment, so a row that changes in one place fails in the other.
//
// Pure function, no fixtures, no I/O: the whole point of extracting the merge is
// that its guarantee (union semantics + nothing silent) is provable without a
// filesystem or a clone.
// ---------------------------------------------------------------------------

function sel(
  name: string,
  role: 'griller' | 'lens' = 'lens',
  matched: 'universal' | Archetype[] = 'universal',
) {
  return { name, role, matched };
}

function skip(name: string, role: 'griller' | 'lens' = 'lens') {
  return { name, role, reason: 'applies to [backend]; detected [lib]' };
}

function selection(over: Partial<Selection> = {}): Selection {
  return { selected: [], skipped: [], ...over };
}

function cap(
  name: string,
  role: 'griller' | 'lens' = 'lens',
  source?: 'auto' | 'manual',
): InstalledCapability {
  return source === undefined ? { name, role } : { name, role, source };
}

// The frozen key set: `role:name` for every capability the fetch boundary could
// not parse this run (index.unknown). Empty for every pre-existing row, which is
// the steady state - a healthy clone freezes nothing.
const NONE: ReadonlySet<string> = new Set();

function frozen(...keys: string[]): ReadonlySet<string> {
  return new Set(keys);
}

describe('mergeCapabilities — the decision table', () => {
  it('row 1: in resolved + not previously present → ADDED as auto', () => {
    const out = mergeCapabilities(
      selection({ selected: [sel('a11y')] }),
      [],
      NONE,
    );

    expect(out.capabilities).toEqual([cap('a11y', 'lens', 'auto')]);
    expect(out.changes).toEqual([
      { cap: cap('a11y', 'lens', 'auto'), reason: 'added' },
    ]);
  });

  it('row 2: in resolved + previously auto → kept auto, SILENT', () => {
    const out = mergeCapabilities(
      selection({ selected: [sel('a11y')] }),
      [cap('a11y', 'lens', 'auto')],
      NONE,
    );

    expect(out.capabilities).toEqual([cap('a11y', 'lens', 'auto')]);
    expect(out.changes).toEqual([]);
  });

  it('row 3: in resolved + previously manual → STAYS manual (sticky), SILENT', () => {
    // The sticky rule: a later archetype change that stops selecting this
    // capability must not drop it, so being re-selected cannot downgrade it.
    const out = mergeCapabilities(
      selection({ selected: [sel('a11y')] }),
      [cap('a11y', 'lens', 'manual')],
      NONE,
    );

    expect(out.capabilities).toEqual([cap('a11y', 'lens', 'manual')]);
    expect(out.changes).toEqual([]);
  });

  it('row 4: in resolved + legacy (no source) → tagged auto, SILENT', () => {
    const out = mergeCapabilities(
      selection({ selected: [sel('a11y')] }),
      [cap('a11y')],
      NONE,
    );

    expect(out.capabilities).toEqual([cap('a11y', 'lens', 'auto')]);
    // A tag-only change is not a MEMBERSHIP change, so it prints nothing.
    expect(out.changes).toEqual([]);
  });

  it('row 5: not resolved + previously auto → DROPPED, reported as unselected', () => {
    const out = mergeCapabilities(
      selection({ skipped: [skip('a11y')] }),
      [cap('a11y', 'lens', 'auto')],
      NONE,
    );

    expect(out.capabilities).toEqual([]);
    expect(out.changes).toEqual([
      { cap: cap('a11y', 'lens', 'auto'), reason: 'dropped-unselected' },
    ]);
  });

  it('row 6: not resolved + manual + still in index → KEPT, SILENT', () => {
    // The headline fix: a manual add survives an update that does not select it.
    const out = mergeCapabilities(
      selection({ skipped: [skip('n-plus-one')] }),
      [cap('n-plus-one', 'lens', 'manual')],
      NONE,
    );

    expect(out.capabilities).toEqual([cap('n-plus-one', 'lens', 'manual')]);
    expect(out.changes).toEqual([]);
  });

  it('row 7: not resolved + manual + GONE from the index → DROPPED, reported', () => {
    // Nothing else in the system would surface this: the install manifest
    // silently contributes zero paths for a missing capability dir.
    const out = mergeCapabilities(
      selection(),
      [cap('gone', 'lens', 'manual')],
      NONE,
    );

    expect(out.capabilities).toEqual([]);
    expect(out.changes).toEqual([
      { cap: cap('gone', 'lens', 'manual'), reason: 'dropped-gone' },
    ]);
  });

  it('row 8: not resolved + legacy + still in index → KEPT as manual, NAMED once', () => {
    // The migration row: no pre-existing manual add may be dropped by the first
    // post-upgrade update.
    const out = mergeCapabilities(
      selection({ skipped: [skip('n-plus-one')] }),
      [cap('n-plus-one')],
      NONE,
    );

    expect(out.capabilities).toEqual([cap('n-plus-one', 'lens', 'manual')]);
    expect(out.changes).toEqual([
      { cap: cap('n-plus-one', 'lens', 'manual'), reason: 'kept-manual' },
    ]);
  });

  it('row 9: not resolved + legacy + GONE from the index → DROPPED, reported', () => {
    const out = mergeCapabilities(selection(), [cap('gone')], NONE);

    expect(out.capabilities).toEqual([]);
    expect(out.changes).toEqual([
      { cap: cap('gone', 'lens', 'manual'), reason: 'dropped-gone' },
    ]);
  });
});

describe('mergeCapabilities — union, order, idempotence', () => {
  it('is the UNION of the resolved set and the manual entries', () => {
    const out = mergeCapabilities(
      selection({
        selected: [sel('a11y', 'griller'), sel('architecture', 'griller')],
        skipped: [skip('n-plus-one')],
      }),
      [cap('n-plus-one', 'lens', 'manual')],
      NONE,
    );

    expect(out.capabilities).toEqual([
      cap('a11y', 'griller', 'auto'),
      cap('architecture', 'griller', 'auto'),
      cap('n-plus-one', 'lens', 'manual'),
    ]);
  });

  it('orders resolved-in-index-order first, then manual in previous-config order', () => {
    const out = mergeCapabilities(
      selection({
        selected: [sel('z-auto', 'griller')],
        skipped: [skip('m-two'), skip('m-one')],
      }),
      // Deliberately NOT alphabetical: the tail keeps the CONFIG's order.
      [cap('m-two', 'lens', 'manual'), cap('m-one', 'lens', 'manual')],
      NONE,
    );

    expect(out.capabilities.map((c) => c.name)).toEqual([
      'z-auto',
      'm-two',
      'm-one',
    ]);
  });

  it('is IDEMPOTENT — merge(merge(x)) === merge(x), with an empty second report', () => {
    const s = selection({
      selected: [sel('a11y', 'griller')],
      skipped: [skip('n-plus-one'), skip('gone-later')],
    });
    // A legacy entry (row 8) and a resolved legacy entry (row 4) both get tagged
    // on the first pass; the second pass must then be a no-op.
    const first = mergeCapabilities(
      s,
      [cap('n-plus-one'), cap('a11y', 'griller')],
      NONE,
    );
    const second = mergeCapabilities(s, first.capabilities, NONE);

    expect(second.capabilities).toEqual(first.capabilities);
    expect(second.changes).toEqual([]);
  });

  it('reports NOTHING when membership is unchanged', () => {
    const s = selection({ selected: [sel('a11y', 'griller')] });
    const out = mergeCapabilities(s, [cap('a11y', 'griller', 'auto')], NONE);

    expect(out.changes).toEqual([]);
  });

  it('handles an empty selection and an empty previous config', () => {
    const out = mergeCapabilities(selection(), [], NONE);

    expect(out.capabilities).toEqual([]);
    expect(out.changes).toEqual([]);
  });

  it('treats (name, role) as the identity — the same name in both roles is two entries', () => {
    const out = mergeCapabilities(
      selection({
        selected: [sel('shared', 'griller'), sel('shared', 'lens')],
      }),
      [cap('shared', 'lens', 'manual')],
      NONE,
    );

    expect(out.capabilities).toEqual([
      cap('shared', 'griller', 'auto'),
      cap('shared', 'lens', 'manual'),
    ]);
    expect(out.changes).toEqual([
      { cap: cap('shared', 'griller', 'auto'), reason: 'added' },
    ]);
  });

  it('PRESERVES a duplicated index entry instead of de-duplicating it', () => {
    // resolveCapabilities explicitly promises "a duplicate `name` yields two
    // results, order preserved". A set-keyed merge would silently break that
    // promise, so the output is built by iterating `selected`, not by key.
    const out = mergeCapabilities(
      selection({ selected: [sel('dupe'), sel('dupe')] }),
      [],
      NONE,
    );

    expect(out.capabilities).toEqual([
      cap('dupe', 'lens', 'auto'),
      cap('dupe', 'lens', 'auto'),
    ]);
  });

  // Removing a `manual` entry is NOT durable when the archetypes also select the
  // capability. The union's manual half can no longer re-add it, but the RESOLVED
  // half still can — it re-enters through row 1 as `auto`. `remove` cannot warn
  // about this (it is offline and has no index), so the guarantee is only that
  // update NAMES it. The docs said "the union can never re-add it"; that was
  // false, and this pins the truth so the wording cannot silently drift back.
  it('re-adds a REMOVED manual entry as auto when the archetypes still select it', () => {
    const s = selection({ selected: [sel('a11y', 'griller')] });
    // `pharn add a11y` on a universal capability → manual AND resolved (row 3).
    const afterAdd = mergeCapabilities(
      s,
      [cap('a11y', 'griller', 'manual')],
      NONE,
    );
    expect(afterAdd.capabilities).toEqual([cap('a11y', 'griller', 'manual')]);

    // `pharn remove a11y` drops the entry from the config — and warns nothing,
    // because warnIfAutoSelected matches only the literal 'auto'.
    const afterUpdate = mergeCapabilities(s, [], NONE);

    expect(afterUpdate.capabilities).toEqual([cap('a11y', 'griller', 'auto')]);
    expect(afterUpdate.changes).toEqual([
      { cap: cap('a11y', 'griller', 'auto'), reason: 'added' },
    ]);
  });

  it('does NOT re-add a removed manual entry the archetypes do not select', () => {
    // The contrast case: outside the resolved set, removal really is durable.
    const s = selection({ skipped: [skip('n-plus-one')] });
    expect(mergeCapabilities(s, [], NONE).capabilities).toEqual([]);
    expect(mergeCapabilities(s, [], NONE).changes).toEqual([]);
  });

  it('does not mutate the previous array or its entries', () => {
    const previous = [cap('n-plus-one')];
    const snapshot = structuredClone(previous);

    mergeCapabilities(
      selection({ skipped: [skip('n-plus-one')] }),
      previous,
      NONE,
    );

    expect(previous).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Row 0 - the FROZEN row. A capability the fetch boundary could not parse this
// run leaves the index entirely, so without this row a recorded entry for it
// falls straight through to a DROP: `source: 'auto'` takes `dropped-unselected`
// (and is mis-reported as "your archetypes no longer select it"), while manual
// and legacy entries take `dropped-gone` ("no longer exists upstream") - both
// false, and both losing the entry over a transient upstream grammar break.
//
// Row 0 therefore runs BEFORE the `source === 'auto'` branch, and it holds for
// all three provenance shapes. It KEEPS the entry verbatim - it never re-tags a
// legacy entry, because a parse failure is not evidence of provenance.
// ---------------------------------------------------------------------------

describe('mergeCapabilities - row 0: frozen (unparseable upstream)', () => {
  it('keeps an AUTO entry, reported kept-frozen (not dropped-unselected)', () => {
    const out = mergeCapabilities(
      selection(),
      [cap('a11y', 'griller', 'auto')],
      frozen('griller:a11y'),
    );

    expect(out.capabilities).toEqual([cap('a11y', 'griller', 'auto')]);
    expect(out.changes).toEqual([
      { cap: cap('a11y', 'griller', 'auto'), reason: 'kept-frozen' },
    ]);
  });

  it('keeps a MANUAL entry, reported kept-frozen (not dropped-gone)', () => {
    const out = mergeCapabilities(
      selection(),
      [cap('a11y', 'griller', 'manual')],
      frozen('griller:a11y'),
    );

    expect(out.capabilities).toEqual([cap('a11y', 'griller', 'manual')]);
    expect(out.changes).toEqual([
      { cap: cap('a11y', 'griller', 'manual'), reason: 'kept-frozen' },
    ]);
  });

  it('keeps a source-ABSENT legacy entry VERBATIM - the legacy inference never runs on it', () => {
    const out = mergeCapabilities(
      selection(),
      [cap('a11y', 'griller')],
      frozen('griller:a11y'),
    );

    // Still no `source`: a parse failure says nothing about provenance, so the
    // reconstruction that rows 8/9 apply must not fire here.
    expect(out.capabilities).toEqual([cap('a11y', 'griller')]);
    expect(out.changes).toEqual([
      { cap: cap('a11y', 'griller'), reason: 'kept-frozen' },
    ]);
  });

  it('never reports a frozen entry as dropped, whatever its source', () => {
    for (const source of ['auto', 'manual', undefined] as const) {
      const out = mergeCapabilities(
        selection(),
        [cap('a11y', 'griller', source)],
        frozen('griller:a11y'),
      );
      const reasons = out.changes.map((c) => c.reason);
      expect(reasons).not.toContain('dropped-unselected');
      expect(reasons).not.toContain('dropped-gone');
      expect(out.capabilities).toHaveLength(1);
    }
  });

  it('matches on the (name, role) PAIR - a same-name different-role entry still drops', () => {
    const out = mergeCapabilities(
      selection(),
      [cap('a11y', 'lens', 'auto')],
      frozen('griller:a11y'),
    );

    expect(out.capabilities).toEqual([]);
    expect(out.changes).toEqual([
      { cap: cap('a11y', 'lens', 'auto'), reason: 'dropped-unselected' },
    ]);
  });

  it('freezes only what is RECORDED - an unparseable capability the project never had adds nothing', () => {
    const out = mergeCapabilities(selection(), [], frozen('griller:a11y'));

    expect(out.capabilities).toEqual([]);
    expect(out.changes).toEqual([]);
  });

  it('keeps reporting kept-frozen on EVERY run while the break persists', () => {
    const first = mergeCapabilities(
      selection(),
      [cap('a11y', 'griller', 'auto')],
      frozen('griller:a11y'),
    );
    const second = mergeCapabilities(
      selection(),
      first.capabilities,
      frozen('griller:a11y'),
    );

    // Deliberately NOT quiet on the second run: the anomaly is still live, and a
    // steady-state silence would hide an ongoing upstream break.
    expect(second).toEqual(first);
    expect(second.changes.map((c) => c.reason)).toEqual(['kept-frozen']);
  });

  it('goes back to the normal rows once upstream parses again', () => {
    const out = mergeCapabilities(
      selection({ selected: [sel('a11y', 'griller')] }),
      [cap('a11y', 'griller', 'auto')],
      NONE,
    );

    expect(out.capabilities).toEqual([cap('a11y', 'griller', 'auto')]);
    expect(out.changes).toEqual([]);
  });

  it('freezes one capability while the rest of the table still applies', () => {
    const out = mergeCapabilities(
      selection({ selected: [sel('security', 'griller')] }),
      [cap('a11y', 'griller', 'auto'), cap('gone', 'lens', 'manual')],
      frozen('griller:a11y'),
    );

    expect(out.capabilities).toEqual([
      cap('security', 'griller', 'auto'),
      cap('a11y', 'griller', 'auto'),
    ]);
    expect(out.changes).toEqual([
      { cap: cap('security', 'griller', 'auto'), reason: 'added' },
      { cap: cap('a11y', 'griller', 'auto'), reason: 'kept-frozen' },
      { cap: cap('gone', 'lens', 'manual'), reason: 'dropped-gone' },
    ]);
  });
});
