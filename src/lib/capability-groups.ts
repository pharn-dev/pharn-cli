import { row } from './format.js';
import { terminalSafe } from './terminal-safe.js';
import type { Archetype, InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Capability role-group DISPLAY: the one place that orders and groups
// capabilities by role, shared by the bare pickers and `pharn list`, so the two
// never drift. Fixed role order; within a role, input order. Pure.
// ---------------------------------------------------------------------------

// The role → display-label order (grillers before lenses).
export const ROLE_GROUPS: {
  role: InstalledCapability['role'];
  label: string;
}[] = [
  { role: 'griller', label: 'grillers' },
  { role: 'lens', label: 'lenses' },
];

// The bullet each capability line is prefixed with.
const BULLET = '—';

// The minimal view `renderCapabilityLines` needs.
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
 *       — copy-paste-drift  (manual)
 *
 * One capability PER LINE (never comma-joined, so nothing wraps mid-item),
 * each group headed `<label> (<count>)`. An empty role renders no header; zero
 * capabilities renders `(none)`.
 */
export function renderCapabilityLines(view: CapabilityListView): string[] {
  const lines: string[] = [
    // Validated at load; sanitized here too, as it reaches the terminal.
    row('Skills version', `v${terminalSafe(view.skillsVersion)}`),
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
    // Only `manual` is annotated: the entry is the user's, and `update`
    // preserves it rather than re-deriving it from the archetypes.
    for (const cap of inRole) {
      const tag = cap.source === 'manual' ? '  (manual)' : '';
      lines.push(`      ${BULLET} ${cap.name}${tag}`);
    }
  }
  return lines;
}
