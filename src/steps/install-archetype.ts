import { log, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { FIRST_FEATURE_COMMAND, REPO_URL } from '../lib/constants.js';
import { installCapabilities } from '../lib/install-capabilities.js';
import { DEFAULT_MODEL_ROUTING } from '../lib/model-routing.js';
import { DEFAULT_SEAM_CONFIG } from '../lib/seam-config.js';
import { writePharnConfig } from '../lib/pharn-config.js';
import { readSkillsVersion } from '../lib/skills-version.js';
import { PHARN_VERSION } from '../version.js';
import type {
  Archetype,
  InstalledCapability,
  Layout,
  PharnConfig,
  Selection,
} from '../types.js';

// The archetype-install apply stage (pharn init --archetype). Copies the
// resolved capabilities + product surfaces from the already-fetched `repoDir`,
// then writes pharn.config.json. Network-free (the commit SHA is passed in by
// the orchestrator) so it is exercised end-to-end by the fixture test. Mirrors
// steps/install.ts. One axis (P3): the archetype apply/config stage.
export async function runInstallArchetype(
  repoDir: string,
  cwd: string,
  archetypes: Archetype[],
  selection: Selection,
  commit: string | null,
): Promise<void> {
  const startedAt = Date.now();

  const s = spinner();
  s.start('Installing capabilities');
  let capabilities: InstalledCapability[];
  let settingsPreserved: boolean;
  let skillsVersion: string;
  let layout: Layout;
  try {
    const result = installCapabilities(repoDir, cwd, selection);
    capabilities = result.capabilities;
    settingsPreserved = result.settingsPreserved;
    layout = result.layout;
    skillsVersion = readSkillsVersion(repoDir);
  } catch (err) {
    // Stop the spinner and propagate — the orchestrator cleans up the fetched
    // temp clone in its finally, then formats + exits (cleanup before exit).
    s.stop('Failed to install capabilities');
    throw err;
  }
  s.stop('Capabilities installed');

  if (settingsPreserved) {
    log.warn(
      'Existing .claude/settings.json preserved — compare it against pharn-oss to wire the PHARN hooks if needed.',
    );
  }

  const config: PharnConfig = {
    pharnVersion: PHARN_VERSION,
    skillsVersion,
    repo: REPO_URL.replace(/^github\.com\//, ''),
    commit,
    // No constitution variant: the archetype install copies pharn-oss's canonical
    // CONSTITUTION.md verbatim. No modules: capabilities are the install unit.
    modules: [],
    installedAt: new Date().toISOString(),
    // Per-stage model routing, written on every fresh install (P7 — additive).
    models: DEFAULT_MODEL_ROUTING,
    // Seam-resolution policy, written on every fresh install (P7 — additive).
    seam: DEFAULT_SEAM_CONFIG,
    archetypes,
    capabilities,
    // The layout mirrored from the fetched clone (flat OR pharn/) — status/remove
    // read this back to address the project the same way (lib/layout.ts).
    layout,
  };
  await writePharnConfig(cwd, config);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const check = pc.green('✔');
  const grillers = capabilities.filter((c) => c.role === 'griller').length;
  const lenses = capabilities.filter((c) => c.role === 'lens').length;
  outro(
    [
      `${check} ${capabilities.length} capabilit${capabilities.length === 1 ? 'y' : 'ies'} installed → ${pc.dim(`(${grillers} griller${grillers === 1 ? '' : 's'}, ${lenses} lens${lenses === 1 ? '' : 'es'})`)}`,
      `${check} PHARN commands + hooks + docs written → ${pc.dim('.claude/')}`,
      `${check} pharn.config.json written ${pc.dim(`(skills v${skillsVersion}, archetypes: ${archetypes.join(', ')})`)}`,
      `${pc.dim(`Done in ${elapsed}s`)}`,
      '',
      pc.bold('Next steps'),
      `  ${pc.cyan('1.')}  ${pc.bold('claude')}            ${pc.dim('open Claude Code')}`,
      `  ${pc.cyan('2.')}  ${pc.bold(FIRST_FEATURE_COMMAND)}       ${pc.dim('plan your first feature')}`,
    ].join('\n'),
  );
}
