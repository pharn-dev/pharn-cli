import { intro, log, note, spinner } from '@clack/prompts';
import { showBanner } from '../lib/banner.js';
import { cancelAndExit } from '../lib/confirm.js';
import {
  errorMessage,
  logError,
  reportFatal,
  type FatalCause,
} from '../lib/report-error.js';
import { REPO_URL } from '../lib/constants.js';
import { detectArchetypesFromProject } from '../lib/detect-archetype.js';
import { interactiveAllowed } from '../lib/capability-picker.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import { minCliGate } from '../lib/min-cli-gate.js';
import { PHARN_VERSION } from '../version.js';
import { resolveCapabilities } from '../lib/resolve-capabilities.js';
import { fetchRepo } from '../lib/repo.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
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
    logError(
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

  // degit reads process.env.https_proxy ITSELF (measured at degit@3.6.6) and
  // reads ONLY that lowercase spelling, so a non-lowercase-only environment
  // clones DIRECTLY on POSIX while a `https_proxy` one is interposed by a host
  // pharn never declared — neither of which was discoverable from any pharn
  // output. Emit BEFORE the spinner starts, for two reasons: a log.warn into an
  // active clack spinner frame is overwritten, and a clone that FAILS because of
  // a misconfigured proxy is exactly when the user most needs to have been told.
  // ADVISORY: this reports what degit WILL READ, never what transport ran; the
  // confident wording is gated on the installed degit being a version pharn
  // measured (lib/proxy-env.ts, MEASURED_DEGIT_VERSIONS).
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) {
    log.warn(proxyNoticeMessage(proxyNotice));
  }

  const s = spinner();
  s.start(`Fetching PHARN from ${REPO_URL}`);
  let repo: Awaited<ReturnType<typeof fetchRepo>>;
  try {
    repo = await fetchRepo();
  } catch (err) {
    s.stop('Failed to fetch PHARN');
    reportFatal(`Could not reach ${REPO_URL}: ${errorMessage(err)}`, { err });
    process.exit(1);
  }

  s.stop(`PHARN fetched from ${REPO_URL}`);

  let outcome: 'installed' | 'cancelled' = 'cancelled';
  // The ERROR OBJECT, not its message: the reporter needs it to decide whether
  // this failure came from an exception (and so deserves the PHARN_DEBUG
  // affordance). Boxed rather than stored bare so that a thrown `null` or
  // `undefined` is still distinguishable from "nothing failed" — the exit is
  // deferred past the finally, which is exactly where a nullish sentinel would
  // silently read as success. The SAME box is what reportFatal takes, so it
  // travels intact rather than being flattened one line short of the reporter.
  let failure: FatalCause | null = null;
  let refusal: string | null = null;
  try {
    // THE MIN_CLI GATE — refuse a too-old CLI CLEANLY, before the index parse
    // and before any prompt or write. Inside the try so the clone's finally
    // cleanup still runs before the exit (P0: cleanup before exit).
    const gate = minCliGate(repo.dir, PHARN_VERSION);
    if (gate.warning) log.warn(gate.warning);
    if (gate.refusal) {
      refusal = gate.refusal;
    } else {
      const index = parseCapabilityIndex(repo.dir);
      // No silent skips (P5): name every capability the fetch boundary refused,
      // immediately after the parse and BEFORE the summary the user acts on.
      const unknownWarning = unknownCapabilitiesWarning(index.unknown);
      if (unknownWarning) log.warn(unknownWarning);
      const selection = resolveCapabilities(archetypes, index);

      const action = await runArchetypeSummary(archetypes, selection);
      // Both prompts return a VALUE and neither exits, so `outcome` stays
      // 'cancelled' and the single cancelAndExit below fires AFTER the finally
      // that disposes of the clone. 'decline' and 'cancel' are indistinguishable
      // to the user here — same message, same exit 0 — but only one of them used
      // to leak the clone.
      const overwrite =
        action === 'install'
          ? await confirmWriteTargets(repo.dir, cwd, selection)
          : 'cancel';
      if (overwrite === 'proceed') {
        // Reuse the SHA the tree was pinned to (recorded == fetched, or null when
        // the branch was floated — LIMITS.md §3b); no separate fetch (TOCTOU).
        const commit = repo.sha;
        // The single-writer lock, taken after BOTH prompts and released in the
        // same finally that disposes of the clone. Holding it across an
        // unanswered confirm would block an agent hook for as long as a human
        // takes to answer.
        await withProjectLock(cwd, 'init', () =>
          runInstallArchetype(repo.dir, cwd, archetypes, selection, commit),
        );
        outcome = 'installed';
      }
    }
  } catch (err) {
    // A held lock is a policy refusal, not a crash — same treatment as the
    // other refusals below: named, actionable, and no PHARN_DEBUG hint.
    if (err instanceof ProjectLockedError) refusal = err.message;
    else failure = { err };
  } finally {
    repo.cleanup();
  }

  // A policy refusal is not a failure to debug — no PHARN_DEBUG hint, and it
  // wins over the cancel path below (nothing was installed, but the reason is
  // the refusal, not a user choice).
  if (refusal) {
    reportFatal(refusal);
    process.exit(1);
  }
  if (failure) {
    reportFatal(errorMessage(failure.err), failure);
    process.exit(1);
  }
  if (outcome === 'cancelled') cancelAndExit();
}
