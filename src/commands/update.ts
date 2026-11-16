import {
  buildUpdatePlan,
  CapabilityRemovalError,
  type PlannedUpdate,
  type UpdatePlanReport,
} from '../lib/update-plan.js';
import { deleteCapabilityDir } from '../lib/capability-dir.js';
import { nextConfig, nextRecordStore } from '../lib/update-next.js';
import {
  backupAction,
  defaultChannelNotice,
  reportBackup,
  reportCapabilityChanges,
  reportDryRun,
  reportOutcome,
  reportRootMigration,
  reportExecutableUnit,
  reportForcedOverwrites,
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
  applyGitignore,
  backupDirIgnored,
  gitignoreLines,
  gitignorePending,
  planGitignore,
} from '../lib/gitignore.js';
import {
  applyPrettierignore,
  planPrettierignore,
  prettierignoreLines,
  prettierignorePending,
} from '../lib/prettierignore.js';
import {
  buildRecords,
  MODELS_RECORD_KEY,
  readRecords,
  recordsBaseline,
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
import { agentSurfaceMissing } from '../lib/agent-surface.js';
import { deleteRootDocs, pendingRootMigration } from '../lib/root-migration.js';
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
// archetypes against the latest capability index and re-copy — DRIFT-SAFELY.
// Every expected file is compared with the hash recorded at install time
// (lib/install-records.ts) and decided per file (lib/update-decision.ts);
// anything not provably pristine is SKIPPED and reported. `--force` overwrites
// the skips after backing each up to `pharn/.backup/<timestamp>/`.
//
// The ONE thing it deletes: the directory of a capability it drops from the
// config, after backing up what pharn cannot prove it wrote. PHARN's commands
// find capabilities by scanning those directories, so a dropped entry's
// directory would keep running and be unreachable by `pharn remove`.
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
  // `--json` is the dry run's machine-readable form only; a direct caller fails
  // closed rather than printing clack chrome into a JSON consumer.
  if (json && !dryRun) {
    reportFatalPlain('--json is only available with --dry-run.');
    process.exit(1);
  }
  // `--compact` filters the JSON report and nothing else.
  if (compact && !json) {
    reportFatalPlain('--compact is only available with --json.');
    process.exit(1);
  }
  // Under `--json` NOTHING reaches stdout but the one report: no clack at all.
  if (!json) intro(dryRun ? 'pharn update --dry-run' : 'pharn update');

  // FIRST: the Node floor is environmental, so it wins over every project-state
  // error below and a refusal costs no round-trip.
  runNodePrereq('update', { json });

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd, { json });

  // Non-TTY (CI, a pipe) → hard-fail before any network call, never a prompt
  // into the void: the confirm would cancel on stream end through
  // cancelAndExit's exit(0), a pipeline that "passes" having updated nothing.
  // The config load runs first so an uninitialized directory gets its
  // actionable error. A dry run never prompts, so it is not gated.
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
  // install already follows. An install on `main` is never moved by the default;
  // it is told once per run, here — above every early return and the dry run,
  // below the refusals so a refused run prints only its one error.
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
  // The proxy notice is emitted ONCE, above both spinners (a log.warn into a
  // live clack spinner frame is overwritten), so it precedes EVERY fetch this
  // command makes: the version check below and the tarball download before the
  // confirm alike — LIMITS.md §3a promises a warning before any fetch. It stays
  // below the config load and the TTY gate, which keep their zero-round-trip
  // errors, and every run reaching it does fetch.
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
    // ONE resolve per run, reused for the tarball download, so the version
    // reported is the version installed. A release names its version in its tag
    // (fetchRepo checks the tree agrees); only `main` reads SKILLS_VERSION.
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

  // `--json` at an early return: the planned report's shape with `plan: null`.
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

  // AHEAD OF THE SOURCE: applying an older upstream would be a downgrade
  // presented as an update, so it is refused unless `--force`. Both channels can
  // be ahead (lib/version-status.ts, the comparison `status` uses too): a
  // `main` install switched to `--ref latest` before its release was cut, or
  // pharn-oss main moving back. A `pendingSkillsVersion` counts too: the files
  // outside the user's kept edits are at it. Runs BEFORE the same-version early
  // return and everything that re-opens it, so none can carry a downgrade in.
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
    // Both are the config's own VERSION_RE-validated strings, sanitized again.
    const held =
      aheadOf === config.skillsVersion
        ? `skills v${terminalSafe(config.skillsVersion)}`
        : `skills v${terminalSafe(config.skillsVersion)}, partly upgraded to v${terminalSafe(aheadOf)}`;
    outro(
      source.kind === 'release'
        ? `Your install (${held}) is ahead of the latest verified release (${source.tag}) — it came from pharn-oss main. Nothing changed. \`pharn update --ref main\` switches back to main; \`pharn update --force\` goes back to ${source.tag}.`
        : `Your install (${held}) is newer than pharn-oss main (v${latest}) — main has moved back to an older version. Nothing changed. \`pharn update --force\` downgrades to v${latest}; otherwise wait for main to move forward again.`,
    );
    return;
  }

  // The version gate. `--force` bypasses it: making the tree match upstream is a
  // legitimate request at the current version, and what `pharn status` advises
  // for locally-changed files. A capability the last run KEPT unparsed
  // (`frozenCapabilities`) re-opens it, or it would never be re-checked.
  const current = config.skillsVersion === latest;
  const recheckFrozen = (config.frozenCapabilities ?? []).length > 0;
  // The records baseline, read ONCE for the local checks below.
  const baselineRecords = recordsBaseline(readRecords(cwd)).records;
  // A `models` block still in the pre-0.7.0 format re-opens the gate: converting
  // it is this CLI's job, so it must reach a current install too. Bounded — the
  // run converts or replaces the block, which closes it (modelsMigrationPending).
  const convertModels = modelsMigrationPending(
    config.models,
    baselineRecords?.[MODELS_RECORD_KEY] ?? null,
  );
  // Switching channel re-opens the gate so the switch is RECORDED at the same
  // version; identical files are no-ops.
  const switchChannel = channel !== channelOf(config);
  // An INCOMPLETE install re-opens the gate: a configured capability dir or a
  // recorded file provably gone (lib/missing-installed.ts). Bounded: the opened
  // run restores what it found and the next run early-returns.
  const missing =
    current && !force
      ? findMissingInstalled(cwd, config, baselineRecords)
      : null;
  // A ≥ 6.64.0 install with no `.claude/agents/pharn-*.md` re-opens it too
  // (lib/agent-surface.ts): older CLIs neither installed nor recorded that
  // surface, so `missing` cannot see it. Bounded like `missing`. Residual: an
  // upstream that stops shipping any agent re-opens every run.
  const agentMissing =
    current && !force && agentSurfaceMissing(cwd, config.skillsVersion);
  // A record-equal root doc whose pharn/ copy was never written re-opens it too
  // (lib/root-migration.ts). User data at the root does not: the run would only
  // hint at it. Bounded: nothing the opened run could not finish counts.
  const rootDoc =
    current && !force
      ? pendingRootMigration(cwd, config, baselineRecords)
      : null;
  // A `.gitignore` that does not cover PHARN's run state and backups re-opens it
  // too (lib/gitignore.ts) — only one the run can write counts, so it is
  // bounded. Residual: a write that keeps failing (EACCES) re-opens every run.
  const gitignoreMissing =
    current && !force && gitignorePending(planGitignore(cwd));
  // A Prettier project whose `.prettierignore` misses recorded paths re-opens it
  // too (lib/prettierignore.ts), read from the usable store (none, no check).
  // Bounded: the opened run covers a superset of the store it writes. Same
  // residual as `.gitignore`.
  const prettierignoreMissing =
    current &&
    !force &&
    baselineRecords !== null &&
    prettierignorePending(
      planPrettierignore(cwd, Object.keys(baselineRecords)),
    );
  if (
    current &&
    !force &&
    !recheckFrozen &&
    !convertModels &&
    !switchChannel &&
    missing === null &&
    !agentMissing &&
    rootDoc === null &&
    !gitignoreMissing &&
    !prettierignoreMissing
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
                // A deleted ORPHAN (lib/orphans.ts) has its record dropped
                // instead of being restored.
                `  ${terminalSafe(missing)} is missing — this run re-applies the install, restoring it if upstream still ships it.`,
              ),
            ]
          : []),
        ...(agentMissing
          ? [
              pc.dim(
                '  .claude/agents/ has no PHARN agent definition — this run re-applies the install, adding it if upstream ships one.',
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
        ...(gitignoreMissing
          ? [
              pc.dim(
                "  .gitignore does not yet keep PHARN's run state and backups out of git — this run re-applies the install and adds them.",
              ),
            ]
          : []),
        ...(prettierignoreMissing
          ? [
              pc.dim(
                '  .prettierignore does not yet cover the files pharn installs and rewrites — this run re-applies the install and adds them.',
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

  // The preview stops here, ahead of the confirm, the lock and every write; it
  // shares the gates above and the planner below, nothing else.
  if (dryRun) {
    await runDryRun(config, cwd, force, channel, source, json, latest, compact);
    return;
  }
  // THE PLAN SNAPSHOT — fetched and planned BEFORE the confirm, so the confirm
  // can name the capabilities this run adds and drops and the directories it
  // deletes, and a failed download, a MIN_CLI refusal or a refused drop exits 1
  // before the user is asked. Stated cost: a cancelled confirm (or a lock
  // refusal) has already downloaded the tarball. The TTY gate still precedes
  // every network call, and the lock is still taken only AFTER the confirm, so
  // no prompt is held under it. The clone is removed in the `finally` below.
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
  // The backup pointer, carried OUT the moment it exists: everything after
  // createBackup can throw, and the user's bytes have already moved. A HOLDER,
  // because TypeScript drops narrowing for a `let` assigned only in a closure.
  const backupRef: { current: Backup | null } = { current: null };
  // The spinner is started INSIDE the lock, so a refused run never renders a
  // frame; `null` is also the case where `withProjectLock` throws before `fn`.
  const spinnerRef: { current: ReturnType<typeof spinner> | null } = {
    current: null,
  };
  // The refusal message, assigned from several closures (hence a holder).
  const refusalRef: { current: string | null } = { current: null };
  // The ERROR OBJECT, not its message: the reporter tells an exception (which
  // earns the PHARN_DEBUG hint) from a curated refusal. Boxed so a thrown
  // nullish value stays distinguishable from "nothing failed".
  let failure: FatalCause | null = null;
  try {
    // THE MIN_CLI GATE and the plan, from the clone fetched above. The
    // unknown-capabilities warning is logged here, once.
    const snapshot = planFromClone(repo, config, cwd, force, channel, (m) =>
      log.warn(m),
    );
    pre.stop(planStopMessage(snapshot));
    if (snapshot.kind === 'refused') refusalRef.current = snapshot.refusal;
    else if (snapshot.kind === 'failed') failure = snapshot.failure;
    else if (snapshot.planned.report.changesNothing) {
      // THE PLAN CHANGES NOTHING (lib/update-next.ts): no confirm, no lock, no
      // backup, no rewrite of pharn.config.json (no updatedAt churn). Every
      // note still prints — a kept edit is worth naming on every run. Skipping
      // the lock is safe because nothing is written; the opposite race (the
      // locked re-plan changes nothing) is applyPlannedUpdate's own check.
      outcome = unchangedOutcome(snapshot.planned);
    } else {
      const confirmed = snapshot.planned.report;
      // Membership changes in the future tense, as the dry run renders them.
      reportCapabilityChanges(
        confirmed.capabilityChanges,
        confirmed.removals,
        true,
      );
      // Root docs it would delete and hints about user data it leaves alone.
      reportRootMigration(confirmed.rootMigration, null);
      // The executable unit it would hold, so a user can revert edits first.
      reportExecutableUnit(confirmed.executableUnit, true);
      // What "overwrite your changes" means, file by file.
      if (force) reportForcedOverwrites(confirmed);
      const deletes = confirmed.removals.filter((r) => r.present).length;
      // `--yes` skips THE CONFIRM AND NOTHING ELSE: the notes have printed and
      // every decision below is byte-identical either way. Skipping the call
      // makes "the prompt is never rendered" true by construction. A run that
      // deletes a directory defaults to No and says how many.
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
    // A held lock, or a drop the PLANNER refuses to delete safely, is a POLICY
    // refusal: no PHARN_DEBUG hint, the message names the action. `?.` because
    // a lock refusal is thrown before `fn` runs, with no spinner to stop.
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
    // No `failure` means the defensive `!outcome` branch, so no hint is offered.
    if (failure) reportFatal(errorMessage(failure.err), failure);
    else reportFatal('Update failed.');
    // Past the backup the originals may already be overwritten, and the success
    // report never runs, so this is the last chance to name the backup.
    if (backupRef.current) {
      reportBackup(backupRef.current, { aborted: true });
    }
    process.exit(1);
  }

  // Before the report, whose outro is the run's last line.
  const legacyBackups = legacyBackupNotice(cwd);
  if (legacyBackups) log.info(legacyBackups);
  const gitignore =
    outcome.gitignore === undefined ? null : gitignoreLines(outcome.gitignore);
  if (gitignore?.warn) log.warn(gitignore.text);
  else if (gitignore !== null) log.info(gitignore.text);
  const prettierignore =
    outcome.prettierignore === undefined
      ? null
      : prettierignoreLines(outcome.prettierignore);
  if (prettierignore?.warn) log.warn(prettierignore.text);
  else if (prettierignore !== null) log.info(prettierignore.text);
  reportOutcome(outcome, force);
}

// The confirm's question; a run that deletes directories says how many.
function confirmMessage(force: boolean, deletes: number): string {
  const base = force
    ? 'Apply this update and overwrite your changes?'
    : 'Apply this update?';
  if (deletes === 0) return base;
  return `${base} It deletes ${deletes} capability director${deletes === 1 ? 'y' : 'ies'}.`;
}

// What the confirm named, as comparable keys: every membership change and
// every directory the run deletes (disk-dependent, so guarded too).
function membershipKeys(r: UpdatePlanReport): string[] {
  return [
    ...r.capabilityChanges.map(
      (c) => `${c.reason} ${c.cap.role}:${c.cap.name}`,
    ),
    ...r.removals.filter((x) => x.present).map((x) => `delete ${x.dir}/`),
    // What the root migration deletes, named before the confirm.
    ...(r.rootMigration?.docs ?? [])
      .filter((d) => d.action === 'delete')
      .map((d) => `delete ${d.rel}`),
  ];
}

// THE MEMBERSHIP GUARD: the plan made under the lock must change exactly what
// the confirm showed. The change list is equal by construction (same config,
// same clone); the deleted-directory set can move with the disk. An equality
// test, so "what you confirmed is what is applied" rests on no argument.
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

// Everything under the project lock: re-plan, membership guard, writes. Returns
// null after setting `refusalRef` when the guard refuses.
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
  // THE SINGLE-WRITER LOCK — taken AFTER the confirm: holding it across an
  // unanswered prompt would block every other pharn run for as long as a human
  // takes. What runs under it is bounded local work. (`init` cannot have this
  // shape: both its prompts sit between its fetch and its install.)
  return withProjectLock(cwd, 'update', async () => {
    // The config was read before the lock; refuse if another run rewrote it.
    assertConfigUnchanged(cwd, config, 'update');
    const s2 = spinner();
    spinnerRef.current = s2;
    s2.start('Updating');
    // AUTHORITATIVE: re-decided from disk under the lock; the snapshot was a
    // preview. No warning callback: the snapshot already logged it.
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
        // Named the moment it exists: everything after it can throw, and this
        // pointer is the user's only route back. The spinner is stopped first
        // (a line logged under clack's spinner is glued to its frame, and in a
        // narrow terminal erased by its stop), then a new one is started.
        s2.stop('Backup written');
        reportBackup(backup, { aborted: false });
        const s3 = spinner();
        spinnerRef.current = s3;
        s3.start('Writing files');
      },
    );
    spinnerRef.current.stop(
      applied.unchanged
        ? 'Nothing to change'
        : applied.plan.writes.length
          ? 'Capabilities updated'
          : 'Nothing to write',
    );
    return applied;
  });
}

// The write half: back up, write, persist. The decisions were made by
// `buildUpdatePlan` (lib/update-plan.ts), which the dry run shares. Never calls
// process.exit. `onBackup` fires the instant a backup exists, because the
// caller needs that path on the throwing paths too.
async function applyPlannedUpdate(
  planned: PlannedUpdate,
  config: PharnConfig,
  cwd: string,
  repoDir: string,
  channel: RefChoice,
  onBackup: (backup: Backup) => void,
): Promise<UpdateOutcome> {
  const { report, apply } = planned;
  const { expected, records, plan, models } = apply;

  // Checked again here: this plan is the authoritative one made under the lock.
  if (report.changesNothing) return unchangedOutcome(planned);

  // Back up EVERY about-to-be-clobbered file before a single original is
  // touched; a failure here aborts with the tree intact. ONE directory per run:
  // the `--force` casualties (the whole config for a forced models block) and
  // the unproven files of every dropped capability directory, de-duplicated.
  const removalBackups = report.removals.flatMap((r) => r.backups);
  const backupRels = [...new Set([...report.backups, ...removalBackups])];
  // "removing" whenever a directory will be deleted, even with nothing to copy,
  // so an aborted run never under-reports what may already be gone.
  const deletes = report.removals.some((r) => r.present);
  const backup: Backup | null =
    backupRels.length > 0
      ? {
          dir: createBackup(cwd, backupRels),
          count: backupRels.length,
          action: backupAction(report.backups.length > 0, deletes),
          // This run may add `pharn/.backup/` to `.gitignore` below.
          gitignored: backupDirIgnored(cwd, report.gitignore),
        }
      : null;
  if (backup) onBackup(backup);

  // Dropped capability directories are deleted BEFORE the writes: a delete
  // failing after them would strand pharn-written files with no records (only an
  // ApplyError carries what was written), read as edits by the next run. Failing
  // here, the config still lists the entries, so the next run drops them again.
  // Their records need no prune: `plan.nextRecords` is manifest-keyed.
  for (const removal of report.removals) {
    if (removal.present)
      deleteCapabilityDir(cwd, apply.removalPaths, removal.cap);
  }

  let written: string[];
  try {
    written = applyWrites({ projectRoot: cwd, expected, writes: plan.writes });
  } catch (err) {
    // Files pharn just wrote MUST be recorded even on a partial failure, or the
    // next run reads them as the user's edits. Stamped with the config's
    // UNCHANGED values, since the config is not written. Only an existing store
    // is extended: minting one from a few paths would turn the rest of the
    // install from `unverifiable` into a false `unrecorded`.
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

  // The old root docs: deleted only now that the pharn/ copy has landed, and
  // only when still record-equal. A failure keeps the file and its record.
  const migration = report.rootMigration;
  const docResult =
    migration === null
      ? { deleted: [], kept: [] }
      : deleteRootDocs(cwd, repoDir, migration.docs);
  const retired = new Set(docResult.deleted);

  // Records first, then the config: if the config write fails, the records
  // still describe the bytes on disk. Every hash is re-read from the DEST after
  // the copy, so a record cannot disagree with what landed.
  await writeRecords(
    cwd,
    nextRecordStore(apply, { written: buildRecords(cwd, written), retired }),
  );
  await writePharnConfig(
    cwd,
    nextConfig(config, report, apply, channel, {
      pharnVersion: PHARN_VERSION,
      updatedAt: new Date().toISOString(),
    }),
  );

  // Keep PHARN's run state and backups out of git: re-planned under the lock,
  // after every pharn-owned write. A failure is reported, never thrown.
  const gitignore = await applyGitignore(cwd);
  // The same for `.prettierignore`, over the planner's superset of the records.
  const prettierignore = await applyPrettierignore(
    cwd,
    apply.prettierignorePaths,
  );

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
    gitignore,
    prettierignore,
    rootMigration: migration,
    rootMigrationResult: migration === null ? null : docResult,
  };
}

// The outcome of a plan that changes nothing: what the report prints, with
// nothing written. The ignore-file plans ride along so a REFUSED file is still
// warned about.
function unchangedOutcome(planned: PlannedUpdate): UpdateOutcome {
  const { report, apply } = planned;
  return {
    installedVersion: report.installedVersion,
    recordedVersion: report.recordedVersion,
    capCount: report.capCount,
    capabilityChanges: report.capabilityChanges,
    removals: report.removals,
    plan: apply.plan,
    backup: null,
    recordsNote: report.recordsNote,
    versionWithheld: report.versionWithheld,
    abandonedLayout: report.abandonedLayout,
    featuresReadmeRelocation: report.featuresReadmeRelocation,
    hookWiring: report.hookWiring,
    absentUpstream: report.absentUpstream,
    models: apply.models,
    modelsFloor: report.modelsFloor,
    orphans: report.orphans,
    gitignore: report.gitignore,
    prettierignore: report.prettierignore,
    rootMigration: report.rootMigration,
    // So the note still prints its hints about root user data.
    rootMigrationResult:
      report.rootMigration === null ? null : { deleted: [], kept: [] },
    unchanged: true,
  };
}

// The MIN_CLI gate — upstream's lever to refuse a stale CLI cleanly — shared by
// the real run and the preview. Returns the refusal (or null); a warning goes
// to `warn` and does not refuse.
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

// The MIN_CLI gate → plan phase over a clone the CALLER owns. Never throws: a
// planner refusal to delete a dropped capability directory is a policy
// refusal; anything else is a failure.
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

// The clone → MIN_CLI gate → plan phase of the text and `--json` dry runs; the
// clone is removed before this returns, and every exit is the caller's.
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

// `--dry-run`: fetch, gate, plan, print, exit 0 — and write NOTHING: every
// project write lives in applyPlannedUpdate, which this never calls. `--json`
// swaps the sinks, not the logic.
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
