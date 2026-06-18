import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { safeJoin } from './install-modules.js';
import { readModuleManifest } from './manifest.js';
import type { InstalledSkill } from '../types.js';

export interface InstallDiff {
  // .claude-relative paths present on disk but whose bytes differ from upstream.
  modified: string[];
  // Expected by an installed module/skill but absent on disk.
  missing: string[];
  // Files present on disk and byte-identical to upstream.
  okCount: number;
}

/**
 * Read-only comparison of the installed `.claude/` tree against a fetched
 * pharn-oss clone. Derives the *expected* file set by mirroring installModule /
 * installSkills (lib/install-modules.ts), then byte-compares each file with disk.
 *
 * Pure: no console, no process.exit, no network, no writes — the caller owns
 * I/O and presentation. The two user-owned surfaces (`.claude/CONSTITUTION.md`
 * and `.claude/memory-bank/`) are materialized at init and hand-edited, so they
 * are excluded; the PHARN-owned template *sources* under `.claude/templates/`
 * are not (the exclusion is anchored at the .claude/ root).
 */
export function diffInstalled(params: {
  repoDir: string;
  claudeDir: string;
  moduleNames: string[];
  skills: InstalledSkill[];
}): InstallDiff {
  const { repoDir, claudeDir, moduleNames, skills } = params;

  // .claude-relative posix path → repo absolute source-file path. Modules are
  // collected first, then skills, last-write-wins — mirroring the installer's
  // cpSync(force) order so an overlapping dest is resolved deterministically.
  const expected = new Map<string, string>();
  const add = (rel: string, repoPath: string): void => {
    const norm = toPosix(rel);
    if (isExcluded(norm)) return;
    expected.set(norm, repoPath);
  };

  // Modules: each installs `from`→`to`. statSync the source and branch — the
  // schema permits a single-file `from`, not only directories.
  for (const name of moduleNames) {
    const mm = readModuleManifest(repoDir, name);
    const moduleDir = resolve(repoDir, name);
    for (const [src, dest] of Object.entries(mm.installs)) {
      const from = safeJoin(moduleDir, src);
      // A `from` missing at @main HEAD is an upstream packaging inconsistency,
      // not local drift — there is nothing to compare, so skip it (never throw).
      if (!existsSync(from)) continue;
      if (statSync(from).isDirectory()) {
        for (const rel of walkFiles(from))
          add(join(dest, rel), resolve(from, rel));
      } else {
        add(dest, from);
      }
    }
  }

  // Skills: each `from` lands in .claude/skills/<basename>/ in isolation.
  for (const skill of skills) {
    const from = safeJoin(repoDir, skill.from);
    const destBase = `skills/${basename(skill.from)}`;
    if (!existsSync(from)) continue;
    if (statSync(from).isDirectory()) {
      for (const rel of walkFiles(from)) {
        add(join(destBase, rel), resolve(from, rel));
      }
    } else {
      add(destBase, from);
    }
  }

  const modified: string[] = [];
  const missing: string[] = [];
  let okCount = 0;
  for (const [rel, repoPath] of expected) {
    const diskPath = safeJoin(claudeDir, rel);
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

// User-owned surfaces, anchored at the .claude/ root: the materialized working
// constitution + memory bank. Template sources nested under templates/ (e.g.
// templates/memory-bank/) start with "templates/" and are deliberately NOT matched.
function isExcluded(rel: string): boolean {
  return (
    rel === 'CONSTITUTION.md' ||
    rel === 'memory-bank' ||
    rel.startsWith('memory-bank/')
  );
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
