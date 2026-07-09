import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm, isCancel, log, outro, spinner } from '@clack/prompts';
import { createRequire } from 'node:module';
import pc from 'picocolors';
import { cancelAndExit } from '../lib/confirm.js';
import { DOCS_URL, FIRST_FEATURE_COMMAND, REPO_URL } from '../lib/constants.js';
import { fetchAndInstall } from '../lib/installer.js';
import { DEFAULT_MODEL_ROUTING } from '../lib/model-routing.js';
import { DEFAULT_SEAM_CONFIG } from '../lib/seam-config.js';
import {
  configPath,
  isConfigValidationError,
  readPharnConfig,
  toInstalledModules,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type { PharnConfig, WizardConfig } from '../types.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };
const PHARN_VERSION = pkg.version;

export async function runInstall(config: WizardConfig): Promise<void> {
  const startedAt = Date.now();
  const cwd = process.cwd();
  const claudeDir = resolve(cwd, '.claude');

  if (existsSync(configPath(cwd))) {
    try {
      const existing = readPharnConfig(cwd);
      if (existing) {
        log.info(
          `Existing pharn.config.json found (skillsVersion ${existing.skillsVersion ?? 'unknown'}).`,
        );
      }
    } catch (e) {
      // Present-but-invalid existing config: name it, don't crash / silently
      // treat-as-absent. Overwrite is still offered (install is the repair path).
      if (isConfigValidationError(e)) {
        log.warn(`Existing pharn.config.json is invalid: ${e.message}`);
      } else {
        throw e;
      }
    }
    if (!(await confirmOverwrite('Overwrite existing pharn.config.json?'))) {
      cancelAndExit();
    }
  }

  // The optional modules plus the stack pack; pharn-core and transitive deps
  // are added during resolution.
  const selected = [
    ...config.modules,
    ...(config.stackPack ? [config.stackPack] : []),
  ];

  const s = spinner();
  s.start(`Fetching skills from ${REPO_URL}`);
  let skillsVersion: string;
  let commit: string | null;
  let resolved: { name: string; version: string }[];
  try {
    const result = await fetchAndInstall({
      claudeDir,
      selected,
      constitution: config.constitution,
      wizardSkills: config.installedSkills,
      isMultiTenant: config.isMultiTenant,
    });
    skillsVersion = result.skillsVersion;
    commit = result.commit;
    resolved = result.resolved;
    s.stop(`Skills installed from ${REPO_URL}`);
  } catch (err) {
    s.stop('Failed to install skills');
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    else log.info('Re-run with PHARN_DEBUG=1 for full error output.');
    process.exit(1);
  }

  const configFile: PharnConfig = {
    pharnVersion: PHARN_VERSION,
    skillsVersion,
    repo: REPO_URL.replace(/^github\.com\//, ''),
    commit,
    constitution: config.constitution,
    isMultiTenant: config.isMultiTenant,
    modules: toInstalledModules(resolved),
    installedAt: new Date().toISOString(),
    // Per-stage model routing, written on every fresh install (P7 — additive).
    models: DEFAULT_MODEL_ROUTING,
    // Seam-resolution policy, written on every fresh install (P7 — additive).
    seam: DEFAULT_SEAM_CONFIG,
    // schemaVersion 2: persist the wizard answers + selected skills so add and
    // update can re-resolve without re-asking. Omitted entirely on legacy installs.
    ...(config.stackAnswers ? { stackAnswers: config.stackAnswers } : {}),
    ...(config.installedSkills && config.installedSkills.length > 0
      ? { installedSkills: config.installedSkills }
      : {}),
  };
  await writePharnConfig(cwd, configFile);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const check = pc.green('✔');
  outro(
    [
      `${check} ${resolved.length} module${resolved.length === 1 ? '' : 's'} installed → ${pc.dim('.claude/')}`,
      ...(config.installedSkills && config.installedSkills.length > 0
        ? [
            `${check} ${config.installedSkills.length} skill${config.installedSkills.length === 1 ? '' : 's'} installed → ${pc.dim('.claude/skills/')} ${pc.dim(`(${config.installedSkills.map((s) => s.skill).join(', ')})`)}`,
          ]
        : []),
      `${check} CONSTITUTION.md + memory-bank written`,
      `${check} pharn.config.json written ${pc.dim(`(skills v${skillsVersion})`)}`,
      `${pc.dim(`Done in ${elapsed}s`)}`,
      '',
      pc.bold('Next steps'),
      `  ${pc.cyan('1.')}  ${pc.bold('claude')}            ${pc.dim('open Claude Code')}`,
      `  ${pc.cyan('2.')}  ${pc.bold(FIRST_FEATURE_COMMAND)}       ${pc.dim('plan your first feature')}`,
      '',
      `${pc.bold('Docs')}  ${pc.cyan(DOCS_URL)}`,
    ].join('\n'),
  );
}

async function confirmOverwrite(message: string): Promise<boolean> {
  const ok = await confirm({ message, initialValue: false });
  return !isCancel(ok) && ok === true;
}
