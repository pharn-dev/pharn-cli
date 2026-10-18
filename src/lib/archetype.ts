import type { Archetype } from '../types.js';
import { ARCHETYPE_VALUES } from './validate.js';

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
// Each name is a package every app of that framework lists itself (F-27). Not
// listed, deliberately: release candidates, build-time-only generators
// (`gatsby`), and adapters that always ride with a listed package
// (`@react-router/express`, `@remix-run/dev`).
const SSR_FRAMEWORKS = new Set([
  'next',
  'nuxt',
  '@remix-run/react',
  '@remix-run/node',
  '@sveltejs/kit',
  'astro',
  '@angular/ssr',
  // React Router v7 framework mode. Library mode lists only `react-router`,
  // a client router (→ `spa` through `react`). A framework-mode app built with
  // `ssr: false` detects as `ssr`, as a `next` static export does.
  '@react-router/dev',
  '@react-router/node',
  '@react-router/serve',
  // TanStack Start: the per-renderer packages and the original name.
  '@tanstack/react-start',
  '@tanstack/solid-start',
  '@tanstack/start',
  '@solidjs/start', // SolidStart
  '@builder.io/qwik-city', // Qwik City
  '@analogjs/platform', // Analog (Angular)
  'vike',
  'vite-plugin-ssr', // Vike's former name
  '@nguniversal/express-engine', // Angular Universal, before @angular/ssr
]);

// Server / API / DB frameworks: a backend surface. Alongside the request
// frameworks, DB/ORM clients map here too — a DB concern folds onto the
// `backend` archetype (the enum has no `db` member). This is the
// archetype-enum-align increment, which reverses decision #2 of
// archetype-file-tree-scan (where DB signals contributed nothing).
//
// Read from `dependencies` ONLY (F-27): a server or DB package that is only a
// devDependency is a mock server, a test database or tooling — not a backend
// surface of the project. A backend bundled so that its framework is only a
// devDependency needs a tree signal, or `--archetype backend`.
const BACKEND_FRAMEWORKS = new Set([
  'express',
  'fastify',
  '@nestjs/core',
  'koa',
  'hono',
  '@hapi/hapi',
  'elysia',
  '@adonisjs/core',
  'h3',
  '@trpc/server',
  '@apollo/server',
  'graphql-yoga',
  // DB/ORM clients → backend (archetype-enum-align): a database driver the
  // project RUNS with is a server-side data surface.
  'prisma',
  '@prisma/client',
  'drizzle-orm',
  'typeorm',
  'sequelize',
  'mongoose',
  'knex',
  'kysely',
  '@mikro-orm/core',
  'pg',
  'mysql2',
  'mongodb',
  'better-sqlite3',
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
const ARCHETYPE_ORDER: readonly Archetype[] = ARCHETYPE_VALUES;

// The subset of package.json we read: dependency name maps only.
// `peerDependencies` and `optionalDependencies` are deliberately NOT read: a
// peer dependency names the host a plug-in LIBRARY runs inside (a Next plugin, a
// React component library — reading it would make every such library
// `ssr`/`spa`), and an optional dependency is by definition one the project
// runs without.
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

// The FIRST allowlist member present, in allowlist order — never the manifest's
// key order, so the same project always cites the same dependency (P5).
const firstOf = (
  names: Set<string>,
  allowlist: Set<string>,
): string | undefined => {
  for (const name of allowlist) {
    if (names.has(name)) return name;
  }
  return undefined;
};

/**
 * One triggering fact per raw signal, for display: a dependency NAME (an
 * allowlist literal) or a project-relative path. A key is present only when that
 * signal fired from that source.
 */
export type SignalEvidence = Partial<Record<keyof ArchetypeSignals, string>>;

/** What package.json contributes: its signals, their evidence, and whether `next` is a dependency. */
export interface PackageFacts {
  signals: ArchetypeSignals;
  // The triggering `dependencies` member, per signal.
  evidence: SignalEvidence;
  // The triggering `devDependencies` member, for a signal NO `dependencies`
  // member raised (never `backend`: devDependencies cannot raise it).
  devEvidence: SignalEvidence;
  // The root base's Next evidence (with a root `next.config.*`): gates the
  // Next-specific structural rules in classifyEntry.
  nextDependency: boolean;
}

// Which allowlist each signal reads, and whether devDependencies may raise it.
// ssr and client UI read devDependencies too: official templates list the
// framework there (`npm create svelte` puts `@sveltejs/kit` and `svelte` in
// devDependencies; React Router framework mode lists `@react-router/dev`).
// backend does not (see BACKEND_FRAMEWORKS).
const PACKAGE_RULES: ReadonlyArray<{
  signal: keyof ArchetypeSignals;
  allowlist: Set<string>;
  readsDev: boolean;
}> = [
  { signal: 'ssr', allowlist: SSR_FRAMEWORKS, readsDev: true },
  { signal: 'backend', allowlist: BACKEND_FRAMEWORKS, readsDev: false },
  { signal: 'clientUi', allowlist: CLIENT_UI, readsDev: true },
];

/**
 * Package.json dependency names → raw ArchetypeSignals plus, per signal, the
 * allowlist member that triggered it: from `dependencies` (`evidence`), or —
 * only when no `dependencies` member did — from `devDependencies`
 * (`devEvidence`). `backend` reads `dependencies` only (F-27); ssr and client UI
 * read both. Pure and deterministic. The cited name is the ALLOWLIST's own
 * string, never the manifest's key bytes.
 */
export function packageFacts(pkg: ProjectPackages): PackageFacts {
  const runtime = new Set(Object.keys(pkg.dependencies ?? {}));
  const dev = new Set(Object.keys(pkg.devDependencies ?? {}));
  const signals: ArchetypeSignals = {
    ssr: false,
    backend: false,
    clientUi: false,
  };
  const evidence: SignalEvidence = {};
  const devEvidence: SignalEvidence = {};
  for (const { signal, allowlist, readsDev } of PACKAGE_RULES) {
    const fromRuntime = firstOf(runtime, allowlist);
    if (fromRuntime !== undefined) {
      signals[signal] = true;
      evidence[signal] = fromRuntime;
      continue;
    }
    const fromDev = readsDev ? firstOf(dev, allowlist) : undefined;
    if (fromDev !== undefined) {
      signals[signal] = true;
      devEvidence[signal] = fromDev;
    }
  }
  return {
    signals,
    evidence,
    devEvidence,
    // The gate for Next's structural rules reads both maps, as before.
    nextDependency: runtime.has('next') || dev.has('next'),
  };
}

/**
 * Package.json dependency names → raw ArchetypeSignals. `clientUi` is the
 * ungated "a client-UI lib is present" fact; SSR suppression is applied later,
 * in `archetypesFromSignals`, over the merged signals.
 */
export function packageSignals(pkg: ProjectPackages): ArchetypeSignals {
  return packageFacts(pkg).signals;
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

// Workspace containers: each DIRECT child (`apps/web`, `packages/site`) is a
// BASE — a project root of its own inside a monorepo — alongside the scan root.
// Exactly depth 2, membership only (P5). This keeps a monorepo's Next app
// (`apps/web/next.config.js`) detected without counting a `next.config.*` at any
// depth (a docs site's `website/next.config.js` is not the project's framework).
const WORKSPACE_DIRS = new Set(['apps', 'packages']);

// Where Next reads its routers from, relative to a base: `app/` and `pages/`,
// or the same under `src/`. Nothing else is a router root.
const ROUTER_DIRS = new Set(['app', 'pages']);

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
 * Is the directory at `segments` (lowercased, from the scan root) a BASE — the
 * scan root itself, or a direct child of a workspace container (`apps/<x>`,
 * `packages/<x>`)? Pure membership.
 */
export function isBaseDir(segments: readonly string[]): boolean {
  if (segments.length === 0) return true;
  return segments.length === 2 && WORKSPACE_DIRS.has(segments[0]!);
}

/** A `next.config.*` file name (case-insensitive). */
export function isNextConfigName(name: string): boolean {
  return name.toLowerCase().startsWith('next.config.');
}

/**
 * What the walk knows about an entry's surroundings. Computed by the reading
 * strategy (detect-archetype.ts), consumed here as plain data so the rule stays
 * pure.
 */
export interface ClassifyContext {
  // A usable package.json at the scan root — the JS-ecosystem evidence that the
  // language-agnostic backend signals (root `api/`, `migrations/`, DB `.sql`)
  // need. Without it a Python/Go/Rust/Ruby/PHP tree's migrations are not read
  // as a backend: the backend capabilities PHARN ships match JS/TS code only.
  jsProject: boolean;
  // How many leading `segments` are the entry's BASE (0 = the scan root,
  // 2 = `apps/<x>` | `packages/<x>`).
  baseDepth: number;
  // The base has Next evidence: a `next.config.*` directly in it, or — for the
  // scan root — the `next` dependency.
  nextBase: boolean;
}

/**
 * The file-tree signal rule (pure): a single entry NAME + whether it is a
 * directory + its lowercased ancestor-directory `segments` (the path from the
 * scan root to the entry's parent; `[]` at the top level) + its surroundings
 * (`ctx`) → the raw signals it contributes. Names are matched case-insensitively
 * so `API/`, `.TSX`, `Next.config.js` behave the same as their lowercase forms
 * across case-insensitive filesystems (P5).
 *
 * PATH-CONTEXT (archetype-path-context) + PRECISION (detection-precision-
 * archetype-override): a file merely NAMED `x` does not mean the project HAS
 * surface `x`, so each structural signal is scoped to where that surface lives:
 *   - `next.config.*` → ssr only directly in a base (`isBaseDir`).
 *   - `route.*`       → backend only under an App-Router root of its base
 *                       (`app/**`, `src/app/**`), and only when that base has
 *                       Next evidence. A Vue/Angular `src/app/router/route.ts` → none.
 *   - `api/`          → backend directly under a Next router root of its base
 *                       (`app/api`, `pages/api`, `src/app/api`, `src/pages/api`)
 *                       with Next evidence, or at the scan root of a JS project.
 *                       A frontend's `src/api/` / `src/app/api/` → none.
 *   - `migrations/`   → backend at the top level or under a DB-location ancestor,
 *                       in a JS project only.
 *   - `.sql`          → backend inside a DB-location dir, in a JS project only.
 *   - `.tsx`/`.jsx`   → client-UI, EXCEPT test fixtures / email templates.
 *
 * This trades false POSITIVES (an Angular/RTK/Vue `src/app/`, a docs site's
 * `next.config.js`, a Rails/Flask/Go repo's migrations) for rarer false
 * NEGATIVES on unconventional layouts — corrected in-product with
 * `pharn init --archetype`. The mechanism stays a deterministic membership test
 * (P5); package.json dependency names remain the primary, location-independent
 * signal (packageFacts, above).
 */
export function classifyEntry(
  name: string,
  isDir: boolean,
  segments: readonly string[],
  ctx: ClassifyContext,
): ArchetypeSignals {
  const lower = name.toLowerCase();
  const underDbLocation = segments.some((s) => SQL_HOST_DIRS.has(s));
  // The path from the entry's base to its parent.
  const rel = segments.slice(ctx.baseDepth);
  const routerOffset = rel[0] === 'src' ? 1 : 0;
  const routerDir = rel[routerOffset];
  // The entry sits directly in a Next router root (`app/`, `src/pages/`, …).
  const inRouterRoot =
    rel.length === routerOffset + 1 &&
    routerDir !== undefined &&
    ROUTER_DIRS.has(routerDir);
  // The entry sits anywhere under an App-Router root (`app/**`, `src/app/**`).
  const underAppRouter = rel.length > routerOffset && routerDir === 'app';
  if (isDir) {
    const apiBackend =
      lower === 'api' &&
      ((ctx.nextBase && inRouterRoot) ||
        (segments.length === 0 && ctx.jsProject));
    const migrationsBackend =
      lower === 'migrations' &&
      ctx.jsProject &&
      (segments.length === 0 || underDbLocation);
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
    // `next.config.{js,ts,mjs,cjs,…}` in a base → an SSR meta-framework config.
    ssr: isNextConfigName(lower) && isBaseDir(segments),
    // An App-Router route handler of a Next base, or a `.sql` file inside a
    // DB-location dir of a JS project, → a backend surface.
    backend:
      (isRouteHandler && ctx.nextBase && underAppRouter) ||
      (lower.endsWith('.sql') && underDbLocation && ctx.jsProject),
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

// ---------------------------------------------------------------------------
// Evidence + the `--archetype` grammar (pure). Evidence is what the install
// summary prints beside each archetype; the grammar is what `--archetype`
// accepts. Both range over the same closed archetype list, so they live with
// the rule that produces archetypes.
// ---------------------------------------------------------------------------

/** One triggering fact per detected archetype — for display only. */
export type ArchetypeEvidence =
  | { archetype: Archetype; source: 'dependency'; name: string }
  | { archetype: Archetype; source: 'devDependency'; name: string }
  | { archetype: Archetype; source: 'path'; path: string }
  | { archetype: Archetype; source: 'none' };

// Which raw signal produced each archetype (`lib` has none: it is the absence
// of every signal).
const SIGNAL_OF: Readonly<Record<Archetype, keyof ArchetypeSignals | null>> = {
  ssr: 'ssr',
  backend: 'backend',
  spa: 'clientUi',
  lib: null,
};

/**
 * One evidence entry per archetype IN `archetypes` — an archetype the result
 * rules out cites nothing — in their order. A dependency wins over a
 * devDependency, and both over a path, for the same signal (package.json is
 * read first, and is the primary signal); `lib`, or an archetype with no
 * recorded trigger, cites none.
 */
export function evidenceFor(
  archetypes: readonly Archetype[],
  fromPackage: SignalEvidence,
  fromTree: SignalEvidence,
  fromDevPackage: SignalEvidence = {},
): ArchetypeEvidence[] {
  return archetypes.map((archetype) => {
    const signal = SIGNAL_OF[archetype];
    const name = signal === null ? undefined : fromPackage[signal];
    if (name !== undefined) return { archetype, source: 'dependency', name };
    const devName = signal === null ? undefined : fromDevPackage[signal];
    if (devName !== undefined) {
      return { archetype, source: 'devDependency', name: devName };
    }
    const path = signal === null ? undefined : fromTree[signal];
    if (path !== undefined) return { archetype, source: 'path', path };
    return { archetype, source: 'none' };
  });
}

/**
 * Where an install's archetypes came from — plain data, rendered by the init
 * summary (`archetypeOriginLines`) and projected into `init --dry-run --json`.
 * `evidence` and `truncated` are always DETECTION's (one evidence entry per
 * detected archetype; `truncated`: the bounded walk stopped while the result
 * could still change); with `--archetype` they describe the set that was found
 * and not used.
 */
export type ArchetypeOrigin =
  | {
      kind: 'detected';
      evidence: readonly ArchetypeEvidence[];
      truncated: boolean;
    }
  | {
      kind: 'flag';
      detected: readonly Archetype[];
      evidence: readonly ArchetypeEvidence[];
      truncated: boolean;
    };

const isArchetype = (value: unknown): value is Archetype =>
  ARCHETYPE_VALUES.some((a) => a === value);

/**
 * The `--archetype` grammar: a comma-separated list of exact archetype names,
 * each at most once, with `lib` (the no-signal base) only on its own — the
 * shapes detection itself can produce. Anything else (an empty segment,
 * whitespace, another case, a duplicate, an unknown name) → `null`, never a
 * guess at what was meant (P5). The result is in canonical order.
 */
export function parseArchetypeList(value: string): Archetype[] | null {
  const parts = value.split(',');
  const picked = new Set<Archetype>();
  for (const part of parts) {
    if (!isArchetype(part) || picked.has(part)) return null;
    picked.add(part);
  }
  if (picked.has('lib') && picked.size > 1) return null;
  return ARCHETYPE_ORDER.filter((a) => picked.has(a));
}

/**
 * A config's recorded `archetypes`, for DISPLAY: a non-empty array whose every
 * element is a canonical archetype → that set in canonical order; anything else
 * (absent, a string, a non-member, control bytes) → `null`. The config is
 * hand-editable, so this is a membership test, never a sanitizer.
 */
export function recordedArchetypes(value: unknown): Archetype[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every(isArchetype)) return null;
  const set = new Set<Archetype>(value);
  return ARCHETYPE_ORDER.filter((a) => set.has(a));
}
