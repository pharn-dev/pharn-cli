import { hookWiringLines, type HookWiringDiff } from '../lib/hook-wiring.js';
import { absentSurfaceLines } from '../lib/absent-surfaces.js';
import type { AbsentSurface } from '../lib/install-manifest.js';
import {
  buildUpdatePlan,
  CapabilityRemovalError,
  type CapabilityRemoval,
  type PlannedUpdate,
  type UpdatePlanReport,
} from '../lib/update-plan.js';
import { deleteCapabilityDir } from '../lib/capability-dir.js';
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
import type { CapabilityChange } from '../lib/merge-capabilities.js';
import { applyWrites, ApplyError } from '../lib/apply-update.js';
import { createBackup, BACKUP_DIR } from '../lib/backup.js';
import {
  buildRecords,
  MODELS_RECORD_KEY,
  readRecords,
  recordsBaseline,
  RECORDS_FILE,
  writeRecords,
} from '../lib/install-records.js';
import { modelsLabelLines } from '../lib/model-config-format.js';
import {
  modelsMigrationPending,
  type ModelsUpdate,
} from '../lib/models-update.js';
import { terminalSafe } from '../lib/terminal-safe.js';
import { orphanNoteLines, type Orphan } from '../lib/orphans.js';
import type { UpdateLabel, UpdatePlan } from '../lib/update-decision.js';
import { fetchRepo } from '../lib/repo.js';
import {
  channelOf,
  resolveSource,
  sourceDescription,
  type InstallSource,
  type RefChoice,
} from '../lib/release.js';
import { findMissingInstalled } from '../lib/missing-installed.js';
import { versionStatus } from '../lib/version-status.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import { fetchRemoteSkillsVersion } from '../lib/skills-version.js';
import { row } from '../lib/format.js';
import {
  assertConfigUnchanged,
  CONFIG_FILENAME,
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type { Layout, PharnConfig } from '../types.js';

// `pharn update` refreshes an archetype install: re-resolve the recorded
// archetypes against the latest capability index and re-copy — but DRIFT-SAFELY.
// It compares every expected file against the per-file hashes recorded at install
// time (lib/install-records.ts) and decides per file (lib/update-decision.ts);
// anything it cannot prove pristine is SKIPPED and reported, never overwritten.
// `--force` overwrites the skip buckets after copying each file to
// `.pharn-backup/<timestamp>/`.
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
  // install already follows — `ref: "latest"`, or `main`'s tip by default.
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

// Where the `--force` copies went, and how many there are — the two facts the
// report needs. One shape, so the count is never re-derived at a second site and
// cannot drift from the directory it describes.
interface Backup {
  dir: string;
  count: number;
  // What the copies were made ahead of — the notice says it, and the abort
  // line says what may already be gone.
  action: BackupAction;
}

type BackupAction = 'overwriting' | 'removing' | 'overwriting and removing';

// The outcome of the fetch+apply phase, assembled inside the try so cleanup can
// run in the finally and every process.exit happens AFTER it (Node skips finally
// on exit) — the discipline this command has always kept.
interface UpdateOutcome {
  // The version upstream ships (what the clone holds).
  installedVersion: string;
  // The version actually written to pharn.config.json — the same as
  // installedVersion for a complete run, the previous one when skips withheld it.
  recordedVersion: string;
  capCount: number;
  // Every difference between the previous and next `capabilities` membership.
  // Empty ⇒ nothing changed ⇒ nothing is printed about capabilities at all.
  capabilityChanges: CapabilityChange[];
  // The directories deleted for the capabilities this run dropped.
  removals: CapabilityRemoval[];
  plan: UpdatePlan;
  backup: Backup | null;
  recordsNote: string | null;
  versionWithheld: boolean;
  abandonedLayout: Layout | null;
  featuresReadmeRelocation: boolean;
  // Upstream hooks the project's settings.json does not wire. Reported only —
  // update never writes settings.json. Absent on paths that never saw a clone.
  hookWiring?: HookWiringDiff;
  // The declared product surfaces the clone ships no file for (NOT SHIPPED).
  // Absent on paths that never saw a clone.
  absentUpstream?: AbsentSurface[];
  // What happened to the `models` block (lib/models-update.ts), and the floor
  // dir its checker is installed under, for the MODELS note.
  models: ModelsUpdate;
  modelsFloor: string;
  // Recorded files upstream no longer ships, still on disk (lib/orphans.ts).
  orphans: Orphan[];
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
  // SKILLS_VERSION read immediately below and the tarball download inside the
  // lock alike. It used to sit inside the lock closure, above fetchRepo,
  // justified by "a refused run performs no fetch". That premise is false HERE:
  // the version check below has already gone over the wire by the time the lock
  // is even attempted — which the lock's own comment further down states in as
  // many words. `add` carries the same sentence and there it holds, because
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
    // ONE resolve per run, reused for the tarball inside the lock below, so the
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
    const held =
      aheadOf === config.skillsVersion
        ? `skills v${config.skillsVersion}`
        : `skills v${config.skillsVersion}, every file you did not edit at v${aheadOf}`;
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
  // The stamped records baseline, read ONCE for the two local checks below.
  const baselineRecords = recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  }).records;
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
  if (
    current &&
    !force &&
    !recheckFrozen &&
    !convertModels &&
    !switchChannel &&
    missing === null
  ) {
    if (json) {
      emitEarlyReturn('up-to-date');
      return;
    }
    outro(`Already up to date (skills v${config.skillsVersion}).`);
    return;
  }

  // The preview's header note is chrome; `--json` carries its facts as fields.
  if (!json)
    note(
      [
        current
          ? row('Skills version', `v${config.skillsVersion} (re-applying)`)
          : row('Skills version', `v${config.skillsVersion} → v${latest}`),
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
        pc.dim(
          '  Re-resolves your archetypes against the latest capabilities and re-copies them.',
        ),
        // The real run's confirm comes before the fetch, so it cannot name the
        // capabilities a drop deletes; the dry run can, and this says so.
        ...(dryRun
          ? []
          : [
              pc.dim(
                '  Capabilities no longer selected are removed: their directories are deleted',
              ),
              pc.dim(
                '  (files pharn did not write are backed up first). `pharn update --dry-run` lists them.',
              ),
            ]),
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
  // `--yes` skips THE CONFIRM AND NOTHING ELSE. The note above has already
  // printed (a non-interactive log deserves the same context a terminal gets),
  // and every decision below — the plan, the drift-safe skips, the backups, the
  // withheld version bump, the exit codes — is byte-identical either way. It
  // means "don't ask", not "non-interactive mode": it works in a terminal too.
  // Skipping the call entirely (rather than short-circuiting its result) is what
  // makes "the prompt is never rendered" true by construction.
  if (!yes) {
    const ok = await confirm({
      message: force
        ? 'Re-fetch capabilities and overwrite your changes?'
        : 'Re-fetch capabilities at the latest version?',
      initialValue: true,
    });
    if (isCancel(ok) || ok !== true) cancelAndExit();
  }

  let outcome: UpdateOutcome | null = null;
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
  // The refusal message. A HOLDER too, because it is now assigned from BOTH the
  // MIN_CLI gate inside the locked closure and the catch below — a bare `let`
  // written only inside a closure is the narrowing problem `backupRef` documents.
  const refusalRef: { current: string | null } = { current: null };
  // The ERROR OBJECT, not its message — the reporter needs it to tell an
  // exception (which earns the PHARN_DEBUG affordance) from a curated refusal.
  // Boxed so a thrown nullish value stays distinguishable from "nothing failed"
  // across the deferred, post-cleanup exit below, and so the same box can be
  // handed straight to reportFatal.
  let failure: FatalCause | null = null;
  try {
    // THE SINGLE-WRITER LOCK — taken AFTER the confirm and BEFORE the fetch.
    //
    // BEFORE THE FETCH, because a run that is going to be refused should not pay
    // for a ~2.5 MB tarball first — the principle the TTY gate above already
    // states. The claim here is deliberately narrower than that one: the
    // `fetchRemoteSkillsVersion` check further up has already run, so a refused
    // `update` still makes ONE small guarded GET. What moving the lock closes is
    // THE TARBALL DOWNLOAD, not every round-trip; saying "zero round-trips" here
    // would be false.
    //
    // AFTER THE CONFIRM, and that half is not negotiable. The confirm is this
    // command's last human step, and holding the lock across an unanswered
    // prompt would block every other pharn run in the project for as long as a
    // human takes to answer — an UNBOUNDED hold, where the fetch below is
    // bounded BY CONSTRUCTION (repo.ts caps the SHA resolve at 8s and the
    // download at 60s; the extraction is capped by entry/byte limits rather than
    // by a clock). Bounded work may go under the lock; unbounded work may not.
    // `init` cannot be given this shape at all — BOTH of its prompts sit between
    // its fetch and its install — which is why init's lock deliberately stays
    // where it is (see the note in src/commands/init.ts).
    //
    // THE FETCH LIVES INSIDE `fn`, not before it, so a fetch failure unwinds
    // through withProjectLock's `finally` and RELEASES. It used to end in
    // process.exit(1), which skips every finally — so a lock acquired before it
    // would have been stranded in the project root on every offline /
    // rate-limited / DNS failure, the most common failure this command has.
    outcome = await withProjectLock(cwd, 'update', async () => {
      // First, before the spinner: the config this run planned (and confirmed)
      // against was read before the lock; refuse if another run rewrote it.
      assertConfigUnchanged(cwd, config, 'update');
      const s2 = spinner();
      spinnerRef.current = s2;
      s2.start(`Updating from ${REPO_URL}`);
      // Assigned ONLY on success, and the cleanup that consumes it is scoped to
      // the try below. The previous shape declared `repo` outside its try so an
      // outer `finally` could clean it up — which, with the fetch now inside the
      // lock, would dereference `undefined` on a failed fetch and mask the real
      // "could not reach" message with a TypeError.
      const repo = await fetchRepo(source);
      try {
        // THE MIN_CLI GATE — upstream's lever to refuse a stale CLI CLEANLY
        // instead of breaking somewhere downstream. Inside this try so the
        // clone's cleanup still runs before any exit, and BEFORE applyUpdate so
        // a refusal writes nothing at all. It can only fire after the confirm,
        // because the file it reads lives in the clone — named in GRILL.md; the
        // refusal still costs zero writes.
        const gate = checkMinCli(repo.dir);
        if (gate.refusal) {
          s2.stop('Update refused');
          refusalRef.current = gate.refusal;
          return null;
        }
        const planned = buildUpdatePlan({
          repoDir: repo.dir,
          sha: repo.sha,
          config,
          cwd,
          force,
          channel,
          // Logged the moment the index is parsed, as it always was.
          onUnknownWarning: (warning) => log.warn(warning),
        });
        const applied = await applyPlannedUpdate(
          planned,
          config,
          cwd,
          channel,
          (backup) => {
            backupRef.current = backup;
            // Named the moment it exists (as `add` does): everything after the
            // backup can throw or be interrupted, and this pointer is the
            // user's only route back to the pre-overwrite bytes.
            //
            // With NO spinner running: clack's spinner owns the line it
            // animates, so a line logged under it is glued to its frame, and
            // below ~50 columns its `stop` erases that line. So the spinner is
            // stopped first — with a neutral phrase, the notice says the rest —
            // and a new one is started for the writes (`spinnerRef` follows it,
            // so every failure path stops the one actually running).
            s2.stop('Backup written');
            printBackupNotice(backup, { aborted: false });
            const s3 = spinner();
            spinnerRef.current = s3;
            s3.start('Writing files');
          },
        );
        spinnerRef.current.stop(
          applied.plan.writes.length
            ? 'Capabilities updated'
            : 'Nothing to write',
        );
        return applied;
      } finally {
        repo.cleanup();
      }
    });
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
  }
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
      printBackupNotice(backupRef.current, { aborted: true });
    }
    process.exit(1);
  }

  reportOutcome(outcome, force);
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
  const removalBackups = report.removals.flatMap((r) => r.backups);
  const backupRels = [...new Set([...report.backups, ...removalBackups])];
  // "removing" whenever a directory will be deleted — even one whose files are
  // all pharn's own and need no copy — so an aborted run never under-reports
  // what may already be gone.
  const deletes = report.removals.some((r) => r.present);
  const backup: Backup | null =
    backupRels.length > 0
      ? {
          dir: createBackup(cwd, backupRels),
          count: backupRels.length,
          action: backupAction(report.backups.length > 0, deletes),
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

  // Records first, then the config: if the config write fails, the records still
  // describe the bytes on disk, and the stamp mismatch makes them safely ignored
  // rather than wrongly authoritative.
  //
  // Every hash is re-read from the DEST after the copy — never carried over from
  // the clone source. The two are equal whenever copyFileSync behaved, which is
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
      ...apply.orphanRecords,
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
  };
}

// The skip buckets `--force` actually overrides, mirroring `skipOrForce` in
// lib/update-decision.ts. Membership, not a negation of one label (P5): a bucket
// outside this set is one `--force` cannot clear, so an unrecognised label fails
// in the safe direction — no advice at all — rather than prescribing a command
// that cannot work.
//
// It names the same three labels `skipHeading` switches on, so the heading and
// the advice agree about every label today. That agreement is convention, not a
// check (there is no shared enum and no test pinning the two lists): a new skip
// label has to be added HERE as well as there, or the heading will say UNREADABLE
// while the advice offers `--force`.
const FORCEABLE_SKIPS = new Set<UpdateLabel | 'unreadable'>([
  'modified',
  'unrecorded',
  'unverifiable',
]);

// The report. Skips are exit 0 — a skip is a decision the user asked for, not a
// failure — but they are never silent: each bucket is listed with the one action
// that resolves it.
function reportOutcome(outcome: UpdateOutcome, force: boolean): void {
  const { plan, recordsNote, versionWithheld } = outcome;
  const { counts } = plan;

  if (recordsNote) log.warn(`⚠ ${recordsNote}`);

  reportCapabilityChanges(outcome.capabilityChanges, outcome.removals, false);
  reportModels(outcome.models, outcome.modelsFloor, outcome.backup);

  const hookLines = outcome.hookWiring
    ? hookWiringLines(outcome.hookWiring)
    : null;
  if (hookLines) note(hookLines.join('\n'), 'HOOKS');
  reportAbsentSurfaces(outcome.absentUpstream ?? []);

  const forceable = reportSkipped(plan.skipped, false);
  reportOrphans(outcome.orphans);

  // The backup pointer was printed when the backup was created (onBackup).

  reportLayoutWarnings(
    outcome.abandonedLayout,
    outcome.featuresReadmeRelocation,
    false,
  );

  if (versionWithheld) {
    // `--force` is offered only while a bucket it can actually clear is still
    // skipped. When every remaining skip is unreadable it finishes nothing, and
    // naming it here is the same dead prescription as above.
    log.warn(
      `${counts.skipped} file(s) were skipped, so your install is still recorded as skills v${outcome.recordedVersion} (upstream is v${outcome.installedVersion}) — resolve them${forceable ? ', or re-run with --force,' : ''} to finish the upgrade.`,
    );
  }

  const summary =
    `updated ${counts.updated} · restored ${counts.restored} · ` +
    `unchanged ${counts.ok}` +
    (force ? ` · forced ${counts.forced}` : '') +
    ` · skipped ${counts.skipped}`;

  outro(
    `${pc.green('✔')} ${summary} ${pc.dim(`(${outcome.capCount} capabilit${outcome.capCount === 1 ? 'y' : 'ies'}, skills v${outcome.recordedVersion})`)}`,
  );
}

// The NOT SHIPPED note, shared by the real report and the preview: every
// declared product surface the clone ships no file for (lib/absent-surfaces.ts
// words it, as `init` does). Report only — it withholds nothing, since no file
// on disk was left behind by it. Nothing absent → no note.
function reportAbsentSurfaces(absent: readonly AbsentSurface[]): void {
  const lines = absentSurfaceLines(absent);
  if (lines) note(lines.join('\n'), 'NOT SHIPPED');
}

// The SKIPPED note, shared by the real report and the preview (`preview` only
// changes the tense of the one line of advice). Returns whether any skipped
// bucket is one `--force` can clear — the caller's withheld-version line needs it.
function reportSkipped(
  skipped: UpdatePlan['skipped'],
  preview: boolean,
): boolean {
  // An unhashable destination is skipped BEFORE the decision table and `force`
  // is not an input to that branch (lib/update-decision.ts) — deliberately, since
  // there is no hash to compare and guessing one is what P5 forbids. So the
  // report must not prescribe `--force` for it: a run whose skips are all
  // unreadable would otherwise be told to re-run a command that produces a
  // byte-identical outcome, forever, while the withheld version bump keeps
  // `pharn status --strict` red with nothing that clears it.
  const forceable = skipped.some((g) => FORCEABLE_SKIPS.has(g.label));
  const hasUnreadable = skipped.some((g) => !FORCEABLE_SKIPS.has(g.label));

  if (skipped.length > 0) {
    const lines: string[] = [];
    for (const group of skipped) {
      lines.push(`  ${skipHeading(group.label)}`);
      for (const rel of group.rels) lines.push(`  ${rel}`);
      lines.push('');
    }
    if (forceable) {
      lines.push(
        pc.dim(
          preview
            ? `  Run \`pharn update --force\` to overwrite (skipped files would be backed up to ${BACKUP_DIR}/ first).`
            : `  Re-run with --force to overwrite (skipped files are backed up to ${BACKUP_DIR}/ first).`,
        ),
      );
    }
    if (hasUnreadable) {
      // SKIP_ORDER puts `unreadable` last, so this sits under the group it names.
      // The closing two lines are `pharn status`'s drift report verbatim
      // (src/commands/status.ts): same situation, same sentence, so the two
      // commands read as one product. The bucket is named rather than "these"
      // because the forceable advice above can sit between it and its group.
      lines.push(
        pc.dim('  --force cannot clear the UNREADABLE paths above.'),
        pc.dim('  Inspect each path by hand — a directory, a symlink, or an'),
        pc.dim('  unreadable file sits where pharn expects a regular file.'),
      );
    }
    note(lines.join('\n'), 'SKIPPED');
  }
  return forceable;
}

// The ORPHANED note, shared by the real report and the preview: the same
// words in both, since an orphan is a fact about the project, not about what
// this run writes. Nothing is printed when there is none.
function reportOrphans(orphans: readonly Orphan[]): void {
  const lines = orphanNoteLines(orphans);
  if (lines) note(lines.join('\n'), 'ORPHANED');
}

// Both directions are named. `abandonedLayout` has always been computed
// direction-agnostically, but only 'flat' used to be rendered — so a pharn→flat
// migration abandoned the whole pharn/ tree in silence, which is strictly more
// than the other direction leaves behind. The second test is `=== 'pharn'`
// rather than a bare `else` so that a third Layout member would print nothing
// instead of this message (P5: membership, not a fallback that guesses).
function reportLayoutWarnings(
  abandonedLayout: Layout | null,
  featuresReadmeRelocation: boolean,
  preview: boolean,
): void {
  if (abandonedLayout === 'flat') {
    log.warn(
      preview
        ? 'Your install would move to the pharn/ layout. The old top-level copies would be left behind and no longer managed by pharn — you would delete them by hand.'
        : 'Your install moved to the pharn/ layout. The old top-level copies are left behind and are no longer managed by pharn — delete them by hand.',
    );
  } else if (abandonedLayout === 'pharn') {
    log.warn(
      preview
        ? 'Your install would move to the flat layout. The old pharn/ tree (contracts, floor scripts, docs, and capabilities) would be left behind and no longer managed by pharn — you would delete it by hand.'
        : 'Your install moved to the flat layout. The old pharn/ tree (contracts, floor scripts, docs, and capabilities) is left behind and is no longer managed by pharn — delete it by hand.',
    );
  }

  if (featuresReadmeRelocation) {
    log.warn(
      preview
        ? 'Your install would keep the product-loop boundary contract at pharn/features/README.md. A copy at the project root (features/README.md) would be left behind and no longer managed by pharn — you would delete it by hand.'
        : 'Your install now keeps the product-loop boundary contract at pharn/features/README.md. A copy at the project root (features/README.md) is left behind and is no longer managed by pharn — delete it by hand.',
    );
  }
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

// What a dry run's clone phase produced — exactly one of the three.
type PlanOutcome =
  | { kind: 'planned'; planned: PlannedUpdate }
  | { kind: 'refused'; refusal: string }
  | { kind: 'failed'; failure: FatalCause | null };

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
  let outcome: PlanOutcome;
  try {
    const repo = await fetchRepo(source);
    try {
      const refusal = checkMinCli(repo.dir, warn).refusal;
      if (refusal) {
        spin.stop('Update refused');
        outcome = { kind: 'refused', refusal };
      } else {
        const planned = buildUpdatePlan({
          repoDir: repo.dir,
          sha: repo.sha,
          config,
          cwd,
          force,
          channel,
          onUnknownWarning: warn,
        });
        spin.stop('Plan ready');
        outcome = { kind: 'planned', planned };
      }
    } finally {
      repo.cleanup();
    }
  } catch (err) {
    // The planner's refusal to delete a dropped capability's directory is a
    // policy refusal, exactly as the real run reports it.
    if (err instanceof CapabilityRemovalError) {
      spin.stop('Update refused');
      outcome = { kind: 'refused', refusal: err.message };
    } else {
      spin.stop('Planning failed');
      outcome = { kind: 'failed', failure: { err } };
    }
  }
  return outcome;
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
  reportDryRun(report, force, channel, config);
}

// The preview report. It reuses the real run's renderers for the membership,
// models, hooks and skip notes, in the same order, and adds the PLAN note —
// the per-file verdicts the real run acts on without listing.
function reportDryRun(
  r: UpdatePlanReport,
  force: boolean,
  channel: RefChoice,
  config: PharnConfig,
): void {
  if (r.recordsNote) log.warn(`⚠ ${r.recordsNote}`);

  const writes = r.files.filter((f) => f.action === 'write');
  const sections: { heading: string; rels: string[] }[] = [
    {
      heading: 'WOULD WRITE — restored (missing from your project)',
      rels: writes.filter((f) => f.label === 'restored').map((f) => f.rel),
    },
    {
      heading: 'WOULD WRITE — updated (still exactly as pharn wrote them)',
      rels: writes.filter((f) => f.label === 'updated').map((f) => f.rel),
    },
    ...(['modified', 'unrecorded', 'unverifiable'] as const).map((label) => ({
      heading: `WOULD OVERWRITE (--force) — ${label}`,
      rels: writes
        .filter((f) => f.forced && f.label === label)
        .map((f) => f.rel),
    })),
  ];
  const deletes = r.removals.filter((removal) => removal.present);
  sections.push({
    heading:
      'WOULD DELETE — directories of capabilities dropped from your config',
    rels: deletes.map((removal) => `${removal.dir}/`),
  });
  // The one backup directory a real run makes holds both sets.
  const backupRels = [
    ...new Set([...r.backups, ...r.removals.flatMap((x) => x.backups)]),
  ];
  const lines: string[] = [];
  for (const { heading, rels } of sections) {
    if (rels.length === 0) continue;
    lines.push(`  ${heading}`);
    for (const rel of rels) lines.push(`  ${rel}`);
    lines.push('');
  }
  if (backupRels.length > 0) {
    lines.push(
      `  WOULD BACK UP ${backupRels.length} file(s) to ${BACKUP_DIR}/<timestamp>/ first`,
    );
    for (const rel of backupRels) lines.push(`  ${rel}`);
    lines.push('');
  }
  if (writes.length === 0 && deletes.length === 0)
    lines.push('  Nothing would be written.', '');
  lines.push(
    `  UNCHANGED ${r.counts.ok} file(s) · SKIPPED ${r.counts.skipped} file(s)`,
  );
  if (channel !== channelOf(config)) {
    lines.push('', `  Would record channel: ${channel}`);
  }
  note(lines.join('\n'), 'PLAN');

  reportCapabilityChanges(r.capabilityChanges, r.removals, true);
  reportModels(r.models, r.modelsFloor, null, true);

  const hookLines = hookWiringLines(r.hookWiring);
  if (hookLines) note(hookLines.join('\n'), 'HOOKS');
  reportAbsentSurfaces(r.absentUpstream);

  const forceable = reportSkipped(r.skipped, true);
  reportOrphans(r.orphans);
  reportLayoutWarnings(r.abandonedLayout, r.featuresReadmeRelocation, true);

  if (r.versionWithheld) {
    log.warn(
      `${r.counts.skipped} file(s) would be skipped, so your install would stay recorded as skills v${r.recordedVersion} (upstream is v${r.installedVersion}) — resolve them${forceable ? ', or run with --force,' : ''} to finish the upgrade.`,
    );
    if (r.pendingSkillsVersion !== null) {
      log.info(
        `Would record skills v${r.pendingSkillsVersion} as pending, so \`pharn add\` installs at it.`,
      );
    }
  } else {
    log.info(`Would record skills v${r.recordedVersion}.`);
  }
  if (r.frozenCapabilities.length > 0) {
    log.info(
      `Would keep unread upstream capabilities as they are: ${r.frozenCapabilities.join(', ')}.`,
    );
  }

  outro(
    `Dry run — would write ${writes.length}${deletes.length > 0 ? ` · delete ${deletes.length} director${deletes.length === 1 ? 'y' : 'ies'}` : ''} · back up ${backupRels.length} · unchanged ${r.counts.ok} · skipped ${r.counts.skipped}. Nothing was changed. Run \`pharn update${force ? ' --force' : ''}\` to apply.`,
  );
}

// The backup pointer — ONE wording, reached from BOTH the success report and the
// failure branch. `.pharn-backup/<ts>/` is the user's only route back to their
// pre-overwrite bytes, so the two paths must never drift into saying different
// things about it — which is why the failure branch calls this rather than
// growing a second copy of the sentence.
//
// The stream is the difference, and it follows lib/report-error.ts's contract:
// an aborted run's notice is part of that run's fatal output, so it goes to
// stderr with the rest of it — an operator redirecting stderr to a log must find
// the pointer there. The success notice stays on stdout, where it has always been.
function printBackupNotice(backup: Backup, opts: { aborted: boolean }): void {
  const output = opts.aborted ? process.stderr : process.stdout;
  if (opts.aborted) {
    // Said plainly, because the tree is now in a state the user did not ask for:
    // the run stopped between the first overwrite and the last.
    log.warn(
      `The update stopped part-way — some originals may already have been ${ABORTED_PHRASE[backup.action]}.`,
      { output },
    );
  }
  log.info(
    `Backed up ${backup.count} file(s) to ${backup.dir} before ${backup.action}.`,
    { output },
  );
  // Advice, not a pointer: said once, when the backup is made. On an abort the
  // pointer above is repeated on stderr (what `2> err.log` keeps); this is not.
  if (!opts.aborted) {
    log.info(
      `${BACKUP_DIR}/ is not gitignored — add it to .gitignore or delete it once you are happy.`,
      { output },
    );
  }
}

// What a backup was made ahead of: overwrites (`--force` casualties) and/or
// directory deletes. Two booleans, no third case; with neither, no backup exists
// (a backup always has a reason, so `overwriting` is the honest default).
function backupAction(overwrites: boolean, removals: boolean): BackupAction {
  if (overwrites && removals) return 'overwriting and removing';
  return removals ? 'removing' : 'overwriting';
}

const ABORTED_PHRASE: Record<BackupAction, string> = {
  overwriting: 'overwritten',
  removing: 'removed',
  'overwriting and removing': 'overwritten or removed',
};

// The order change groups are reported in — additions first, then departures,
// then the one-time legacy tagging (P5: deterministic output, never dependent on
// the merge's internal iteration order).
const CHANGE_ORDER: { reason: CapabilityChange['reason']; heading: string }[] =
  [
    {
      reason: 'added',
      heading: 'ADDED — newly selected for your archetypes',
    },
    {
      reason: 'dropped-unselected',
      heading: 'REMOVED — no longer selected for your archetypes',
    },
    {
      reason: 'dropped-gone',
      heading: 'REMOVED — no longer exists upstream (was a manual add)',
    },
    {
      reason: 'kept-manual',
      heading: 'KEPT — your manual add, not selected by your archetypes',
    },
    {
      reason: 'kept-frozen',
      heading:
        'KEPT — pharn could not read these upstream this run, so they were left exactly as they are',
    },
  ];

// Name EVERY membership change. This is the whole point of the merge: before it,
// a manual add could vanish and a removal could resurrect without a word. Zero
// changes prints NOTHING — a steady-state update stays as quiet as it was.
//
// A REMOVED line also says what happened to the directory (`removals`, keyed by
// `role:name`): deleted, deleted after a backup, or already gone. `preview`
// switches the tense for the dry run.
function reportCapabilityChanges(
  changes: CapabilityChange[],
  removals: readonly CapabilityRemoval[],
  preview: boolean,
): void {
  if (changes.length === 0) return;

  const removalOf = new Map(
    removals.map((r) => [`${r.cap.role}:${r.cap.name}`, r]),
  );
  const lines: string[] = [];
  for (const { reason, heading } of CHANGE_ORDER) {
    const inGroup = changes.filter((c) => c.reason === reason);
    if (inGroup.length === 0) continue;
    lines.push(`  ${heading}`);
    for (const { cap } of inGroup) {
      const key = `${cap.role}:${cap.name}`;
      const removal = removalOf.get(key);
      lines.push(
        removal === undefined
          ? `  ${key}`
          : `  ${key} — ${removalPhrase(removal, preview)}`,
      );
    }
    lines.push('');
  }
  if (removals.length > 0) {
    lines.push(
      pc.dim(
        preview
          ? '  Removed capabilities’ directories would be deleted, so PHARN would no longer run them.'
          : '  Removed capabilities’ directories are deleted, so PHARN no longer runs them.',
      ),
    );
    if (removals.some((r) => r.backups.length > 0)) {
      lines.push(
        pc.dim(
          preview
            ? `  Files in them pharn did not write would be copied to ${BACKUP_DIR}/ first.`
            : `  Files in them pharn did not write were copied to ${BACKUP_DIR}/ first.`,
        ),
      );
    }
  }
  note(lines.join('\n'), 'CAPABILITIES');
}

function removalPhrase(removal: CapabilityRemoval, preview: boolean): string {
  if (!removal.present) return 'already gone';
  const n = removal.backups.length;
  const deleted = preview ? 'directory would be deleted' : 'directory deleted';
  if (n === 0) return deleted;
  return preview
    ? `${deleted} (${n} file(s) would be backed up first)`
    : `${deleted} (${n} file(s) backed up first)`;
}

// The MODELS note: what happened to the `models` block, for every outcome but
// `ok` (already pharn-oss's) and a quiet `upstream-absent` (nothing upstream,
// nothing of yours to convert or flag). Every string quoted from a block —
// stage names, values, upstream's reasons — goes through `terminalSafe`. The
// note's own lines stay within 70 columns, so an 80-column box never wraps
// one mid-sentence.
function reportModels(
  models: ModelsUpdate,
  floor: string,
  backup: Backup | null,
  preview = false,
): void {
  const lines = modelsReportLines(models, backup, preview);
  if (lines.length === 0) return;
  if (models.next !== undefined) {
    lines.push('', ...modelsLabelLines(floor).map((line) => pc.dim(line)));
  }
  note(lines.join('\n'), 'MODELS');
}

function modelsReportLines(
  models: ModelsUpdate,
  backup: Backup | null,
  preview: boolean,
): string[] {
  const quoted = (text: string): string =>
    `  ${terminalSafe(text, { max: 300 })}`;
  const lines: string[] = [];
  switch (models.outcome) {
    case 'ok':
      return [];
    case 'restored':
      lines.push(
        preview
          ? "Your config has no models block — would write pharn-oss's."
          : "Your config had no models block — wrote pharn-oss's.",
      );
      break;
    case 'updated':
      lines.push(
        ...(models.replacedLegacyDefault
          ? [
              preview
                ? "Would replace the models block an earlier pharn wrote with pharn-oss's."
                : "Replaced the models block an earlier pharn wrote with pharn-oss's.",
              'Its model ids, such as opus-4-8, are rejected by Claude Code',
              "and by pharn-oss's checker.",
            ]
          : [
              preview
                ? "Would move your models block to pharn-oss's current one: you have"
                : "Moved your models block to pharn-oss's current one: you had",
              'not changed it since pharn wrote it.',
            ]),
      );
      break;
    case 'forced':
      lines.push(
        preview
          ? "Would replace your models block with pharn-oss's (--force)."
          : "Replaced your models block with pharn-oss's (--force).",
        preview
          ? `Your current ${CONFIG_FILENAME} would be copied to ${BACKUP_DIR}/<timestamp>/ first.`
          : `Your previous ${CONFIG_FILENAME} is in ${backup?.dir ?? `${BACKUP_DIR}/`}.`,
      );
      break;
    case 'kept':
      lines.push(keptModelsHeading(models.label));
      break;
    case 'upstream-invalid':
      lines.push(
        "pharn-oss's models block was not applied; this pharn rejects it:",
        ...models.upstreamReasons.map(quoted),
        'If pharn-oss changed its models format, upgrade pharn',
        '(npm i -g @pharn-dev/pharn@latest) and run `pharn update` again.',
      );
      break;
    case 'upstream-absent':
      if (models.conversion === null && models.problems.length === 0) {
        return [];
      }
      lines.push('pharn-oss ships no models block, so yours is kept.');
      break;
  }
  if (models.conversion !== null) {
    lines.push(
      '',
      preview
        ? 'Would convert your models block from the format pharn wrote before 0.7.0,'
        : 'Converted your models block from the format pharn wrote before 0.7.0,',
      'keeping your values:',
      ...models.conversion.changes.map(quoted),
    );
  }
  if (models.problems.length > 0) {
    lines.push(
      '',
      "pharn-oss's rules still reject your models block — left as is,",
      'fix it by hand:',
      ...models.problems.map(quoted),
    );
  }
  if (models.outcome === 'kept') {
    lines.push(
      '',
      pc.dim("--force replaces it with pharn-oss's, after copying"),
      pc.dim(`${CONFIG_FILENAME} to ${BACKUP_DIR}/.`),
    );
  }
  return lines;
}

// Why a models block is the user's — `decideFileAction`'s skip labels.
function keptModelsHeading(label: ModelsUpdate['label']): string {
  switch (label) {
    case 'modified':
      return 'Kept your models block — you changed it since pharn wrote it.';
    case 'unrecorded':
      return 'Kept your models block — pharn has no record of writing it.';
    default:
      return `Kept your models block — no usable ${RECORDS_FILE} to check it.`;
  }
}

function skipHeading(label: string): string {
  switch (label) {
    case 'modified':
      return 'MODIFIED — you changed these since pharn wrote them';
    case 'unrecorded':
      return 'UNRECORDED — pharn has no record of writing these';
    case 'unverifiable':
      return `UNVERIFIABLE — no usable ${RECORDS_FILE} to compare against`;
    default:
      return 'UNREADABLE — not a regular readable file';
  }
}
