import { ROLE_GROUPS } from './capability-groups.js';
import type { CapabilityIndex, InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Bare-invocation picker option models (pure, no I/O, no clack import). Bare
// `pharn add` / `pharn remove` in a terminal open a grouped multi-select; that
// selection is SUGAR over the existing per-name install/remove paths (never a
// second installer). This module owns only the pure parts — the option MENUS
// the pickers render and the interactivity gate — so `available = catalog −
// installed`, grouping, and the empty states are unit-testable without a TTY or
// a clone. One axis (P3): the bare-picker's option models + its interactivity
// gate.
//
// Determinism (P5): `available` and grouping are set-membership over
// `(name, role)` — no classification. The commands read `process.std*.isTTY`
// and pass the two booleans to `interactiveAllowed` so the guard stays pure and
// testable; a non-interactive stream is a hard-fail at the call site, never a
// silent prompt.
//
// Trust (P2): options are built only from the already-validated CapabilityIndex
// (name/role are CAPABILITY_NAME_RE/enum-checked at the parseCapabilityIndex
// fetch boundary) and from config.capabilities — no raw untrusted frontmatter
// reaches the prompt.
// ---------------------------------------------------------------------------

// One picker option — a plain shape that maps 1:1 onto a clack `Option` (so this
// module never imports clack). `value` is the `<role>:<name>` capability address
// (lib/capability-address.ts grammar); `label` is the bare capability name.
export interface PickerOption {
  value: string;
  label: string;
}

// Options grouped by role label ("grillers" / "lenses") — the shape clack's
// `groupMultiselect` takes as `options`. An empty group is omitted so a role
// with nothing to offer renders no header.
export type PickerGroups = Record<string, PickerOption[]>;

// The role → group-label order is shared with `pharn list`'s human output via
// lib/capability-groups.ts (ROLE_GROUPS) so the picker menu and the list render
// the same fixed order (grillers before lenses) from one source of truth, P5.

// Group capabilities by role into the PickerGroups shape. Deterministic: role
// order is fixed (ROLE_GROUPS), option order is the caller's input order (the
// index's / config's declared order). Empty groups are omitted.
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
 * `(name, role)` membership (P5), grouped by role. A capability installed in one
 * role is still offered in the other (the pair `(name, role)` is the identity).
 * The installed set is returned for the summary line (chosen at GATE 1 over an
 * in-list disabled rendering) — the picker offers ONLY not-installed items.
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

/**
 * Build the bare `pharn remove` picker model: the installed capabilities grouped
 * by role. `remove` is subtractive-only — it offers exactly what is installed.
 */
export function buildRemoveSelection(
  installed: readonly InstalledCapability[],
): RemoveSelection {
  return { groups: groupByRole(installed) };
}

/**
 * Is interaction allowed? True only when BOTH stdin and stdout are TTYs. The
 * commands pass `process.stdin.isTTY` / `process.stdout.isTTY`; keeping the guard
 * a pure boolean function makes the non-TTY behavior unit-testable. Non-TTY (CI,
 * a pipe) ⇒ false ⇒ the command hard-fails with a usage error, never a prompt.
 */
export function interactiveAllowed(streams: {
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
}): boolean {
  return Boolean(streams.stdinIsTTY) && Boolean(streams.stdoutIsTTY);
}
