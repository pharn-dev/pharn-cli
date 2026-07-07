import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectArchetypes } from './archetype.js';
import type { ProjectPackages } from './archetype.js';
import type { Archetype } from '../types.js';

// ---------------------------------------------------------------------------
// Archetype detection — I/O boundary (project root → ArchetypeDetection). Reads
// the project's package.json from a root path and delegates to the pure
// detectArchetypes (./archetype.ts). This is the ONLY archetype file that
// touches disk; the membership rules stay pure next door (P3 — one axis of
// change per file: this file changes only if the reading strategy / its result
// shape changes, archetype.ts only if the framework allowlists do).
//
// We read package.json dependency NAME maps only (dependencies +
// devDependencies) — never file bodies, scripts, or values, and we never
// execute anything (ARCHITECTURE.md §5, "detected deterministically (membership
// over package.json)"). package.json is untrusted project input (P2): only
// dependency key NAMES are tested for membership against the fixed allowlists in
// detectArchetypes; values are never executed, forwarded, or logged, and the
// output is a closed `Archetype[]` enum plus a boolean, so no untrusted free
// text escapes this boundary. A mis-shaped `dependencies`/`devDependencies`
// (e.g. a string) simply contributes no matching name → the frameworkless `lib`
// base, never a bogus archetype (mirrors readProjectPackages' benign handling in
// steps/prereqs.ts).
// ---------------------------------------------------------------------------

// The boundary's result: the detected archetypes, plus whether a usable
// package.json was actually read. `packageJsonFound` distinguishes a genuinely
// frameworkless project (found, but no framework deps → `['lib']`, found: true)
// from a project with NO usable package.json (missing / malformed / non-object →
// also `['lib']`, but found: false), so callers need not conflate "no manifest"
// with "frameworkless". Co-located with the function, mirroring ProjectPackages
// in archetype.ts.
export interface ArchetypeDetection {
  archetypes: Archetype[];
  packageJsonFound: boolean;
}

/**
 * Detect a project's archetype set from its package.json on disk: read
 * `<cwd>/package.json` and delegate to the pure `detectArchetypes`.
 *
 * Deterministic (P5): the same project directory always yields the same result.
 * `packageJsonFound` is `true` iff a package.json exists AND parses to a
 * non-null, non-array object; a missing file, a parse error, or a non-object
 * top-level value all yield `{ archetypes: ['lib'], packageJsonFound: false }` —
 * the frameworkless base (ARCHITECTURE.md §4) with an explicit "no usable
 * manifest" signal. A found-but-frameworkless project yields
 * `{ archetypes: ['lib'], packageJsonFound: true }`. These are defined,
 * deterministic outcomes (no framework signal ⇒ `lib`), not guesses.
 */
export function detectArchetypesFromProject(cwd: string): ArchetypeDetection {
  const pkgPath = resolve(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    return { archetypes: detectArchetypes({}), packageJsonFound: false };
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { archetypes: detectArchetypes({}), packageJsonFound: false };
    }
    return {
      archetypes: detectArchetypes(parsed as ProjectPackages),
      packageJsonFound: true,
    };
  } catch {
    return { archetypes: detectArchetypes({}), packageJsonFound: false };
  }
}
