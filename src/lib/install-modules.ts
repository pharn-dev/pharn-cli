import { cpSync, existsSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { CORE_MODULE } from './constants.js';
import { ManifestValidationError } from './validate.js';
import { readModuleManifest } from './manifest.js';
import type { Constitution, InstalledSkill, ManifestModule } from '../types.js';

// Materialized (not just copied via installs map) by the installer for
// pharn-core. Kept in sync with pharn-core/templates/.
const MEMORY_BANK_SRC = 'templates/memory-bank';
const CONSTITUTION_SRC = 'templates/constitution';

/**
 * Copy a single module's `installs` entries from the fetched repo into the
 * user's `.claude/`. Directories merge; files overwrite.
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
    cpSync(from, to, { recursive: true, force: true });
  }
}

/**
 * Pre-flight for selective install (schemaVersion 2): assert every skill's
 * source folder exists in the fetched repo BEFORE any copy, so a bad `from`
 * path fails the whole install with nothing written (no partial installs).
 */
export function assertSkillSourcesExist(
  repoDir: string,
  skills: InstalledSkill[],
): void {
  for (const skill of skills) {
    const from = safeJoin(repoDir, skill.from);
    if (!existsSync(from)) {
      throw new ManifestValidationError(
        `Skill "${skill.skill}" declares source "${skill.from}" but it is missing in the fetched repo.`,
      );
    }
  }
}

/**
 * Copy each selected skill's subfolder into .claude/skills/<basename>/. Only the
 * exact `from` directory is copied — sibling skills in the same category module
 * are never touched. Call assertSkillSourcesExist first.
 */
export function installSkills(
  repoDir: string,
  claudeDir: string,
  skills: InstalledSkill[],
): void {
  for (const skill of skills) {
    const from = safeJoin(repoDir, skill.from);
    const to = safeJoin(claudeDir, `skills/${basename(skill.from)}`);
    cpSync(from, to, { recursive: true, force: true });
  }
}

/**
 * pharn-core post-install: materialize the memory bank at .claude/memory-bank/
 * and the chosen constitution variant at .claude/CONSTITUTION.md.
 */
export function materializeCore(
  repoDir: string,
  claudeDir: string,
  constitution: Constitution,
): void {
  const coreDir = resolve(repoDir, CORE_MODULE);

  const memoryFrom = resolve(coreDir, MEMORY_BANK_SRC);
  if (existsSync(memoryFrom)) {
    cpSync(memoryFrom, resolve(claudeDir, 'memory-bank'), {
      recursive: true,
      force: true,
      filter: (s) => !s.endsWith(`${sep}.gitkeep`),
    });
  }

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
  cpSync(constitutionFrom, resolve(claudeDir, 'CONSTITUTION.md'), {
    force: true,
  });
}

// Defense-in-depth against path traversal in installs maps (already validated
// by INSTALL_PATH_RE, but never let a copy escape its base directory).
function safeJoin(base: string, rel: string): string {
  const target = resolve(base, rel);
  const root = resolve(base);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new ManifestValidationError(
      `Refusing path escape: ${rel} resolves outside ${base}`,
    );
  }
  return target;
}
