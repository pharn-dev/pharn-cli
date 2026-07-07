import { describe, expect, it } from 'vitest';
import { resolveCapabilities } from '../src/lib/resolve-capabilities.js';
import type {
  Archetype,
  CapabilityEntry,
  CapabilityIndex,
} from '../src/types.js';

function index(...capabilities: CapabilityEntry[]): CapabilityIndex {
  return { capabilities };
}

const security: CapabilityEntry = {
  name: 'security',
  role: 'griller',
  applies: 'universal',
};
const a11y: CapabilityEntry = {
  name: 'a11y',
  role: 'griller',
  applies: ['ssr', 'spa'],
};
const nPlusOne: CapabilityEntry = {
  name: 'n-plus-one',
  role: 'lens',
  applies: ['ssr', 'backend'],
};

describe('resolveCapabilities', () => {
  it('always selects a universal capability, for any archetype set', () => {
    const sets: Archetype[][] = [[], ['lib'], ['backend'], ['ssr', 'spa']];
    for (const archetypes of sets) {
      const r = resolveCapabilities(archetypes, index(security));
      expect(r.selected.map((c) => c.name)).toEqual(['security']);
      expect(r.selected[0]!.matched).toBe('universal');
      expect(r.skipped).toEqual([]);
    }
  });

  it('selects a frontend capability for spa and SKIPS it for backend (a11y)', () => {
    const spa = resolveCapabilities(['spa'], index(a11y));
    expect(spa.selected.map((c) => c.name)).toEqual(['a11y']);
    expect(spa.selected[0]!.matched).toEqual(['spa']);
    expect(spa.skipped).toEqual([]);

    // The brief's headline invariant: a backend project gets no a11y.
    const backend = resolveCapabilities(['backend'], index(a11y));
    expect(backend.selected).toEqual([]);
    expect(backend.skipped.map((c) => c.name)).toEqual(['a11y']);
    expect(backend.skipped[0]!.reason).toContain('backend');
  });

  it('selects a capability that applies to any detected archetype (multi)', () => {
    const r = resolveCapabilities(['ssr', 'backend'], index(a11y, nPlusOne));
    // a11y [ssr,spa] matches ssr; n-plus-one [ssr,backend] matches both
    expect(r.selected.map((c) => c.name)).toEqual(['a11y', 'n-plus-one']);
    expect(r.skipped).toEqual([]);
  });

  it('returns empty selected and skipped for an empty index', () => {
    expect(resolveCapabilities(['ssr'], index())).toEqual({
      selected: [],
      skipped: [],
    });
  });

  it("preserves the index's declared order across selected and skipped", () => {
    const r = resolveCapabilities(['backend'], index(a11y, security, nPlusOne));
    // a11y skipped (frontend-only); security + n-plus-one selected, order kept
    expect(r.selected.map((c) => c.name)).toEqual(['security', 'n-plus-one']);
    expect(r.skipped.map((c) => c.name)).toEqual(['a11y']);
  });

  it('is deterministic — identical result across repeated calls', () => {
    const idx = index(a11y, security, nPlusOne);
    expect(resolveCapabilities(['ssr'], idx)).toEqual(
      resolveCapabilities(['ssr'], idx),
    );
  });

  it('resolves a duplicate capability name independently, order preserved', () => {
    const r = resolveCapabilities(['spa'], index(a11y, a11y));
    expect(r.selected.map((c) => c.name)).toEqual(['a11y', 'a11y']);
    expect(r.skipped).toEqual([]);
  });

  it('skips an entry with empty applies:[] for any archetype set', () => {
    const never: CapabilityEntry = { name: 'never', role: 'lens', applies: [] };
    const r = resolveCapabilities(['ssr', 'backend', 'spa'], index(never));
    expect(r.selected).toEqual([]);
    expect(r.skipped.map((c) => c.name)).toEqual(['never']);
  });
});
