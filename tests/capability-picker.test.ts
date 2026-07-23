import { describe, expect, it } from 'vitest';
import {
  buildAddSelection,
  buildRemoveSelection,
  interactiveAllowed,
} from '../src/lib/capability-picker.js';
import type { CapabilityIndex, InstalledCapability } from '../src/types.js';

// The bare-picker option models are PURE (no I/O, no clack) — this exercises the
// selection/grouping/empty-state logic the checklist calls out, not the prompt
// rendering.

const index: CapabilityIndex = {
  capabilities: [
    { name: 'a11y', role: 'griller', applies: ['ssr', 'spa'] },
    { name: 'security', role: 'griller', applies: 'universal' },
    { name: 'n-plus-one', role: 'lens', applies: ['backend', 'ssr'] },
    { name: 'ssrf', role: 'lens', applies: 'universal' },
  ],
};

describe('interactiveAllowed', () => {
  it('is true only when BOTH stdin and stdout are TTYs', () => {
    expect(interactiveAllowed({ stdinIsTTY: true, stdoutIsTTY: true })).toBe(
      true,
    );
  });

  it('is false when stdin is not a TTY', () => {
    expect(interactiveAllowed({ stdinIsTTY: false, stdoutIsTTY: true })).toBe(
      false,
    );
  });

  it('is false when stdout is not a TTY', () => {
    expect(interactiveAllowed({ stdinIsTTY: true, stdoutIsTTY: false })).toBe(
      false,
    );
  });

  it('is false when neither is a TTY', () => {
    expect(interactiveAllowed({ stdinIsTTY: false, stdoutIsTTY: false })).toBe(
      false,
    );
  });

  it('is false when the flags are undefined (Node reports undefined off a TTY)', () => {
    expect(interactiveAllowed({})).toBe(false);
  });
});

describe('buildAddSelection', () => {
  it('offers available = index − installed, grouped by role (grillers before lenses)', () => {
    const installed: InstalledCapability[] = [
      { name: 'security', role: 'griller' },
    ];
    const { groups, availableCount } = buildAddSelection(index, installed);
    expect(availableCount).toBe(3);
    // Fixed group order: grillers before lenses.
    expect(Object.keys(groups)).toEqual(['grillers', 'lenses']);
    expect(groups.grillers).toEqual([{ value: 'griller:a11y', label: 'a11y' }]);
    expect(groups.lenses).toEqual([
      { value: 'lens:n-plus-one', label: 'n-plus-one' },
      { value: 'lens:ssrf', label: 'ssrf' },
    ]);
  });

  it('still offers a name in the OTHER role when it is installed in one', () => {
    const dupIndex: CapabilityIndex = {
      capabilities: [
        { name: 'dup', role: 'griller', applies: 'universal' },
        { name: 'dup', role: 'lens', applies: 'universal' },
      ],
    };
    const { groups, availableCount } = buildAddSelection(dupIndex, [
      { name: 'dup', role: 'griller' },
    ]);
    expect(availableCount).toBe(1);
    expect(groups).toEqual({ lenses: [{ value: 'lens:dup', label: 'dup' }] });
  });

  it('omits an empty group (no lenses available → no lenses key)', () => {
    const grillersOnly: CapabilityIndex = {
      capabilities: [{ name: 'a11y', role: 'griller', applies: 'universal' }],
    };
    const { groups } = buildAddSelection(grillersOnly, []);
    expect(Object.keys(groups)).toEqual(['grillers']);
  });

  it('reports availableCount 0 when everything is installed (empty groups)', () => {
    const installed: InstalledCapability[] = index.capabilities.map((c) => ({
      name: c.name,
      role: c.role,
    }));
    const { groups, availableCount } = buildAddSelection(index, installed);
    expect(availableCount).toBe(0);
    expect(groups).toEqual({});
  });

  it('returns the installed set (for the summary line)', () => {
    const installed: InstalledCapability[] = [
      { name: 'security', role: 'griller' },
    ];
    expect(buildAddSelection(index, installed).installed).toEqual(installed);
  });
});

describe('buildRemoveSelection', () => {
  it('offers the installed capabilities grouped by role', () => {
    const installed: InstalledCapability[] = [
      { name: 'a11y', role: 'griller' },
      { name: 'n-plus-one', role: 'lens' },
    ];
    expect(buildRemoveSelection(installed).groups).toEqual({
      grillers: [{ value: 'griller:a11y', label: 'a11y' }],
      lenses: [{ value: 'lens:n-plus-one', label: 'n-plus-one' }],
    });
  });

  it('is empty when nothing is installed', () => {
    expect(buildRemoveSelection([]).groups).toEqual({});
  });

  it('omits an empty group (only grillers installed → no lenses key)', () => {
    const { groups } = buildRemoveSelection([
      { name: 'a11y', role: 'griller' },
    ]);
    expect(Object.keys(groups)).toEqual(['grillers']);
  });
});
