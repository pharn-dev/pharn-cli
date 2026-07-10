import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  CLAUDE_COMMANDS_DIR,
  CLAUDE_HOOKS_DIR,
  DEV_COMMAND_PREFIX,
  PRODUCT_COMMAND_PREFIX,
} from './constants.js';
import { layoutPaths } from './layout.js';
import { safeJoin } from './validate.js';
import type { InstalledCapability, Layout } from '../types.js';

export interface InstallDiff {
  // .claude-relative paths present on disk but whose bytes differ from upstream.
  modified: string[];
  // Expected by an installed module/skill but absent on disk.
  missing: string[];
  // Files present on disk and byte-identical to upstream.
  okCount: number;
}

/**
 * Read-only comparison of an archetype install's PHARN-owned files against a
 * fetched clone. Derives the expected set by mirroring installCapabilities
 * (lib/install-capabilities.ts) — the selected capability dirs + the fixed
 * product surfaces — then byte-compares each against `projectRoot`. Parallels the
 * diffInstalled↔installModule mirror. `.claude/settings.json` is user-owned
 * (preserved at install) and excluded; the copied-verbatim trusted docs, hooks,
 * contracts, and floor checkers ARE compared. Every read is safeJoin-guarded.
 */
export function diffInstalledCapabilities(params: {
  repoDir: string;
  projectRoot: string;
  capabilities: InstalledCapability[];
  // The project's recorded layout (config.layout via configLayout). The expected
  // set is derived at the layout's paths for BOTH the clone source and the project
  // dest (the mirror). A clone at @main whose layout differs simply lacks the
  // source (existsSync false → skipped) — the same pre-existing "@main packaging"
  // bound already documented below.
  layout: Layout;
}): InstallDiff {
  const { repoDir, projectRoot, capabilities, layout } = params;
  const paths = layoutPaths(layout);
  const expected = new Map<string, string>();
  const add = (rel: string, repoPath: string): void => {
    expected.set(toPosix(rel), repoPath);
  };
  // Enumerate one source dir's files (optionally filtered by relative name) into
  // the expected map at the mirrored path.
  const addDir = (relDir: string, keep?: (rel: string) => boolean): void => {
    const from = safeJoin(repoDir, relDir);
    if (!existsSync(from) || !statSync(from).isDirectory()) return;
    for (const rel of walkFiles(from)) {
      if (keep && !keep(rel)) continue;
      add(join(relDir, rel), resolve(from, rel));
    }
  };

  // Selected capabilities (whole dir, incl. evals) at the layout's subtree.
  for (const cap of capabilities) {
    const subtree = cap.role === 'griller' ? paths.grillers : paths.lenses;
    addDir(`${subtree}/${cap.name}`);
  }
  // Product commands: top-level non-dev pharn-*.md.
  addDir(
    CLAUDE_COMMANDS_DIR,
    (rel) =>
      !rel.includes('/') &&
      rel.endsWith('.md') &&
      rel.startsWith(PRODUCT_COMMAND_PREFIX) &&
      !rel.startsWith(DEV_COMMAND_PREFIX),
  );
  // Hooks: top-level *.cjs, excluding *.test.cjs.
  addDir(
    CLAUDE_HOOKS_DIR,
    (rel) =>
      !rel.includes('/') && rel.endsWith('.cjs') && !rel.endsWith('.test.cjs'),
  );
  // Trusted docs (flat: root files; pharn: CONSTITUTION + ARCHITECTURE under pharn/).
  for (const doc of paths.docs) {
    const from = safeJoin(repoDir, doc);
    if (existsSync(from)) add(doc, from);
  }
  // Contracts (whole dir) + floor checkers (test files excluded), at layout paths.
  addDir(paths.contracts);
  addDir(paths.floor, (rel) => !/\.test\.(mjs|cjs)$/.test(rel));

  return compareExpected(expected, projectRoot);
}

// Byte-compare each expected file against `baseDir`, partitioning into
// modified / missing / ok. Shared by both diff functions (safeJoin-guarded).
function compareExpected(
  expected: Map<string, string>,
  baseDir: string,
): InstallDiff {
  const modified: string[] = [];
  const missing: string[] = [];
  let okCount = 0;
  for (const [rel, repoPath] of expected) {
    const diskPath = safeJoin(baseDir, rel);
    if (!existsSync(diskPath)) {
      missing.push(rel);
    } else if (hash(repoPath) === hash(diskPath)) {
      okCount += 1;
    } else {
      modified.push(rel);
    }
  }
  modified.sort();
  missing.sort();
  return { modified, missing, okCount };
}

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// Relative paths (posix) of every file (not directory) under `dir`, recursively.
function* walkFiles(dir: string, prefix = ''): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      yield* walkFiles(resolve(dir, entry.name), rel);
    } else {
      yield rel;
    }
  }
}

// Normalize a dest/relpath to a posix, no-trailing-slash .claude-relative key.
function toPosix(rel: string): string {
  return rel.split(sep).join('/').replace(/\/+$/, '');
}
