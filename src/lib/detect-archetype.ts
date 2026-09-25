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
// trees (build output, VCS, deps, framework build/deploy caches). Compared
// case-insensitively (below).
//
// A skipped dir `continue`s BEFORE the `budget -= 1` decrement, so a skip-listed
// subtree costs ZERO entries. That is what keeps a fat framework cache from
// exhausting MAX_ENTRIES and silently truncating the walk before it reaches the
// project's real source — the failure this list's framework-cache members exist
// to prevent (a `.next/` of 55k files made a `src/App.tsx` project detect as
// frameworkless `lib` instead of `spa`, identically on every machine, because the
// walk is sorted and `.next` sorts before `src`).
//
// The failure DIRECTION of this list is a LOST signal, never a false one: a
// hand-authored dir that happens to be named here (e.g. `out/` holding real
// source) goes dark, and package.json dependency names are what normally backstop
// it. That tradeoff is accepted deliberately — recorded here so it is not
// rediscovered as a bug.
//
// Exported read-only so tests can pin every member's skip behavior and its
// classification neutrality against the shipped set, without being able to mutate
// it.
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
  // Non-JS trees that are never hand-authored JS source, whatever sits beside
  // them. The ones that ARE ordinary folder names elsewhere (`target`, `vendor`,
  // `venv`) are in ECOSYSTEM_DIRS below instead.
  '__pycache__', // Python bytecode cache
  '.yarn', // Yarn Berry cache / PnP store
]);

/** How to tell that a directory is its ecosystem's tree. */
export type EcosystemMarker =
  // A regular file with one of these exact names beside the directory.
  | { siblings: readonly string[] }
  // A regular file with this exact name inside the directory.
  | { inside: string };

// Non-JS dependency/build trees that share a repo with a JS app — skipped, at
// zero budget, like SKIP_DIRS, but ONLY where they are that ecosystem's tree.
// Their names are ordinary folder names in a JS project too, and the backend
// signal is STRUCTURAL (`app/**/route.ts`), so no package.json dependency
// backstops it: skipping every `target/` sent a Next.js route at
// app/target/route.ts dark, and `[ssr, backend]` detected as `[ssr]`.
//
// The test is a membership check over the parent's already-read entries (the
// sibling build file), or one `lstat` (a virtualenv's pyvenv.cfg), so a real
// 50k-file tree still costs one check and zero budget — the protection PHARN-15
// added, kept at any depth (a nested Maven module, a PHP `vendor/`). The dir
// name matches case-insensitively, as SKIP_DIRS does; each marker matches
// exactly as its tool writes it, and only as a regular file.
//
// Exported read-only for the same reason as SKIP_DIRS: the tests pin every
// member's behavior and its classification neutrality against this map.
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
    const siblingFiles = new Set(
      entries.filter((e) => e.isFile()).map((e) => e.name),
    );
    for (const entry of entries) {
      if (budget <= 0 || allFound()) return;
      const name = entry.name;
      // Never follow or classify a symlink → no escape past `root` (P2).
      if (entry.isSymbolicLink()) continue;
      const isDir = entry.isDirectory();
      if (isDir && SKIP_DIRS.has(name.toLowerCase())) continue;
      if (isDir && isEcosystemTree(dir, name, siblingFiles)) continue;
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

// A package.json larger than this is not one pharn will read (real manifests
// are a few KB; the largest public ones are well under 1 MiB). Past it the file
// is "not usable", exactly like a parse error.
export const MAX_PACKAGE_JSON_BYTES = 4 * 1024 * 1024;

// O_NONBLOCK keeps the open of a FIFO from blocking forever (the descriptor's
// type is then refused below). POSIX-only; absent on win32, where the flag is
// simply not set. A symlinked package.json is deliberately still FOLLOWED — it
// is the user's own project — and bounded by the regular-file check + the cap.
const PKG_OPEN_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

/**
 * Read `<cwd>/package.json`'s text, or `null` when it is absent or unusable.
 * ONE descriptor, opened once: its type is checked with `fstat` and the bytes
 * are read from the same descriptor into a fixed buffer, so a FIFO, a device
 * (a symlink to `/dev/zero`) or a huge file can neither hang nor exhaust memory.
 * Never throws — detection must still proceed on file-tree signals.
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
    // A leading UTF-8 BOM (some Windows editors write one) is not JSON;
    // `JSON.parse` would reject the whole manifest and misdetect the project.
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
 * Read `<cwd>/package.json` and reduce it to its raw ArchetypeSignals, reporting
 * whether a usable manifest was found. Missing file, unusable file (not a
 * regular file, over MAX_PACKAGE_JSON_BYTES), parse error, or a non-object
 * top-level value all yield the empty signal set with `packageJsonFound: false`;
 * a found, parseable object yields its signals with `true`.
 */
function readPackageSignals(cwd: string): {
  pkgSig: ArchetypeSignals;
  packageJsonFound: boolean;
} {
  const empty = packageSignals({});
  const text = readPackageJsonText(resolve(cwd, 'package.json'));
  if (text === null) return { pkgSig: empty, packageJsonFound: false };
  try {
    const parsed: unknown = JSON.parse(text);
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
