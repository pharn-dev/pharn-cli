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
  reportFatal,
  type FatalCause,
} from '../lib/report-error.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import { REPO_URL } from '../lib/constants.js';
import { interactiveAllowed } from '../lib/capability-picker.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import { minCliGate } from '../lib/min-cli-gate.js';
import { PHARN_VERSION } from '../version.js';
import { resolveCapabilities } from '../lib/resolve-capabilities.js';
import {
  mergeCapabilities,
  type CapabilityChange,
} from '../lib/merge-capabilities.js';
import { collectExpectedInstallPaths } from '../lib/install-manifest.js';
import { applyWrites, ApplyError, readDiskState } from '../lib/apply-update.js';
import { createBackup, BACKUP_DIR } from '../lib/backup.js';
import { sha256File } from '../lib/hash.js';
import { configLayout, detectLayout, layoutPaths } from '../lib/layout.js';
import {
  buildRecords,
  readRecords,
  recordsBaseline,
  recordsUnderCapabilities,
  RECORDS_FILE,
  writeRecords,
} from '../lib/install-records.js';
import {
  planUpdate,
  type UpdateLabel,
  type UpdatePlan,
} from '../lib/update-decision.js';
import { fetchRepo } from '../lib/repo.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import {
  fetchRemoteSkillsVersion,
  readSkillsVersion,
} from '../lib/skills-version.js';
import { row } from '../lib/format.js';
import {
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type { DiskState } from '../lib/update-decision.js';
import type { InstalledCapability, Layout, PharnConfig } from '../types.js';

// `pharn update` refreshes an archetype install: re-resolve the recorded
// archetypes against the latest capability index and re-copy — but DRIFT-SAFELY.
// It compares every expected file against the per-file hashes recorded at install
// time (lib/install-records.ts) and decides per file (lib/update-decision.ts);
// anything it cannot prove pristine is SKIPPED and reported, never overwritten.
// `--force` overwrites the skip buckets after copying each file to
// `.pharn-backup/<timestamp>/`.
export async function runUpdate(
  opts: { force?: boolean; yes?: boolean } = {},
): Promise<void> {
  intro('pharn update');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);

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
  const yes = opts.yes ?? false;
  if (
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

  await runArchetypeUpdate(config, cwd, opts.force ?? false, yes);
}

// Where the `--force` copies went, and how many there are — the two facts the
// report needs. One shape, so the count is never re-derived at a second site and
// cannot drift from the directory it describes.
interface Backup {
  dir: string;
  count: number;
}

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
  plan: UpdatePlan;
  backup: Backup | null;
  recordsNote: string | null;
  versionWithheld: boolean;
  abandonedLayout: Layout | null;
}

async function runArchetypeUpdate(
  config: PharnConfig,
  cwd: string,
  force: boolean,
  yes: boolean,
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
    log.warn(proxyNoticeMessage(proxyNotice));
  }

  const s = spinner();
  s.start('Checking for updates');
  let latest: string;
  try {
    latest = await fetchRemoteSkillsVersion();
    s.stop(`Latest skills v${latest}`);
  } catch (err) {
    s.stop('Failed to check for updates');
    reportFatal(errorMessage(err), { err });
    process.exit(1);
  }

  // The version gate. `--force` deliberately bypasses it: `--force` means "make
  // my tree match upstream, overwriting my edits", which is a request the user
  // can legitimately make at the current version — and it is what `pharn status`
  // tells them to do about locally-changed files.
  const current = config.skillsVersion === latest;
  if (current && !force) {
    outro(`Already up to date (skills v${config.skillsVersion}).`);
    return;
  }

  note(
    [
      current
        ? row('Skills version', `v${config.skillsVersion} (re-applying)`)
        : row('Skills version', `v${config.skillsVersion} → v${latest}`),
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
      pc.dim('  https://github.com/pharn-dev/pharn-oss/blob/main/CHANGELOG.md'),
    ].join('\n'),
  );
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
      const s2 = spinner();
      spinnerRef.current = s2;
      s2.start(`Updating from ${REPO_URL}`);
      // Assigned ONLY on success, and the cleanup that consumes it is scoped to
      // the try below. The previous shape declared `repo` outside its try so an
      // outer `finally` could clean it up — which, with the fetch now inside the
      // lock, would dereference `undefined` on a failed fetch and mask the real
      // "could not reach" message with a TypeError.
      const repo = await fetchRepo();
      try {
        // THE MIN_CLI GATE — upstream's lever to refuse a stale CLI CLEANLY
        // instead of breaking somewhere downstream. Inside this try so the
        // clone's cleanup still runs before any exit, and BEFORE applyUpdate so
        // a refusal writes nothing at all. It can only fire after the confirm,
        // because the file it reads lives in the clone — named in GRILL.md; the
        // refusal still costs zero writes.
        const gate = minCliGate(repo.dir, PHARN_VERSION);
        if (gate.warning) log.warn(gate.warning);
        if (gate.refusal) {
          s2.stop('Update refused');
          refusalRef.current = gate.refusal;
          return null;
        }
        const applied = await applyUpdate(
          repo.dir,
          repo.sha,
          config,
          cwd,
          force,
          (backup) => {
            backupRef.current = backup;
          },
        );
        s2.stop(
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
    if (err instanceof ProjectLockedError) {
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

// The fetch-side work: resolve, hash, decide, back up, write, persist. Pure of
// process.exit — the caller owns cleanup + exit.
//
// `onBackup` fires the instant a backup exists, because the caller needs that
// path on the paths this function does NOT return from.
async function applyUpdate(
  repoDir: string,
  sha: string | null,
  config: PharnConfig,
  cwd: string,
  force: boolean,
  onBackup: (backup: Backup) => void,
): Promise<UpdateOutcome> {
  const index = parseCapabilityIndex(repoDir);
  // No silent skips (P5): a capability the fetch boundary refused is NAMED here,
  // immediately after the parse, at every call site.
  const unknownWarning = unknownCapabilitiesWarning(index.unknown);
  if (unknownWarning) log.warn(unknownWarning);
  // The frozen key set: `role:name` for every unparseable capability, built from
  // the SUBTREE's role (authoritative — a frozen capability's declared role may
  // be exactly what failed). It answers the one question index membership
  // structurally cannot: "is this entry missing because it was REMOVED upstream,
  // or because we could not READ it this run?"
  const frozen = new Set(index.unknown.map((u) => `${u.role}:${u.name}`));
  const selection = resolveCapabilities(config.archetypes ?? [], index);
  // The UNION, not a wholesale replace: the freshly-resolved auto set PLUS every
  // manual entry the user added by name (lib/merge-capabilities.ts owns the
  // table). Replacing wholesale is what used to delete manual adds and resurrect
  // removals in silence. `capabilities` feeds the install manifest below, so a
  // preserved manual entry is first-class — its files run through the same
  // per-file decision rows as everything else.
  //
  // Membership is written even when `versionWithheld` holds the version back
  // (below), and that is deliberate: membership answers "which capabilities does
  // this project have", which the archetypes decide, while the version answers
  // "are its BYTES complete". A newly-selected capability's files are absent, so
  // they always take the `restored` row and are written regardless; withholding
  // membership instead would strand a phantom entry forever for any user whose
  // tree has a single local edit.
  const merged = mergeCapabilities(
    selection,
    config.capabilities ?? [],
    frozen,
  );
  // TWO arrays, deliberately — they answer different questions and a frozen entry
  // separates them. The CONFIG keeps the entry (it is still this project's
  // capability; `update` never deletes, and a transient upstream parse failure
  // must not silently drop it). The MANIFEST must NOT: it is `update`'s only
  // write source, and enumerating an unparseable clone directory would classify
  // its files `restored` (update-decision.ts row 1) and copy an arbitrary WIP
  // upstream directory into the user's project — the exact fail-open this whole
  // contract exists to prevent. Recorded is not the same as re-copied.
  const configCapabilities: InstalledCapability[] = merged.capabilities;
  const manifestCapabilities = configCapabilities.filter(
    (cap) => !frozen.has(`${cap.role}:${cap.name}`),
  );
  const installedVersion = readSkillsVersion(repoDir);

  // The layout the copy actually mirrors is the CLONE's (this is what
  // installCapabilities has always done) — so it is also what gets RECORDED, and
  // the two can no longer disagree. A project recorded `flat` meeting a `pharn`
  // clone therefore migrates, and the config stops lying about where its files are.
  const layout = detectLayout(repoDir);
  const previousLayout = configLayout(config);

  const expected = collectExpectedInstallPaths({
    repoDir,
    capabilities: manifestCapabilities,
    layout,
  });

  const latestHashes = new Map<string, string>();
  for (const [rel, source] of expected)
    latestHashes.set(rel, sha256File(source));

  const diskStates = new Map<string, DiskState>();
  for (const rel of expected.keys())
    diskStates.set(rel, readDiskState(cwd, rel));

  const { records, note: recordsNote } = recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  });

  const plan = planUpdate({ latestHashes, diskStates, records, force });

  // Back up EVERY about-to-be-clobbered file before a single original is
  // touched; a failure here aborts with the whole tree still intact.
  //
  // Ordered exactly as before — after planUpdate, before applyWrites — and the
  // pointer is handed UP here rather than only in the return value below: every
  // line after this one (the writes, the records, the config) can throw, and a
  // run that dies there has already moved the user's bytes into that directory.
  const backup: Backup | null =
    plan.backups.length > 0
      ? { dir: createBackup(cwd, plan.backups), count: plan.backups.length }
      : null;
  if (backup) onBackup(backup);

  // A run that could not apply everything must not claim the new version: the
  // recorded version describes the last COMPLETE state, so the next `pharn
  // update` still has work to do instead of early-returning forever.
  const versionWithheld = plan.counts.skipped > 0;
  const nextSkillsVersion = versionWithheld
    ? config.skillsVersion
    : installedVersion;
  const nextCommit = versionWithheld ? config.commit : sha;

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
  // A frozen capability is absent from the manifest, and `planUpdate` keys
  // `nextRecords` by the manifest — so without this its entries would be pruned
  // as "no longer installed". They are not: nothing under it was touched, so its
  // recorded hashes are still true, and dropping them would make the next run
  // (once upstream parses again) read every one of those files as `unrecorded`
  // and skip it — a transient upstream break turned into a `--force`.
  const frozenRecords =
    records === null
      ? {}
      : recordsUnderCapabilities(
          records,
          layoutPaths(layout),
          configCapabilities.filter((cap) =>
            frozen.has(`${cap.role}:${cap.name}`),
          ),
        );

  await writeRecords(cwd, {
    skillsVersion: nextSkillsVersion,
    commit: nextCommit,
    files: {
      ...frozenRecords,
      ...plan.nextRecords,
      ...buildRecords(cwd, written),
    },
  });
  await writePharnConfig(cwd, {
    ...config,
    skillsVersion: nextSkillsVersion,
    commit: nextCommit,
    capabilities: configCapabilities,
    layout,
    installedAt: new Date().toISOString(),
  });

  return {
    installedVersion,
    recordedVersion: nextSkillsVersion,
    capCount: configCapabilities.length,
    capabilityChanges: merged.changes,
    plan,
    backup,
    recordsNote,
    versionWithheld,
    abandonedLayout:
      previousLayout !== layout && written.length > 0 ? previousLayout : null,
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
  const { plan, backup, recordsNote, versionWithheld } = outcome;
  const { counts } = plan;

  if (recordsNote) log.warn(`⚠ ${recordsNote}`);

  reportCapabilityChanges(outcome.capabilityChanges);

  // An unhashable destination is skipped BEFORE the decision table and `force`
  // is not an input to that branch (lib/update-decision.ts) — deliberately, since
  // there is no hash to compare and guessing one is what P5 forbids. So the
  // report must not prescribe `--force` for it: a run whose skips are all
  // unreadable would otherwise be told to re-run a command that produces a
  // byte-identical outcome, forever, while the withheld version bump keeps
  // `pharn status --strict` red with nothing that clears it.
  const forceable = plan.skipped.some((g) => FORCEABLE_SKIPS.has(g.label));
  const hasUnreadable = plan.skipped.some((g) => !FORCEABLE_SKIPS.has(g.label));

  if (plan.skipped.length > 0) {
    const lines: string[] = [];
    for (const group of plan.skipped) {
      lines.push(`  ${skipHeading(group.label)}`);
      for (const rel of group.rels) lines.push(`  ${rel}`);
      lines.push('');
    }
    if (forceable) {
      lines.push(
        pc.dim(
          `  Re-run with --force to overwrite (skipped files are backed up to ${BACKUP_DIR}/ first).`,
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

  if (backup) printBackupNotice(backup, { aborted: false });

  // Both directions are named. `abandonedLayout` has always been computed
  // direction-agnostically (see its assignment above), but only 'flat' used to be
  // rendered — so a pharn→flat migration abandoned the whole pharn/ tree in
  // silence, which is strictly more than the other direction leaves behind. The
  // second test is `=== 'pharn'` rather than a bare `else` so that a third Layout
  // member would print nothing instead of this message (P5: membership, not a
  // fallback that guesses).
  if (outcome.abandonedLayout === 'flat') {
    log.warn(
      'Your install moved to the pharn/ layout. The old top-level copies are left behind and are no longer managed by pharn — delete them by hand.',
    );
  } else if (outcome.abandonedLayout === 'pharn') {
    log.warn(
      'Your install moved to the flat layout. The old pharn/ tree (contracts, floor scripts, docs, and capabilities) is left behind and is no longer managed by pharn — delete it by hand.',
    );
  }

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
      'The update stopped part-way — some originals may already have been overwritten.',
      { output },
    );
  }
  log.info(
    `Backed up ${backup.count} file(s) to ${backup.dir} before overwriting.`,
    { output },
  );
  log.info(
    `${BACKUP_DIR}/ is not gitignored — add it to .gitignore or delete it once you are happy.`,
    { output },
  );
}

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
function reportCapabilityChanges(changes: CapabilityChange[]): void {
  if (changes.length === 0) return;

  const lines: string[] = [];
  for (const { reason, heading } of CHANGE_ORDER) {
    const inGroup = changes.filter((c) => c.reason === reason);
    if (inGroup.length === 0) continue;
    lines.push(`  ${heading}`);
    for (const { cap } of inGroup) lines.push(`  ${cap.role}:${cap.name}`);
    lines.push('');
  }
  if (
    changes.some(
      (c) => c.reason === 'dropped-unselected' || c.reason === 'dropped-gone',
    )
  ) {
    lines.push(
      pc.dim(
        '  Removed capabilities’ files are left on disk — pharn update never deletes.',
      ),
    );
  }
  note(lines.join('\n'), 'CAPABILITIES');
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
