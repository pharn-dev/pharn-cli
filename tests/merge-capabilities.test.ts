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

describe('mergeCapabilities — the decision table', () => {
  it('row 1: in resolved + not previously present → ADDED as auto', () => {
    const out = mergeCapabilities(selection({ selected: [sel('a11y')] }), []);

    expect(out.capabilities).toEqual([cap('a11y', 'lens', 'auto')]);
    expect(out.changes).toEqual([
      { cap: cap('a11y', 'lens', 'auto'), reason: 'added' },
    ]);
  });

  it('row 2: in resolved + previously auto → kept auto, SILENT', () => {
    const out = mergeCapabilities(selection({ selected: [sel('a11y')] }), [
      cap('a11y', 'lens', 'auto'),
    ]);

    expect(out.capabilities).toEqual([cap('a11y', 'lens', 'auto')]);
    expect(out.changes).toEqual([]);
  });

  it('row 3: in resolved + previously manual → STAYS manual (sticky), SILENT', () => {
    // The sticky rule: a later archetype change that stops selecting this
    // capability must not drop it, so being re-selected cannot downgrade it.
    const out = mergeCapabilities(selection({ selected: [sel('a11y')] }), [
      cap('a11y', 'lens', 'manual'),
    ]);

    expect(out.capabilities).toEqual([cap('a11y', 'lens', 'manual')]);
    expect(out.changes).toEqual([]);
  });

  it('row 4: in resolved + legacy (no source) → tagged auto, SILENT', () => {
    const out = mergeCapabilities(selection({ selected: [sel('a11y')] }), [
      cap('a11y'),
    ]);

    expect(out.capabilities).toEqual([cap('a11y', 'lens', 'auto')]);
    // A tag-only change is not a MEMBERSHIP change, so it prints nothing.
    expect(out.changes).toEqual([]);
  });

  it('row 5: not resolved + previously auto → DROPPED, reported as unselected', () => {
    const out = mergeCapabilities(selection({ skipped: [skip('a11y')] }), [
      cap('a11y', 'lens', 'auto'),
    ]);

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
    );

    expect(out.capabilities).toEqual([cap('n-plus-one', 'lens', 'manual')]);
    expect(out.changes).toEqual([]);
  });

  it('row 7: not resolved + manual + GONE from the index → DROPPED, reported', () => {
    // Nothing else in the system would surface this: the install manifest
    // silently contributes zero paths for a missing capability dir.
    const out = mergeCapabilities(selection(), [cap('gone', 'lens', 'manual')]);

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
    );

    expect(out.capabilities).toEqual([cap('n-plus-one', 'lens', 'manual')]);
    expect(out.changes).toEqual([
      { cap: cap('n-plus-one', 'lens', 'manual'), reason: 'kept-manual' },
    ]);
  });

  it('row 9: not resolved + legacy + GONE from the index → DROPPED, reported', () => {
    const out = mergeCapabilities(selection(), [cap('gone')]);

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
    const first = mergeCapabilities(s, [
      cap('n-plus-one'),
      cap('a11y', 'griller'),
    ]);
    const second = mergeCapabilities(s, first.capabilities);

    expect(second.capabilities).toEqual(first.capabilities);
    expect(second.changes).toEqual([]);
  });

  it('reports NOTHING when membership is unchanged', () => {
    const s = selection({ selected: [sel('a11y', 'griller')] });
    const out = mergeCapabilities(s, [cap('a11y', 'griller', 'auto')]);

    expect(out.changes).toEqual([]);
  });

  it('handles an empty selection and an empty previous config', () => {
    const out = mergeCapabilities(selection(), []);

    expect(out.capabilities).toEqual([]);
    expect(out.changes).toEqual([]);
  });

  it('treats (name, role) as the identity — the same name in both roles is two entries', () => {
    const out = mergeCapabilities(
      selection({
        selected: [sel('shared', 'griller'), sel('shared', 'lens')],
      }),
      [cap('shared', 'lens', 'manual')],
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
    const afterAdd = mergeCapabilities(s, [cap('a11y', 'griller', 'manual')]);
    expect(afterAdd.capabilities).toEqual([cap('a11y', 'griller', 'manual')]);

    // `pharn remove a11y` drops the entry from the config — and warns nothing,
    // because warnIfAutoSelected matches only the literal 'auto'.
    const afterUpdate = mergeCapabilities(s, []);

    expect(afterUpdate.capabilities).toEqual([cap('a11y', 'griller', 'auto')]);
    expect(afterUpdate.changes).toEqual([
      { cap: cap('a11y', 'griller', 'auto'), reason: 'added' },
    ]);
  });

  it('does NOT re-add a removed manual entry the archetypes do not select', () => {
    // The contrast case: outside the resolved set, removal really is durable.
    const s = selection({ skipped: [skip('n-plus-one')] });
    expect(mergeCapabilities(s, []).capabilities).toEqual([]);
    expect(mergeCapabilities(s, []).changes).toEqual([]);
  });

  it('does not mutate the previous array or its entries', () => {
    const previous = [cap('n-plus-one')];
    const snapshot = structuredClone(previous);

    mergeCapabilities(selection({ skipped: [skip('n-plus-one')] }), previous);

    expect(previous).toEqual(snapshot);
  });
});
