import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { CORE_MODULE, DEV_COMMAND_PREFIX } from './constants.js';
import { ManifestValidationError } from './validate.js';
import { readModuleManifest } from './manifest.js';
import { MULTI_TENANT_PRINCIPLE, stripPrinciple } from './constitution.js';
import type { Constitution, InstalledSkill, ManifestModule } from '../types.js';

// Materialized (not just copied via installs map) by the installer for
// pharn-core. Kept in sync with pharn-core/templates/.
const MEMORY_BANK_SRC = 'templates/memory-bank';
const CONSTITUTION_SRC = 'templates/constitution';

// ---------------------------------------------------------------------------
// Untrusted-copy guards (P2) — the LEGACY install path, brought to the same
// posture as the archetype path (install-capabilities.ts). The fetched repo is
// untrusted; a recursive cpSync copies symlinks VERBATIM by default, and the
// pure-string safeJoin below cannot see a symlink planted in a destination
// parent — so a malicious clone could (a) MATERIALIZE a symlink into .claude/,
// or (b) write a file THROUGH a planted symlink to escape .claude/ with no "..".
// Three structural guards close both, mirroring install-capabilities.ts.
// ---------------------------------------------------------------------------

// True if the path is a symlink (lstat: does not follow it).
const isSymlink = (p: string): boolean => lstatSync(p).isSymbolicLink();
// A *.test.{mjs,cjs} file — never part of a product install (matches
// install-capabilities.ts's isTestFile).
const isTestFile = (p: string): boolean => /\.test\.(mjs|cjs)$/.test(p);
// A pharn-dev-*.md dev-loop command — never part of a product install
// (Surface A dev/product split; the archetype path excludes DEV_COMMAND_PREFIX).
const isDevCommand = (p: string): boolean => {
  const b = basename(p);
  return b.startsWith(DEV_COMMAND_PREFIX) && b.endsWith('.md');
};
// The cpSync filter for the legacy path: skip symlinks (never materialize one),
// dev-loop commands, and test files. Structural (P0) — set/prefix membership,
// no judgment. Applied to every copy from the untrusted repo below.
const copyFilter = (src: string): boolean =>
  !isSymlink(src) && !isDevCommand(src) && !isTestFile(src);

// Reject a destination whose existing parent chain, with symlinks RESOLVED,
// escapes claudeDir. The lexical safeJoin (resolve + startsWith) cannot see a
// planted symlink; realpathSync can. This defends against a symlink already
// present under .claude/ (from a prior run or planted out-of-band) that a copy
// would otherwise write THROUGH. The threat is hostile REMOTE content
// (THREAT-MODEL.md §1 surface B), not a local race during a single-process
// install, so the check-then-write window here is out of scope.
function assertRealDestWithin(claudeDir: string, to: string): void {
  // The base must exist to realpath it (on a fresh install .claude/ does not
  // exist yet; mkdirSync is idempotent and creates it as a real directory).
  mkdirSync(claudeDir, { recursive: true });
  const realBase = realpathSync(claudeDir);
  // Walk up to the deepest ALREADY-existing ancestor of `to` (which may not
  // exist yet); `to` is lexically under claudeDir, so this stops at claudeDir
  // at the latest.
  let existing = to;
  while (!existsSync(existing)) existing = dirname(existing);
  const real = realpathSync(existing);
  if (real !== realBase && !real.startsWith(realBase + sep)) {
    throw new ManifestValidationError(
      `Refusing path escape via symlink: ${to} resolves outside ${claudeDir}`,
    );
  }
}

/**
 * Copy a single module's `installs` entries from the fetched repo into the
 * user's `.claude/`. Directories merge; files overwrite. Every copy is guarded
 * against a symlinked source root (rejected), a nested symlink / dev command /
 * test file (skipped), and a destination that escapes `.claude/` via a symlink
 * (rejected) — the untrusted-repo posture from install-capabilities.ts (P2).
 */
export function installModule(
  repoDir: string,
  claudeDir: string,
  module: ManifestModule,
): void {
  const manifest = readModuleManifest(repoDir, module.name);
  for (const [src, dest] of Object.entries(manifest.installs)) {
    const from = safeJoin(resolve(repoDir, module.name), src);
    const to = safeJoin(claudeDir, dest);
    if (!existsSync(from)) {
      // A module declaring a path it doesn't ship is a packaging bug upstream;
      // surface it rather than silently skipping.
      throw new ManifestValidationError(
        `${module.name} declares installs "${src}" but it is missing in the fetched repo.`,
      );
    }
    // Never copy from a symlinked source ROOT (the untrusted repo).
    if (isSymlink(from)) {
      throw new ManifestValidationError(
        `${module.name} installs "${src}" is a symlink; refusing to copy from the untrusted repo.`,
      );
    }
    // Never write THROUGH a symlink that escapes .claude/ (safeJoin is lexical).
    assertRealDestWithin(claudeDir, to);
    // Skip nested symlinks, dev commands, and test files during the copy.
    cpSync(from, to, { recursive: true, force: true, filter: copyFilter });
  }
}

/**
 * Pre-flight for selective install (schemaVersion 2): assert every skill's
 * source folder exists (and is not a symlink) in the fetched repo BEFORE any
 * copy, so a bad `from` path fails the whole install with nothing written (no
 * partial installs).
 */
export function assertSkillSourcesExist(
  repoDir: string,
  skills: InstalledSkill[],
): void {
  // Skills all land in .claude/skills/<basename>/, so two sources sharing a
  // basename would silently overwrite each other. Reject the whole batch.
  const seenBasenames = new Map<string, string>();
  for (const skill of skills) {
    const from = safeJoin(repoDir, skill.from);
    if (!existsSync(from)) {
      throw new ManifestValidationError(
        `Skill "${skill.skill}" declares source "${skill.from}" but it is missing in the fetched repo.`,
      );
    }
    // A symlinked skill source is refused before any copy (untrusted repo, P2).
    if (isSymlink(from)) {
      throw new ManifestValidationError(
        `Skill "${skill.skill}" source "${skill.from}" is a symlink; refusing to copy from the untrusted repo.`,
      );
    }
    const name = basename(skill.from);
    const prior = seenBasenames.get(name);
    if (prior !== undefined && prior !== skill.from) {
      throw new ManifestValidationError(
        `Duplicate skill basename "${name}": "${prior}" and "${skill.from}" would both install to .claude/skills/${name}/.`,
      );
    }
    seenBasenames.set(name, skill.from);
  }
}

/**
 * Copy each selected skill's subfolder into .claude/skills/<basename>/. Only the
 * exact `from` directory is copied — sibling skills in the same category module
 * are never touched. Call assertSkillSourcesExist first (it rejects a symlinked
 * source root); nested symlinks are skipped and no copy escapes .claude/ (P2).
 */
export function installSkills(
  repoDir: string,
  claudeDir: string,
  skills: InstalledSkill[],
): void {
  for (const skill of skills) {
    const from = safeJoin(repoDir, skill.from);
    const to = safeJoin(claudeDir, `skills/${basename(skill.from)}`);
    assertRealDestWithin(claudeDir, to);
    cpSync(from, to, { recursive: true, force: true, filter: copyFilter });
  }
}

/**
 * pharn-core post-install: materialize the memory bank at .claude/memory-bank/
 * and the chosen constitution variant at .claude/CONSTITUTION.md. The template
 * sources are still untrusted fetched content, so the same symlink guards apply.
 */
export function materializeCore(
  repoDir: string,
  claudeDir: string,
  constitution: Constitution,
  isMultiTenant = true,
): void {
  const coreDir = resolve(repoDir, CORE_MODULE);

  const memoryFrom = resolve(coreDir, MEMORY_BANK_SRC);
  if (!existsSync(memoryFrom)) {
    // pharn-core not shipping its memory bank is an upstream packaging bug;
    // surface it rather than silently producing an install without one.
    throw new ManifestValidationError(
      `pharn-core is missing its memory bank at ${MEMORY_BANK_SRC} in the fetched repo.`,
    );
  }
  if (isSymlink(memoryFrom)) {
    throw new ManifestValidationError(
      `pharn-core memory bank at ${MEMORY_BANK_SRC} is a symlink; refusing to copy from the untrusted repo.`,
    );
  }
  const memoryTo = resolve(claudeDir, 'memory-bank');
  assertRealDestWithin(claudeDir, memoryTo);
  cpSync(memoryFrom, memoryTo, {
    recursive: true,
    force: true,
    filter: (s) => copyFilter(s) && !s.endsWith(`${sep}.gitkeep`),
  });

  const constitutionFrom = resolve(
    coreDir,
    CONSTITUTION_SRC,
    `CONSTITUTION.${constitution}.md`,
  );
  if (!existsSync(constitutionFrom)) {
    throw new ManifestValidationError(
      `Constitution variant "${constitution}" not found in pharn-core templates.`,
    );
  }
  if (isSymlink(constitutionFrom)) {
    throw new ManifestValidationError(
      `Constitution variant "${constitution}" is a symlink; refusing to copy from the untrusted repo.`,
    );
  }
  const constitutionTo = resolve(claudeDir, 'CONSTITUTION.md');
  assertRealDestWithin(claudeDir, constitutionTo);
  if (isMultiTenant) {
    cpSync(constitutionFrom, constitutionTo, { force: true });
  } else {
    // Non-SaaS project: drop Principle 2 (Multi-Tenant Isolation) so it is not
    // a blocking principle. principles_included + the `## Principle N` headings
    // are kept consistent (pharn-init's [A2] check).
    const stripped = stripPrinciple(
      readFileSync(constitutionFrom, 'utf8'),
      MULTI_TENANT_PRINCIPLE,
    );
    writeFileSync(constitutionTo, stripped);
  }
}

// Defense-in-depth against path traversal in installs maps (already validated
// by INSTALL_PATH_RE, but never let a copy escape its base directory). This is
// the LEXICAL first gate (resolve + startsWith); it does NOT resolve symlinks —
// assertRealDestWithin above is the symlink-aware backstop at the write sites.
// Exported so the read-only drift check (lib/diff.ts) guards its reads the same
// way.
export function safeJoin(base: string, rel: string): string {
  const target = resolve(base, rel);
  const root = resolve(base);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new ManifestValidationError(
      `Refusing path escape: ${rel} resolves outside ${base}`,
    );
  }
  return target;
}
