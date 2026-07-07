import type {
  Archetype,
  CapabilityIndex,
  SelectedCapability,
  Selection,
  SkippedCapability,
} from '../types.js';

// ---------------------------------------------------------------------------
// Capability selection (pure, no I/O): detected archetypes + the pharn-oss
// capability index → which capabilities apply. A `universal` capability is
// always selected; an archetype-gated one is selected iff its `applies` set
// intersects the detected archetypes, else skipped with a reason. Deterministic
// membership only (P5); the index's declared order is preserved so the result
// is stable.
//
// This consumes an already-TYPED index. Parsing + validating the untrusted
// index bytes is the fetch boundary's job, a later increment (THREAT-MODEL.md
// §2, surface B); this module assumes a validated index.
// ---------------------------------------------------------------------------

/**
 * Select the capabilities that apply to a project, given its detected
 * archetypes and the capability index. Returns `selected` and `skipped` (each
 * with why), both in the index's declared order (stable / deterministic).
 *
 * Selection rule (membership, P5):
 * - `applies: 'universal'` → always selected.
 * - `applies: Archetype[]` → selected iff it shares an archetype with
 *   `archetypes`; otherwise skipped (including the empty `applies: []`, which
 *   intersects nothing and is always skipped).
 *
 * Each index entry is resolved independently: a duplicate `name` yields two
 * results, order preserved (de-duplication belongs to the fetch-boundary
 * validation, not here).
 */
export function resolveCapabilities(
  archetypes: Archetype[],
  index: CapabilityIndex,
): Selection {
  const detected = new Set<Archetype>(archetypes);
  const selected: SelectedCapability[] = [];
  const skipped: SkippedCapability[] = [];

  for (const entry of index.capabilities) {
    if (entry.applies === 'universal') {
      selected.push({
        name: entry.name,
        role: entry.role,
        matched: 'universal',
      });
      continue;
    }
    const matched = entry.applies.filter((a) => detected.has(a));
    if (matched.length > 0) {
      selected.push({ name: entry.name, role: entry.role, matched });
    } else {
      skipped.push({
        name: entry.name,
        role: entry.role,
        reason: `applies to [${entry.applies.join(', ')}]; detected [${archetypes.join(', ')}]`,
      });
    }
  }

  return { selected, skipped };
}
