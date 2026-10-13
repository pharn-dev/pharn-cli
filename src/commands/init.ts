import { intro, log, note, outro, spinner } from '@clack/prompts';
import { showBanner } from '../lib/banner.js';
import { cancelAndExit } from '../lib/confirm.js';
import {
  errorMessage,
  logError,
  logErrorPlain,
  reportFatal,
  reportFatalPlain,
  type FatalCause,
} from '../lib/report-error.js';
import { CLAUDE_SETTINGS_FILE, REPO_URL } from '../lib/constants.js';
import { detectArchetypesFromProject } from '../lib/detect-archetype.js';
import { recordedArchetypes } from '../lib/archetype.js';
import type { ArchetypeOrigin } from '../lib/archetype.js';
import { interactiveAllowed } from '../lib/capability-picker.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import { minCliGate } from '../lib/min-cli-gate.js';
import { PHARN_VERSION } from '../version.js';
import { fetchRepo } from '../lib/repo.js';
import {
  ReleaseResolveError,
  resolveSource,
  sourceLabel,
  type RefChoice,
} from '../lib/release.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import { preservedSettingsHookLines } from '../lib/hook-wiring.js';
import { serializeJsonReport } from '../lib/json-report.js';
import { terminalSafe } from '../lib/terminal-safe.js';
import { BACKUP_DIR } from '../lib/backup.js';
import {
  buildInitPlan,
  capabilityKey,
  resolveInitSelection,
  type InitCarry,
  type InitPlanReport,
} from '../lib/init-plan.js';
import { buildInitReport } from '../lib/init-report.js';
import {
  assertNoExistingTargets,
  OverwriteRefusedError,
  targetLines,
} from '../lib/write-targets.js';
import { runGitPrereq } from '../steps/prereqs.js';
import { runNodePrereq } from '../steps/node-prereq.js';
import { confirmWriteTargets } from '../steps/overwrite-check.js';
import {
  archetypeSummaryLines,
  runArchetypeSummary,
} from '../steps/archetype-summary.js';
import {
  installManifest,
  preflightInstall,
  reinstallBaseline,
  runInstallArchetype,
} from '../steps/install-archetype.js';
import { assertConfigFingerprintUnchanged } from '../lib/pharn-config.js';
import type { Archetype } from '../types.js';

export interface InitOptions {
  ref?: RefChoice;
  // `--archetype`: install for these instead of the detected archetypes.
  archetypes?: Archetype[];
  // Install without prompts — but ONLY where nothing would be overwritten
  // (see the TTY gate below).
  yes?: boolean;
  // Plan, print, write nothing.
  dryRun?: boolean;
  // With `dryRun`: the plan as ONE JSON object on stdout, nothing else.
  json?: boolean;
}

export async function runInit(opts: InitOptions = {}): Promise<void> {
  const yes = opts.yes ?? false;
  const dryRun = opts.dryRun ?? false;
  const json = opts.json ?? false;
  // `--json` is the dry run's machine-readable form and nothing else: the
  // dispatch refuses it alone, and a direct caller fails closed here rather than
  // reaching a real install that would print clack chrome into a JSON consumer.
  if (json && !dryRun) {
    reportFatalPlain('--json is only available with --dry-run.');
    process.exit(1);
  }
  // Under `--json` NOTHING reaches stdout but the one report: no banner, no clack.
  if (!json) {
    showBanner();
    intro(dryRun ? 'pharn init --dry-run' : 'init wizard');
  }

  // FIRST, before even the git prerequisite: the Node floor is a fact about the
  // environment that nothing later can repair, and an install made on a Node the
  // PHARN floor checkers refuse to run on would fail mid-run. Refuses with
  // nothing written, ahead of every prompt and every network call.
  runNodePrereq('init', { json });

  runGitPrereq({ json });

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
  // Two runs prompt nothing, so they have nothing to gate. `--dry-run` writes
  // nothing. `--yes` skips the summary confirm and NEVER answers the second,
  // destructive one: it installs only when none of init's write targets exists
  // (so there is nothing to confirm), and otherwise refuses — before the lock
  // and again under it. Auto-confirming file overwrites in a pipeline is the
  // hazard that prompt exists to prevent, so `--yes` does not; a re-install
  // (where `pharn.config.json` always exists) therefore always refuses it and
  // is pointed at `pharn update`.
  if (
    !dryRun &&
    !yes &&
    !interactiveAllowed({
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
    })
  ) {
    logError(
      'pharn init is interactive — run it in an interactive terminal. To install without prompts, pass --yes: it installs only into a project where none of its files exists yet, and never overwrites. To see what init would do, pass --dry-run.',
    );
    process.exit(1);
  }

  // Archetype-driven install is the default (and only) init flow: detect the
  // project's archetype(s) and install the applicable capabilities. Framework-
  // agnostic — no module catalog / manifest fetch. (The legacy module/wizard
  // flow was removed entirely; add/update/status/remove reject a pre-archetype
  // config up front via loadArchetypeConfigOrExit — there is no manifest fallback.)
  await runInitArchetype({
    channel: opts.ref ?? 'main',
    override: opts.archetypes,
    yes,
    dryRun,
    json,
  });
}

// A spinner that draws nothing, for `--json`: stdout stays the one report.
function silentSpinner(): Pick<ReturnType<typeof spinner>, 'start' | 'stop'> {
  return { start: () => undefined, stop: () => undefined };
}

interface RunMode {
  channel: RefChoice;
  override: Archetype[] | undefined;
  yes: boolean;
  dryRun: boolean;
  json: boolean;
}

// schemaVersion-free archetype flow: detect archetypes from the project, fetch
// pharn-oss, derive + resolve the capability index, confirm, then copy the
// applicable capabilities + product surfaces. The fetched temp clone lives
// across the interactive summary, so cleanup runs in a finally and every
// process.exit / cancelAndExit happens AFTER it (Node skips finally on exit).
async function runInitArchetype(mode: RunMode): Promise<void> {
  const { channel, override, yes, dryRun, json } = mode;
  // `--json` swaps the sinks, not the logic: diagnostics and failures as plain
  // stderr lines (stdout empty, exit 1), and no spinner.
  const warn = json
    ? (message: string) => logErrorPlain(message)
    : (message: string) => log.warn(message);
  const fatal = json ? reportFatalPlain : reportFatal;
  const cwd = process.cwd();
  // `--archetype` REPLACES detection: it is what is resolved, installed and
  // recorded (so `update` keeps it). Detection still runs — local and bounded —
  // so the summary and the dry-run report can show what it would have chosen.
  const detection = detectArchetypesFromProject(cwd);
  const archetypes = override ?? detection.archetypes;
  const origin: ArchetypeOrigin = override
    ? {
        kind: 'flag',
        detected: detection.archetypes,
        evidence: detection.evidence,
      }
    : { kind: 'detected', evidence: detection.evidence };
  if (!json) {
    note(
      archetypes.join(', '),
      override ? 'Archetypes (from --archetype)' : 'Detected archetypes',
    );
  }

  // pharn's fetches go through Node's global fetch, which reads NO proxy
  // environment variable on any platform — so a configured proxy is simply
  // unused, and in a network that blocks direct egress the only symptom is a
  // timeout with nothing pointing at the cause (LIMITS.md §3a). Emit BEFORE the
  // spinner starts, for two reasons: a log.warn into an active clack spinner
  // frame is overwritten, and a fetch that FAILS because of a proxy-only network
  // is exactly when the user most needs to have been told.
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) {
    warn(proxyNoticeMessage(proxyNotice));
  }

  const s = json ? silentSpinner() : spinner();
  s.start(`Fetching PHARN from ${REPO_URL}`);
  let repo: Awaited<ReturnType<typeof fetchRepo>>;
  try {
    // WHICH commit, first: the tip of main by default, or the newest verified
    // release with `--ref latest`. A release that cannot be resolved REFUSES (no
    // fallback to the tip), and the error already names `--ref main`
    // (lib/release.ts).
    repo = await fetchRepo(await resolveSource(channel));
  } catch (err) {
    s.stop('Failed to fetch PHARN');
    fatal(
      err instanceof ReleaseResolveError
        ? err.message
        : `Could not reach ${REPO_URL}: ${errorMessage(err)}`,
      { err },
    );
    process.exit(1);
  }

  s.stop(`PHARN fetched from ${sourceLabel(repo.source)}`);

  if (dryRun) {
    await runInitDryRun(repo, cwd, archetypes, origin, channel, json);
    return;
  }

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
      // The archetypes' selection plus what a re-run carries over from the
      // config it replaces — the same computation the dry run makes
      // (lib/init-plan.ts).
      const { previous, carry, selection } = resolveInitSelection({
        cwd,
        archetypes,
        index,
      });
      reportCarry(carry);
      // What the replaced config recorded, for display only: a re-run
      // re-detects, and the summary names a different recorded set so an
      // earlier `--archetype` never disappears silently.
      const recorded = recordedArchetypes(previous.config?.archetypes);

      // `--yes` answers the summary's question ("install?") and nothing else:
      // the summary is still printed, so a CI log says what was installed.
      let action: 'install' | 'cancel';
      if (yes) {
        note(
          archetypeSummaryLines(archetypes, selection, origin, recorded).join(
            '\n',
          ),
        );
        action = 'install';
      } else {
        action = await runArchetypeSummary(
          archetypes,
          selection,
          origin,
          recorded,
        );
      }
      // Both prompts return a VALUE and neither exits, so `outcome` stays
      // 'cancelled' and the single cancelAndExit below fires AFTER the finally
      // that disposes of the clone. 'decline' and 'cancel' are indistinguishable
      // to the user here — same message, same exit 0 — but only one of them used
      // to leak the clone.
      //
      // The install manifest — every file this install writes, dest → source —
      // computed ONCE, here, and handed to the early pre-flight, the prompt and
      // the install (its pre-flight, backup scan, copy and records). It depends
      // only on the clone, the selection and the clone's layout, and none of
      // those change during the run; it used to be rebuilt five times. Only the
      // HASHING is repeated, deliberately: the install re-scans under the lock,
      // so an edit made while the prompt was open is still backed up.
      const manifest =
        action === 'install' ? installManifest(repo.dir, selection) : null;
      // The destination pre-flight, BEFORE the overwrite prompt: a project the
      // install cannot finish in (a symlink on the way, a type in the way) is
      // refused here — exit 1 through the catch below, the clone cleaned up
      // first — rather than after the user has answered yes to a question whose
      // yes could not be honoured. The early answer only: the tree can change
      // while the prompt is open, so the same checks run again under the lock
      // (runInstallArchetype, before its backup), and those are authoritative.
      if (manifest !== null) {
        preflightInstall(repo.dir, cwd, selection, manifest);
      }
      // `--yes` never answers the overwrite question: where any write target
      // already exists it refuses (OverwriteRefusedError → exit 1, the clone
      // cleaned up first, nothing written); otherwise there is no question.
      let overwrite: Awaited<ReturnType<typeof confirmWriteTargets>> = 'cancel';
      if (manifest !== null) {
        const records = reinstallBaseline(cwd, carry.previousStamp);
        if (yes) {
          assertNoExistingTargets({
            repoDir: repo.dir,
            projectRoot: cwd,
            capabilities: selection.selected,
            manifest,
            records,
          });
          overwrite = 'proceed';
        } else {
          overwrite = await confirmWriteTargets(repo.dir, cwd, selection, {
            manifest,
            records,
          });
        }
      }
      if (manifest !== null && overwrite === 'proceed') {
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
          // The authoritative `--yes` check, under the lock and immediately
          // before the install: a target that appeared since the check above
          // refuses here, before the first write (the backup included).
          if (yes) {
            assertNoExistingTargets({
              repoDir: repo.dir,
              projectRoot: cwd,
              capabilities: selection.selected,
              manifest,
              records: reinstallBaseline(cwd, carry.previousStamp),
            });
          }
          return runInstallArchetype(
            repo.dir,
            cwd,
            archetypes,
            selection,
            commit,
            channel === 'latest' ? { ...carry, ref: 'latest' } : carry,
            manifest,
          );
        });
        outcome = 'installed';
      }
    }
  } catch (err) {
    // A held lock — or a `--yes` run that met an existing file — is a policy
    // refusal, not a crash: named, actionable, and no PHARN_DEBUG hint.
    if (
      err instanceof ProjectLockedError ||
      err instanceof OverwriteRefusedError
    )
      refusal = err.message;
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

// What a re-run carries over, named before the summary the user acts on — the
// same three lines in the real run and in the preview.
function reportCarry(carry: InitCarry): void {
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
}

// `--dry-run`: the real run's steps up to its first prompt — MIN_CLI, index,
// selection, carry-over — then the rest of the plan (manifest, pre-flight,
// targets, backups, settings, hooks, models: lib/init-plan.ts), printed, exit 0.
// It writes NOTHING: no prompt, no lock, no fingerprint check, no backup, no
// copy, no records, no config — none of those functions is reachable from here.
// The only thing created is the clone's temp dir under the OS temp dir, removed
// in the finally below exactly as the real run removes it.
//
// `--json` swaps the sinks, not the logic: diagnostics and failures on plain
// stderr (stdout empty, exit 1), and one report on stdout at the end, through a
// normal return (never `process.exit`, so a large object piped to `jq` is
// flushed).
async function runInitDryRun(
  repo: Awaited<ReturnType<typeof fetchRepo>>,
  cwd: string,
  archetypes: Archetype[],
  origin: ArchetypeOrigin,
  channel: RefChoice,
  json: boolean,
): Promise<void> {
  const warn = json
    ? (message: string) => logErrorPlain(message)
    : (message: string) => log.warn(message);
  let plan: InitPlanReport | null = null;
  let carry: InitCarry | null = null;
  let failure: FatalCause | null = null;
  let refusal: string | null = null;
  try {
    const gate = minCliGate(repo.dir, PHARN_VERSION);
    if (gate.warning) warn(gate.warning);
    if (gate.refusal) {
      refusal = gate.refusal;
    } else {
      const index = parseCapabilityIndex(repo.dir);
      const unknownWarning = unknownCapabilitiesWarning(index.unknown);
      if (unknownWarning) warn(unknownWarning);
      const chosen = resolveInitSelection({ cwd, archetypes, index });
      carry = chosen.carry;
      plan = buildInitPlan({
        repoDir: repo.dir,
        cwd,
        sha: repo.sha,
        source: repo.source,
        channel,
        archetypes,
        origin,
        index,
        chosen,
      });
    }
  } catch (err) {
    failure = { err };
  } finally {
    repo.cleanup();
  }

  // Every exit AFTER the clone's cleanup above (Node skips finally on exit).
  const fatal = json ? reportFatalPlain : reportFatal;
  if (refusal) {
    fatal(refusal);
    process.exit(1);
  }
  if (failure || plan === null || carry === null) {
    fatal(
      failure ? errorMessage(failure.err) : 'Planning failed.',
      failure ?? undefined,
    );
    process.exit(1);
  }
  if (json) {
    console.log(serializeJsonReport(buildInitReport(plan)));
    return;
  }
  reportCarry(carry);
  reportInitDryRun(plan);
}

// The preview: the summary the interactive run would ask about, then a PLAN
// note — every existing file it would overwrite (marked exactly as the prompt
// marks them, labelled ones first), the files it would create as a count, the
// backups, the config — then the HOOKS note a real run would print, and the
// models outcome.
function reportInitDryRun(r: InitPlanReport): void {
  note(
    archetypeSummaryLines(
      r.archetypes,
      r.selection,
      r.archetypeOrigin,
      r.previousArchetypes,
    ).join('\n'),
  );

  const labels = new Map(
    r.targets.flatMap((t) =>
      t.label === null || t.label === 'rewritten'
        ? []
        : [[t.rel, t.label] as const],
    ),
  );
  const lines: string[] = [];
  if (r.counts.overwrite > 0) {
    lines.push(`  WOULD OVERWRITE ${r.counts.overwrite} existing file(s)`);
    lines.push(
      ...targetLines({
        conflicts: r.conflicts,
        labels,
        configBackedUp: r.configBackedUp,
      }),
    );
  } else {
    lines.push('  Nothing in your project would be overwritten.');
  }
  lines.push('', `  WOULD CREATE ${r.counts.create} file(s)`);
  if (r.counts.backup > 0) {
    lines.push(
      '',
      `  WOULD BACK UP ${r.counts.backup} file(s) to ${BACKUP_DIR}/<timestamp>/ first — the marked ones above`,
    );
  }
  lines.push(
    '',
    `  Would write pharn.config.json (skills v${r.skillsVersion}, ${r.layout} layout, archetypes: ${r.archetypes.join(', ')})`,
  );
  // The prompt's own line for the replaced config (steps/overwrite-check.ts).
  if (r.configBackedUp) {
    lines.push(
      `  The existing pharn.config.json would be rewritten (seam and models reset to their defaults); it would be copied to ${BACKUP_DIR}/ first.`,
    );
  }
  if (r.carriedConfigKeys.length > 0) {
    lines.push(
      `  Would keep your own pharn.config.json keys: ${r.carriedConfigKeys.map((k) => terminalSafe(k, { max: 200 })).join(', ')}`,
    );
  }
  if (r.settingsPreserved) {
    lines.push(
      `  Would preserve the existing ${CLAUDE_SETTINGS_FILE} — pharn never overwrites it.`,
    );
  }
  lines.push(
    '',
    r.counts.overwrite === 0
      ? '  `pharn init --yes` would install (nothing would be overwritten).'
      : `  \`pharn init --yes\` would refuse: ${r.counts.overwrite} existing file(s) would be overwritten.`,
  );
  note(lines.join('\n'), 'PLAN');

  // The same note a real run prints over a preserved settings.json
  // (steps/install-archetype.ts), from the same function.
  const hookLines =
    r.hookWiring === null ? null : preservedSettingsHookLines(r.hookWiring);
  if (hookLines) note(hookLines.join('\n'), 'HOOKS');

  if (r.models.outcome === 'rejected') {
    log.warn(
      [
        "pharn-oss's models block would not be written; this pharn rejects it:",
        ...r.models.reasons.map(
          (reason) => `  ${terminalSafe(reason, { max: 300 })}`,
        ),
      ].join('\n'),
    );
  }

  outro(
    `Dry run — would create ${r.counts.create} · overwrite ${r.counts.overwrite} · back up ${r.counts.backup}. Nothing was changed. Run \`pharn init\` to apply.`,
  );
}
