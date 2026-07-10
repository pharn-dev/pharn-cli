import { existsSync } from 'node:fs';
import { confirm, intro, isCancel, log, note, spinner } from '@clack/prompts';
import { showBanner } from '../lib/banner.js';
import { cancelAndExit } from '../lib/confirm.js';
import { REPO_URL } from '../lib/constants.js';
import { detectArchetypesFromProject } from '../lib/detect-archetype.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { resolveCapabilities } from '../lib/resolve-capabilities.js';
import { fetchRepo } from '../lib/repo.js';
import {
  configPath,
  isConfigValidationError,
  readPharnConfig,
} from '../lib/pharn-config.js';
import { runGitPrereq } from '../steps/prereqs.js';
import { runFreshCheck } from '../steps/fresh-check.js';
import { runArchetypeSummary } from '../steps/archetype-summary.js';
import { runInstallArchetype } from '../steps/install-archetype.js';

export async function runInit(): Promise<void> {
  showBanner();
  intro('init wizard');

  runGitPrereq();
  await runFreshCheck();

  // Archetype-driven install is the default (and only) init flow: detect the
  // project's archetype(s) and install the applicable capabilities. Framework-
  // agnostic — no module catalog / manifest fetch. (The legacy module/wizard
  // flow was removed; add/update still fall back to the manifest for
  // pre-archetype configs.)
  await runInitArchetype();
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
      // Reuse the SHA the tree was pinned to (recorded == fetched, or null when
      // the branch was floated — LIMITS.md §3b); no separate fetch (TOCTOU).
      const commit = repo.sha;
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
  try {
    const existing = readPharnConfig(cwd);
    if (existing) {
      log.info(
        `Existing pharn.config.json found (skillsVersion ${existing.skillsVersion ?? 'unknown'}).`,
      );
    }
  } catch (e) {
    // A present-but-invalid existing config must NAME the problem, not crash and
    // not be silently treated as absent (then clobbered). Warn and let the user
    // decide to overwrite it — init is the repair path.
    if (isConfigValidationError(e)) {
      log.warn(`Existing pharn.config.json is invalid: ${e.message}`);
    } else {
      throw e;
    }
  }
  const ok = await confirm({
    message: 'Overwrite existing pharn.config.json?',
    initialValue: false,
  });
  return !isCancel(ok) && ok === true;
}
