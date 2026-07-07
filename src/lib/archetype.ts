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

// Server / API frameworks: a backend request surface.
const BACKEND_FRAMEWORKS = new Set([
  'express',
  'fastify',
  '@nestjs/core',
  'koa',
  'hono',
  '@hapi/hapi',
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
