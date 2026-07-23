import { row } from './format.js';
import type { Archetype, InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Capability role-group DISPLAY — the single source of truth for how installed
// capabilities are ordered and grouped by role in the CLI's human surfaces. Two
// surfaces consume this: the bare `pharn add` / `pharn remove` pickers
// (lib/capability-picker.ts, which imports ROLE_GROUPS) and `pharn list`'s
// human output (renderCapabilityLines). Keeping the order in ONE place means the
// two never drift (grillers always before lenses). Pure — no I/O, no clack — so
// the renderer is unit-testable without a TTY (P1).
//
// Determinism (P5): the role order is a FIXED membership iteration over
// ROLE_GROUPS; within a role, items keep their input order (the config's stored
// array order) — no classification, no sort by a guessed key.
// ---------------------------------------------------------------------------

// The role → display-label order. Iterated in this fixed order so identical
// state always renders identically (grillers before lenses).
export const ROLE_GROUPS: {
  role: InstalledCapability['role'];
  label: string;
}[] = [
  { role: 'griller', label: 'grillers' },
  { role: 'lens', label: 'lenses' },
];

// The em-dash bullet each capability line is prefixed with (the repo's
// prevailing typographic style; chosen at plan approval over en-dash / hyphen).
const BULLET = '—';

// The minimal view `renderCapabilityLines` needs — a projection of the archetype
// inventory / pharn.config.json (this CLI owns that schema, P3).
export interface CapabilityListView {
  skillsVersion: string;
  archetypes: Archetype[];
  capabilities: InstalledCapability[];
}

/**
 * Render the human `note` body for `pharn list` as an array of lines (the
 * command joins them with `\n`). Layout:
 *
 *   Skills version            v1.2.3
 *   Archetypes                backend, lib
 *
 *   CAPABILITIES
 *     grillers (2)
 *       — architecture
 *       — comprehension
 *     lenses (1)
 *       — copy-paste-drift
 *
 * One capability PER LINE (never comma-joined), grouped by role in the fixed
 * ROLE_GROUPS order, each group headed `<label> (<count>)`. An empty role
 * renders no header; zero capabilities renders `(none)`. Deterministic (P5) and
 * pure — the readability win (no mid-item wrap on a narrow terminal) is advisory,
 * but the guaranteed, tested property is that items are never joined.
 */
export function renderCapabilityLines(view: CapabilityListView): string[] {
  const lines: string[] = [
    row('Skills version', `v${view.skillsVersion}`),
    row('Archetypes', view.archetypes.join(', ') || '(none)'),
    '',
    '  CAPABILITIES',
  ];
  if (view.capabilities.length === 0) {
    lines.push('  (none)');
    return lines;
  }
  for (const { role, label } of ROLE_GROUPS) {
    const inRole = view.capabilities.filter((c) => c.role === role);
    if (inRole.length === 0) continue;
    lines.push(`    ${label} (${inRole.length})`);
    for (const cap of inRole) lines.push(`      ${BULLET} ${cap.name}`);
  }
  return lines;
}
