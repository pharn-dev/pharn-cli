import type { Archetype } from '../types.js';

// ---------------------------------------------------------------------------
// Archetype detection (pure, no I/O): package.json dependency names → project
// archetype(s). Deterministic membership over three framework allowlists
// (ARCHITECTURE.md §5, "detected deterministically (membership over
// package.json)"). We read dependency NAMES only — never values, scripts, or
// any file body. A project with no framework signal is `lib`, the frameworkless
// base that runs on core alone (ARCHITECTURE.md §4). A project may match several
// archetypes at once (e.g. Next + Express → ssr + backend).
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
// result is deterministic regardless of package.json key order (P5).
const ARCHETYPE_ORDER: readonly Archetype[] = ['ssr', 'backend', 'spa', 'lib'];

// The subset of package.json we read: dependency name maps only.
export interface ProjectPackages {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Detect the project archetype set from package.json, by membership over the
 * union of `dependencies` and `devDependencies` names. Pure and deterministic:
 * the same package set always yields the same archetypes, in ARCHETYPE_ORDER.
 *
 * - ssr: an SSR meta-framework is present.
 * - backend: a server framework is present.
 * - spa: a client UI library is present AND no SSR meta-framework is (with one,
 *   the frontend is the `ssr` archetype instead).
 * - lib: none of the above — the frameworkless base (ARCHITECTURE.md §4).
 */
export function detectArchetypes(pkg: ProjectPackages): Archetype[] {
  const names = new Set<string>([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);

  const hasAny = (allowlist: Set<string>): boolean => {
    for (const name of allowlist) {
      if (names.has(name)) return true;
    }
    return false;
  };

  const hasSsr = hasAny(SSR_FRAMEWORKS);
  const hasBackend = hasAny(BACKEND_FRAMEWORKS);
  const hasSpa = hasAny(CLIENT_UI) && !hasSsr;

  const found = new Set<Archetype>();
  if (hasSsr) found.add('ssr');
  if (hasBackend) found.add('backend');
  if (hasSpa) found.add('spa');
  if (found.size === 0) found.add('lib');

  return ARCHETYPE_ORDER.filter((a) => found.has(a));
}
