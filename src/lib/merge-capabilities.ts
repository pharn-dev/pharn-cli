import type {
  CapabilitySource,
  InstalledCapability,
  Selection,
} from '../types.js';

// ---------------------------------------------------------------------------
// The capability MEMBERSHIP merge — the one axis of `pharn update`'s config
// write, and a pure function: no I/O, no clock, no fs. Given what the archetypes
// resolve to now and what the config recorded last time, decide which entries
// the next config holds and which membership changes to report.
//
// The bug this exists to fix: `update` used to REPLACE `capabilities` with
// `resolve(archetypes, index)` wholesale. That silently deleted every manual
// `pharn add` (its files orphaned on disk, invisible to list/remove/status) and
// silently resurrected every `pharn remove` of a universal capability. `add` and
// `remove` treat `capabilities` as the source of truth; `update` treated
// `archetypes × index` as the source of truth. Both models were documented;
// their interaction was not, and it resolved silently in update's favour.
//
// The contract is now a UNION:
//
//     next = resolve(archetypes, fresh index)   ← the auto set, as before
//          ∪ manual entries                     ← preserved, first-class
//
// FLOOR (P0, ARCHITECTURE.md §2 #3 — enum / set membership): every branch below
// is a Set lookup over `role:name` or an exact compare against the two-value
// `source` enum. There is no classification, no heuristic, and no third outcome
// (P5). An unrecognised `source` cannot reach this function at all: ingest
// hard-fails on it first (lib/pharn-config.ts, CapabilitySourceError) — the
// fail-closed direction.
//
// One axis (P3): this module owns "selection × previous config → next membership
// + report". lib/resolve-capabilities.ts owns "archetypes × index → selection".
// Those are different reasons to change, so they are different files.
// ---------------------------------------------------------------------------

/**
 * The decision table (per `role:name` key; every cell enumerated, first match
 * wins). `in resolved?` = the key is in `selection.selected`. `in index?` = the
 * key is in `selected ∪ skipped`. `selected ⊆ index`, so `in index?` is only a
 * live question on the not-resolved rows (`—` = entailed).
 *
 * | # | in resolved | previous source | in index | next entry             | reported as        |
 * |---|-------------|-----------------|----------|------------------------|--------------------|
 * | 1 | yes         | not present     | —        | ADD, source: auto      | added              |
 * | 2 | yes         | auto            | —        | KEEP, auto             | — (silent)         |
 * | 3 | yes         | manual          | —        | KEEP, manual (sticky)  | — (silent)         |
 * | 4 | yes         | absent (legacy) | —        | KEEP, tag auto         | — (silent)         |
 * | 5 | no          | auto            | any      | DROP                   | dropped-unselected |
 * | 6 | no          | manual          | yes      | KEEP, manual           | — (silent)         |
 * | 7 | no          | manual          | no       | DROP                   | dropped-gone       |
 * | 8 | no          | absent (legacy) | yes      | KEEP, tag manual       | kept-manual        |
 * | 9 | no          | absent (legacy) | no       | DROP                   | dropped-gone       |
 *
 * Nine cells, three outcomes (ADD / KEEP / DROP). The LEGACY inference runs
 * FIRST — a `source`-absent entry reads as `auto` when it is in the resolved set
 * (row 4) and as `manual` when it is not (rows 8/9) — and then the manual rules
 * run over the result. That is why row 9 lands on the same `dropped-gone` as row
 * 7 instead of inventing a tenth outcome. The inference is deterministic, but it
 * is a RECONSTRUCTION, not a recovered fact: rows 8/9 also catch an entry that
 * WAS auto and that a newer index no longer selects. Tagging both `manual` is
 * the fail-safe direction (preserving is recoverable, deleting is not), and it
 * sets only the TAG — row 9 still DROPS a capability gone from the index. It is
 * applied ONLY here, because this is the only place holding the fresh index.
 *
 * Idempotent by construction: after one merge every surviving entry carries an
 * explicit `source`, so row 4's entry becomes row 2 next run and row 8's becomes
 * row 6 — both silent. Rows 1/5/7/9 leave no entry behind to re-fire. Hence
 * `merge(merge(x)) = merge(x)` with an EMPTY change list, which is what makes a
 * second `pharn update` quiet.
 *
 * Row 5 is where a user-removed capability RESURRECTS: once removed it is gone
 * from `previous`, so the resolver re-selects it and it re-enters through row 1 —
 * installed and NAMED in the report. Resurrection is reported, not prevented;
 * preventing it needs tombstones, which are deliberately out of scope (P7).
 */
export type CapabilityChangeReason =
  'added' | 'dropped-unselected' | 'dropped-gone' | 'kept-manual';

export interface CapabilityChange {
  // The entry the change is about, carrying the `source` it resolved to.
  cap: InstalledCapability;
  reason: CapabilityChangeReason;
}

export interface CapabilityMerge {
  // The next `capabilities` array: every entry carries an explicit `source`.
  capabilities: InstalledCapability[];
  // Every membership difference, for the report. EMPTY means nothing changed —
  // and the caller renders nothing at all (no report noise on a steady state).
  changes: CapabilityChange[];
}

// The identity of a capability, everywhere in this CLI: the (name, role) PAIR.
// `add`, `remove` and the pickers already treat it as the identity, so the merge
// must not invent a different one.
function key(cap: { name: string; role: 'griller' | 'lens' }): string {
  return `${cap.role}:${cap.name}`;
}

/**
 * Merge the freshly-resolved selection with the previously-recorded
 * capabilities. Returns the next `capabilities` array plus every membership
 * change, by the table above.
 *
 * `selection` alone carries full-index membership — `resolveCapabilities` pushes
 * EVERY index entry into either `selected` or `skipped` — so no separate index
 * parameter is needed, and "does this still exist upstream?" stays a membership
 * test rather than a second fetch.
 *
 * ORDER (deterministic, P5): `selection.selected` in index order, then the
 * preserved-manual entries in their previous-config order. Stable across runs, so
 * a second merge reproduces the array byte-for-byte.
 *
 * DUPLICATES: `resolveCapabilities` explicitly preserves a duplicated index entry
 * ("a duplicate `name` yields two results, order preserved"). This function keeps
 * that promise — the output is built by ITERATING `selection.selected`, one entry
 * per selected element; the key is used only to look provenance up, never to
 * de-duplicate. Silently collapsing duplicates here would break a guarantee
 * another module makes.
 */
export function mergeCapabilities(
  selection: Selection,
  previous: readonly InstalledCapability[],
): CapabilityMerge {
  const resolved = new Set(selection.selected.map(key));
  const inIndex = new Set([
    ...selection.selected.map(key),
    ...selection.skipped.map(key),
  ]);

  // Previous provenance by key. First entry wins for a duplicated key — the
  // lookup must be a function, and "first" is the deterministic choice (P5).
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
      // Row 1 — newly selected for these archetypes (genuinely new upstream, or
      // a previously-removed capability resurfacing; indistinguishable without
      // tombstones, so it is REPORTED either way).
      const cap: InstalledCapability = {
        name: sel.name,
        role: sel.role,
        source: 'auto',
      };
      capabilities.push(cap);
      changes.push({ cap, reason: 'added' });
      continue;
    }
    // Rows 2/4 → auto. Row 3 → manual, STICKY: an entry the user asked for by
    // name stays manual even while the archetypes also select it, so a later
    // archetype change cannot quietly drop it.
    const source: CapabilitySource =
      previousSource.get(k) === 'manual' ? 'manual' : 'auto';
    capabilities.push({ name: sel.name, role: sel.role, source });
  }

  // --- The preserved-manual tail, in previous-config order (rows 5-9). ---
  for (const cap of previous) {
    const k = key(cap);
    // Already emitted by the prefix loop (rows 2-4).
    if (resolved.has(k)) continue;

    // Row 5 — pharn chose it, pharn un-chooses it. Its FILES are left on disk:
    // `update` never deletes.
    if (cap.source === 'auto') {
      changes.push({ cap, reason: 'dropped-unselected' });
      continue;
    }

    // Below here the entry is manual — either explicitly, or by the legacy
    // inference (absent `source` ∧ not resolved ⇒ tag manual). That inference is
    // a RECONSTRUCTION, not a recovered fact: such an entry was either added by
    // hand, or auto-selected by an OLDER index and since de-selected upstream.
    // Nothing offline distinguishes the two — the config records no history —
    // so both are tagged manual, which is the fail-safe direction. It decides
    // only the TAG, not the outcome: the index-membership test below still
    // drops a capability that no longer exists (rows 7/9).
    const inferred: InstalledCapability = { ...cap, source: 'manual' };

    // Rows 7 & 9 — a manual entry whose capability no longer exists upstream.
    // Dropped from the config rather than kept as a phantom pointing at nothing,
    // and NAMED — the install manifest silently contributes zero paths for a
    // missing capability dir (lib/install-manifest.ts, addDir's lstat guard), so
    // nothing else in the system would ever surface it. Its files stay on disk.
    if (!inIndex.has(k)) {
      changes.push({ cap: inferred, reason: 'dropped-gone' });
      continue;
    }

    // Rows 6 & 8 — kept. Row 8 (the legacy entry the inference just tagged) is
    // named ONCE, on the run that tags it; row 6 (already explicitly manual) is
    // silent, so the steady state stays quiet.
    capabilities.push(inferred);
    if (cap.source === undefined) {
      changes.push({ cap: inferred, reason: 'kept-manual' });
    }
  }

  return { capabilities, changes };
}
