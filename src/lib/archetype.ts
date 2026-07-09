import type { Archetype } from '../types.js';

// ---------------------------------------------------------------------------
// Archetype classification (pure, no I/O): observable project facts → project
// archetype(s), via three signal booleans. Deterministic membership
// (ARCHITECTURE.md §5, "detected deterministically"; §4, the frameworkless `lib`
// base). Two fact sources feed the same booleans and are merged BEFORE the rule
// is applied (see detect-archetype.ts): package.json dependency NAMES (here) and
// file-tree structural signals (there). We read NAMES only — never values,
// scripts, or any file body. A project with no signal from any source is `lib`.
// A project may match several archetypes at once (e.g. Next + Express → ssr +
// backend).
//
// P3 (one axis of change): this file holds the pure CLASSIFICATION rules — the
// package-name allowlists and the signals→archetypes rule. It changes only if
// those rules change. The disk-reading strategy (read package.json, walk the
// tree) lives next door in detect-archetype.ts.
// ---------------------------------------------------------------------------

// SSR meta-frameworks: a client UI rendered through a server request lifecycle.
const SSR_FRAMEWORKS = new Set([
  'next',
  'nuxt',
  '@remix-run/react',
  '@remix-run/node',
  '@sveltejs/kit',
  'astro',
  '@angular/ssr',
]);

// Server / API / DB frameworks: a backend surface. Alongside the request
// frameworks, DB/ORM clients map here too — a DB concern folds onto the
// `backend` archetype (the enum has no `db` member). This is the
// archetype-enum-align increment, which reverses decision #2 of
// archetype-file-tree-scan (where DB signals contributed nothing).
const BACKEND_FRAMEWORKS = new Set([
  'express',
  'fastify',
  '@nestjs/core',
  'koa',
  'hono',
  '@hapi/hapi',
  // DB/ORM clients → backend (archetype-enum-align).
  'prisma',
  '@prisma/client',
  'drizzle-orm',
]);

// Client UI libraries: a frontend that, on its own, has no SSR meta-framework.
const CLIENT_UI = new Set([
  'react',
  'vue',
  'svelte',
  '@angular/core',
  'solid-js',
  'preact',
]);

// The fixed output order. Detection returns archetypes in this order so the
// result is deterministic regardless of input (package.json key order, or
// file-tree traversal order) (P5).
const ARCHETYPE_ORDER: readonly Archetype[] = ['ssr', 'backend', 'spa', 'lib'];

// The subset of package.json we read: dependency name maps only.
export interface ProjectPackages {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// The RAW signal booleans a fact source contributes, BEFORE the archetype rule
// runs. `clientUi` is deliberately ungated here (the `spa = clientUi && !ssr`
// suppression is applied once, in `archetypesFromSignals`, over the MERGED
// signals) — this is what lets a client-UI signal from one source be correctly
// suppressed by an SSR signal from another. Co-located with the pure functions
// that range over it, mirroring ProjectPackages.
export interface ArchetypeSignals {
  ssr: boolean;
  backend: boolean;
  clientUi: boolean;
}

const hasAny = (names: Set<string>, allowlist: Set<string>): boolean => {
  for (const name of allowlist) {
    if (names.has(name)) return true;
  }
  return false;
};

/**
 * Package.json dependency names → raw ArchetypeSignals (membership over the
 * union of `dependencies` and `devDependencies` names). Pure and deterministic.
 * `clientUi` is the ungated "a client-UI lib is present" fact; SSR suppression
 * is applied later, in `archetypesFromSignals`, over the merged signals.
 */
export function packageSignals(pkg: ProjectPackages): ArchetypeSignals {
  const names = new Set<string>([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  return {
    ssr: hasAny(names, SSR_FRAMEWORKS),
    backend: hasAny(names, BACKEND_FRAMEWORKS),
    clientUi: hasAny(names, CLIENT_UI),
  };
}

// ---------------------------------------------------------------------------
// File-tree classification (the second pure signal source — the file-tree analog
// of packageSignals above). `classifyEntry` maps ONE tree entry (its name,
// whether it is a directory, and its lowercased ancestor `segments`) to raw
// signals. It is pure (no I/O): the disk WALK that produces `segments` lives in
// the I/O file detect-archetype.ts, which imports this. Co-located here so ALL
// pure classification rules — package NAMES and file/dir NAMES — share one
// axis-of-change file (P3), as this file's contract intends.
// ---------------------------------------------------------------------------

// Recognized DB-location directory names. A `.sql` file counts as a `backend`
// signal ONLY inside one of these (a committed `seed.sql` in a frontend does
// not), and a nested `migrations/` dir counts only under one of these (or at the
// top level). Membership only (P5).
const SQL_HOST_DIRS = new Set([
  'migrations',
  'db',
  'database',
  'prisma',
  'drizzle',
  'sql',
]);

// Directories where a `.tsx`/`.jsx` file is NOT a client-UI signal: test trees
// and (server-rendered) email templates. A backend legitimately holds these
// (react-email templates, `.test.tsx` fixtures) and must not be flipped to `spa`
// by them.
const NON_UI_DIRS = new Set([
  'test',
  'tests',
  '__tests__',
  '__mocks__',
  'spec',
  'e2e',
  'emails',
  'email',
]);

// Test-fixture basenames (`Foo.test.tsx`, `Bar.spec.jsx`, …) — never a client-UI
// signal, even co-located beside real components.
const TEST_FIXTURE_RE = /\.(test|spec)\.(tsx|jsx)$/;

/**
 * The file-tree signal rule (pure): a single entry NAME + whether it is a
 * directory + its lowercased ancestor-directory `segments` (the path from the
 * scan root to the entry's parent; `[]` at the top level) → the raw signals it
 * contributes. Names are matched case-insensitively so `API/`, `.TSX`,
 * `Next.config.js` behave the same as their lowercase forms across
 * case-insensitive filesystems (P5).
 *
 * PATH-CONTEXT (archetype-path-context): a file merely NAMED `x` does not mean
 * the project HAS surface `x`, so each structural signal is scoped to the
 * location where that surface actually lives — the classifier reads `segments`,
 * not just the basename:
 *   - `api/`        → backend only at the top level, or as `pages/api` /
 *                     `app/api` (Next.js). A nested `src/api/` (client fetch
 *                     wrappers) is a FRONTEND convention → no signal.
 *   - `route.*`     → backend only under an App-Router `app/` ancestor (incl.
 *                     `src/app/**`). A client router's `route.ts` → no signal.
 *   - `.sql`        → backend only inside a DB-location dir (SQL_HOST_DIRS). A
 *                     committed `seed.sql`/`queries.sql` elsewhere → no signal.
 *   - `migrations/` → backend at the top level, or under a DB-location ancestor;
 *                     a deep non-DB `src/state/migrations/` → no signal.
 *   - `.tsx`/`.jsx` → client-UI, EXCEPT test fixtures / email templates
 *                     (NON_UI_DIRS, TEST_FIXTURE_RE).
 *
 * This trades a common false POSITIVE (a frontend's `src/api/`, a seed `.sql`, or
 * an email `.tsx` mis-read as backend/spa) for a rarer false NEGATIVE on a
 * nonconventional-but-legitimate layout (e.g. a frameworkless backend serving
 * from `src/api/` with no server-framework dependency, which now relies on its
 * dependency signal to detect as backend). The mechanism stays a deterministic
 * membership test (P5); package.json dependency names remain the primary,
 * location-independent signal (packageSignals, above).
 */
export function classifyEntry(
  name: string,
  isDir: boolean,
  segments: readonly string[],
): ArchetypeSignals {
  const lower = name.toLowerCase();
  const parent = segments[segments.length - 1]; // immediate parent, or undefined at top level
  const underDbLocation = segments.some((s) => SQL_HOST_DIRS.has(s));
  if (isDir) {
    // `api/` only in its documented location (top-level, or a `pages`/`app`
    // parent); `migrations/` only where a DB lives (top-level or DB ancestor).
    const apiBackend =
      lower === 'api' &&
      (segments.length === 0 || parent === 'pages' || parent === 'app');
    const migrationsBackend =
      lower === 'migrations' && (segments.length === 0 || underDbLocation);
    return {
      ssr: false,
      backend: apiBackend || migrationsBackend,
      clientUi: false,
    };
  }
  const isRouteHandler =
    lower === 'route.ts' ||
    lower === 'route.tsx' ||
    lower === 'route.js' ||
    lower === 'route.mjs';
  return {
    // `next.config.{js,ts,mjs,cjs,…}` → an SSR meta-framework config.
    ssr: lower.startsWith('next.config.'),
    // An App-Router route handler (`app/**/route.ts`), or a `.sql` file inside a
    // DB-location dir, → a backend surface.
    backend:
      (isRouteHandler && segments.includes('app')) ||
      (lower.endsWith('.sql') && underDbLocation),
    // A `.tsx` / `.jsx` file → a client-UI (frontend) signal, except test
    // fixtures and (server-rendered) email templates.
    clientUi:
      (lower.endsWith('.tsx') || lower.endsWith('.jsx')) &&
      !TEST_FIXTURE_RE.test(lower) &&
      !segments.some((s) => NON_UI_DIRS.has(s)),
  };
}

/** Field-wise OR of two signal sets — the pure merge of two fact sources. */
export function mergeSignals(
  a: ArchetypeSignals,
  b: ArchetypeSignals,
): ArchetypeSignals {
  return {
    ssr: a.ssr || b.ssr,
    backend: a.backend || b.backend,
    clientUi: a.clientUi || b.clientUi,
  };
}

/**
 * The archetype rule, applied ONCE over a (possibly merged) signal set. Pure and
 * deterministic: the same signals always yield the same archetypes, in
 * ARCHETYPE_ORDER.
 *
 * - ssr: an SSR meta-framework signal is present.
 * - backend: a server / API signal is present.
 * - spa: a client-UI signal is present AND no SSR signal is (with SSR, the
 *   frontend is the `ssr` archetype instead) — the single suppression point.
 * - lib: none of the above — the frameworkless base (ARCHITECTURE.md §4).
 */
export function archetypesFromSignals(sig: ArchetypeSignals): Archetype[] {
  const hasSpa = sig.clientUi && !sig.ssr;
  const found = new Set<Archetype>();
  if (sig.ssr) found.add('ssr');
  if (sig.backend) found.add('backend');
  if (hasSpa) found.add('spa');
  if (found.size === 0) found.add('lib');
  return ARCHETYPE_ORDER.filter((a) => found.has(a));
}

/**
 * Detect the project archetype set from package.json alone (the pure,
 * package.json-only path). Preserved byte-for-byte in output for existing
 * callers: `archetypesFromSignals(packageSignals(pkg))`. The file-tree-aware
 * detection lives in detect-archetype.ts, which merges this file's signals with
 * the tree's before applying the rule.
 */
export function detectArchetypes(pkg: ProjectPackages): Archetype[] {
  return archetypesFromSignals(packageSignals(pkg));
}
