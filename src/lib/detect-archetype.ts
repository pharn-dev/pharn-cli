import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  archetypesFromSignals,
  classifyEntry,
  evidenceFor,
  isBaseDir,
  isNextConfigName,
  mergeSignals,
  packageFacts,
} from './archetype.js';
import type {
  ArchetypeEvidence,
  ArchetypeSignals,
  ClassifyContext,
  PackageFacts,
  ProjectPackages,
  SignalEvidence,
} from './archetype.js';
import type { Archetype } from '../types.js';

// ---------------------------------------------------------------------------
// Archetype detection — I/O boundary (project root → ArchetypeDetection). The
// ONLY archetype file that touches disk; the pure classification rules
// (packageFacts, classifyEntry) live in archetype.ts. Detection merges
// package.json dependency NAMES with file-tree structural signals, then applies
// the archetype rule once.
//
// Only NAMES are tested against fixed allowlists; nothing is executed, and the
// walk never reads a discovered file's body (only package.json is read).
// Evidence paths are built from the user's own entry names: display data only,
// never written, joined or compared, and rendered through `terminalSafe`.
// ---------------------------------------------------------------------------

// The boundary's result: the detected archetypes, with their evidence.
export interface ArchetypeDetection {
  archetypes: Archetype[];
  // One entry per archetype, in the same order (see `evidenceFor`).
  evidence: ArchetypeEvidence[];
  // The bounded walk stopped (WALK_LIMITS) while the result could still change.
  truncated: boolean;
}

// Directories never recursed into and never classified (build output, VCS,
// deps, framework caches), compared case-insensitively. A skip costs ZERO
// budget, so a fat cache cannot exhaust WALK_LIMITS.maxEntries before the walk
// reaches real source. The accepted cost: a hand-authored dir with one of these
// names (e.g. `out/`) goes dark — a lost signal, never a false one.
export const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next', // Next.js build cache
  'out', // Next.js static-export default output
  'coverage', // test-coverage output
  '.turbo', // Turborepo cache
  '.vercel', // deploy artifacts
  '.nuxt', // Nuxt build cache
  '.svelte-kit', // SvelteKit build cache
  '.astro', // Astro build cache
  '.cache', // generic tool cache (Parcel, Gatsby, …)
  '.parcel-cache', // Parcel cache
  'storybook-static', // Storybook static build
  // Non-JS trees never holding JS source; ordinary-looking names (`target`,
  // `vendor`, `venv`) are in ECOSYSTEM_DIRS instead.
  '__pycache__', // Python bytecode cache
  '.yarn', // Yarn Berry cache / PnP store
]);

/** How to tell that a directory is its ecosystem's tree. */
export type EcosystemMarker =
  // A regular file with one of these exact names beside the directory.
  | { siblings: readonly string[] }
  // A regular file with this exact name inside the directory.
  | { inside: string };

// Non-JS dependency/build trees — skipped at zero budget like SKIP_DIRS, but
// ONLY where they are that ecosystem's tree: their names are ordinary folder
// names in a JS project too, and a structural backend signal
// (`app/target/route.ts`) has no package.json backstop. The test is a lookup in
// the parent's already-read entries or one `lstat`, so a huge tree still costs
// one check. Dir names match case-insensitively; markers exactly, as regular
// files only.
export const ECOSYSTEM_DIRS: ReadonlyMap<string, EcosystemMarker> = new Map<
  string,
  EcosystemMarker
>([
  ['target', { siblings: ['Cargo.toml', 'pom.xml', 'build.sbt'] }], // Rust / Maven / sbt output
  ['vendor', { siblings: ['go.mod', 'composer.json', 'Gemfile'] }], // Go / PHP / Ruby deps
  ['venv', { inside: 'pyvenv.cfg' }], // Python virtualenv
  ['.venv', { inside: 'pyvenv.cfg' }], // Python virtualenv
]);

/**
 * Is `name` (a directory inside `dir`) its ecosystem's tree? `siblingFiles` is
 * the set of regular-file names in `dir`, from the entries already read.
 */
function isEcosystemTree(
  dir: string,
  name: string,
  siblingFiles: ReadonlySet<string>,
): boolean {
  const marker = ECOSYSTEM_DIRS.get(name.toLowerCase());
  if (marker === undefined) return false;
  if ('siblings' in marker) {
    return marker.siblings.some((file) => siblingFiles.has(file));
  }
  return (
    lstatSync(join(dir, name, marker.inside), {
      throwIfNoEntry: false,
    })?.isFile() === true
  );
}

// Bounded walk: a DEFENSIVE bound on a pathological tree, chosen generously. A
// signal past a cap is undetected, so a cap that bites before the result is
// settled sets `truncated` and `init` says so. `maxDepth`: directories below the
// root whose entries are still classified; `maxEntries`: entries classified in
// all. `scanFileTree` takes other limits for tests only.
export interface WalkLimits {
  readonly maxDepth: number;
  readonly maxEntries: number;
}
export const WALK_LIMITS: WalkLimits = Object.freeze({
  maxDepth: 24,
  maxEntries: 50_000,
});

/**
 * What the scan root's package.json tells the walk. `jsProject` (a usable
 * manifest) gates the language-agnostic backend signals; `nextDependency` is the
 * root base's Next evidence. A missing manifest is both `false`.
 * `packageSignals` are the manifest's own signals: they never enter the tree's
 * result, they only let the walk stop once the MERGED result is settled.
 */
export interface RootFacts {
  jsProject: boolean;
  nextDependency: boolean;
  packageSignals?: ArchetypeSignals;
}

const NO_PACKAGE_JSON: RootFacts = { jsProject: false, nextDependency: false };

const NO_SIGNALS: ArchetypeSignals = {
  ssr: false,
  backend: false,
  clientUi: false,
};

/**
 * The walk's result: the merged tree signals, each signal's first trigger, and
 * whether a cap stopped the walk before the result was settled. A settled walk
 * may leave `clientUi` unset (ssr suppresses spa); the archetypes and evidence
 * still equal a full walk's.
 */
export interface TreeScan {
  signals: ArchetypeSignals;
  evidence: SignalEvidence;
  // Never true for a settled walk.
  truncated: boolean;
}

const SIGNAL_KEYS: ReadonlyArray<keyof ArchetypeSignals> = [
  'ssr',
  'backend',
  'clientUi',
];

/**
 * Walk the project tree once and collect the merged file-tree signals, plus the
 * project-relative path of the FIRST entry that raised each one (evidence).
 * Classification is the pure `classifyEntry`; this owns the bounded, sorted,
 * symlink-safe walk.
 *
 * A BASE directory's (`isBaseDir`) Next evidence is decided from the file names
 * just read, before any of its entries is classified, and threaded to its
 * subtree. Entries are sorted, so even a truncated walk is deterministic. The
 * walk stops once ssr AND backend hold (merged with `facts.packageSignals`):
 * the result is then `[ssr, backend]` whatever else the tree holds.
 *
 * The caps are checked after every skip filter, at an entry the walk would
 * classify (budget → whole walk, depth → that directory); a settled walk is
 * never `truncated`. Symlinks are never followed or classified; an unreadable
 * directory contributes no signal.
 */
export function scanFileTree(
  root: string,
  facts: RootFacts = NO_PACKAGE_JSON,
  limits: WalkLimits = WALK_LIMITS,
): TreeScan {
  let acc: ArchetypeSignals = { ssr: false, backend: false, clientUi: false };
  const evidence: SignalEvidence = {};
  const pkg = facts.packageSignals ?? NO_SIGNALS;
  let budget = limits.maxEntries;
  let truncated = false;

  const settled = (): boolean =>
    (pkg.ssr || acc.ssr) && (pkg.backend || acc.backend);

  const readEntries = (dir: string) => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      return []; // unreadable subtree → no signal (deterministic default)
    }
  };

  const walk = (
    dir: string,
    depth: number,
    segments: readonly string[],
    names: readonly string[],
    inherited: ClassifyContext,
  ): void => {
    // A spent, reported budget: nothing more can be classified anywhere.
    if ((budget <= 0 && truncated) || settled()) return;
    const entries = readEntries(dir).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    const siblingFiles = new Set(
      entries.filter((e) => e.isFile()).map((e) => e.name),
    );
    const ctx: ClassifyContext = isBaseDir(segments)
      ? {
          jsProject: facts.jsProject,
          baseDepth: segments.length,
          nextBase:
            (segments.length === 0 && facts.nextDependency) ||
            [...siblingFiles].some(isNextConfigName),
        }
      : inherited;
    for (const entry of entries) {
      if (settled()) return;
      const name = entry.name;
      // Never follow or classify a symlink → no escape past `root`.
      if (entry.isSymbolicLink()) continue;
      const isDir = entry.isDirectory();
      if (isDir && SKIP_DIRS.has(name.toLowerCase())) continue;
      if (isDir && isEcosystemTree(dir, name, siblingFiles)) continue;
      // A secrets file is never a signal and spends no budget.
      if (!isDir && name.toLowerCase().startsWith('.env')) continue;
      if (!isDir && !entry.isFile()) continue; // sockets/fifos/etc.: not signals
      // An entry the walk WOULD classify, past a cap: the result may be
      // incomplete.
      if (depth > limits.maxDepth || budget <= 0) {
        truncated = true;
        return;
      }
      budget -= 1;
      const sig = classifyEntry(name, isDir, segments, ctx);
      for (const key of SIGNAL_KEYS) {
        if (sig[key] && evidence[key] === undefined) {
          evidence[key] = [...names, name].join('/') + (isDir ? '/' : '');
        }
      }
      acc = mergeSignals(acc, sig);
      // `segments` is the lowercased ancestor chain for classification; `names`
      // keeps the original spelling for evidence.
      if (isDir) {
        walk(
          join(dir, name),
          depth + 1,
          [...segments, name.toLowerCase()],
          [...names, name],
          ctx,
        );
      }
    }
  };

  walk(root, 0, [], [], {
    jsProject: facts.jsProject,
    baseDepth: 0,
    nextBase: false,
  });
  return { signals: acc, evidence, truncated: truncated && !settled() };
}

/** The file-tree signals alone (`scanFileTree` without the evidence). */
export function scanFileTreeSignals(
  root: string,
  facts: RootFacts = NO_PACKAGE_JSON,
): ArchetypeSignals {
  return scanFileTree(root, facts).signals;
}

// A larger package.json is "not usable", exactly like a parse error.
export const MAX_PACKAGE_JSON_BYTES = 4 * 1024 * 1024;

// O_NONBLOCK keeps the open of a FIFO from blocking (absent on win32). A
// symlinked package.json is still followed — it is the user's own project.
const PKG_OPEN_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

/**
 * Read `<cwd>/package.json`'s text, or `null` when it is absent or unusable.
 * One descriptor, `fstat`-checked and read into a fixed buffer, so a FIFO, a
 * device or a huge file can neither hang nor exhaust memory. Never throws.
 */
function readPackageJsonText(pkgPath: string): string | null {
  let fd: number;
  try {
    fd = openSync(pkgPath, PKG_OPEN_FLAGS);
  } catch {
    return null;
  }
  try {
    if (!fstatSync(fd).isFile()) return null;
    const buf = Buffer.alloc(MAX_PACKAGE_JSON_BYTES + 1);
    let total = 0;
    while (total < buf.length) {
      const n = readSync(fd, buf, total, buf.length - total, null);
      if (n === 0) break;
      total += n;
    }
    if (total > MAX_PACKAGE_JSON_BYTES) return null;
    // A leading UTF-8 BOM would make `JSON.parse` reject the manifest.
    return buf
      .subarray(0, total)
      .toString('utf8')
      .replace(/^\uFEFF/, '');
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * Read `<cwd>/package.json` and reduce it to its PackageFacts. Anything but a
 * readable JSON object yields the empty facts with `packageJsonFound: false`.
 */
export function readPackageFacts(cwd: string): {
  pkg: PackageFacts;
  packageJsonFound: boolean;
} {
  const empty = packageFacts({});
  const text = readPackageJsonText(resolve(cwd, 'package.json'));
  if (text === null) return { pkg: empty, packageJsonFound: false };
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { pkg: empty, packageJsonFound: false };
    }
    return {
      pkg: packageFacts(parsed as ProjectPackages),
      packageJsonFound: true,
    };
  } catch {
    return { pkg: empty, packageJsonFound: false };
  }
}

/**
 * Detect a project's archetype set from disk: read its package.json, walk its
 * file tree with what the manifest says (a JS project? a `next` dependency?),
 * merge the two signal sets, then apply the archetype rule once. Deterministic;
 * a wholly signal-less project is `['lib']`.
 */
export function detectArchetypesFromProject(cwd: string): ArchetypeDetection {
  const { pkg, packageJsonFound } = readPackageFacts(cwd);
  const tree = scanFileTree(cwd, {
    jsProject: packageJsonFound,
    nextDependency: pkg.nextDependency,
    packageSignals: pkg.signals,
  });
  const archetypes = archetypesFromSignals(
    mergeSignals(pkg.signals, tree.signals),
  );
  return {
    archetypes,
    evidence: evidenceFor(
      archetypes,
      pkg.evidence,
      tree.evidence,
      pkg.devEvidence,
    ),
    truncated: tree.truncated,
  };
}
