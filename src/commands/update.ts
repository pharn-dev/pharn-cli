import {
  buildUpdatePlan,
  CapabilityRemovalError,
  type PlannedUpdate,
} from '../lib/update-plan.js';
import { deleteCapabilityDir } from '../lib/capability-dir.js';
import { nextConfig, nextRecordStore } from '../lib/update-next.js';
import {
  backupAction,
  defaultChannelNotice,
  noChangeVerdict,
  reportBackup,
  reportCapabilityChanges,
  reportDryRun,
  reportOutcome,
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
import { CliError } from '../lib/cli-error.js';
import {
  errorMessage,
  logErrorPlain,
  reportFatal,
} from '../lib/report-error.js';
import { serializeJsonReport } from '../lib/json-report.js';
import { buildUpdateReport, type UpdateStatus } from '../lib/update-report.js';
import { warnIfOlderCli } from '../lib/older-cli.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import { REPO_URL } from '../lib/constants.js';
import { interactiveAllowed } from '../lib/capability-picker.js';
import { runNodePrereq } from '../steps/node-prereq.js';
import { minCliGate } from '../lib/min-cli-gate.js';
import { PHARN_VERSION } from '../version.js';
import { applyWrites, ApplyError, changedSince } from '../lib/apply-update.js';
import { removalBackupsNow } from '../lib/capability-removal.js';
import { BACKUP_DIR, createBackup } from '../lib/backup.js';
import {
  applyGitignore,
  backupDirIgnored,
  gitignoreLines,
} from '../lib/gitignore.js';
import {
  applyPrettierignore,
  prettierignoreLines,
} from '../lib/prettierignore.js';
import { buildRecords, writeRecords } from '../lib/install-records.js';
import { terminalSafe } from '../lib/terminal-safe.js';
import { fetchRepo, type FetchedRepo } from '../lib/repo.js';
import {
  channelOf,
  resolveSource,
  sourceDescription,
  type InstallSource,
  type RefChoice,
} from '../lib/release.js';
import { versionStatus } from '../lib/version-status.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import { fetchRemoteSkillsVersion } from '../lib/skills-version.js';
import { row } from '../lib/format.js';
import {
  assertConfigFingerprintUnchanged,
  configFingerprint,
  loadArchetypeConfig,
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
//
// A real run takes the project lock FIRST — before the config is read or the
// network touched — and holds it across the plan, the confirm and the writes,
// so it plans once and a second pharn writer is refused meanwhile. A dry run
// takes no lock.
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
  // `--compact` filters the JSON report, and `--json` is the dry run's
  // machine-readable form, so each implies the next (the argv parser applies
  // the same rule).
  const compact = opts.compact ?? false;
  const json = (opts.json ?? false) || compact;
  const dryRun = (opts.dryRun ?? false) || json;
  // Under `--json` NOTHING reaches stdout but the one report: no clack at all.
  if (!json) intro(dryRun ? 'pharn update --dry-run' : 'pharn update');

  // FIRST: the Node floor is environmental, so it wins over every project-state
  // error below and a refusal costs no round-trip.
  runNodePrereq('update', { json });

  const cwd = process.cwd();
  const run = (): Promise<void> =>
    updateProject(cwd, { ...opts, dryRun, json, compact });
  if (dryRun) {
    await run();
    return;
  }
  try {
    await withProjectLock(cwd, 'update', run);
  } catch (err) {
    // Another run holds the lock: a policy refusal, nothing read or fetched.
    if (err instanceof ProjectLockedError) throw CliError.refusal(err.message);
    throw err;
  }
}

// Everything after the Node floor; a real run calls it under the project lock.
async function updateProject(
  cwd: string,
  opts: {
    force?: boolean;
    yes?: boolean;
    ref?: RefChoice;
    dryRun: boolean;
    json: boolean;
    compact: boolean;
  },
): Promise<void> {
  const { dryRun, json, compact } = opts;
  // Taken BEFORE the read: the bytes this run planned against, checked again
  // after the confirm and before the first write.
  const fingerprint = configFingerprint(cwd);
  const config = loadArchetypeConfig(cwd, { json });
  // A dry run (no lock) warns too: it previews what this older CLI would do.
  warnIfOlderCli(config, { json });

  // Non-TTY (CI, a pipe) → hard-fail before any network call, never a prompt
  // into the void: the confirm would cancel on stream end with exit 0, a
  // pipeline that "passes" having updated nothing.
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
    throw CliError.error(
      'pharn update needs to confirm before it writes. Run it in an interactive terminal, or pass --yes to confirm automatically (e.g. `pharn update --yes`).',
    );
  }

  // The channel: `--ref` when passed (and then recorded), else the one this
  // install already follows. An install on `main` is never moved by the default;
  // it is told once per run, here — above the ahead-of-source return and the
  // dry run, below the refusals so a refused run prints only its one error.
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
    fingerprint,
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
  fingerprint: string,
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
    throw CliError.failure(err, { json });
  }

  // `--json` at the ahead-of-source return: the planned report's shape with
  // `plan: null` (an empty dry-run plan, `up-to-date`, uses the same shape).
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
  // outside the user's kept edits are at it. Runs BEFORE the download, so a
  // downgrade is never planned and the refusal costs no tarball.
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

  // There is no same-version shortcut: every run downloads and plans, and "up
  // to date" is a plan that changes nothing (lib/update-next.ts
  // `changesNothing`). The preview branches here, ahead of the confirm and
  // every write; it shares the gates above and the planner, nothing else.
  if (dryRun) {
    await runDryRun(config, cwd, force, channel, source, json, latest, compact);
    return;
  }
  // THE PLAN — fetched and planned ONCE, under the lock and BEFORE the confirm,
  // so the confirm names the capabilities this run adds and drops and the
  // directories it deletes, a failed download, a MIN_CLI refusal or a refused
  // drop exits 1 before the user is asked, and what is confirmed is what is
  // applied. Stated cost: a cancelled confirm has already downloaded the
  // tarball. The clone is removed in the `finally` below.
  const pre = spinner();
  pre.start(`Planning from ${REPO_URL}`);
  let repo: FetchedRepo;
  try {
    repo = await fetchRepo(source);
  } catch (err) {
    pre.stop('Update failed');
    throw CliError.failure(err);
  }

  let outcome: UpdateOutcome;
  try {
    // THE MIN_CLI GATE and the plan, from the clone fetched above. The
    // unknown-capabilities warning is logged here, once.
    const planned = planFromClone(repo, config, cwd, force, channel, {
      spin: pre,
      warn: (m) => log.warn(m),
      json: false,
    });
    if (planned.report.changesNothing) {
      // THE PLAN CHANGES NOTHING (lib/update-next.ts) — "up to date": no
      // header, no confirm, no backup, no rewrite of pharn.config.json (no
      // updatedAt churn). Every note still prints — a kept edit is worth
      // naming on every run.
      outcome = unchangedOutcome(planned);
    } else {
      const confirmed = planned.report;
      printHeader(config, latest, source, force, false);
      // Membership changes in the future tense, as the dry run renders them.
      reportCapabilityChanges(
        confirmed.capabilityChanges,
        confirmed.removals,
        true,
      );
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
        if (isCancel(ok) || ok !== true) throw CliError.cancel();
      }
      outcome = await applyConfirmed(planned, {
        config,
        cwd,
        channel,
        repoDir: repo.dir,
        fingerprint,
      });
    }
  } catch (err) {
    // A drop that cannot be deleted safely is a POLICY refusal: no PHARN_DEBUG
    // hint, the message names the action. A CliError thrown above (a refusal,
    // the cancel) passes through.
    if (err instanceof CapabilityRemovalError)
      throw CliError.refusal(err.message);
    throw CliError.failure(err);
  } finally {
    repo.cleanup();
  }

  // Before the report, whose outro is the run's last line.
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

// The run's header note, printed once a plan changes something (an up-to-date
// run prints none). Chrome: `--json` carries its facts as fields.
function printHeader(
  config: PharnConfig,
  latest: string,
  source: InstallSource,
  force: boolean,
  preview: boolean,
): void {
  note(
    [
      config.skillsVersion === latest
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
      pc.dim(
        '  Re-resolves your archetypes against the latest capabilities and re-copies them.',
      ),
      ...(preview ? [pc.dim('  Preview only — nothing will be written.')] : []),
      pc.dim('  https://github.com/pharn-dev/pharn-oss/blob/main/CHANGELOG.md'),
    ].join('\n'),
  );
}

// The confirm's question; a run that deletes directories says how many.
function confirmMessage(force: boolean, deletes: number): string {
  const base = force
    ? 'Apply this update and overwrite your changes?'
    : 'Apply this update?';
  if (deletes === 0) return base;
  return `${base} It deletes ${deletes} capability director${deletes === 1 ? 'y' : 'ies'}.`;
}

// The most changed files a refusal names before "…and N more".
const MAX_CHANGED_SHOWN = 10;

// The refusal for planned writes whose file changed while the confirm was open.
// Skipping them and going on would leave the rest of the plan's decisions
// (the version bump, the executable-unit hold, the root migration) resting on
// bytes that are no longer there, so the run stops with nothing written; the
// next run plans the edit as `modified` and keeps it.
function changedWhileWaiting(changed: readonly string[]): string {
  const shown = changed
    .slice(0, MAX_CHANGED_SHOWN)
    .map((rel) => `  ${terminalSafe(rel)}`);
  const more = changed.length - shown.length;
  return [
    `${changed.length === 1 ? 'A file' : `${changed.length} files`} changed while \`pharn update\` was waiting for your answer:`,
    ...shown,
    ...(more > 0 ? [`  …and ${more} more`] : []),
    'Nothing was written, and your edit is kept. Run `pharn update` again: it plans the file as changed by you and leaves it alone (or, with --force, backs it up first).',
  ].join('\n');
}

// The writes of the plan the user confirmed, still under the lock taken before
// the plan. First the write-time checks for what may have changed while the
// confirm was open: pharn.config.json (its fingerprint), every file the plan
// writes (its hash at plan time) and every root doc it deletes (its record,
// the proof a delete needs). Any of them refuses with nothing written.
async function applyConfirmed(
  planned: PlannedUpdate,
  ctx: {
    config: PharnConfig;
    cwd: string;
    channel: RefChoice;
    repoDir: string;
    fingerprint: string;
  },
): Promise<UpdateOutcome> {
  const { config, cwd, channel, repoDir, fingerprint } = ctx;
  // Before the spinner, so a refused run never renders a frame.
  assertConfigFingerprintUnchanged(cwd, fingerprint, 'update');
  const changed = changedSince(
    cwd,
    planned.apply.seen,
    planned.report.writes,
    planned.apply.expected,
  );
  if (changed.length > 0) throw CliError.refusal(changedWhileWaiting(changed));
  let s = spinner();
  s.start('Updating');
  // Set the moment a backup exists: everything after createBackup can throw,
  // and the user's bytes have already moved. (`as`: a `let` assigned only in
  // the callback below would otherwise stay narrowed to `null`.)
  let backup = null as Backup | null;
  try {
    const applied = await applyPlannedUpdate(
      planned,
      config,
      cwd,
      repoDir,
      channel,
      (written) => {
        backup = written;
        // Named the moment it exists: everything after it can throw, and this
        // pointer is the user's only route back. The spinner is stopped first
        // (a line logged under clack's spinner is glued to its frame, and in a
        // narrow terminal erased by its stop), then a new one is started.
        s.stop('Backup written');
        reportBackup(written, { aborted: false });
        s = spinner();
        s.start('Writing files');
      },
    );
    s.stop(
      applied.plan.writes.length ? 'Capabilities updated' : 'Nothing to write',
    );
    return applied;
  } catch (err) {
    const refused =
      err instanceof CliError || err instanceof CapabilityRemovalError;
    s.stop(refused ? 'Update refused' : 'Update failed');
    if (refused || backup === null) throw err;
    // Past the backup the originals may already be overwritten, and the
    // success report never runs: name the failure, then the backup, as the
    // last lines of the run.
    reportFatal(errorMessage(err), { err });
    reportBackup(backup, { aborted: true });
    throw CliError.reported();
  }
}

// The write half: back up, write, persist. The decisions were made by
// `buildUpdatePlan` (lib/update-plan.ts), which the dry run shares. `onBackup`
// fires the instant a backup exists, because the caller needs that path on the
// throwing paths too.
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

  // Back up EVERY about-to-be-clobbered file before a single original is
  // touched; a failure here aborts with the tree intact. ONE directory per run:
  // the `--force` casualties (the whole config for a forced models block) and
  // the unproven files of every dropped capability directory, de-duplicated —
  // that set read again now, so a file edited in a dropped directory while
  // the confirm was open is saved too.
  const removalBackups = removalBackupsNow({
    cwd,
    removals: report.removals,
    records,
    command: 'update',
  });
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

  // `seen`: a file changed after applyConfirmed's check (the instant before
  // its own write) is left unwritten and keeps its old record.
  let written: string[];
  let unwritten: string[];
  try {
    ({ written, changed: unwritten } = applyWrites({
      projectRoot: cwd,
      expected,
      writes: plan.writes,
      seen: apply.seen,
    }));
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

  // Records first, then the config: if the config write fails, the records
  // still describe the bytes on disk. Every hash is re-read from the DEST after
  // the copy, so a record cannot disagree with what landed.
  await writeRecords(
    cwd,
    nextRecordStore(apply, {
      written: buildRecords(cwd, written),
      unwritten,
    }),
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
    featuresReadmeRelocation: report.featuresReadmeRelocation,
    hookWiring: report.hookWiring,
    absentUpstream: report.absentUpstream,
    models,
    modelsFloor: report.modelsFloor,
    orphans: report.orphans,
    gitignore,
    prettierignore,
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
    featuresReadmeRelocation: report.featuresReadmeRelocation,
    hookWiring: report.hookWiring,
    absentUpstream: report.absentUpstream,
    models: apply.models,
    modelsFloor: report.modelsFloor,
    orphans: report.orphans,
    gitignore: report.gitignore,
    prettierignore: report.prettierignore,
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

// How a clone phase reports: its spinner, where a warning goes, and whether a
// refusal or failure is printed plain (`--json`).
interface PlanUi {
  spin: Pick<ReturnType<typeof spinner>, 'start' | 'stop'>;
  warn: (message: string) => void;
  json: boolean;
}

// The MIN_CLI gate → plan phase over a clone the CALLER owns; stops `ui.spin`
// either way. Throws a CliError: a MIN_CLI refusal and a planner refusal to
// delete a dropped capability directory are policy refusals; anything else is
// a failure.
function planFromClone(
  repo: FetchedRepo,
  config: PharnConfig,
  cwd: string,
  force: boolean,
  channel: RefChoice,
  ui: PlanUi,
): PlannedUpdate {
  const { spin, warn, json } = ui;
  let planned: PlannedUpdate;
  try {
    const refusal = checkMinCli(repo.dir, warn).refusal;
    if (refusal) throw CliError.refusal(refusal, { json });
    planned = buildUpdatePlan({
      repoDir: repo.dir,
      sha: repo.sha,
      config,
      cwd,
      force,
      channel,
      onUnknownWarning: warn,
    });
  } catch (err) {
    const removal = err instanceof CapabilityRemovalError;
    spin.stop(
      removal || err instanceof CliError ? 'Update refused' : 'Planning failed',
    );
    if (removal) throw CliError.refusal(err.message, { json });
    throw CliError.failure(err, { json });
  }
  spin.stop('Plan ready');
  return planned;
}

// The clone → MIN_CLI gate → plan phase of the text and `--json` dry runs; the
// clone is removed before this returns or throws.
async function fetchAndPlan(
  config: PharnConfig,
  cwd: string,
  force: boolean,
  channel: RefChoice,
  source: InstallSource,
  ui: PlanUi,
): Promise<PlannedUpdate> {
  ui.spin.start(`Planning from ${REPO_URL}`);
  let repo: FetchedRepo;
  try {
    repo = await fetchRepo(source);
  } catch (err) {
    ui.spin.stop('Planning failed');
    throw CliError.failure(err, { json: ui.json });
  }
  try {
    return planFromClone(repo, config, cwd, force, channel, ui);
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
  const planned = await fetchAndPlan(config, cwd, force, channel, source, {
    spin: json ? silentSpinner() : spinner(),
    warn: json
      ? (message) => logErrorPlain(message)
      : (message) => log.warn(message),
    json,
  });

  const { report } = planned;
  if (json) {
    // `up-to-date` (with `plan: null`, like the ahead-of returns) under the
    // text outro's rule: nothing changes, nothing is skipped and the recorded
    // version is the installed one. A plan held back by kept edits changes
    // nothing yet is not current, so it stays `planned` with the plan.
    const empty =
      report.changesNothing && noChangeVerdict(report) === 'Up to date.';
    emitJson(
      buildUpdateReport({
        status: empty ? 'up-to-date' : 'planned',
        force,
        channel,
        currentChannel: channelOf(config),
        source,
        installed: config.skillsVersion,
        latest,
        archetypes: config.archetypes ?? [],
        plan: empty ? null : report,
        compact,
      }),
    );
    return;
  }
  if (!report.changesNothing) printHeader(config, latest, source, force, true);
  reportDryRun(report, force, channel, config);
}
