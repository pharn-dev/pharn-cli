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
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { resolveCapabilities } from '../lib/resolve-capabilities.js';
import { installCapabilities } from '../lib/install-capabilities.js';
import { fetchRepo } from '../lib/repo.js';
import {
  fetchRemoteSkillsVersion,
  readSkillsVersion,
} from '../lib/skills-version.js';
import { row } from '../lib/format.js';
import {
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type { InstalledCapability, PharnConfig } from '../types.js';

// `pharn update` refreshes an archetype install: re-resolve the recorded
// archetypes against the latest capability index and re-copy. The legacy
// module/manifest flow was removed (live pharn-oss ships no manifest.json); a
// pre-archetype config is rejected up front by loadArchetypeConfigOrExit.
export async function runUpdate(): Promise<void> {
  intro('pharn update');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);
  await runArchetypeUpdate(config, cwd);
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
    // Reuse the SHA the tree was pinned to (recorded == fetched, or null when
    // the branch was floated — LIMITS.md §3b); no separate fetch (TOCTOU).
    const commit = repo.sha;
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
