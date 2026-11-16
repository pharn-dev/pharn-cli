import {
  CLAUDE_AGENTS_DIR,
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
} from './constants.js';
import {
  isInstalledHookFile,
  isProductAgentFile,
  isProductCommandFile,
} from './install-manifest.js';
import { MODELS_RECORD_KEY } from './install-records.js';
import { layoutPaths, type LayoutPaths } from './layout.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// The install-root surfaces of BOTH layouts, derived from `layoutPaths` — the
// paths some install could have written. Shared by orphan detection,
// `uninstall` and the `.prettierignore` entries, so none keeps its own list.
// ---------------------------------------------------------------------------

const BOTH_LAYOUTS: readonly LayoutPaths[] = [
  layoutPaths('flat'),
  layoutPaths('pharn'),
];

// Whole-directory fixed surfaces (contracts, pharn-core, floor), both layouts.
export const SURFACE_DIRS: readonly string[] = BOTH_LAYOUTS.flatMap((p) => [
  p.contracts,
  p.core,
  p.floor,
]);

// Single-file fixed surfaces (trusted docs, the mapped LICENSE, the
// product-loop boundary contract), both layouts.
const SURFACE_FILES: ReadonlySet<string> = new Set(
  BOTH_LAYOUTS.flatMap((p) => [...p.docs, p.license.to, p.featuresReadme]),
);

// Capability subtrees, both layouts, with the role each one holds.
export const CAPABILITY_SUBTREES: readonly {
  subtree: string;
  role: InstalledCapability['role'];
}[] = BOTH_LAYOUTS.flatMap((p) => [
  { subtree: p.grillers, role: 'griller' as const },
  { subtree: p.lenses, role: 'lens' as const },
]);

// The direct child of `dir` that `rel` names, or null when `rel` is not
// exactly one segment below `dir`.
function directChild(rel: string, dir: string): string | null {
  if (!rel.startsWith(`${dir}/`)) return null;
  const name = rel.slice(dir.length + 1);
  return name !== '' && !name.includes('/') ? name : null;
}

// The `role:name` of the capability dir `rel` lies inside, or null when it is
// not inside one (`<subtree>/<name>/<at least one more segment>`).
export function capabilityOf(rel: string): string | null {
  for (const { subtree, role } of CAPABILITY_SUBTREES) {
    if (!rel.startsWith(`${subtree}/`)) continue;
    const rest = rel.slice(subtree.length + 1);
    const slash = rest.indexOf('/');
    if (slash <= 0 || slash === rest.length - 1) return null;
    return `${role}:${rest.slice(0, slash)}`;
  }
  return null;
}

/**
 * Could ANY install (flat or pharn layout) have written `rel`? Mirrors the
 * surfaces lib/install-manifest.ts enumerates, derived from `layoutPaths`.
 */
export function isInstallRootPath(rel: string): boolean {
  if (rel === MODELS_RECORD_KEY) return false;
  if (SURFACE_FILES.has(rel)) return true;
  if (SURFACE_DIRS.some((dir) => rel.startsWith(`${dir}/`))) return true;
  if (capabilityOf(rel) !== null) return true;
  // The install's own name filters, so this bound takes exactly the command,
  // agent and hook names an install copies.
  const command = directChild(rel, CLAUDE_COMMANDS_DIR);
  if (command !== null) return isProductCommandFile(command);
  const agent = directChild(rel, CLAUDE_AGENTS_DIR);
  if (agent !== null) return isProductAgentFile(agent);
  const hook = directChild(rel, CLAUDE_HOOKS_DIR);
  if (hook !== null) return isInstalledHookFile(hook);
  return false;
}
