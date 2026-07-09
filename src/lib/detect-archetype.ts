import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  archetypesFromSignals,
  classifyEntry,
  mergeSignals,
  packageSignals,
} from './archetype.js';
import type { ArchetypeSignals, ProjectPackages } from './archetype.js';
import type { Archetype } from '../types.js';

// ---------------------------------------------------------------------------
// Archetype detection — I/O boundary (project root → ArchetypeDetection). This
// is the ONLY archetype file that touches disk; the pure classification rules —
// packageSignals AND the file-entry classifyEntry (imported below) — stay next
// door in archetype.ts (P3 — one axis of change per file: this file changes if
// the READING STRATEGY changes, archetype.ts if the classification rules do).
// Detection merges TWO fact sources, then applies the archetype rule once
// (ARCHITECTURE.md §5, "detected deterministically"):
//
//   1. package.json dependency NAMES  (readPackageSignals, below)
//   2. file-tree structural signals   (scanFileTreeSignals, below)
//
// Both are untrusted project input (P2). We test NAMES only — dependency key
// names and file/dir names — for membership against fixed in-code allowlists /
// patterns; we never execute, interpolate, forward, or log a value, and the
// tree walk never reads a discovered file's BODY (only package.json is read, as
// before). The output is a closed `Archetype[]` enum plus a boolean, so no
// untrusted free text escapes this boundary.
//
// NOTE (human-owned reconciliation, surfaced per P6): ARCHITECTURE.md §5 still
// phrases detection as "membership over package.json", predating the file-tree
// extension. §5 is trusted + hook-protected — the agent cannot amend it; its
// wording is a human call. The mechanism stays deterministic either way (P5).
// ---------------------------------------------------------------------------

// The boundary's result: the detected archetypes, plus whether a usable
// package.json was actually read. `packageJsonFound` distinguishes "no usable
// manifest" (missing / malformed / non-object → false) from a found manifest
// (true). NOTE: with file-tree scanning, `packageJsonFound: false` no longer
// implies `archetypes: ['lib']` — a manifest-less project with a `.tsx` file is
// `{ archetypes: ['spa'], packageJsonFound: false }`. Callers must not conflate
// the two.
export interface ArchetypeDetection {
  archetypes: Archetype[];
  packageJsonFound: boolean;
}

// Directories never recursed into and never classified — heavy or irrelevant
// trees (build output, VCS, deps). Compared case-insensitively (below).
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

// Bounded walk. These caps are a DEFENSIVE bound on a pathological tree, NOT a
// perf-only knob: a signal that lies past a cap is silently UNDETECTED (a
// completeness tradeoff — determinism is preserved, but a real signal could be
// missed). They are therefore chosen GENEROUSLY, far beyond any realistic
// project depth/size; combined with the all-signals-found short-circuit, a
// normal project finishes long before either cap bites.
const MAX_DEPTH = 24;
const MAX_ENTRIES = 50_000;

/**
 * Walk the project tree once and collect the merged file-tree ArchetypeSignals.
 * The per-entry classification rule is the pure `classifyEntry` (archetype.ts);
 * this function owns only the READING STRATEGY — the bounded, sorted, symlink-safe
 * walk that produces each entry's ancestor `segments` and feeds them in.
 *
 * Deterministic (P5): signals are booleans (OR-merge is order-independent) and
 * per-directory entries are sorted by name before traversal, so even a
 * cap-truncated walk visits the same set on any filesystem. Short-circuits once
 * all three signals are true. Symlinks are never followed or classified
 * (recursion/classification is gated on real files/dirs), so the walk cannot
 * escape `root` via a symlink. A per-directory read error is narrowly caught and
 * that subtree contributes no signal — a deterministic default, not a guess.
 */
export function scanFileTreeSignals(root: string): ArchetypeSignals {
  let acc: ArchetypeSignals = { ssr: false, backend: false, clientUi: false };
  let budget = MAX_ENTRIES;

  const allFound = (): boolean => acc.ssr && acc.backend && acc.clientUi;

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
  ): void => {
    if (depth > MAX_DEPTH || budget <= 0 || allFound()) return;
    const entries = readEntries(dir).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (budget <= 0 || allFound()) return;
      const name = entry.name;
      // Never follow or classify a symlink → no escape past `root` (P2).
      if (entry.isSymbolicLink()) continue;
      const isDir = entry.isDirectory();
      if (isDir && SKIP_DIRS.has(name.toLowerCase())) continue;
      if (!isDir && name.toLowerCase().startsWith('.env')) continue;
      if (!isDir && !entry.isFile()) continue; // sockets/fifos/etc.: not signals
      budget -= 1;
      acc = mergeSignals(acc, classifyEntry(name, isDir, segments));
      // Recurse with this dir appended to the (lowercased) ancestor chain, so a
      // child sees its full path context. Determinism is preserved: `segments`
      // derives from the same sorted, bounded walk (P5).
      if (isDir) {
        walk(join(dir, name), depth + 1, [...segments, name.toLowerCase()]);
      }
    }
  };

  walk(root, 0, []);
  return acc;
}

/**
 * Read `<cwd>/package.json` and reduce it to its raw ArchetypeSignals, reporting
 * whether a usable manifest was found. Missing file, parse error, or a non-object
 * top-level value all yield the empty signal set with `packageJsonFound: false`;
 * a found, parseable object yields its signals with `true`.
 */
function readPackageSignals(cwd: string): {
  pkgSig: ArchetypeSignals;
  packageJsonFound: boolean;
} {
  const empty = packageSignals({});
  const pkgPath = resolve(cwd, 'package.json');
  if (!existsSync(pkgPath)) return { pkgSig: empty, packageJsonFound: false };
  try {
    const parsed: unknown = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { pkgSig: empty, packageJsonFound: false };
    }
    return {
      pkgSig: packageSignals(parsed as ProjectPackages),
      packageJsonFound: true,
    };
  } catch {
    return { pkgSig: empty, packageJsonFound: false };
  }
}

/**
 * Detect a project's archetype set from disk: merge its package.json signals
 * with its file-tree signals, then apply the archetype rule once.
 *
 * Deterministic (P5): the same project directory always yields the same result.
 * `packageJsonFound` reports only whether a usable package.json was read (see the
 * interface note); the archetype set reflects BOTH sources — so a project with no
 * manifest but a `.tsx` file is `{ archetypes: ['spa'], packageJsonFound: false }`,
 * and a wholly signal-less project is `{ archetypes: ['lib'], ... }` (the
 * frameworkless base, ARCHITECTURE.md §4). These are defined, deterministic
 * outcomes, not guesses.
 */
export function detectArchetypesFromProject(cwd: string): ArchetypeDetection {
  const { pkgSig, packageJsonFound } = readPackageSignals(cwd);
  const fileSig = scanFileTreeSignals(cwd);
  const merged = mergeSignals(pkgSig, fileSig);
  return { archetypes: archetypesFromSignals(merged), packageJsonFound };
}
