import type {
  CapabilitySource,
  InstalledCapability,
  Selection,
} from '../types.js';

// ---------------------------------------------------------------------------
// The capability MEMBERSHIP merge of `pharn update`'s config write — a pure
// function. Given what the archetypes resolve to now and what the config
// recorded, decide which entries the next config holds and which membership
// changes to report. The contract is a UNION, so a manual `pharn add` is never
// silently deleted by `update`:
//
//     next = resolve(archetypes, fresh index)   ← the auto set
//          ∪ manual entries                     ← preserved, first-class
//
// Every branch is a Set lookup over `role:name` or an exact compare against the
// two-value `source` enum; an unrecognised `source` never reaches this function
// (ingest rejects it: CapabilitySourceError). lib/resolve-capabilities.ts owns
// "archetypes × index → selection"; this module owns what follows.
// ---------------------------------------------------------------------------

/**
 * The decision table (per `role:name` key; every cell enumerated, first match
 * wins). `in resolved?` = the key is in `selection.selected`. `in index?` = the
 * key is in `selected ∪ skipped`. `selected ⊆ index`, so `in index?` is only a
 * live question on the not-resolved rows (`—` = entailed). `frozen?` = the key is
 * in the `frozen` set — a capability the fetch boundary could not PARSE this run.
 *
 * | # | frozen | in resolved | previous source | in index | next entry             | reported as        |
 * |---|--------|-------------|-----------------|----------|------------------------|--------------------|
 * | 0 | yes    | no          | any             | no       | KEEP VERBATIM          | kept-frozen        |
 * | 1 | no     | yes         | not present     | —        | ADD, source: auto      | added              |
 * | 2 | no     | yes         | auto            | —        | KEEP, auto             | — (silent)         |
 * | 3 | no     | yes         | manual          | —        | KEEP, manual (sticky)  | — (silent)         |
 * | 4 | no     | yes         | absent (legacy) | —        | KEEP, tag auto         | — (silent)         |
 * | 5 | no     | no          | auto            | any      | DROP                   | dropped-unselected |
 * | 6 | no     | no          | manual          | yes      | KEEP, manual           | — (silent)         |
 * | 7 | no     | no          | manual          | no       | DROP                   | dropped-gone       |
 * | 8 | no     | no          | absent (legacy) | yes      | KEEP, tag manual       | kept-manual        |
 * | 9 | no     | no          | absent (legacy) | no       | DROP                   | dropped-gone       |
 *
 * ROW 0 — FROZEN — must run FIRST among the not-resolved rows. An unparseable
 * capability leaves the index entirely, so without it a recorded entry would
 * fall into row 5 or rows 7/9 by its `source` — a false reason, and the entry
 * lost over a transient upstream break the user cannot fix. It KEEPS the entry
 * VERBATIM, absent `source` included (a parse failure is no evidence of
 * provenance), and reports it on EVERY run while the break persists.
 *
 * Among rows 1-9 the LEGACY inference runs first — a `source`-absent entry
 * reads as `auto` in the resolved set (row 4) and `manual` outside it (rows
 * 8/9) — then the manual rules run over the result, which is why row 9 lands on
 * row 7's `dropped-gone`. It is a RECONSTRUCTION: rows 8/9 also catch an entry
 * that WAS auto and a newer index no longer selects. Tagging both `manual` is
 * the fail-safe direction, and sets only the TAG — row 9 still drops. Applied
 * only here, the one place holding the fresh index.
 *
 * Idempotent: after one merge every surviving non-frozen entry carries an
 * explicit `source` (row 4 → row 2, row 8 → row 6, both silent), so
 * `merge(merge(x)) = merge(x)` with an EMPTY change list. Row 0 is idempotent in
 * output but deliberately not silent.
 *
 * Resurrection: a removed capability is gone from `previous`, so the resolver
 * re-selects it through row 1 — installed and NAMED. Reported, not prevented
 * (no tombstones).
 */
export type CapabilityChangeReason =
  | 'added'
  | 'dropped-unselected'
  | 'dropped-gone'
  | 'kept-manual'
  | 'kept-frozen';

export interface CapabilityChange {
  // The entry the change is about, carrying the `source` it resolved to.
  cap: InstalledCapability;
  reason: CapabilityChangeReason;
}

export interface CapabilityMerge {
  // The next `capabilities` array. Every entry carries an explicit `source`
  // except a frozen one (row 0), preserved byte-for-byte.
  capabilities: InstalledCapability[];
  // Every membership difference. EMPTY ⇒ the caller renders nothing.
  changes: CapabilityChange[];
}

// The identity of a capability everywhere in this CLI: the (name, role) PAIR.
function key(cap: { name: string; role: 'griller' | 'lens' }): string {
  return `${cap.role}:${cap.name}`;
}

/**
 * Merge the freshly-resolved selection with the previously-recorded
 * capabilities, by the table above.
 *
 * `selection` carries full-index membership for everything the fetch boundary
 * could PARSE (`selected ∪ skipped`), so "still upstream?" is a membership
 * test. `frozen` supplies what it cannot: a capability the parse REFUSED never
 * enters the index, so by membership it looks deleted. Its keys use the
 * SUBTREE's role (the declared `role` may be what failed).
 *
 * ORDER: `selection.selected` in index order, then the preserved manual entries
 * in previous-config order — stable, so a second merge reproduces the array.
 * DUPLICATES in `selection.selected` are kept (resolveCapabilities promises
 * them); the key only looks provenance up, never de-duplicates.
 */
export function mergeCapabilities(
  selection: Selection,
  previous: readonly InstalledCapability[],
  frozen: ReadonlySet<string>,
): CapabilityMerge {
  const resolved = new Set(selection.selected.map(key));
  const inIndex = new Set([
    ...selection.selected.map(key),
    ...selection.skipped.map(key),
  ]);

  // Previous provenance by key; the first entry wins for a duplicated key.
  const previousSource = new Map<string, CapabilitySource | undefined>();
  const seenPrevious = new Set<string>();
  for (const cap of previous) {
    const k = key(cap);
    if (!seenPrevious.has(k)) {
      seenPrevious.add(k);
      previousSource.set(k, cap.source);
    }
  }

  const capabilities: InstalledCapability[] = [];
  const changes: CapabilityChange[] = [];

  // --- The resolved prefix, in index order (rows 1-4). ---
  for (const sel of selection.selected) {
    const k = key(sel);
    if (!seenPrevious.has(k)) {
      // Row 1 — newly selected (new upstream, or a removed capability
      // resurfacing: indistinguishable without tombstones, so REPORTED).
      const cap: InstalledCapability = {
        name: sel.name,
        role: sel.role,
        source: 'auto',
      };
      capabilities.push(cap);
      changes.push({ cap, reason: 'added' });
      continue;
    }
    // Rows 2/4 → auto. Row 3 → manual, STICKY, so a later archetype change
    // cannot quietly drop an entry the user asked for by name.
    const source: CapabilitySource =
      previousSource.get(k) === 'manual' ? 'manual' : 'auto';
    capabilities.push({ name: sel.name, role: sel.role, source });
  }

  // --- The preserved-manual tail, in previous-config order (rows 5-9). ---
  for (const cap of previous) {
    const k = key(cap);
    // Already emitted by the prefix loop (rows 2-4).
    if (resolved.has(k)) continue;

    // Row 0 — FROZEN: kept VERBATIM and NAMED. Before the `source` test, or
    // row 5 would claim an auto entry.
    if (frozen.has(k)) {
      const kept: InstalledCapability = { ...cap };
      capabilities.push(kept);
      changes.push({ cap: kept, reason: 'kept-frozen' });
      continue;
    }

    // Row 5 — pharn chose it, pharn un-chooses it. `update` then DELETES its
    // directory (lib/update-plan.ts → removals): PHARN's commands scan the
    // directories, so one left on disk would keep running.
    if (cap.source === 'auto') {
      changes.push({ cap, reason: 'dropped-unselected' });
      continue;
    }

    // Below here the entry is manual — explicitly, or by the legacy inference
    // (see the table). The inference decides only the TAG: the membership test
    // below still drops a capability that no longer exists.
    const inferred: InstalledCapability = { ...cap, source: 'manual' };

    // Rows 7 & 9 — gone upstream: dropped and NAMED (the install manifest
    // contributes no path for a missing dir, so nothing else would surface it).
    // Like row 5, `update` deletes its directory.
    if (!inIndex.has(k)) {
      changes.push({ cap: inferred, reason: 'dropped-gone' });
      continue;
    }

    // Rows 6 & 8 — kept. Row 8 is named ONCE, on the run that tags it; row 6 is
    // silent.
    capabilities.push(inferred);
    if (cap.source === undefined) {
      changes.push({ cap: inferred, reason: 'kept-manual' });
    }
  }

  return { capabilities, changes };
}
