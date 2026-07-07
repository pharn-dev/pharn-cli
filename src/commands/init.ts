import { existsSync } from 'node:fs';
import { confirm, intro, isCancel, log, note, spinner } from '@clack/prompts';
import { showBanner } from '../lib/banner.js';
import { cancelAndExit } from '../lib/confirm.js';
import { REPO_URL } from '../lib/constants.js';
import {
  categorizeModules,
  fetchRemoteManifest,
  resolveModules,
} from '../lib/manifest.js';
import {
  applyDefaults,
  collectInstalls,
  collectVendorSkills,
} from '../lib/wizard.js';
import { detectArchetypesFromProject } from '../lib/detect-archetype.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { resolveCapabilities } from '../lib/resolve-capabilities.js';
import { fetchRepo, fetchCommitSha } from '../lib/repo.js';
import { configPath, readPharnConfig } from '../lib/pharn-config.js';
import { runGitPrereq, assertPrerequisites } from '../steps/prereqs.js';
import { runFreshCheck } from '../steps/fresh-check.js';
import { runModeSelect } from '../steps/mode-select.js';
import { runDetect } from '../steps/detect.js';
import { runWizardQuestions } from '../steps/wizard-questions.js';
import { runModuleSelect } from '../steps/module-select.js';
import { runStackPackSelect } from '../steps/stackpack-select.js';
import { runConstitutionSelect } from '../steps/constitution-select.js';
import { runMultiTenantSelect } from '../steps/multitenant-select.js';
import { runVendorConsent } from '../steps/vendor-consent.js';
import { runSummary } from '../steps/summary.js';
import { runInstall } from '../steps/install.js';
import { runArchetypeSummary } from '../steps/archetype-summary.js';
import { runInstallArchetype } from '../steps/install-archetype.js';
import type { Manifest, WizardConfig, WizardSpec } from '../types.js';

export async function runInit(
  opts: { archetype?: boolean } = {},
): Promise<void> {
  showBanner();
  intro('init wizard');

  runGitPrereq();
  await runFreshCheck();

  // Archetype-driven install (experimental, flag-gated). Framework-agnostic: it
  // detects the project's archetype(s) and installs the applicable capabilities.
  // The legacy module/wizard flow below stays the default.
  if (opts.archetype) {
    await runInitArchetype();
    return;
  }

  const manifest = await loadManifest();

  if (manifest.schemaVersion === 2 && manifest.wizard) {
    await runInitV2(manifest, manifest.wizard);
    return;
  }
  await runInitLegacy(manifest);
}

// schemaVersion-free archetype flow: detect archetypes from the project, fetch
// pharn-oss, derive + resolve the capability index, confirm, then copy the
// applicable capabilities + product surfaces. The fetched temp clone lives
// across the interactive summary, so cleanup runs in a finally and every
// process.exit / cancelAndExit happens AFTER it (Node skips finally on exit).
async function runInitArchetype(): Promise<void> {
  const cwd = process.cwd();
  const { archetypes } = detectArchetypesFromProject(cwd);
  note(archetypes.join(', '), 'Detected archetypes');

  const s = spinner();
  s.start(`Fetching PHARN from ${REPO_URL}`);
  let repo: Awaited<ReturnType<typeof fetchRepo>>;
  try {
    repo = await fetchRepo();
  } catch (err) {
    s.stop('Failed to fetch PHARN');
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ Could not reach ${REPO_URL}: ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  s.stop(`PHARN fetched from ${REPO_URL}`);

  let outcome: 'installed' | 'cancelled' = 'cancelled';
  let failure: string | null = null;
  try {
    const index = parseCapabilityIndex(repo.dir);
    const selection = resolveCapabilities(archetypes, index);

    const action = await runArchetypeSummary(archetypes, selection);
    if (action === 'install' && (await confirmOverwriteIfExists(cwd))) {
      const commit = await fetchCommitSha();
      await runInstallArchetype(repo.dir, cwd, archetypes, selection, commit);
      outcome = 'installed';
    }
  } catch (err) {
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
  if (outcome === 'cancelled') cancelAndExit();
}

// Confirm before clobbering an existing pharn.config.json. Returns true to
// proceed. No process.exit here — the caller handles cancel after cleanup.
async function confirmOverwriteIfExists(cwd: string): Promise<boolean> {
  if (!existsSync(configPath(cwd))) return true;
  const existing = readPharnConfig(cwd);
  if (existing) {
    log.info(
      `Existing pharn.config.json found (skillsVersion ${existing.skillsVersion ?? 'unknown'}).`,
    );
  }
  const ok = await confirm({
    message: 'Overwrite existing pharn.config.json?',
    initialValue: false,
  });
  return !isCancel(ok) && ok === true;
}

// schemaVersion 2: render the wizard from manifest.wizard, then install only the
// selected per-tech skill subfolders.
async function runInitV2(
  manifest: Manifest,
  wizard: WizardSpec,
): Promise<void> {
  const { optional, stackPacks } = categorizeModules(manifest);

  // Pre-fill from the project's package.json (stack pack + per-tech answers).
  // Detection runs once up front; the user overrides anything below.
  const { detectedAnswers, detectedStackPack } = runDetect(wizard, stackPacks);

  let previous: WizardConfig | undefined;

  while (true) {
    const mode = await runModeSelect();
    const stackAnswers =
      mode === 'default'
        ? applyDefaults(wizard, detectedAnswers)
        : await runWizardQuestions(
            wizard,
            previous?.stackAnswers ?? detectedAnswers,
          );

    const modules = await runModuleSelect(optional, previous?.modules);
    // undefined initial = first run → seed the detected pack (or None); on a
    // loop-back reuse the prior pick, preserving an explicit None (null).
    const stackPack = await runStackPackSelect(
      stackPacks,
      previous ? previous.stackPack : detectedStackPack,
    );
    const constitution = await runConstitutionSelect(previous?.constitution);
    const isMultiTenant = await runMultiTenantSelect(previous?.isMultiTenant);

    const installedSkills = collectInstalls(wizard, stackAnswers);
    const vendorSkills = await runVendorConsent(
      collectVendorSkills(wizard, stackAnswers),
      previous?.vendorSkills,
    );

    const config: WizardConfig = {
      modules,
      stackPack,
      constitution,
      isMultiTenant,
      stackAnswers,
      installedSkills,
      vendorSkills,
    };

    const selected = [...modules, ...(stackPack ? [stackPack] : [])];
    const resolved = resolveModules(manifest, selected);

    const action = await runSummary(config, resolved, manifest.skillsVersion);

    if (action === 'install') {
      // Conditional, manifest-driven package gate — only the chosen pack's
      // prerequisites are enforced, and only once the user commits to install.
      assertPrerequisites(resolved);
      await runInstall(config);
      return;
    }
    if (action === 'cancel') {
      cancelAndExit();
    }
    previous = config;
  }
}

// schemaVersion 1: the original module-multiselect → stack pack → posture flow.
async function runInitLegacy(manifest: Manifest): Promise<void> {
  const { optional, stackPacks } = categorizeModules(manifest);

  let previous: WizardConfig | undefined;

  while (true) {
    const modules = await runModuleSelect(optional, previous?.modules);
    const stackPack = await runStackPackSelect(stackPacks, previous?.stackPack);
    const constitution = await runConstitutionSelect(previous?.constitution);
    const isMultiTenant = await runMultiTenantSelect(previous?.isMultiTenant);

    const config: WizardConfig = {
      modules,
      stackPack,
      constitution,
      isMultiTenant,
    };

    const selected = [...modules, ...(stackPack ? [stackPack] : [])];
    const resolved = resolveModules(manifest, selected);

    const action = await runSummary(config, resolved, manifest.skillsVersion);

    if (action === 'install') {
      // Conditional, manifest-driven package gate — only the chosen pack's
      // prerequisites are enforced, and only once the user commits to install.
      assertPrerequisites(resolved);
      await runInstall(config);
      return;
    }
    if (action === 'cancel') {
      cancelAndExit();
    }
    previous = config;
  }
}

async function loadManifest(): Promise<Manifest> {
  const s = spinner();
  s.start('Fetching module catalog');
  try {
    const manifest = await fetchRemoteManifest();
    s.stop(`Module catalog loaded (skills v${manifest.skillsVersion})`);
    return manifest;
  } catch (err) {
    s.stop('Failed to load module catalog');
    const message = err instanceof Error ? err.message : String(err);
    log.error(`⚠ Could not reach ${REPO_URL}: ${message}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }
}
