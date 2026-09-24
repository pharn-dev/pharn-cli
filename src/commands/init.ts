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
import {
  runInstallArchetype,
  type InstallCarry,
} from '../steps/install-archetype.js';
import {
  assertConfigFingerprintUnchanged,
  configFingerprint,
  readPharnConfig,
} from '../lib/pharn-config.js';
import type {
  CapabilityIndex,
  InstalledCapability,
  PharnConfig,
  Selection,
} from '../types.js';

export async function runInit(): Promise<void> {
  showBanner();
  intro('init wizard');

  runGitPrereq();

  // Non-TTY (CI, a pipe) → NEVER prompt into the void: a usage error + exit(1),
  // BEFORE `fetchRepo` (P5 — the terminal fallback is a hard-fail, not a guess).
  // Without this, init's first prompt (the archetype summary's select) renders
  // into a dead stream and cancels through cancelAndExit's exit(0) — a silent
  // no-op that has ALREADY paid for a full clone, since the fetch precedes it.
  // Refusing here wastes no network round trip at all.
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

  // pharn's fetches go through Node's global fetch, which reads NO proxy
  // environment variable on any platform — so a configured proxy is simply
  // unused, and in a network that blocks direct egress the only symptom is a
  // timeout with nothing pointing at the cause (LIMITS.md §3a). Emit BEFORE the
  // spinner starts, for two reasons: a log.warn into an active clack spinner
  // frame is overwritten, and a fetch that FAILS because of a proxy-only network
  // is exactly when the user most needs to have been told.
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
      const resolved = resolveCapabilities(archetypes, index);
      // A re-run init must not silently drop what the user added by hand, nor
      // what this CLI merely could not READ upstream: the config it replaces is
      // carried over by `update`'s own merge rules (carryOver, below).
      const previous = readPreviousConfig(cwd);
      const carry = carryOver(previous.config, index, resolved);
      if (carry.extra.length) {
        log.info(
          `Keeping ${carry.extra.length} capabilit${carry.extra.length === 1 ? 'y' : 'ies'} you added by hand: ${carry.extra.map(capabilityKey).join(', ')}.`,
        );
      }
      if (carry.kept.length) {
        log.info(
          `Keeping ${carry.kept.length} capabilit${carry.kept.length === 1 ? 'y' : 'ies'} as installed — upstream still ships ${carry.kept.length === 1 ? 'it' : 'them'} but this pharn cannot read ${carry.kept.length === 1 ? 'it' : 'them'} (see above): ${carry.kept.map(capabilityKey).join(', ')}. Files and config entries are left as they are; \`pharn update\` re-checks them.`,
        );
      }
      if (carry.gone.length) {
        log.warn(
          `Not keeping ${carry.gone.length} capabilit${carry.gone.length === 1 ? 'y' : 'ies'} you added by hand that upstream no longer ships: ${carry.gone.map(capabilityKey).join(', ')}. ${carry.gone.length === 1 ? 'It is' : 'They are'} dropped from pharn.config.json; the files stay on disk.`,
        );
      }
      const extraKeys = new Set(carry.extra.map(capabilityKey));
      const selection: Selection = carry.extra.length
        ? {
            selected: [
              ...resolved.selected,
              ...carry.extra.map((c) => ({
                name: c.name,
                role: c.role,
                matched: 'manual' as const,
              })),
            ],
            // Installed now, so no longer "skipped" by the archetypes.
            skipped: resolved.skipped.filter(
              (s) => !extraKeys.has(capabilityKey(s)),
            ),
          }
        : resolved;

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
        //
        // DELIBERATELY NOT MOVED BEFORE THE FETCH — `add` and `update` were, and
        // this is the one that was not. Do not "fix" it for consistency.
        //
        // Those two acquire before `fetchRepo` so a run that will be refused
        // never pays for the ~2.5 MB tarball. `init` cannot be given that shape:
        // BOTH of its prompts sit BETWEEN the fetch and the install (the summary
        // needs the parsed capability index, and confirmWriteTargets needs the
        // install manifest — each derived from the clone), so the only slot
        // before the fetch is also before both prompts. That trades a bounded
        // hold for an unbounded one: `fetchRepo` is capped by construction
        // (repo.ts — 8s SHA resolve, 60s download), while a prompt is capped only
        // by human attention, and `init` hard-fails off a TTY so it is ALWAYS a
        // human at a keyboard. A walked-away init would refuse every other pharn
        // command in the project for up to STALE_MS (6h). The lock REFUSES rather
        // than queues, so a longer hold is a wider refusal window.
        //
        // The cost is named, not hidden: a second writer racing `pharn init`
        // still pays the full download before being refused. Accepted — init is
        // the bootstrap command, run once, interactively, and it is where a
        // concurrent-writer collision is least likely.
        await withProjectLock(cwd, 'init', () => {
          // PHARN-03's re-check, for init. The carry-over was computed from the
          // config as it was BEFORE both prompts; a pharn run that wrote it since
          // (a concurrent `pharn add`) would be silently overwritten. Refuse
          // instead — before the first write, the backup included.
          assertConfigFingerprintUnchanged(cwd, previous.fingerprint, 'init');
          return runInstallArchetype(
            repo.dir,
            cwd,
            archetypes,
            selection,
            commit,
            carry,
          );
        });
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

/** A capability's identity everywhere in this CLI: the `role:name` pair. */
function capabilityKey(cap: { name: string; role: string }): string {
  return `${cap.role}:${cap.name}`;
}

/**
 * The config a re-run init is about to replace, read TOLERANTLY: init is the
 * command every other one points at for recovery, so an absent, unreadable,
 * invalid or pre-archetype config simply means "nothing to carry over" — never
 * a refusal. The fingerprint is taken FIRST, so a write that lands between the
 * two reads fails the under-lock check (closed) instead of being blessed by it.
 */
function readPreviousConfig(cwd: string): {
  fingerprint: string;
  config: PharnConfig | null;
} {
  const fingerprint = configFingerprint(cwd);
  let config: PharnConfig | null;
  try {
    config = readPharnConfig(cwd);
  } catch {
    config = null;
  }
  return { fingerprint, config };
}

interface Carry extends InstallCarry {
  // Manual entries the index has but the archetypes did not select — added to
  // the selection so they are installed again (row 6).
  extra: InstalledCapability[];
  // Manual entries upstream no longer ships — dropped and NAMED (row 7).
  gone: InstalledCapability[];
}

/**
 * What a re-run init carries over from the previous config, by `update`'s own
 * membership table (lib/merge-capabilities.ts — cited, not restated, P4). Pure:
 * every branch is a `role:name` set lookup or an exact `source` compare (P5).
 *
 * - Row 0: an entry of ANY source whose capability the fetch could not PARSE
 *   (`index.unknown`) is KEPT verbatim — a parse failure is evidence about
 *   upstream's bytes, not about who asked for it.
 * - Rows 3 and 6: a `manual` entry the index still has stays `manual`, whether
 *   or not the archetypes also select it (sticky).
 * - Row 7: a `manual` entry the index no longer has is dropped — and named.
 * - Everything else (`auto`, or a legacy entry with no `source`) is simply
 *   re-resolved from the archetypes: init starts over. Resolving an ABSENT
 *   source is the merge's job alone, so it is not inferred here.
 *
 * The first entry wins for a duplicated key, as in the merge.
 */
function carryOver(
  previous: PharnConfig | null,
  index: CapabilityIndex,
  resolved: Selection,
): Carry {
  const inIndex = new Set(index.capabilities.map(capabilityKey));
  const frozen = new Set(index.unknown.map(capabilityKey));
  const selected = new Set(resolved.selected.map(capabilityKey));
  const manualKeys = new Set<string>();
  const kept: InstalledCapability[] = [];
  const extra: InstalledCapability[] = [];
  const gone: InstalledCapability[] = [];
  const seen = new Set<string>();
  for (const cap of previous?.capabilities ?? []) {
    const k = capabilityKey(cap);
    if (seen.has(k)) continue;
    seen.add(k);
    if (frozen.has(k)) {
      kept.push({ ...cap });
      continue;
    }
    if (cap.source !== 'manual') continue;
    if (!inIndex.has(k)) {
      gone.push(cap);
      continue;
    }
    manualKeys.add(k);
    if (!selected.has(k)) extra.push(cap);
  }
  return {
    manualKeys,
    kept,
    extra,
    gone,
    previousStamp: previous
      ? { skillsVersion: previous.skillsVersion, commit: previous.commit }
      : null,
  };
}
