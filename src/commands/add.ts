import { resolve } from 'node:path';
import {
  confirm,
  intro,
  isCancel,
  log,
  outro,
  select,
  spinner,
} from '@clack/prompts';
import pc from 'picocolors';
import { cancelAndExit } from '../lib/confirm.js';
import { REPO_URL } from '../lib/constants.js';
import {
  categorizeModules,
  fetchRemoteManifest,
  resolveModules,
} from '../lib/manifest.js';
import { findSkillOption, listSkillAddresses } from '../lib/wizard.js';
import { assertPrerequisites } from '../steps/prereqs.js';
import { fetchAndInstall } from '../lib/installer.js';
import {
  readPharnConfig,
  toInstalledModules,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type {
  InstalledSkill,
  Manifest,
  ManifestModule,
  PharnConfig,
} from '../types.js';

export async function runAdd(moduleArg: string | undefined): Promise<void> {
  intro('pharn add');

  const cwd = process.cwd();
  const config = readPharnConfig(cwd);
  if (!config) {
    log.error('No pharn.config.json found. Run `pharn init` first.');
    process.exit(1);
  }

  const manifest = await loadManifest();

  // schemaVersion 2: `add <category>:<skill>` installs one wizard skill.
  if (moduleArg !== undefined && moduleArg.includes(':')) {
    await addSkill(cwd, config, manifest, moduleArg);
    return;
  }

  const { optional, stackPacks } = categorizeModules(manifest);
  const installed = new Set(config.modules.map((m) => m.name));

  // Anything not yet installed: optional modules + stack packs.
  const addable = [...optional, ...stackPacks].filter(
    (m) => !installed.has(m.name),
  );
  if (addable.length === 0) {
    outro('Everything available is already installed.');
    return;
  }

  let name = moduleArg;
  if (name && !addable.some((m) => m.name === name)) {
    if (installed.has(name)) {
      outro(`${name} is already installed.`);
      return;
    }
    log.warn(`"${name}" is not an addable module. Pick one below.`);
    name = undefined;
  }
  if (!name) {
    const choice = await select({
      message: 'Which module do you want to add?',
      options: addable.map((m) => ({
        value: m.name,
        label: m.name,
        hint: `v${m.version}`,
      })),
    });
    if (isCancel(choice)) cancelAndExit();
    name = choice as string;
  }
  const moduleName: string = name;
  const union = [...installed, moduleName];

  // Resolve up front to discover the new module's transitive deps; a conflict
  // (ResolutionError, e.g. a second stack pack) fails here before any network
  // work, sharing the install-failure exit path below.
  let newlyResolved: ManifestModule[];
  try {
    newlyResolved = resolveModules(manifest, union).filter(
      (m) => !installed.has(m.name),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }
  // Same prerequisite gate as init: the newly-introduced modules' declared
  // packages must already be in package.json, so `add pharn-stack-nextjs` into
  // a non-Next project fails identically instead of bypassing the requirement.
  assertPrerequisites(newlyResolved, cwd, `npx pharn add ${moduleName}`);

  const claudeDir = resolve(cwd, '.claude');
  const s = spinner();
  s.start(`Fetching ${moduleName} from ${REPO_URL}`);
  let resolved: { name: string; version: string }[];
  let skillsVersion: string;
  let commit: string | null;
  try {
    // Re-resolve the union so dependencies of the new module are pulled in too.
    const result = await fetchAndInstall({ claudeDir, selected: union });
    resolved = result.resolved;
    skillsVersion = result.skillsVersion;
    commit = result.commit;
    s.stop(`${moduleName} installed`);
  } catch (err) {
    s.stop(`Failed to add ${moduleName}`);
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  await writePharnConfig(cwd, {
    ...config,
    skillsVersion,
    commit,
    modules: toInstalledModules(resolved),
    installedAt: new Date().toISOString(),
  });

  const added = resolved.map((m) => m.name).filter((n) => !installed.has(n));
  outro(
    `${pc.green('✔')} Added ${added.join(', ')} → ${pc.dim('.claude/')}  ${pc.dim(`(skills v${skillsVersion})`)}`,
  );
}

// Install a single category skill (e.g. `add orm:prisma`). Records it in
// installedSkills WITHOUT touching stackAnswers — the recorded wizard answer
// stays authoritative; the wizard never auto-edits it.
async function addSkill(
  cwd: string,
  config: PharnConfig,
  manifest: Manifest,
  arg: string,
): Promise<void> {
  if (manifest.schemaVersion !== 2 || !manifest.wizard) {
    log.error(
      'category:skill requires a schemaVersion 2 manifest (skills v0.69+). Run `pharn update` or pass a plain module name.',
    );
    process.exit(1);
  }
  const wizard = manifest.wizard;

  const idx = arg.indexOf(':');
  const category = arg.slice(0, idx);
  const skill = arg.slice(idx + 1);
  const addr = findSkillOption(wizard, category, skill);
  if (!addr) {
    const valid = listSkillAddresses(wizard)
      .map((a) => `${a.category}:${a.skill}`)
      .sort();
    log.error(
      `Unknown skill "${arg}". Valid options:\n  ${valid.join('\n  ')}`,
    );
    process.exit(1);
  }

  const installedSkills = config.installedSkills ?? [];
  if (installedSkills.some((s) => s.from === addr.install)) {
    outro(`${addr.skill} is already installed.`);
    return;
  }

  // A different skill of the same category already installed → confirm before
  // installing alongside it.
  const sibling = installedSkills.find(
    (s) => s.from.split('/')[0] === addr.module && s.skill !== addr.skill,
  );
  if (sibling) {
    const ok = await confirm({
      message: `Your project is configured with ${sibling.skill}. Install ${addr.skill} alongside?`,
      initialValue: false,
    });
    if (isCancel(ok) || ok !== true) cancelAndExit();
  }

  const claudeDir = resolve(cwd, '.claude');
  const newSkill: InstalledSkill = { skill: addr.skill, from: addr.install };
  const installedNames = config.modules.map((m) => m.name);

  const s = spinner();
  s.start(`Fetching ${addr.skill} from ${REPO_URL}`);
  let resolved: { name: string; version: string }[];
  let skillsVersion: string;
  let commit: string | null;
  try {
    const result = await fetchAndInstall({
      claudeDir,
      selected: installedNames,
      wizardSkills: [newSkill],
    });
    resolved = result.resolved;
    skillsVersion = result.skillsVersion;
    commit = result.commit;
    s.stop(`${addr.skill} installed`);
  } catch (err) {
    s.stop(`Failed to add ${addr.skill}`);
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  await writePharnConfig(cwd, {
    ...config,
    skillsVersion,
    commit,
    modules: toInstalledModules(resolved),
    installedSkills: [...installedSkills, newSkill],
    installedAt: new Date().toISOString(),
  });

  outro(
    `${pc.green('✔')} Added ${addr.skill} → ${pc.dim('.claude/skills/')}  ${pc.dim(`(skills v${skillsVersion})`)}`,
  );
}

async function loadManifest(): Promise<Manifest> {
  const s = spinner();
  s.start('Fetching module catalog');
  try {
    const manifest = await fetchRemoteManifest();
    s.stop('Module catalog loaded');
    return manifest;
  } catch (err) {
    s.stop('Failed to load module catalog');
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }
}
