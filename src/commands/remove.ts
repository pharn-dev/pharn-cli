import { existsSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
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
import {
  CORE_MODULE,
  REPO_URL,
  SKILL_MODULE_PREFIX,
} from '../lib/constants.js';
import {
  readManifest,
  readModuleManifest,
  resolveModules,
} from '../lib/manifest.js';
import { fetchRepo, type FetchedRepo } from '../lib/repo.js';
import { readPharnConfig, writePharnConfig } from '../lib/pharn-config.js';
import { ManifestValidationError } from '../lib/validate.js';
import type { InstalledSkill, ModuleManifest, PharnConfig } from '../types.js';

// The inverse of `pharn add`. Removes a methodology module (clones to learn the
// exact files it contributed) or a single category:skill (precise single-dir
// delete — no clone, no network), then updates pharn.config.json to match.
export async function runRemove(
  arg: string | undefined,
  opts: { yes?: boolean } = {},
): Promise<void> {
  intro('pharn remove');

  const cwd = process.cwd();
  const config = readPharnConfig(cwd);
  if (!config) {
    log.error('No pharn.config.json found. Run `pharn init` first.');
    process.exit(1);
  }
  const claudeDir = resolve(cwd, '.claude');

  // A `category:skill` address (has a colon) removes one wizard skill; a plain
  // name removes a whole module; no arg opens the interactive picker.
  if (arg !== undefined && arg.includes(':')) {
    await removeSkill(cwd, claudeDir, config, arg);
    return;
  }
  if (arg !== undefined) {
    await removeModule(cwd, claudeDir, config, arg, opts);
    return;
  }
  await runPicker(cwd, claudeDir, config);
}

// ---------------------------------------------------------------------------
// §A — remove a category:skill (no clone, no network)
// ---------------------------------------------------------------------------

// What is installed is fully derivable from installedSkills + the filesystem, so
// this path never fetches the manifest or clones the repo.
async function removeSkill(
  cwd: string,
  claudeDir: string,
  config: PharnConfig,
  arg: string,
): Promise<void> {
  const idx = arg.indexOf(':');
  const category = arg.slice(0, idx);
  const skill = arg.slice(idx + 1);
  const moduleRoot = `${SKILL_MODULE_PREFIX}${category}`;

  const installedSkills = config.installedSkills ?? [];
  const target = installedSkills.find(
    (s) => s.from.split('/')[0] === moduleRoot && s.skill === skill,
  );

  // Not installed → benign no-op (no config write). Without a manifest we can't
  // tell "valid but absent" from "unknown", so list the installed skills (the
  // only things actually removable) as the valid values.
  if (!target) {
    const valid = installedSkills.map(skillAddress).sort();
    const hint = valid.length
      ? ` Installed skills: ${valid.join(', ')}.`
      : ' No skills are installed.';
    log.warn(`"${arg}" is not an installed skill.${hint}`);
    outro('Nothing was removed.');
    return;
  }

  // Each skill lives in its own isolated dir, so removal is a precise recursive
  // delete; siblings in the same category are never touched.
  const skillDir = safeUnderClaude(
    claudeDir,
    `skills/${basename(target.from)}`,
  );
  let note = '';
  if (existsSync(skillDir)) {
    rmSync(skillDir, { recursive: true, force: true });
  } else {
    note = pc.dim(' (its files were already gone)');
  }

  // Drop only this entry. stackAnswers / modules / skillsVersion / commit are
  // left untouched — the recorded wizard answer stays authoritative.
  await writePharnConfig(cwd, {
    ...config,
    installedSkills: installedSkills.filter((s) => s.from !== target.from),
    installedAt: new Date().toISOString(),
  });

  outro(
    `${pc.green('✔')} Removed ${target.skill}${note} ${pc.dim('from .claude/skills/')}`,
  );
}

// ---------------------------------------------------------------------------
// §B — remove a module (clones once)
// ---------------------------------------------------------------------------

type RemoveOutcome =
  | { kind: 'refused'; message: string }
  | { kind: 'cancelled' }
  | { kind: 'removed'; removed: string[] };

async function removeModule(
  cwd: string,
  claudeDir: string,
  config: PharnConfig,
  name: string,
  opts: { yes?: boolean },
): Promise<void> {
  // Cheap refusals first — decidable from the config alone, before any clone.
  if (name === CORE_MODULE) {
    log.error(
      `${CORE_MODULE} is required by every other module and cannot be removed.`,
    );
    process.exit(1);
  }
  const installedNames = config.modules.map((m) => m.name);
  if (!installedNames.includes(name)) {
    log.error(`${name} is not installed. Run \`pharn list\` to see what is.`);
    process.exit(1);
  }

  // Clone once and read the manifest FROM the clone (@main HEAD) — one source of
  // truth, no raw-vs-HEAD race. Always cleanup() before any process.exit, since
  // process.exit skips finally blocks in production.
  const repo = await cloneRepo();
  let outcome: RemoveOutcome | undefined;
  let failure: unknown;
  try {
    outcome = await planAndApplyModuleRemoval(
      cwd,
      claudeDir,
      config,
      name,
      opts.yes ?? false,
      repo.dir,
    );
  } catch (err) {
    failure = err;
  } finally {
    repo.cleanup();
  }

  // Surface a clean one-line message (parity with add/update) instead of letting
  // a manifest/resolve error propagate as a raw stack — but only after cleanup.
  if (failure !== undefined) {
    reportError(failure);
    process.exit(1);
  }

  const result = outcome!;
  switch (result.kind) {
    case 'refused':
      log.error(result.message);
      process.exit(1);
      break;
    case 'cancelled':
      cancelAndExit();
      break;
    case 'removed':
      outro(
        `${pc.green('✔')} Removed ${result.removed.join(', ')} ${pc.dim('from .claude/')}`,
      );
      break;
  }
}

// Resolve the survivor set, confirm, then delete exactly the target's files and
// rewrite the config. Returns an outcome instead of exiting so the caller can
// cleanup() the clone first. Performs no writes/deletes on a refusal or cancel.
async function planAndApplyModuleRemoval(
  cwd: string,
  claudeDir: string,
  config: PharnConfig,
  name: string,
  yes: boolean,
  repoDir: string,
): Promise<RemoveOutcome> {
  const manifest = readManifest(repoDir);
  const installedNames = config.modules.map((m) => m.name);

  // Dependents guard: refuse while any other installed module still needs this
  // one (directly or transitively). No automatic cascade in v1.
  const dependents = installedDependents(manifest, installedNames, name);
  if (dependents.length > 0) {
    return {
      kind: 'refused',
      message: `${name} is required by ${dependents.join(', ')} — remove ${
        dependents.length > 1 ? 'those' : 'that'
      } first.`,
    };
  }

  // The survivor set is the safe source of truth for what to delete: modules
  // present before but absent after. Resolved before any file is touched.
  const remaining = installedNames.filter((n) => n !== name);
  const survivors = resolveModules(manifest, remaining);
  const survivorNames = new Set(survivors.map((m) => m.name));
  const toRemove = installedNames.filter((n) => !survivorNames.has(n));

  // An empty toRemove means `name` survived re-resolution despite being dropped
  // from the explicit set — i.e. resolveModules force-includes it because the
  // manifest marks it `required`. Refuse rather than no-op with a false success.
  if (toRemove.length === 0) {
    return {
      kind: 'refused',
      message: `${name} is a required module and cannot be removed.`,
    };
  }

  if (!yes) {
    const ok = await confirm({
      message: `Remove ${toRemove.join(', ')} from .claude/?`,
      initialValue: false,
    });
    if (isCancel(ok) || ok !== true) return { kind: 'cancelled' };
  }

  // Compute the exact contributed file set up front (fail-before-write).
  const files = new Set<string>();
  const dirs = new Set<string>();
  for (const mod of toRemove) {
    const mm = readModuleManifest(repoDir, mod);
    collectModuleFiles(repoDir, claudeDir, mod, mm, files, dirs);
  }

  for (const file of files) {
    if (existsSync(file)) rmSync(file, { force: true });
  }
  pruneEmptyDirs(dirs, claudeDir);

  // Keep the survivors' RECORDED versions — remove deletes files but never
  // reinstalls, so resampling versions from the clone's @main manifest would
  // misreport what's on disk and mask pending per-module updates.
  await writePharnConfig(cwd, {
    ...config,
    modules: config.modules.filter((m) => survivorNames.has(m.name)),
    installedAt: new Date().toISOString(),
  });

  return { kind: 'removed', removed: toRemove };
}

// ---------------------------------------------------------------------------
// Interactive picker (no arg)
// ---------------------------------------------------------------------------

// Lists only genuinely removable items — installed optional modules (excluding
// pharn-core and any module with an installed dependent) plus installed skills —
// so we never offer something the command would immediately refuse. Clones once
// (the dependents guard needs the manifest) and reuses that clone for the delete.
async function runPicker(
  cwd: string,
  claudeDir: string,
  config: PharnConfig,
): Promise<void> {
  const installedNames = config.modules.map((m) => m.name);
  const removableSkills = (config.installedSkills ?? [])
    .map(skillAddress)
    .sort();
  const hasOptionalModules = installedNames.some((n) => n !== CORE_MODULE);

  // Only the module dependents-guard needs the manifest; skill removal is
  // cloneless. Skip the clone entirely when no optional module is installed.
  const repo = hasOptionalModules ? await cloneRepo() : undefined;
  let cancelled = false;
  let none = false;
  let skillArg: string | undefined;
  let moduleOutcome: RemoveOutcome | undefined;
  let failure: unknown;
  try {
    let removableModules: string[] = [];
    if (repo) {
      const manifest = readManifest(repo.dir);
      removableModules = installedNames.filter(
        (n) =>
          n !== CORE_MODULE &&
          installedDependents(manifest, installedNames, n).length === 0,
      );
    }

    if (removableModules.length === 0 && removableSkills.length === 0) {
      none = true;
    } else {
      const choice = await select({
        message: 'What do you want to remove?',
        options: [
          ...removableModules.map((n) => ({
            value: n,
            label: n,
            hint: 'module',
          })),
          ...removableSkills.map((a) => ({
            value: a,
            label: a,
            hint: 'skill',
          })),
        ],
      });
      if (isCancel(choice)) {
        cancelled = true;
      } else if ((choice as string).includes(':')) {
        // A skill address carries a colon; a module name never does.
        skillArg = choice as string;
      } else {
        // A bare module name can only come from removableModules, which is empty
        // unless the clone exists — so repo is non-null here. Remove without a
        // second confirm (the pick is the intent), while the clone is held.
        moduleOutcome = await planAndApplyModuleRemoval(
          cwd,
          claudeDir,
          config,
          choice as string,
          true,
          repo!.dir,
        );
      }
    }
  } catch (err) {
    failure = err;
  } finally {
    repo?.cleanup();
  }

  // Act only after the clone is cleaned up (so process.exit can't skip cleanup).
  if (failure !== undefined) {
    reportError(failure);
    process.exit(1);
  }
  if (none) {
    outro(
      'Nothing to remove — pharn-core is required and no skills are installed.',
    );
    return;
  }
  if (cancelled) cancelAndExit();
  if (skillArg !== undefined) {
    await removeSkill(cwd, claudeDir, config, skillArg);
    return;
  }
  if (moduleOutcome?.kind === 'removed') {
    outro(
      `${pc.green('✔')} Removed ${moduleOutcome.removed.join(', ')} ${pc.dim('from .claude/')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function cloneRepo(): Promise<FetchedRepo> {
  const s = spinner();
  s.start(`Fetching module catalog from ${REPO_URL}`);
  try {
    const repo = await fetchRepo();
    s.stop('Module catalog loaded');
    return repo;
  } catch (err) {
    s.stop('Failed to fetch repository');
    reportError(err);
    process.exit(1);
  }
}

// Clean one-line error (parity with add/update/status); full detail under
// PHARN_DEBUG. Used by every catch in this command.
function reportError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  log.error(`⚠ ${message}`);
  if (process.env.PHARN_DEBUG) console.error(err);
}

// `category:skill` rendering of an installed skill, e.g. orm:prisma.
function skillAddress(s: InstalledSkill): string {
  const root = s.from.split('/')[0] ?? '';
  const category = root.startsWith(SKILL_MODULE_PREFIX)
    ? root.slice(SKILL_MODULE_PREFIX.length)
    : root;
  return `${category}:${s.skill}`;
}

// Installed modules whose transitive dependsOn includes `target`.
function installedDependents(
  manifest: { modules: { name: string; dependsOn: string[] }[] },
  installedNames: string[],
  target: string,
): string[] {
  const byName = new Map(manifest.modules.map((m) => [m.name, m]));
  const dependsOnTarget = (start: string): boolean => {
    const seen = new Set<string>();
    const stack = [...(byName.get(start)?.dependsOn ?? [])];
    while (stack.length) {
      const dep = stack.pop()!;
      if (dep === target) return true;
      if (seen.has(dep)) continue;
      seen.add(dep);
      stack.push(...(byName.get(dep)?.dependsOn ?? []));
    }
    return false;
  };
  return installedNames.filter((n) => n !== target && dependsOnTarget(n));
}

// Map a module's `installs` entries to the exact files they contributed under
// .claude/, mirroring installModule's cpSync(from, to) semantics. statSync the
// source and branch — the schema permits a single-file `from`, not only dirs.
function collectModuleFiles(
  repoDir: string,
  claudeDir: string,
  moduleName: string,
  mm: ModuleManifest,
  files: Set<string>,
  dirs: Set<string>,
): void {
  const moduleDir = resolve(repoDir, moduleName);
  for (const [src, dest] of Object.entries(mm.installs)) {
    const from = resolve(moduleDir, src);
    const to = safeUnderClaude(claudeDir, dest);
    // A `from` missing at @main HEAD means we can't know which files it once
    // contributed — leave them (the documented orphan caveat) rather than guess.
    if (!existsSync(from)) continue;

    if (statSync(from).isDirectory()) {
      for (const rel of walkFiles(from)) {
        const file = resolve(to, rel);
        if (isProtected(claudeDir, file)) continue;
        files.add(file);
        dirs.add(dirname(file));
      }
      dirs.add(to);
    } else {
      if (isProtected(claudeDir, to)) continue;
      files.add(to);
      dirs.add(dirname(to));
    }
  }
}

// Relative paths of every file (not directory) under `dir`, recursively.
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

// CONSTITUTION.md and the memory bank are user-owned (materialized only at init)
// and must never be deleted, even if a module's file set somehow references them.
function isProtected(claudeDir: string, target: string): boolean {
  const memoryBank = resolve(claudeDir, 'memory-bank');
  return (
    target === resolve(claudeDir, 'CONSTITUTION.md') ||
    target === memoryBank ||
    target.startsWith(memoryBank + sep)
  );
}

// Remove now-empty directories bottom-up, but never one that still holds a
// surviving module's files (re-checked with readdirSync before each rmdir).
function pruneEmptyDirs(dirs: Set<string>, claudeDir: string): void {
  const candidates = new Set<string>();
  for (const dir of dirs) {
    let cur = dir;
    while (cur.startsWith(claudeDir + sep)) {
      candidates.add(cur);
      cur = dirname(cur);
    }
  }
  const depth = (p: string): number => p.split(sep).length;
  for (const dir of [...candidates].sort((a, b) => depth(b) - depth(a))) {
    if (isProtected(claudeDir, dir) || !existsSync(dir)) continue;
    try {
      if (readdirSync(dir).length === 0) rmdirSync(dir);
    } catch {
      // Non-empty (surviving files) or a race — leave it in place.
    }
  }
}

// Defense-in-depth: never let a delete escape .claude/ (mirrors install-modules
// safeJoin). dest paths are already validated by INSTALL_PATH_RE upstream.
function safeUnderClaude(claudeDir: string, rel: string): string {
  const target = resolve(claudeDir, rel);
  const root = resolve(claudeDir);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new ManifestValidationError(
      `Refusing path escape: ${rel} resolves outside ${claudeDir}`,
    );
  }
  return target;
}
