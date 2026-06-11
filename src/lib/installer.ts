import { fetchRepo, fetchCommitSha } from './repo.js';
import { readManifest, resolveModules } from './manifest.js';
import {
  assertSkillSourcesExist,
  installModule,
  installSkills,
  materializeCore,
} from './install-modules.js';
import type { Constitution, InstalledSkill, ManifestModule } from '../types.js';

export interface InstallResult {
  skillsVersion: string;
  commit: string | null;
  resolved: ManifestModule[];
  installedSkills: InstalledSkill[];
}

/**
 * Clone pharn-oss, resolve the full module set from the selected names, copy
 * each module's installs into `claudeDir`, and (when a constitution variant is
 * given) materialize the memory bank + CONSTITUTION.md.
 *
 * Reads the manifest from the cloned commit so the installed versions exactly
 * match what shipped at that SHA.
 */
export async function fetchAndInstall(params: {
  claudeDir: string;
  selected: string[];
  constitution?: Constitution;
  // schemaVersion 2: specific skill subfolders resolved from wizard answers.
  wizardSkills?: InstalledSkill[];
}): Promise<InstallResult> {
  const repo = await fetchRepo();
  const wizardSkills = params.wizardSkills ?? [];
  try {
    const manifest = readManifest(repo.dir);
    const resolved = resolveModules(manifest, params.selected);

    // Validate every skill source up front so a bad path fails before any file
    // is written — no partial installs.
    assertSkillSourcesExist(repo.dir, wizardSkills);

    for (const mod of resolved) {
      installModule(repo.dir, params.claudeDir, mod);
    }
    installSkills(repo.dir, params.claudeDir, wizardSkills);
    if (params.constitution) {
      materializeCore(repo.dir, params.claudeDir, params.constitution);
    }

    const commit = await fetchCommitSha();
    return {
      skillsVersion: manifest.skillsVersion,
      commit,
      resolved,
      installedSkills: wizardSkills,
    };
  } finally {
    repo.cleanup();
  }
}
