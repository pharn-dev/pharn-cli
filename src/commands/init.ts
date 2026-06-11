import { intro, log, spinner } from '@clack/prompts';
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
import { runPrereqs } from '../steps/prereqs.js';
import { runFreshCheck } from '../steps/fresh-check.js';
import { runModeSelect } from '../steps/mode-select.js';
import { runWizardQuestions } from '../steps/wizard-questions.js';
import { runModuleSelect } from '../steps/module-select.js';
import { runStackPackSelect } from '../steps/stackpack-select.js';
import { runConstitutionSelect } from '../steps/constitution-select.js';
import { runVendorConsent } from '../steps/vendor-consent.js';
import { runSummary } from '../steps/summary.js';
import { runInstall } from '../steps/install.js';
import type { Manifest, WizardConfig, WizardSpec } from '../types.js';

export async function runInit(): Promise<void> {
  showBanner();
  intro('init wizard');

  runPrereqs();
  await runFreshCheck();

  const manifest = await loadManifest();

  if (manifest.schemaVersion === 2 && manifest.wizard) {
    await runInitV2(manifest, manifest.wizard);
    return;
  }
  await runInitLegacy(manifest);
}

// schemaVersion 2: render the wizard from manifest.wizard, then install only the
// selected per-tech skill subfolders.
async function runInitV2(
  manifest: Manifest,
  wizard: WizardSpec,
): Promise<void> {
  const { optional, stackPacks } = categorizeModules(manifest);

  let previous: WizardConfig | undefined;

  while (true) {
    const mode = await runModeSelect();
    const stackAnswers =
      mode === 'default'
        ? applyDefaults(wizard)
        : await runWizardQuestions(wizard, previous?.stackAnswers);

    const modules = await runModuleSelect(optional, previous?.modules);
    const stackPack = await runStackPackSelect(stackPacks, previous?.stackPack);
    const constitution = await runConstitutionSelect(previous?.constitution);

    const installedSkills = collectInstalls(wizard, stackAnswers);
    const vendorSkills = await runVendorConsent(
      collectVendorSkills(wizard, stackAnswers),
      previous?.vendorSkills,
    );

    const config: WizardConfig = {
      modules,
      stackPack,
      constitution,
      stackAnswers,
      installedSkills,
      vendorSkills,
    };

    const selected = [...modules, ...(stackPack ? [stackPack] : [])];
    const resolved = resolveModules(manifest, selected);

    const action = await runSummary(config, resolved, manifest.skillsVersion);

    if (action === 'install') {
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

    const config: WizardConfig = { modules, stackPack, constitution };

    const selected = [...modules, ...(stackPack ? [stackPack] : [])];
    const resolved = resolveModules(manifest, selected);

    const action = await runSummary(config, resolved, manifest.skillsVersion);

    if (action === 'install') {
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
