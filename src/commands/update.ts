import {
  buildUpdatePlan,
  CapabilityRemovalError,
  type PlannedUpdate,
  type UpdatePlanReport,
} from '../lib/update-plan.js';
import { deleteCapabilityDir } from '../lib/capability-dir.js';
import {
  backupAction,
  defaultChannelNotice,
  reportBackup,
  reportCapabilityChanges,
  reportDryRun,
  reportOutcome,
  reportRootMigration,
  type Backup,
  type UpdateOutcome,
} from '../lib/update-render.js';
import {
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  spinner,
} from '@clack/prompts';
import pc from '../lib/color.js';
import { cancelAndExit } from '../lib/confirm.js';
import {
  errorMessage,
  logError,
  logErrorPlain,
  reportFatal,
  reportFatalPlain,
  type FatalCause,
} from '../lib/report-error.js';
import { serializeJsonReport } from '../lib/json-report.js';
import { buildUpdateReport, type UpdateStatus } from '../lib/update-report.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import { REPO_URL } from '../lib/constants.js';
import { interactiveAllowed } from '../lib/capability-picker.js';
import { runNodePrereq } from '../steps/node-prereq.js';
import { minCliGate } from '../lib/min-cli-gate.js';
import { PHARN_VERSION } from '../version.js';
import { applyWrites, ApplyError } from '../lib/apply-update.js';
import { BACKUP_DIR, createBackup, legacyBackupNotice } from '../lib/backup.js';
import {
  buildRecords,
  MODELS_RECORD_KEY,
  readRecords,
  recordsBaseline,
  recordsStampStale,
  RECORDS_FILE,
  writeRecords,
} from '../lib/install-records.js';
import { modelsMigrationPending } from '../lib/models-update.js';
import { terminalSafe } from '../lib/terminal-safe.js';
import { fetchRepo, type FetchedRepo } from '../lib/repo.js';
import {
  channelOf,
  resolveSource,
  sourceDescription,
  type InstallSource,
  type RefChoice,
} from '../lib/release.js';
import { findMissingInstalled } from '../lib/missing-installed.js';
import {
  applyRootMoves,
  deleteRootDocs,
  pendingRootMigration,
  rootMigrationFailed,
} from '../lib/root-migration.js';
import { versionStatus } from '../lib/version-status.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import { fetchRemoteSkillsVersion } from '../lib/skills-version.js';
import { row } from '../lib/format.js';
import {
  assertConfigUnchanged,
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type { PharnConfig } from '../types.js';

// `pharn update` refreshes an archetype install: re-resolve the recorded
// archetypes against the latest capability index and re-copy — but DRIFT-SAFELY.
// It compares every expected file against the per-file hashes recorded at install
// time (lib/install-records.ts) and decides per file (lib/update-decision.ts);
// anything it cannot prove pristine is SKIPPED and reported, never overwritten.
// `--force` overwrites the skip buckets after copying each file to
// `pharn/.backup/<timestamp>/`.
//
// The ONE thing it deletes: the directory of a capability it drops from the
// config (merge rows 5/7/9) — after backing up every file in it pharn cannot
// prove it wrote. PHARN's commands find capabilities by scanning those
// directories, so a dropped entry whose directory stayed would keep running, and
// `pharn remove` could no longer reach it. Nothing else is ever deleted, and
// `.claude/settings.json` is never written.
export async function runUpdate(
  opts: {
    force?: boolean;
    yes?: boolean;
    ref?: RefChoice;
    dryRun?: boolean;
    json?: boolean;
    compact?: boolean;
  } = {},
): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const json = opts.json ?? false;
  const compact = opts.compact ?? false;
  // `--json` is the dry run's machine-readable form and nothing else: the
  // dispatch refuses it alone, and a direct caller fails closed here rather than
  // reaching a real run that would print clack chrome into a JSON consumer.
  if (json && !dryRun) {
    reportFatalPlain('--json is only available with --dry-run.');
    process.exit(1);
  }
  // `--compact` filters the JSON report and has nothing to filter anywhere else:
  // the dispatch refuses it without `--json`, and a direct caller fails closed.
  if (compact && !json) {
    reportFatalPlain('--compact is only available with --json.');
    process.exit(1);
  }
  // Under `--json` NOTHING reaches stdout but the one report: no clack at all.
  if (!json) intro(dryRun ? 'pharn update --dry-run' : 'pharn update');

  // FIRST, ahead of the config load, the TTY gate and every network call: the
  // Node floor is environmental, so it wins over the project-state errors below
  // and a refusal costs nothing and writes nothing. (See steps/node-prereq.ts.)
  runNodePrereq('update', { json });

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd, { json });

  // Non-TTY (CI, a pipe) → NEVER prompt into the void: a usage error + exit(1),
  // BEFORE any network call (P5 — the terminal fallback is a hard-fail, not a
  // guess). Without this the confirm below cancels on stream end and routes
  // through cancelAndExit's exit(0): a pipeline that "passes" having updated
  // nothing, which is the worst failure shape for automation. Same predicate and
  // same shape as the add/remove pickers — `interactiveAllowed` is imported, so
  // this repo keeps exactly ONE TTY test.
  //
  // The config load runs FIRST and deliberately so: an uninitialized directory
  // deserves its actionable "run pharn init" error, not a TTY message about a
  // prompt it would never have reached.
  //
  // A dry run never prompts and never writes, so it has nothing to gate: it runs
  // without a terminal, and `--yes` (which only skips the confirm) is moot.
  const yes = opts.yes ?? false;
  if (
    !dryRun &&
    !yes &&
    !interactiveAllowed({
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
    })
  ) {
    logError(
      'pharn update needs to confirm before it writes. Run it in an interactive terminal, or pass --yes to confirm automatically (e.g. `pharn update --yes`).',
    );
    process.exit(1);
  }

  // The channel: `--ref` when passed (and then recorded), else the one this
  // install already follows — `ref: "latest"`, or `main`'s tip when the config
  // records none. An install on `main` is never moved by the new default; it is
  // told once per run, here — above every early return and the dry run, below
  // the refusals above (so a refused run still prints one error and nothing
  // else). Under `--json` nothing is printed: the report carries `channel`.
  const channelNotice = defaultChannelNotice(config, opts.ref);
  if (channelNotice !== null && !json) log.info(channelNotice);
  await runArchetypeUpdate(
    config,
    cwd,
    opts.force ?? false,
    yes,
    opts.ref ?? channelOf(config),
    dryRun,
    json,
    compact,
  );
}

async function runArchetypeUpdate(
  config: PharnConfig,
  cwd: string,
  force: boolean,
  yes: boolean,
  channel: RefChoice,
  dryRun: boolean,
  json: boolean,
  compact: boolean,
): Promise<void> {
  // What a configured proxy means here (nothing: fetch never uses one), emitted
  // ONCE at the top so it precedes EVERY fetch this command can make — the
  // SKILLS_VERSION read immediately below and the tarball download before the
  // confirm alike. It used to sit inside the lock closure, above fetchRepo,
  // justified by "a refused run performs no fetch". That premise is false HERE:
  // the version check below — and, since F-24, the tarball download — has
  // already gone over the wire by the time the lock is even attempted. `add` carries the same sentence and there it holds, because
  // `add` makes no pre-lock fetch; the words travelled to a command where the
  // precondition does not.
  //
  // What that cost is the whole reason the notice exists: a proxy-only user
  // (direct egress blocked) got a bare "Failed to check for updates" from the
  // one fetch that skipped it, and the already-up-to-date early return fetched
  // and returned having said nothing at all — against LIMITS.md §3a, which
  // promises EVERY network-bearing command warns before fetching and names this
  // command's version check as one of those fetches in the same paragraph.
  //
  // Above both spinners for the same reason it was always pre-spinner: a
  // log.warn into a live clack spinner frame is overwritten (see
  // src/commands/init.ts for the full rationale). Still below
  // loadArchetypeConfigOrExit and the TTY gate in runUpdate, so an uninitialized
  // directory and a piped run each keep their actionable error at zero
  // round-trips. And it cannot fire early: the fetch below is the unconditional
  // first statement of the try, so every run reaching this line also fetches —
  // a lock refusal and a cancelled confirm now warn too, and in both cases a
  // fetch really did happen.
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) {
    // A diagnostic: stderr under `--json`, so stdout stays one object.
    if (json) logErrorPlain(proxyNoticeMessage(proxyNotice));
    else log.warn(proxyNoticeMessage(proxyNotice));
  }

  const s = json ? silentSpinner() : spinner();
  s.start('Checking for updates');
  let latest: string;
  let source: InstallSource;
  try {
    // ONE resolve per run, reused for the one tarball download below, so the
    // version this check reports is the version that run installs. A release
    // names its version in its tag (and `fetchRepo` checks the tree agrees);
    // only the `main` channel reads the tip's SKILLS_VERSION over the wire.
    source = await resolveSource(channel);
    latest =
      source.kind === 'release'
        ? source.version
        : await fetchRemoteSkillsVersion();
    s.stop(`Latest skills v${latest} (${sourceDescription(source)})`);
  } catch (err) {
    s.stop('Failed to check for updates');
    (json ? reportFatalPlain : reportFatal)(errorMessage(err), { err });
    process.exit(1);
  }

  // The `--json` report of a run that ends at an early return: the same object
  // as a planned one, with `plan: null` — the outcome is the `status` field, not
  // prose.
  const emitEarlyReturn = (status: UpdateStatus): void => {
    emitJson(
      buildUpdateReport({
        status,
        force,
        channel,
        currentChannel: channelOf(config),
        source,
        installed: config.skillsVersion,
        latest,
        archetypes: config.archetypes ?? [],
        plan: null,
        compact,
      }),
    );
  };

  // AHEAD OF THE SOURCE: applying an OLDER upstream would be a DOWNGRADE
  // presented as an update ("v2.0.0 → v1.0.0" over every file), so it is
  // refused unless asked for: `--force` already means "make my tree match
  // upstream". Both channels can be ahead (lib/version-status.ts — the ONE
  // comparison `status` uses too, so the two never disagree):
  // - the release channel: an install made from `main` switched to `--ref
  //   latest` before the release at its version was cut;
  // - the `main` channel: pharn-oss main moved BACK (a revert of its
  //   SKILLS_VERSION).
  // A `pendingSkillsVersion` counts as well: every file but the user's kept
  // edits is at it, so stepping those files back to an older upstream is the
  // same downgrade even when the recorded `skillsVersion` is older.
  // This runs BEFORE the same-version early return and everything that
  // re-opens it (a frozen-capability re-check, an old-format models block, a
  // `--ref` switch), so none of them can carry the downgrade in. Not ahead (or a
  // version either side cannot order) → as before.
  const aheadOf = force
    ? null
    : ([config.pendingSkillsVersion, config.skillsVersion].find(
        (held) =>
          held !== undefined &&
          versionStatus({ installed: held, latest }).ahead,
      ) ?? null);
  if (aheadOf !== null) {
    if (json) {
      emitEarlyReturn(
        source.kind === 'release' ? 'ahead-of-release' : 'ahead-of-main',
      );
      return;
    }
    // Both are the config's own strings (VERSION_RE-validated at load, F-18),
    // sanitized again where they reach the terminal.
    const held =
      aheadOf === config.skillsVersion
        ? `skills v${terminalSafe(config.skillsVersion)}`
        : `skills v${terminalSafe(config.skillsVersion)}, every file you did not edit at v${terminalSafe(aheadOf)}`;
    outro(
      source.kind === 'release'
        ? `Your install (${held}) is ahead of the latest verified release (${source.tag}) — it came from pharn-oss main. Nothing changed. \`pharn update --ref main\` switches back to main; \`pharn update --force\` goes back to ${source.tag}.`
        : `Your install (${held}) is newer than pharn-oss main (v${latest}) — main has moved back to an older version. Nothing changed. \`pharn update --force\` downgrades to v${latest}; otherwise wait for main to move forward again.`,
    );
    return;
  }

  // The version gate. `--force` deliberately bypasses it: `--force` means "make
  // my tree match upstream, overwriting my edits", which is a request the user
  // can legitimately make at the current version — and it is what `pharn status`
  // tells them to do about locally-changed files.
  // A capability the last run KEPT unparsed (`frozenCapabilities`) re-opens the
  // gate: without the fetch it is never re-checked, so the KEPT report would not
  // repeat and its bytes would stay stale after a pharn upgrade that can parse it.
  const current = config.skillsVersion === latest;
  const recheckFrozen = (config.frozenCapabilities ?? []).length > 0;
  // The stamped records baseline, read ONCE for the local checks below.
  const recordsRead = readRecords(cwd);
  const recordsStamp = {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  };
  const baselineRecords = recordsBaseline(recordsRead, recordsStamp).records;
  // A `models` block still in the format pharn wrote before 0.7.0 re-opens the
  // gate as well: converting it is this CLI's job, not upstream's, so it has to
  // reach an install that is already current. Bounded: a run converts the block
  // or writes pharn-oss's and records it, and either closes the gate
  // (modelsMigrationPending). A local read — no round-trip.
  const convertModels = modelsMigrationPending(
    config.models,
    baselineRecords?.[MODELS_RECORD_KEY] ?? null,
  );
  // Switching channel (`--ref main` on a release install, or `--ref latest` on
  // one that follows main) re-opens the gate too, so the switch is RECORDED even
  // at the same version — otherwise the next run would quietly revert to the old
  // channel. The re-apply is cheap: identical files are no-ops.
  const switchChannel = channel !== channelOf(config);
  // An INCOMPLETE install re-opens the gate as well: a configured capability
  // whose dir is gone, or a recorded file that is gone, at the current version.
  // Without this a deleted file stayed deleted until upstream bumped its version
  // or the user reached for `--force` (which also overwrites their edits). A
  // local, read-only lstat walk — no round-trip — that only ever answers
  // "provably missing", so the run it opens restores what it found and the next
  // run early-returns again (lib/missing-installed.ts).
  const missing =
    current && !force
      ? findMissingInstalled(cwd, config, baselineRecords)
      : null;
  // A record store stamped for ANOTHER install state re-opens the gate too
  // (F-22): `add` and `update` write the store before the config, so a torn run
  // leaves a store the baseline above ignores, and the next version bump would
  // read every differing file as `unverifiable`. The opened run re-records the
  // install: a complete OR withheld run writes the store stamped with the SAME
  // skillsVersion and commit it writes to the config, so the next run's stamp
  // agrees and it early-returns again, bounded like `missing`. Only a store
  // that PARSED counts (recordsStampStale): an absent or corrupt one does not
  // re-open, so `update` never overwrites a store the user could still repair.
  const staleRecords =
    current && !force && recordsStampStale(recordsRead, recordsStamp);
  // The old root footprint an older CLI left on an install already at SKILLS 7
  // re-opens the gate too (lib/root-migration.ts): a record-equal root doc
  // whose pharn/ copy was never written, or user data still at the root with
  // its destination free. Local and read-only, and bounded like `missing`: the
  // opened run finishes exactly what counted, and nothing it could not finish
  // ever counts.
  const rootDoc =
    current && !force
      ? pendingRootMigration(cwd, config, baselineRecords)
      : null;
  if (
    current &&
    !force &&
    !recheckFrozen &&
    !convertModels &&
    !switchChannel &&
    missing === null &&
    !staleRecords &&
    rootDoc === null
  ) {
    if (json) {
      emitEarlyReturn('up-to-date');
      return;
    }
    outro(
      `Already up to date (skills v${terminalSafe(config.skillsVersion)}).`,
    );
    return;
  }

  // The preview's header note is chrome; `--json` carries its facts as fields.
  if (!json)
    note(
      [
        current
          ? row(
              'Skills version',
              `v${terminalSafe(config.skillsVersion)} (re-applying)`,
            )
          : row(
              'Skills version',
              `v${terminalSafe(config.skillsVersion)} → v${latest}`,
            ),
        row('Source', sourceDescription(source)),
        '',
        row('Archetypes', (config.archetypes ?? []).join(', ') || '(none)'),
        '',
        force
          ? pc.dim(
              `  --force: files you changed will be OVERWRITTEN (each is copied to ${BACKUP_DIR}/ first).`,
            )
          : pc.dim(
              '  Files you have changed are kept, not overwritten — they are listed at the end.',
            ),
        ...(convertModels
          ? [
              pc.dim(
                '  Your models block is in the format pharn wrote before 0.7.0 — this run converts it.',
              ),
            ]
          : []),
        ...(missing !== null
          ? [
              pc.dim(
                // "if upstream still ships it": a deleted ORPHAN (lib/orphans.ts)
                // is a recorded path that is gone too; this run drops its record
                // instead of restoring it, and the next run early-returns.
                `  ${terminalSafe(missing)} is missing — this run re-applies the install, restoring it if upstream still ships it.`,
              ),
            ]
          : []),
        ...(rootDoc !== null
          ? [
              pc.dim(
                `  ${terminalSafe(rootDoc)} is still at the project root — this run re-applies the install, which keeps it under pharn/.`,
              ),
            ]
          : []),
        ...(staleRecords
          ? [
              pc.dim(
                `  ${RECORDS_FILE} is stamped for a different install state than pharn.config.json (an interrupted run?) — this run re-applies the install and records it again.`,
              ),
            ]
          : []),
        pc.dim(
          '  Re-resolves your archetypes against the latest capabilities and re-copies them.',
        ),
        ...(dryRun
          ? [pc.dim('  Preview only — nothing will be written.')]
          : []),
        pc.dim(
          '  https://github.com/pharn-dev/pharn-oss/blob/main/CHANGELOG.md',
        ),
      ].join('\n'),
    );

  // The preview stops here, ahead of the confirm, the lock and every write: it
  // shares the gates above (so it answers "Already up to date" exactly when the
  // real run would) and the planner below, and nothing else.
  if (dryRun) {
    await runDryRun(config, cwd, force, channel, source, json, latest, compact);
    return;
  }
  // THE PLAN SNAPSHOT — fetched and planned BEFORE the confirm (F-24), so the
  // confirm can name what this run changes: the capabilities it adds, the ones
  // it drops, and the directories it deletes. The confirm used to come first,
  // which meant those changes were applied after a prompt that could not name
  // them, and `--yes` applied them with nothing in the log saying which.
  //
  // The cost is stated, not hidden: the tarball is downloaded before the user
  // can answer, so a cancelled confirm (or a run the lock then refuses) has paid
  // for it — the trade the dry run already makes. The TTY gate still runs
  // before ANY network call (runUpdate), the early returns above still fetch no
  // tarball, and the lock is still taken only AFTER the confirm (below), so no
  // human prompt is ever held under it. The clone is held across the prompt in
  // its private temp dir, registered for exit/signal cleanup (lib/repo.ts), and
  // removed in the `finally` below before any exit.
  //
  // A failed download, a MIN_CLI refusal and a drop the planner refuses to
  // delete now stop the run BEFORE it asks — same messages, same exit 1.
  const pre = spinner();
  pre.start(`Planning from ${REPO_URL}`);
  const repo: FetchedRepo = await fetchRepo(source).catch(
    (err: unknown): never => {
      pre.stop('Update failed');
      reportFatal(errorMessage(err), { err });
      process.exit(1);
    },
  );

  let outcome: UpdateOutcome | null = null;
  let cancelled = false;
  // The backup pointer, carried OUT of applyUpdate the moment it exists rather
  // than riding home inside a successful outcome — everything after createBackup
  // can throw, and a run that dies there has already moved the user's bytes.
  //
  // A HOLDER, not a bare `let`: TypeScript drops narrowing for a `let` assigned
  // only inside a closure, so the `if` below would fight `strict` for no reason.
  const backupRef: { current: Backup | null } = { current: null };
  // The spinner is created and started INSIDE the lock, so a run refused before
  // the lock is taken never renders a frame it would then have to erase. A
  // HOLDER for the same reason `backupRef` is one, and it is also what lets the
  // catch stop a spinner that may never have been started: `withProjectLock` can
  // throw (a held lock, or an fs error creating the file) BEFORE `fn` runs at
  // all, and `null` is exactly that case.
  const spinnerRef: { current: ReturnType<typeof spinner> | null } = {
    current: null,
  };
  // The refusal message. A HOLDER too, because it is assigned from the snapshot,
  // from the membership guard inside the locked closure and from the catch
  // below — a bare `let` written only inside a closure is the narrowing problem
  // `backupRef` documents.
  const refusalRef: { current: string | null } = { current: null };
  // The ERROR OBJECT, not its message — the reporter needs it to tell an
  // exception (which earns the PHARN_DEBUG affordance) from a curated refusal.
  // Boxed so a thrown nullish value stays distinguishable from "nothing failed"
  // across the deferred, post-cleanup exit below, and so the same box can be
  // handed straight to reportFatal.
  let failure: FatalCause | null = null;
  try {
    // THE MIN_CLI GATE and the plan, from the clone fetched above — upstream's
    // lever to refuse a stale CLI CLEANLY, now answered before the user is asked.
    // The unknown-capabilities warning is logged here, once.
    const snapshot = planFromClone(repo, config, cwd, force, channel, (m) =>
      log.warn(m),
    );
    pre.stop(planStopMessage(snapshot));
    if (snapshot.kind === 'refused') refusalRef.current = snapshot.refusal;
    else if (snapshot.kind === 'failed') failure = snapshot.failure;
    else {
      const confirmed = snapshot.planned.report;
      // What this run would change about membership, in the future tense —
      // the same renderer the dry run uses. Nothing changes → no note.
      reportCapabilityChanges(
        confirmed.capabilityChanges,
        confirmed.removals,
        true,
      );
      // The root docs it would delete and the user data it would move
      // (lib/root-migration.ts), named before the question as well.
      reportRootMigration(confirmed.rootMigration, null);
      const deletes = confirmed.removals.filter((r) => r.present).length;
      // `--yes` skips THE CONFIRM AND NOTHING ELSE. The notes above have
      // already printed (a non-interactive log deserves the same context a
      // terminal gets), and every decision below — the plan, the drift-safe
      // skips, the backups, the withheld version bump, the exit codes — is
      // byte-identical either way. It means "don't ask", not "non-interactive
      // mode": it works in a terminal too. Skipping the call entirely (rather
      // than short-circuiting its result) is what makes "the prompt is never
      // rendered" true by construction.
      //
      // A run that deletes a directory defaults to No — the default init's
      // overwrite/removal prompt has — and says how many in the question.
      if (!yes) {
        const ok = await confirm({
          message: confirmMessage(force, deletes),
          initialValue: deletes === 0,
        });
        cancelled = isCancel(ok) || ok !== true;
      }
      if (!cancelled)
        outcome = await applyUnderLock(confirmed, {
          config,
          cwd,
          force,
          channel,
          repo,
          backupRef,
          spinnerRef,
          refusalRef,
        });
    }
  } catch (err) {
    // A held lock is a POLICY refusal, not a crash: it earns the same
    // no-PHARN_DEBUG treatment as the MIN_CLI gate, because the message already
    // names the one action that resolves it. Routing it through `failure` would
    // offer a stack trace for a situation with nothing to debug.
    //
    // `?.` because a lock refusal is thrown before `fn` runs, so there is no
    // spinner to stop — stopping one that never started would paint a stray frame.
    //
    // A drop whose directory cannot be deleted safely (a symlink on the way, an
    // unreadable file) is refused by the PLANNER, before any write — the same
    // kind of named refusal.
    if (
      err instanceof ProjectLockedError ||
      err instanceof CapabilityRemovalError
    ) {
      spinnerRef.current?.stop('Update refused');
      refusalRef.current = err.message;
    } else {
      spinnerRef.current?.stop('Update failed');
      failure = { err };
    }
  } finally {
    repo.cleanup();
  }
  // Every exit below runs AFTER the clone's cleanup (Node skips finally on exit).
  if (cancelled) cancelAndExit();
  const refusal = refusalRef.current;

  // A policy refusal is not a failure to debug — no PHARN_DEBUG hint, and the
  // message already names the one action that resolves it.
  if (refusal) {
    reportFatal(refusal);
    process.exit(1);
  }

  if (failure || !outcome) {
    // No `failure` means the `!outcome` branch — a defensive guard, not a caught
    // exception — so nothing is passed and no hint is offered for a stack that
    // does not exist.
    if (failure) reportFatal(errorMessage(failure.err), failure);
    else reportFatal('Update failed.');
    // Past the backup, the originals it copied may already be overwritten, and
    // this is the last chance anything names where the copies went — the success
    // report never runs. After the `finally` above, so the clone is cleaned up
    // before the exit, the discipline every exit in this file keeps.
    //
    // Nothing prints when no backup exists: `createBackup` throwing leaves the
    // tree intact with nothing to point at, and a run without `--force` only
    // ever writes over files pharn itself wrote and proved pristine.
    if (backupRef.current) {
      reportBackup(backupRef.current, { aborted: true });
    }
    process.exit(1);
  }

  // Before the report, whose outro is the run's last line.
  const legacyBackups = legacyBackupNotice(cwd);
  if (legacyBackups) log.info(legacyBackups);
  reportOutcome(outcome, force);
  // A user-data move that could not be made (a conflict, a symlink, a failed
  // rename) fails the run, after everything else it did has been reported and
  // kept (lib/root-migration.ts). exitCode, not exit: the report is flushed.
  if (rootMigrationFailed(outcome.rootMigration, outcome.rootMigrationResult))
    process.exitCode = 1;
}

// The confirm's question. "Re-fetch" no longer describes the step (the fetch
// has happened); a run that deletes directories says how many.
function confirmMessage(force: boolean, deletes: number): string {
  const base = force
    ? 'Apply this update and overwrite your changes?'
    : 'Apply this update?';
  if (deletes === 0) return base;
  return `${base} It deletes ${deletes} capability director${deletes === 1 ? 'y' : 'ies'}.`;
}

// What the confirm named, as comparable keys: every membership change, and
// every directory the run deletes. The second is disk-dependent (`present`),
// and it is exactly what decides whether something is deleted — so it is
// guarded too (GRILL.md).
function membershipKeys(r: UpdatePlanReport): string[] {
  return [
    ...r.capabilityChanges.map(
      (c) => `${c.reason} ${c.cap.role}:${c.cap.name}`,
    ),
    ...r.removals.filter((x) => x.present).map((x) => `delete ${x.dir}/`),
    // What the root migration deletes and moves, named before the confirm.
    ...(r.rootMigration?.docs ?? [])
      .filter((d) => d.action === 'delete')
      .map((d) => `delete ${d.rel}`),
    ...(r.rootMigration?.moves ?? [])
      .filter((m) => m.action === 'move')
      .map((m) => `move ${m.from} → ${m.to}`),
  ];
}

// THE MEMBERSHIP GUARD: the plan made under the lock must change exactly what
// the confirm showed. With the config unchanged (asserted) and the same clone,
// the change list is equal by construction; the deleted-directory set can move
// with the disk. Any difference refuses, naming both sides — an equality test,
// so "what you confirmed is what is applied" does not rest on an argument.
// `null` when they agree.
function membershipDrift(
  confirmed: UpdatePlanReport,
  now: UpdatePlanReport,
): string | null {
  const before = membershipKeys(confirmed);
  const after = membershipKeys(now);
  if (
    before.length === after.length &&
    before.every((key, i) => key === after[i])
  )
    return null;
  const shown = before.filter((key) => !after.includes(key));
  const added = after.filter((key) => !before.includes(key));
  const list = (keys: string[]): string =>
    keys.length > 0 ? keys.join(', ') : '(nothing)';
  return `The capabilities this update would change are no longer what you confirmed — shown but not planned now: ${list(shown)}; planned now but not shown: ${list(added)}. Nothing was changed. Run \`pharn update\` again.`;
}

// Everything under the project lock: the authoritative re-plan, the membership
// guard, and the writes. Returns null after setting `refusalRef` when the guard
// refuses.
async function applyUnderLock(
  confirmed: UpdatePlanReport,
  ctx: {
    config: PharnConfig;
    cwd: string;
    force: boolean;
    channel: RefChoice;
    repo: FetchedRepo;
    backupRef: { current: Backup | null };
    spinnerRef: { current: ReturnType<typeof spinner> | null };
    refusalRef: { current: string | null };
  },
): Promise<UpdateOutcome | null> {
  const { config, cwd, force, channel, repo } = ctx;
  const { backupRef, spinnerRef, refusalRef } = ctx;
  // THE SINGLE-WRITER LOCK — taken AFTER the confirm, and that is not
  // negotiable. The confirm is this command's last human step, and holding the
  // lock across an unanswered prompt would block every other pharn run in the
  // project for as long as a human takes to answer — an UNBOUNDED hold. What
  // runs under it is bounded local work: a re-plan from the clone already on
  // disk and the writes. `init` cannot be given this shape at all — BOTH of
  // its prompts sit between its fetch and its install — which is why init's
  // lock deliberately stays where it is (see the note in src/commands/init.ts).
  //
  // The tarball is fetched before the confirm (F-24), so a run the lock
  // refuses has already downloaded it; the clone is still removed before the
  // refusal is reported.
  return withProjectLock(cwd, 'update', async () => {
    // First, before the spinner: the config this run planned (and confirmed)
    // against was read before the lock; refuse if another run rewrote it.
    assertConfigUnchanged(cwd, config, 'update');
    const s2 = spinner();
    spinnerRef.current = s2;
    s2.start('Updating');
    // AUTHORITATIVE: re-decided from disk under the lock — every per-file row,
    // and each removal's `present` and backups. The snapshot was a preview.
    // No warning callback: the snapshot already logged it for this clone.
    const planned = buildUpdatePlan({
      repoDir: repo.dir,
      sha: repo.sha,
      config,
      cwd,
      force,
      channel,
    });
    const drift = membershipDrift(confirmed, planned.report);
    if (drift !== null) {
      s2.stop('Update refused');
      refusalRef.current = drift;
      return null;
    }
    const applied = await applyPlannedUpdate(
      planned,
      config,
      cwd,
      repo.dir,
      channel,
      (backup) => {
        backupRef.current = backup;
        // Named the moment it exists (as `add` does): everything after the
        // backup can throw or be interrupted, and this pointer is the user's
        // only route back to the pre-overwrite bytes.
        //
        // With NO spinner running: clack's spinner owns the line it animates,
        // so a line logged under it is glued to its frame, and below ~50
        // columns its `stop` erases that line. So the spinner is stopped first
        // — with a neutral phrase, the notice says the rest — and a new one is
        // started for the writes (`spinnerRef` follows it, so every failure
        // path stops the one actually running).
        s2.stop('Backup written');
        reportBackup(backup, { aborted: false });
        const s3 = spinner();
        spinnerRef.current = s3;
        s3.start('Writing files');
      },
    );
    spinnerRef.current.stop(
      applied.plan.writes.length ? 'Capabilities updated' : 'Nothing to write',
    );
    return applied;
  });
}

// The write half: back up, write, persist. The decisions were made by
// `buildUpdatePlan` (lib/update-plan.ts), which the dry run shares. Pure of
// process.exit — the caller owns cleanup + exit.
//
// `onBackup` fires the instant a backup exists, because the caller needs that
// path on the paths this function does NOT return from.
async function applyPlannedUpdate(
  planned: PlannedUpdate,
  config: PharnConfig,
  cwd: string,
  repoDir: string,
  channel: RefChoice,
  onBackup: (backup: Backup) => void,
): Promise<UpdateOutcome> {
  const { report, apply } = planned;
  const { expected, records, plan, models, configCapabilities } = apply;

  // Back up EVERY about-to-be-clobbered file before a single original is
  // touched; a failure here aborts with the whole tree still intact.
  //
  // Ordered exactly as before — after planning, before applyWrites — and the
  // pointer is handed UP here rather than only in the return value below: every
  // line after this one (the writes, the records, the config) can throw, and a
  // run that dies there has already moved the user's bytes into that directory.
  // A `--force` over the user's models block backs up the whole config: the
  // block lives inside it (`report.backups` already includes it).
  //
  // ONE backup directory per run: the `--force` casualties AND every file in a
  // dropped capability's directory that pharn cannot prove it wrote
  // (`removals[].backups`). The two sets are disjoint by construction (the
  // manifest holds no dropped capability), and de-duplicated anyway.
  // The user-data moves (lib/root-migration.ts) join the same directory: their
  // files are copied before the move, which runs last.
  const removalBackups = report.removals.flatMap((r) => r.backups);
  const backupRels = [
    ...new Set([
      ...report.backups,
      ...removalBackups,
      ...apply.rootMoveBackups,
    ]),
  ];
  // "removing" whenever a directory will be deleted — even one whose files are
  // all pharn's own and need no copy — so an aborted run never under-reports
  // what may already be gone.
  const deletes = report.removals.some((r) => r.present);
  const backup: Backup | null =
    backupRels.length > 0
      ? {
          dir: createBackup(cwd, backupRels),
          count: backupRels.length,
          action: backupAction(
            report.backups.length > 0,
            deletes,
            apply.rootMoveBackups.length > 0,
          ),
        }
      : null;
  if (backup) onBackup(backup);

  // The capability directories this run drops, deleted BEFORE the writes — on
  // purpose. A delete that failed AFTER the writes would leave pharn-written
  // files whose records are never stored (only an ApplyError carries what was
  // written), and the next run would read them as the user's edits and skip
  // them forever. Failing here leaves only the backup and some deleted
  // directories; the config still lists those entries, so the next run drops
  // them again (an absent directory has nothing to save). The planner already
  // refused a symlinked component and every unreadable file, under this lock.
  // Their records need no prune: `plan.nextRecords` is keyed by the manifest,
  // which holds no dropped capability.
  for (const removal of report.removals) {
    if (removal.present)
      deleteCapabilityDir(cwd, apply.removalPaths, removal.cap);
  }

  let written: string[];
  try {
    written = applyWrites({ projectRoot: cwd, expected, writes: plan.writes });
  } catch (err) {
    // Files pharn just wrote MUST be recorded even on a partial failure — an
    // unrecorded pharn write reads as the user's edit on the next run and would
    // be skipped forever. The config is not written, so the store is stamped with
    // the config's UNCHANGED values and stays consistent with it.
    //
    // `records !== null` matters: with no usable baseline this would MINT a store
    // from a handful of paths, flipping the rest of the install from the honest
    // `unverifiable` to a false `unrecorded` — the same reason `add` only ever
    // extends an already-readable store. With no baseline the partially-written
    // files stay unrecorded, which is the safe (skip) reading.
    if (
      err instanceof ApplyError &&
      err.written.length > 0 &&
      records !== null
    ) {
      await writeRecords(cwd, {
        skillsVersion: config.skillsVersion,
        commit: config.commit,
        files: { ...records, ...buildRecords(cwd, err.written) },
      });
    }
    throw err;
  }

  // The old root docs (lib/root-migration.ts): deleted only now that the
  // pharn/ copy has landed, and only when still record-equal. A failure keeps
  // the file and so its record; it never throws past the writes above.
  const migration = report.rootMigration;
  const docResult =
    migration === null
      ? { deleted: [], kept: [] }
      : deleteRootDocs(cwd, repoDir, migration.docs);
  const retired = new Set(docResult.deleted);
  const orphanRecords = Object.fromEntries(
    Object.entries(apply.orphanRecords).filter(([rel]) => !retired.has(rel)),
  );

  // Records first, then the config: if the config write fails, the records still
  // describe the bytes on disk, and the stamp mismatch makes them safely ignored
  // rather than wrongly authoritative.
  //
  // Every hash is re-read from the DEST after the copy — never carried over from
  // the clone source. The two are equal whenever the copy behaved, which is
  // exactly the assumption a record exists to avoid making: hashing what landed
  // is what makes "the record cannot disagree with disk" true by construction
  // rather than by trusting the copy (lib/install-records.ts).
  await writeRecords(cwd, {
    skillsVersion: apply.nextSkillsVersion,
    commit: apply.nextCommit,
    files: {
      ...apply.frozenRecords,
      // Orphans keep their record while their file exists, so later runs (and
      // `status`) still name them. Disjoint from the manifest by construction.
      // A root doc retired just above is gone, so its record goes with it.
      ...orphanRecords,
      ...plan.nextRecords,
      ...buildRecords(cwd, written),
      // `planUpdate` keys its records by the manifest, which holds no models
      // block, so the block's record is written here.
      ...(models.nextRecord !== null
        ? { [MODELS_RECORD_KEY]: models.nextRecord }
        : {}),
    },
  });
  const {
    pendingSkillsVersion: _previousPending,
    frozenCapabilities: _previousFrozen,
    ref: _previousRef,
    ...rest
  } = config;
  await writePharnConfig(cwd, {
    ...rest,
    skillsVersion: apply.nextSkillsVersion,
    commit: apply.nextCommit,
    // The channel this run used — even when the version bump is withheld: it is
    // the user's choice of source, not a claim about the bytes.
    ...(channel === 'latest' ? { ref: 'latest' as const } : {}),
    ...(report.pendingSkillsVersion !== null
      ? { pendingSkillsVersion: report.pendingSkillsVersion }
      : {}),
    ...(apply.frozenKeys.length > 0
      ? { frozenCapabilities: apply.frozenKeys }
      : {}),
    capabilities: configCapabilities,
    layout: report.layout,
    installedAt: new Date().toISOString(),
    // In place: the key keeps its position in the file, and `undefined` (there
    // was none and there is none to write) writes no key.
    models: models.next,
  });

  // The user-data moves, LAST: everything pharn-owned is in place, so a move
  // that fails (or was refused at plan time) costs nothing but itself, and the
  // caller turns it into exit 1 after the report.
  const moveResult =
    migration === null
      ? { moved: [], failed: [] }
      : applyRootMoves(cwd, migration.moves);

  return {
    installedVersion: report.installedVersion,
    recordedVersion: report.recordedVersion,
    capCount: report.capCount,
    capabilityChanges: report.capabilityChanges,
    removals: report.removals,
    plan,
    backup,
    recordsNote: report.recordsNote,
    versionWithheld: report.versionWithheld,
    abandonedLayout: report.abandonedLayout,
    featuresReadmeRelocation: report.featuresReadmeRelocation,
    hookWiring: report.hookWiring,
    absentUpstream: report.absentUpstream,
    models,
    modelsFloor: report.modelsFloor,
    orphans: report.orphans,
    rootMigration: migration,
    rootMigrationResult:
      migration === null ? null : { ...docResult, ...moveResult },
  };
}

// The MIN_CLI gate — upstream's lever to refuse a stale CLI CLEANLY. One
// function for the real run and the preview, so the warning, the refusal text
// and the exit code cannot diverge. Returns the refusal (or null); a warning goes
// to `warn` (clack's `log.warn`, or plain stderr under `--json`) and does not
// refuse.
function checkMinCli(
  repoDir: string,
  warn: (message: string) => void = (message) => log.warn(message),
): { refusal: string | null } {
  const gate = minCliGate(repoDir, PHARN_VERSION);
  if (gate.warning) warn(gate.warning);
  return { refusal: gate.refusal ?? null };
}

// A spinner that draws nothing, for `--json`: stdout stays the one report.
function silentSpinner(): Pick<ReturnType<typeof spinner>, 'start' | 'stop'> {
  return { start: () => undefined, stop: () => undefined };
}

// The one stdout write of a `--json` run. A normal return follows (never
// `process.exit`), so a large object piped to `jq` is flushed, not cut off.
function emitJson(report: object): void {
  console.log(serializeJsonReport(report));
}

// What a clone phase produced — exactly one of the three.
type PlanOutcome =
  | { kind: 'planned'; planned: PlannedUpdate }
  | { kind: 'refused'; refusal: string }
  | { kind: 'failed'; failure: FatalCause | null };

// The MIN_CLI gate → plan phase over a clone the CALLER owns (and cleans up):
// the dry run through fetchAndPlan, the real run with the clone it keeps for
// the locked re-plan. Never throws — a planner refusal to delete a dropped
// capability's directory is a policy refusal, exactly as the lock path reports
// it; anything else is a failure to report.
function planFromClone(
  repo: FetchedRepo,
  config: PharnConfig,
  cwd: string,
  force: boolean,
  channel: RefChoice,
  warn: (message: string) => void,
): PlanOutcome {
  try {
    const refusal = checkMinCli(repo.dir, warn).refusal;
    if (refusal) return { kind: 'refused', refusal };
    const planned = buildUpdatePlan({
      repoDir: repo.dir,
      sha: repo.sha,
      config,
      cwd,
      force,
      channel,
      onUnknownWarning: warn,
    });
    return { kind: 'planned', planned };
  } catch (err) {
    if (err instanceof CapabilityRemovalError)
      return { kind: 'refused', refusal: err.message };
    return { kind: 'failed', failure: { err } };
  }
}

function planStopMessage(outcome: PlanOutcome): string {
  switch (outcome.kind) {
    case 'planned':
      return 'Plan ready';
    case 'refused':
      return 'Update refused';
    case 'failed':
      return 'Planning failed';
  }
}

// The clone → MIN_CLI gate → plan phase, shared by the text and `--json` dry
// runs so there is ONE copy of the clone/cleanup discipline: the clone is
// removed before this returns, and every exit is the caller's, AFTER it.
async function fetchAndPlan(
  config: PharnConfig,
  cwd: string,
  force: boolean,
  channel: RefChoice,
  source: InstallSource,
  ui: {
    spin: Pick<ReturnType<typeof spinner>, 'start' | 'stop'>;
    warn: (message: string) => void;
  },
): Promise<PlanOutcome> {
  const { spin, warn } = ui;
  spin.start(`Planning from ${REPO_URL}`);
  let repo: FetchedRepo;
  try {
    repo = await fetchRepo(source);
  } catch (err) {
    spin.stop('Planning failed');
    return { kind: 'failed', failure: { err } };
  }
  try {
    const outcome = planFromClone(repo, config, cwd, force, channel, warn);
    spin.stop(planStopMessage(outcome));
    return outcome;
  } finally {
    repo.cleanup();
  }
}

// `--dry-run`: fetch, gate, plan, print, exit 0 — and write NOTHING. No lock, no
// confirm, no backup, no copy, no records, no config: none of those functions is
// reachable from here (the project-root writes all live in applyPlannedUpdate,
// which this never calls). The only thing created is the clone's temp dir under
// the OS temp dir, removed in fetchAndPlan exactly as the real run does.
//
// `--json` swaps the sinks, not the logic: no spinner, diagnostics and failures
// on plain stderr (stdout empty, exit 1), and one report on stdout at the end.
async function runDryRun(
  config: PharnConfig,
  cwd: string,
  force: boolean,
  channel: RefChoice,
  source: InstallSource,
  json: boolean,
  latest: string,
  compact: boolean,
): Promise<void> {
  const outcome = await fetchAndPlan(config, cwd, force, channel, source, {
    spin: json ? silentSpinner() : spinner(),
    warn: json
      ? (message) => logErrorPlain(message)
      : (message) => log.warn(message),
  });

  // Every exit AFTER the clone's cleanup above (Node skips finally on exit).
  const fatal = json ? reportFatalPlain : reportFatal;
  if (outcome.kind === 'refused') {
    fatal(outcome.refusal);
    process.exit(1);
  }
  if (outcome.kind === 'failed') {
    if (outcome.failure)
      fatal(errorMessage(outcome.failure.err), outcome.failure);
    else fatal('Update failed.');
    process.exit(1);
  }

  const { report } = outcome.planned;
  if (json) {
    emitJson(
      buildUpdateReport({
        status: 'planned',
        force,
        channel,
        currentChannel: channelOf(config),
        source,
        installed: config.skillsVersion,
        latest,
        archetypes: config.archetypes ?? [],
        plan: report,
        compact,
      }),
    );
    return;
  }
  const legacyBackups = legacyBackupNotice(cwd);
  if (legacyBackups) log.info(legacyBackups);
  reportDryRun(report, force, channel, config);
}
