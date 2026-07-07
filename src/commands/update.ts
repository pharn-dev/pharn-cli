import { resolve } from 'node:path';
import {
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  spinner,
} from '@clack/prompts';
import pc from 'picocolors';
import { cancelAndExit } from '../lib/confirm.js';
import { REPO_URL } from '../lib/constants.js';
import { fetchRemoteManifest } from '../lib/manifest.js';
import { listSkillAddresses } from '../lib/wizard.js';
import { fetchAndInstall } from '../lib/installer.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { resolveCapabilities } from '../lib/resolve-capabilities.js';
import { installCapabilities } from '../lib/install-capabilities.js';
import { fetchRepo, fetchCommitSha } from '../lib/repo.js';
import {
  fetchRemoteSkillsVersion,
  readSkillsVersion,
} from '../lib/skills-version.js';
import { row } from '../lib/format.js';
import {
  isArchetypeConfig,
  readPharnConfig,
  toInstalledModules,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type {
  InstalledCapability,
  InstalledSkill,
  PharnConfig,
} from '../types.js';

export async function runUpdate(): Promise<void> {
  intro('pharn update');

  const cwd = process.cwd();
  const config = readPharnConfig(cwd);
  if (!config) {
    log.error('No pharn.config.json found. Run `pharn init` first.');
    process.exit(1);
  }

  // Archetype (capability) install: refresh via SKILLS_VERSION + re-resolved
  // capabilities (there is no manifest). Separate path; legacy flow unchanged.
  if (isArchetypeConfig(config)) {
    await runArchetypeUpdate(config, cwd);
    return;
  }

  const s = spinner();
  s.start('Checking for updates');
  let manifest;
  try {
    manifest = await fetchRemoteManifest();
    s.stop(`Latest skills v${manifest.skillsVersion}`);
  } catch (err) {
    s.stop('Failed to check for updates');
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  const latest = new Map(manifest.modules.map((m) => [m.name, m.version]));
  const changes = config.modules
    .filter((m) => latest.has(m.name) && latest.get(m.name) !== m.version)
    .map((m) => ({ name: m.name, from: m.version, to: latest.get(m.name)! }));

  // schemaVersion 2: re-resolve installed skills against the new wizard. A
  // recorded `from` path that no longer exists upstream (skill moved/renamed) is
  // reported and dropped — never guessed at a new location.
  const recordedSkills = config.installedSkills ?? [];
  let keptSkills: InstalledSkill[] = recordedSkills;
  let droppedSkills: InstalledSkill[] = [];
  if (
    manifest.schemaVersion === 2 &&
    manifest.wizard &&
    recordedSkills.length
  ) {
    const validPaths = new Set(
      listSkillAddresses(manifest.wizard).map((a) => a.install),
    );
    keptSkills = recordedSkills.filter((s) => validPaths.has(s.from));
    droppedSkills = recordedSkills.filter((s) => !validPaths.has(s.from));
  }

  if (
    config.skillsVersion === manifest.skillsVersion &&
    changes.length === 0 &&
    droppedSkills.length === 0
  ) {
    outro(`Already up to date (skills v${config.skillsVersion}).`);
    return;
  }

  if (droppedSkills.length > 0) {
    log.warn(
      [
        'These installed skills no longer exist upstream and will be skipped',
        '(their files in .claude/skills/ are left untouched):',
        ...droppedSkills.map((s) => `  ${s.skill} (${s.from})`),
      ].join('\n'),
    );
  }

  note(
    [
      row(
        'Skills version',
        `v${config.skillsVersion} → v${manifest.skillsVersion}`,
      ),
      '',
      '  MODULE CHANGES',
      ...(changes.length
        ? changes.map((c) => row(c.name, `v${c.from} → v${c.to}`))
        : ['  (no per-module version changes)']),
      '',
      pc.dim('  Review CHANGELOG.md for breaking changes before updating.'),
      pc.dim('  https://github.com/pharn-dev/pharn-oss/blob/main/CHANGELOG.md'),
    ].join('\n'),
  );

  const ok = await confirm({
    message: 'Re-fetch installed modules at the latest version?',
    initialValue: true,
  });
  if (isCancel(ok) || ok !== true) cancelAndExit();

  const claudeDir = resolve(cwd, '.claude');
  const installedNames = config.modules.map((m) => m.name);
  const s2 = spinner();
  s2.start(`Updating from ${REPO_URL}`);
  let result;
  try {
    result = await fetchAndInstall({
      claudeDir,
      selected: installedNames,
      wizardSkills: keptSkills,
    });
    s2.stop('Modules updated');
  } catch (err) {
    s2.stop('Update failed');
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  await writePharnConfig(cwd, {
    ...config,
    skillsVersion: result.skillsVersion,
    commit: result.commit,
    modules: toInstalledModules(result.resolved),
    installedAt: new Date().toISOString(),
    // Persist only the surviving skills; stackAnswers stays untouched.
    ...(recordedSkills.length > 0 ? { installedSkills: keptSkills } : {}),
  });

  outro(
    `${pc.green('✔')} Updated to skills v${result.skillsVersion}. ${pc.dim('CONSTITUTION.md left untouched (edit it by hand).')}`,
  );
}

// Archetype install refresh: check SKILLS_VERSION, then (on a bump + confirm)
// re-resolve the RECORDED archetypes against the latest capability index and
// re-copy — mirroring legacy update's "re-resolve recorded modules". The clone
// lives across no interactive prompt (confirm is before it), but cleanup still
// runs in a finally with every process.exit after it.
async function runArchetypeUpdate(
  config: PharnConfig,
  cwd: string,
): Promise<void> {
  const s = spinner();
  s.start('Checking for updates');
  let latest: string;
  try {
    latest = await fetchRemoteSkillsVersion();
    s.stop(`Latest skills v${latest}`);
  } catch (err) {
    s.stop('Failed to check for updates');
    log.error(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  if (config.skillsVersion === latest) {
    outro(`Already up to date (skills v${config.skillsVersion}).`);
    return;
  }

  note(
    [
      row('Skills version', `v${config.skillsVersion} → v${latest}`),
      '',
      row('Archetypes', (config.archetypes ?? []).join(', ') || '(none)'),
      '',
      pc.dim(
        '  Re-resolves your archetypes against the latest capabilities and re-copies them.',
      ),
      pc.dim('  https://github.com/pharn-dev/pharn-oss/blob/main/CHANGELOG.md'),
    ].join('\n'),
  );
  const ok = await confirm({
    message: 'Re-fetch capabilities at the latest version?',
    initialValue: true,
  });
  if (isCancel(ok) || ok !== true) cancelAndExit();

  const s2 = spinner();
  s2.start(`Updating from ${REPO_URL}`);
  let repo;
  try {
    repo = await fetchRepo();
  } catch (err) {
    s2.stop('Update failed');
    log.error(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  let installedVersion: string | null = null;
  let capCount = 0;
  let failure: string | null = null;
  try {
    const index = parseCapabilityIndex(repo.dir);
    const selection = resolveCapabilities(config.archetypes ?? [], index);
    installCapabilities(repo.dir, cwd, selection);
    const capabilities: InstalledCapability[] = selection.selected.map((c) => ({
      name: c.name,
      role: c.role,
    }));
    installedVersion = readSkillsVersion(repo.dir);
    capCount = capabilities.length;
    const commit = await fetchCommitSha();
    await writePharnConfig(cwd, {
      ...config,
      skillsVersion: installedVersion,
      commit,
      capabilities,
      installedAt: new Date().toISOString(),
    });
    s2.stop('Capabilities updated');
  } catch (err) {
    s2.stop('Update failed');
    failure = err instanceof Error ? err.message : String(err);
    if (process.env.PHARN_DEBUG) console.error(err);
  } finally {
    repo.cleanup();
  }

  if (failure) {
    log.error(`⚠ ${failure}`);
    if (!process.env.PHARN_DEBUG) {
      log.info('Re-run with PHARN_DEBUG=1 for full error output.');
    }
    process.exit(1);
  }
  outro(
    `${pc.green('✔')} Updated to skills v${installedVersion} (${capCount} capabilit${capCount === 1 ? 'y' : 'ies'}). ${pc.dim('CONSTITUTION.md left untouched.')}`,
  );
}
