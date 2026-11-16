import { ROLE_GROUPS } from './capability-groups.js';
import type { CapabilityIndex, InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Bare-invocation picker option models and the interactivity gate (pure; no
// I/O, no clack). Bare `pharn add` / `pharn remove` selections are sugar over
// the per-name paths, never a second installer. Options come only from the
// validated CapabilityIndex and config.capabilities, never raw frontmatter.
// ---------------------------------------------------------------------------

// One picker option, mapping 1:1 onto a clack `Option`. `value` is the
// `<role>:<name>` address; `label` the bare name.
export interface PickerOption {
  value: string;
  label: string;
}

// Options grouped by role label — clack `groupMultiselect`'s `options` shape.
export type PickerGroups = Record<string, PickerOption[]>;

// Role order is shared with `pharn list` via ROLE_GROUPS.

// Group capabilities by role: fixed role order, the caller's option order,
// empty groups omitted (no header for a role with nothing to offer).
function groupByRole(caps: readonly InstalledCapability[]): PickerGroups {
  const groups: PickerGroups = {};
  for (const { role, label } of ROLE_GROUPS) {
    const inRole = caps.filter((c) => c.role === role);
    if (inRole.length === 0) continue;
    groups[label] = inRole.map((c) => ({
      value: `${c.role}:${c.name}`,
      label: c.name,
    }));
  }
  return groups;
}

export interface AddSelection {
  // Options for NOT-yet-installed capabilities, grouped by role.
  groups: PickerGroups;
  // Count of not-installed capabilities — 0 ⇒ "everything is already installed".
  availableCount: number;
  // The already-installed capabilities, for the "Installed (N): …" summary line.
  installed: InstalledCapability[];
}

/**
 * Build the bare `pharn add` picker model: available = index − installed by
 * `(name, role)` (the pair is the identity), grouped by role. The installed set
 * is returned for the summary line; the picker offers only not-installed items.
 */
export function buildAddSelection(
  index: CapabilityIndex,
  installed: readonly InstalledCapability[],
): AddSelection {
  const isInstalled = (c: InstalledCapability): boolean =>
    installed.some((i) => i.name === c.name && i.role === c.role);
  const available = index.capabilities.filter((c) => !isInstalled(c));
  return {
    groups: groupByRole(available),
    availableCount: available.length,
    installed: [...installed],
  };
}

export interface RemoveSelection {
  // Options for the installed capabilities, grouped by role.
  groups: PickerGroups;
}

/** Build the bare `pharn remove` picker model: exactly what is installed. */
export function buildRemoveSelection(
  installed: readonly InstalledCapability[],
): RemoveSelection {
  return { groups: groupByRole(installed) };
}

/**
 * Is interaction allowed? True only when BOTH stdin and stdout are TTYs — the
 * one such predicate; callers hard-fail otherwise, never prompt into a pipe.
 */
export function interactiveAllowed(streams: {
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
}): boolean {
  return Boolean(streams.stdinIsTTY) && Boolean(streams.stdoutIsTTY);
}
