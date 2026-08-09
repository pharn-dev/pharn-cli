import { intro, log, note, spinner } from '@clack/prompts';
import { showBanner } from '../lib/banner.js';
import { cancelAndExit } from '../lib/confirm.js';
import { REPO_URL } from '../lib/constants.js';
import { detectArchetypesFromProject } from '../lib/detect-archetype.js';
import { interactiveAllowed } from '../lib/capability-picker.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { resolveCapabilities } from '../lib/resolve-capabilities.js';
import { fetchRepo } from '../lib/repo.js';
import { runGitPrereq } from '../steps/prereqs.js';
import { confirmWriteTargets } from '../steps/overwrite-check.js';
import { runArchetypeSummary } from '../steps/archetype-summary.js';
import { runInstallArchetype } from '../steps/install-archetype.js';

export async function runInit(): Promise<void> {
  showBanner();
  intro('init wizard');

  runGitPrereq();

  // Non-TTY (CI, a pipe) → NEVER prompt into the void: a usage error + exit(1),
  // BEFORE `fetchRepo` (P5 — the terminal fallback is a hard-fail, not a guess).
  // Without this, init's first prompt (the archetype summary's select) renders
  // into a dead stream and cancels through cancelAndExit's exit(0) — a silent
  // no-op that has ALREADY paid for a full clone, since the fetch precedes it.
  // Refusing here wastes neither the network nor the ~/.degit tarball.
  //
  // The prereq runs FIRST and deliberately so: a directory with no `.git` gets
  // the more useful "run git init" error, exactly as `update` lets its config
  // error win over this message.
  //
  // There is deliberately NO `--yes` for init (unlike `update`): init prompts
  // twice, and the second is the destructive overwrite confirmation. Auto-
  // confirming file overwrites in a pipeline is precisely the hazard that
  // prompt exists to prevent, so init has one honest answer here — refuse.
  if (
    !interactiveAllowed({
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
    })
  ) {
    log.error(
      'pharn init is interactive — run it in an interactive terminal. There is deliberately no --yes for init: it confirms before overwriting existing files, and auto-confirming that in a pipeline is what the prompt exists to prevent.',
    );
    process.exit(1);
  }

  // Archetype-driven install is the default (and only) init flow: detect the
  // project's archetype(s) and install the applicable capabilities. Framework-
  // agnostic — no module catalog / manifest fetch. (The legacy module/wizard
  // flow was removed entirely; add/update/status/remove reject a pre-archetype
  // config up front via loadArchetypeConfigOrExit — there is no manifest fallback.)
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
    if (
      action === 'install' &&
      (await confirmWriteTargets(repo.dir, cwd, selection))
    ) {
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
