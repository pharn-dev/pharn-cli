import {
  CLAUDE_AGENTS_DIR,
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  CONTRACTS_DIR,
  CORE_DIR,
  DEV_COMMAND_PREFIX,
  FEATURES_README,
  FLAT_LICENSE_DEST,
  FLOOR_DIR,
  GRILLERS_DIR,
  LENSES_DIR,
  PRODUCT_COMMAND_PREFIX,
  TRUSTED_DOCS,
} from './constants.js';
import { MODELS_RECORD_KEY } from './install-records.js';
import { layoutPaths, type LayoutPaths } from './layout.js';
import { COPY_FILENAME_RE } from './validate.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// The install-root surfaces of the pharn layout (`layoutPaths`) and of the
// legacy root (LEGACY_ROOT) — the paths some install, current or older, could
// have written. Shared by orphan detection,
// `uninstall` and the `.prettierignore` entries, so none keeps its own list.
// ---------------------------------------------------------------------------

// The filename filters the install applies to its flat `.claude/` surfaces,
// shared with every reader that classifies an installed path (re-exported by
// lib/install-manifest.ts). `name` is relative to the
// surface dir: anything nested is never taken.

/** A product command: a top-level `pharn-*.md` that is not a `pharn-dev-*` one. */
export function isProductCommandFile(name: string): boolean {
  return (
    !name.includes('/') &&
    name.endsWith('.md') &&
    name.startsWith(PRODUCT_COMMAND_PREFIX) &&
    !name.startsWith(DEV_COMMAND_PREFIX)
  );
}

/**
 * A product agent definition under `.claude/agents/`: the command name rule, so
 * a dev-loop agent stays out of a product install like a dev-loop command does.
 */
export function isProductAgentFile(name: string): boolean {
  return isProductCommandFile(name);
}

/**
 * A hook script: a top-level `.cjs` OR `.mjs` file that is not a test
 * (`*.test.cjs` / `*.test.mjs`) — upstream may ship either flavour.
 */
export function isInstalledHookFile(name: string): boolean {
  return (
    !name.includes('/') &&
    /\.(cjs|mjs)$/.test(name) &&
    !/\.test\.(cjs|mjs)$/.test(name)
  );
}

type SurfacePaths = Omit<LayoutPaths, 'layout' | 'license'> & {
  license: { to: string };
};

// The root paths the legacy flat layout (removed in v0.21.0) installed to,
// and with its `docs` the root THREAT-MODEL.md / LIMITS.md a pre-7.0 clone
// gave a pharn-layout install. Nothing installs there any more: they stay here
// only so such a RECORD is still an install path — an orphan `status` and
// `update` name and `uninstall` removes by its hash — instead of being dropped
// from the store without a word.
const LEGACY_ROOT: SurfacePaths = {
  grillers: GRILLERS_DIR,
  lenses: LENSES_DIR,
  contracts: CONTRACTS_DIR,
  core: CORE_DIR,
  floor: FLOOR_DIR,
  docs: TRUSTED_DOCS,
  license: { to: FLAT_LICENSE_DEST },
  featuresReadme: FEATURES_README,
};

const BOTH_LAYOUTS: readonly SurfacePaths[] = [
  LEGACY_ROOT,
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
 * Could ANY install have written `rel`? A file of either layout's fixed
 * surfaces (derived from `layoutPaths`, with the install's own name filters),
 * or a path inside the outer bound an install from pharn-install.json may write
 * ({@link isPharnOwnedPath}), so a file installed into a surface this CLI does
 * not name can still be updated, orphaned and uninstalled — each of those still
 * gated by its record's hash.
 */
export function isInstallRootPath(rel: string): boolean {
  if (rel === MODELS_RECORD_KEY) return false;
  return isLegacyInstallPath(rel) || isPharnOwnedPath(rel);
}

// The surfaces this CLI names, both layouts (every install before the manifest).
function isLegacyInstallPath(rel: string): boolean {
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

// ---------------------------------------------------------------------------
// THE OUTER BOUND — the one CLI-owned answer to "may a pharn-install.json
// `dest` name this path?", and the record-key bound beside it. The manifest is
// untrusted, so its own `installRoots` never decide this (an `include: ["**"]`
// would reach `.git/hooks/`). Wide enough that a surface upstream ADDS under a
// pharn-owned name installs with no CLI release; narrow enough that it never
// reaches the project root, a `.git` or dot-led segment, `.claude/settings*`,
// or user data under `pharn/` (`memory-bank/`, `features/<x>/`,
// `spec-template.md`, `.backup/`, `.lock`). `.claude/settings.json` is not in
// it: the manifest may name it only as `if-absent` (lib/upstream-manifest.ts).
// ---------------------------------------------------------------------------

const PHARN_ROOT = 'pharn';
const CLAUDE_ROOT = '.claude';
// One path segment an install may create: no dot-led name (so no `.`, `..`,
// `.git`, `.backup`, `.lock`), nothing outside the portable filename set.
// Mirrored upstream: pharn-oss's generator `.dev/floor/install-manifest-core.mjs`
// (`assertPlainRelative`) holds every emitted dest to this rule, so a release
// this CLI would refuse is caught when pharn-oss builds it. Change both together.
const OWNED_SEGMENT_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
// A directory name under `.claude/` (`commands`, `skills`, ...).
const CLAUDE_DIR_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A pharn-owned entry name: `pharn-*`, never a dev-loop `pharn-dev-*`.
const isPharnOwnedName = (name: string): boolean =>
  name.startsWith(PRODUCT_COMMAND_PREFIX) &&
  !name.startsWith(DEV_COMMAND_PREFIX) &&
  name.length > PRODUCT_COMMAND_PREFIX.length;

// The pharn layout's fixed roots below `pharn/` whose names are not `pharn-*`:
// files, and the one directory (`floor/`) installed whole.
const PHARN = layoutPaths('pharn');
const PHARN_FIXED_FILES: ReadonlySet<string> = new Set([
  ...PHARN.docs,
  PHARN.license.to,
  PHARN.featuresReadme,
]);
const PHARN_FIXED_DIRS: readonly string[] = [PHARN.floor];
const PHARN_SUBTREES: readonly string[] = [PHARN.grillers, PHARN.lenses];

/**
 * Is `rel` inside the outer bound: (a) below `pharn/`, inside a `pharn-*` entry
 * or one of the layout's fixed roots (a capability subtree only inside a
 * capability dir), or (b) below `.claude/<dir>/`, inside a `pharn-*` entry (a
 * file directly there also passes COPY_FILENAME_RE), or a top-level hook under
 * `.claude/hooks/` (upstream hook names carry no `pharn-` prefix).
 */
export function isPharnOwnedPath(rel: string): boolean {
  const segments = rel.split('/');
  const [root, entry] = segments as [string, string, ...string[]];
  // The two roots are fixed names; every segment below one must be ownable.
  if (root !== PHARN_ROOT && root !== CLAUDE_ROOT) return false;
  const below = segments.slice(1);
  if (below.length === 0 || !below.every((s) => OWNED_SEGMENT_RE.test(s)))
    return false;
  if (root === PHARN_ROOT) {
    if (PHARN_FIXED_FILES.has(rel)) return true;
    if (PHARN_FIXED_DIRS.some((dir) => rel.startsWith(`${dir}/`))) return true;
    if (PHARN_SUBTREES.some((dir) => rel.startsWith(`${dir}/`)))
      return capabilityOf(rel) !== null;
    return segments.length > 2 && isPharnOwnedName(entry);
  }
  if (segments.length < 3) return false;
  const dir = entry;
  const name = segments[2]!;
  if (!CLAUDE_DIR_RE.test(dir)) return false;
  const isFile = segments.length === 3;
  if (
    isFile &&
    `${root}/${dir}` === CLAUDE_HOOKS_DIR &&
    isInstalledHookFile(name)
  )
    return COPY_FILENAME_RE.test(name);
  if (!isPharnOwnedName(name)) return false;
  return !isFile || COPY_FILENAME_RE.test(name);
}
