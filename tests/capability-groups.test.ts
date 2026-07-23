import { describe, expect, it } from 'vitest';
import {
  renderCapabilityLines,
  ROLE_GROUPS,
  type CapabilityListView,
} from '../src/lib/capability-groups.js';
import type { InstalledCapability } from '../src/types.js';

function view(
  capabilities: InstalledCapability[],
  extra: Partial<CapabilityListView> = {},
): CapabilityListView {
  return {
    skillsVersion: '1.2.3',
    archetypes: ['backend', 'lib'],
    capabilities,
    ...extra,
  };
}

// The capability lines only (below the `CAPABILITIES` header) — every line that
// carries the em-dash bullet.
function bulletLines(lines: string[]): string[] {
  return lines.filter((l) => l.includes('—'));
}

describe('renderCapabilityLines', () => {
  it('keeps the Skills version and Archetypes key-value rows', () => {
    const lines = renderCapabilityLines(
      view([{ name: 'a11y', role: 'griller' }]),
    );
    expect(lines.some((l) => /Skills version\s+v1\.2\.3/.test(l))).toBe(true);
    expect(lines.some((l) => /Archetypes\s+backend, lib/.test(l))).toBe(true);
    expect(lines).toContain('  CAPABILITIES');
  });

  it('groups by role with a per-role count header, grillers before lenses', () => {
    const lines = renderCapabilityLines(
      view([
        { name: 'architecture', role: 'griller' },
        { name: 'comprehension', role: 'griller' },
        { name: 'copy-paste-drift', role: 'lens' },
      ]),
    );
    const gi = lines.indexOf('    grillers (2)');
    const li = lines.indexOf('    lenses (1)');
    expect(gi).toBeGreaterThan(-1);
    expect(li).toBeGreaterThan(-1);
    // grillers header precedes lenses header (fixed ROLE_GROUPS order).
    expect(gi).toBeLessThan(li);
  });

  it('renders ONE capability per line, dash-bulleted, never comma-joined', () => {
    const lines = renderCapabilityLines(
      view([
        { name: 'architecture', role: 'griller' },
        { name: 'comprehension', role: 'griller' },
      ]),
    );
    expect(lines).toContain('      — architecture');
    expect(lines).toContain('      — comprehension');
    // No line joins two capability names with a comma.
    expect(lines.every((l) => !/architecture.*,.*comprehension/.test(l))).toBe(
      true,
    );
    // One bullet line per capability.
    expect(bulletLines(lines)).toHaveLength(2);
  });

  it('omits a role header when that role has no capabilities', () => {
    const onlyGrillers = renderCapabilityLines(
      view([{ name: 'architecture', role: 'griller' }]),
    );
    expect(onlyGrillers.some((l) => l.includes('grillers'))).toBe(true);
    expect(onlyGrillers.some((l) => l.includes('lenses'))).toBe(false);

    const onlyLenses = renderCapabilityLines(
      view([{ name: 'n-plus-one', role: 'lens' }]),
    );
    expect(onlyLenses.some((l) => l.includes('lenses'))).toBe(true);
    expect(onlyLenses.some((l) => l.includes('grillers'))).toBe(false);
  });

  it('preserves stored (config) order within a role, roles always griller→lens', () => {
    // Interleaved input; roles must still emit griller-group-then-lens-group,
    // and within each role the ORIGINAL relative order is kept.
    const lines = renderCapabilityLines(
      view([
        { name: 'zeta', role: 'lens' },
        { name: 'bravo', role: 'griller' },
        { name: 'alpha', role: 'lens' },
        { name: 'yankee', role: 'griller' },
      ]),
    );
    const bullets = bulletLines(lines).map((l) => l.replace(/^\s*—\s*/, ''));
    expect(bullets).toEqual(['bravo', 'yankee', 'zeta', 'alpha']);
  });

  it('renders (none) and no role headers when nothing is installed', () => {
    const lines = renderCapabilityLines(view([]));
    expect(lines).toContain('  CAPABILITIES');
    expect(lines).toContain('  (none)');
    expect(bulletLines(lines)).toHaveLength(0);
    expect(lines.some((l) => l.includes('grillers'))).toBe(false);
    expect(lines.some((l) => l.includes('lenses'))).toBe(false);
  });

  it('renders (none) for an empty archetype list', () => {
    const lines = renderCapabilityLines(
      view([{ name: 'a11y', role: 'griller' }], { archetypes: [] }),
    );
    expect(lines.some((l) => /Archetypes\s+\(none\)/.test(l))).toBe(true);
  });

  it('exposes the shared role order as grillers-before-lenses', () => {
    expect(ROLE_GROUPS.map((g) => g.role)).toEqual(['griller', 'lens']);
    expect(ROLE_GROUPS.map((g) => g.label)).toEqual(['grillers', 'lenses']);
  });
});
