import type {
  Archetype,
  CapabilityIndex,
  SelectedCapability,
  Selection,
  SkippedCapability,
} from '../types.js';

// ---------------------------------------------------------------------------
// Capability selection (pure): archetypes + the already-validated capability
// index → which capabilities apply.
// ---------------------------------------------------------------------------

/**
 * Select the capabilities that apply: `universal` always; an `Archetype[]`
 * `applies` iff it intersects `archetypes` (so `[]` never), else skipped with a
 * reason. Both lists keep the index's order; each entry is resolved
 * independently (no de-duplication here).
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
        // Neutral: the archetypes may come from detection, `--archetype` or
        // the config.
        reason: `applies to [${entry.applies.join(', ')}]; archetypes [${archetypes.join(', ')}]`,
      });
    }
  }

  return { selected, skipped };
}
