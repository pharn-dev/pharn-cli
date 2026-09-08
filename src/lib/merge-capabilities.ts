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
 * ROW 0 — the FROZEN row, and it must run FIRST among the not-resolved rows.
 * An unparseable capability leaves the index ENTIRELY, so without this row a
 * recorded entry for it falls into one of the two DROP branches, chosen by its
 * stored `source`: `auto` → row 5, mis-reported as "your archetypes no longer
 * select it"; manual or legacy → rows 7/9, mis-reported as "no longer exists
 * upstream". Both are false, and both lose the entry over a TRANSIENT upstream
 * grammar break the user cannot see or fix. Row 5 runs before rows 7/9, so
 * patching only the `!inIndex` branch would still drop an auto entry — which is
 * exactly why row 0 sits above the `source` test rather than beside it.
 *
 * Row 0 KEEPS the entry VERBATIM, including an ABSENT `source`. The legacy
 * inference (rows 4/8/9) deliberately does not run on it: a parse failure is
 * evidence about upstream's bytes, not about who asked for this capability, so
 * reconstructing provenance from it would be inventing a fact. And it is
 * reported on EVERY run while the break persists — unlike the one-shot
 * `kept-manual` — because the anomaly is still live, and a steady-state silence
 * would hide an ongoing upstream break.
 *
 * Ten cells, three outcomes (ADD / KEEP / DROP). Among rows 1-9 the LEGACY
 * inference runs FIRST — a `source`-absent entry reads as `auto` when it is in the resolved set
 * (row 4) and as `manual` when it is not (rows 8/9) — and then the manual rules
 * run over the result. That is why row 9 lands on the same `dropped-gone` as row
 * 7 instead of inventing a tenth outcome. The inference is deterministic, but it
 * is a RECONSTRUCTION, not a recovered fact: rows 8/9 also catch an entry that
 * WAS auto and that a newer index no longer selects. Tagging both `manual` is
 * the fail-safe direction (preserving is recoverable, deleting is not), and it
 * sets only the TAG — row 9 still DROPS a capability gone from the index. It is
 * applied ONLY here, because this is the only place holding the fresh index.
 *
 * Idempotent by construction: after one merge every surviving NON-FROZEN entry
 * carries an explicit `source`, so row 4's entry becomes row 2 next run and row
 * 8's becomes row 6 — both silent. Rows 1/5/7/9 leave no entry behind to re-fire.
 * Hence `merge(merge(x)) = merge(x)` with an EMPTY change list, which is what
 * makes a second `pharn update` quiet. Row 0 is idempotent in its OUTPUT (the
 * entry is unchanged) but deliberately NOT silent on repeat, because its input —
 * an upstream capability the CLI cannot read — is still true.
 *
 * Row 5 is where a user-removed capability RESURRECTS: once removed it is gone
 * from `previous`, so the resolver re-selects it and it re-enters through row 1 —
 * installed and NAMED in the report. Resurrection is reported, not prevented;
 * preventing it needs tombstones, which are deliberately out of scope (P7).
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
  // EXCEPT a frozen one (row 0), which is preserved byte-for-byte — including an
  // absent `source`, because a parse failure is not evidence of provenance.
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
 * `selection` alone carries full-index membership for everything the fetch
 * boundary could PARSE — `resolveCapabilities` pushes every index entry into
 * either `selected` or `skipped` — so "does this still exist upstream?" stays a
 * membership test rather than a second fetch.
 *
 * `frozen` supplies the ONE fact `selection` structurally cannot: a capability
 * the parse REFUSED never enters the index at all, so it is indistinguishable
 * from a deleted one by membership alone. Its keys are `role:name` built from the
 * SUBTREE's role (the authoritative one — a frozen capability's declared `role`
 * may be exactly what failed), and they are the caller's to supply because this
 * module owns the merge, not the fetch.
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
  frozen: ReadonlySet<string>,
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

    // Row 0 — FROZEN. The capability exists upstream; this run just could not
    // read it. Kept VERBATIM (no provenance re-tag) and NAMED, so a transient
    // grammar break upstream can never silently delete a user's config entry.
    // It must precede the `source` test below: row 5 would otherwise claim an
    // auto entry, and report the wrong reason for the wrong outcome.
    if (frozen.has(k)) {
      const kept: InstalledCapability = { ...cap };
      capabilities.push(kept);
      changes.push({ cap: kept, reason: 'kept-frozen' });
      continue;
    }

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
