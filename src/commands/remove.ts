import {
  confirm,
  groupMultiselect,
  intro,
  isCancel,
  log,
  outro,
} from '@clack/prompts';
import pc from '../lib/color.js';
import { cancelAndExit } from '../lib/confirm.js';
import { configLayout, layoutPaths, type LayoutPaths } from '../lib/layout.js';
import {
  capabilityDir,
  capabilityRelDir,
  deleteCapabilityDir,
  linkedComponent,
} from '../lib/capability-dir.js';
import { parseCapabilityArg } from '../lib/capability-address.js';
import { errorMessage, logError } from '../lib/report-error.js';
import { createBackup, printBackupNotice } from '../lib/backup.js';
import { removalBackupSet } from '../lib/removal-backup.js';
import {
  buildRemoveSelection,
  interactiveAllowed,
} from '../lib/capability-picker.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import {
  assertConfigUnchanged,
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import {
  readRecords,
  recordsBaseline,
  writeRecords,
  type FileRecords,
} from '../lib/install-records.js';
import type { InstalledCapability, PharnConfig } from '../types.js';

// The inverse of `pharn add`: removes installed capabilities from an archetype
// project (no clone, no network — everything is derivable from
// config.capabilities + the filesystem). Two paths, and the confirm contract is
// PER PATH: the NAMED remove (`pharn remove a11y`) never prompts, while bare
// `pharn remove` in a terminal opens a grouped multi-select over the installed
// capabilities, confirms ONCE (listing the picks, default No), then deletes each
// via the SAME per-name delete path (deleteCapabilityDir); non-TTY keeps a usage
// error. `remove` therefore has NO `--yes`: the named path has no prompt to
// skip, and the picker's single confirm IS the destructive gate, so nothing may
// skip it either — the dispatcher passes the argument alone (src/index.ts). The
// legacy module/skill removal (which read the manifest) was removed; a
// pre-archetype config is rejected up front.
//
// Neither path deletes a file it cannot prove is pharn's own without saving it
// first: every regular file in a target directory that is not at its recorded
// hash in a usable `pharn.records.json` is copied to `.pharn-backup/<ts>/`
// BEFORE the first delete (backupBeforeDelete), and a failed backup refuses the
// removal with nothing deleted.
export async function runRemove(arg: string | undefined): Promise<void> {
  intro('pharn remove');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);
  try {
    await removeCapability(cwd, config, arg);
  } catch (err) {
    // A held lock is the one refusal this command can hit from below, and it is
    // a policy refusal rather than a crash: the message names the one action
    // that resolves it, so it gets the same no-stack-trace treatment as the
    // ambiguity and not-installed refusals below. `remove` takes no clone, so
    // there is nothing to clean up before the exit.
    if (err instanceof ProjectLockedError) {
      logError(err.message);
      process.exit(1);
    }
    // A backup that could not be made is the same kind of refusal: it fired
    // BEFORE the first delete, so the message can say "Nothing was removed"
    // truthfully, and the lock was released by the unwinding that got us here.
    if (err instanceof RemoveBackupError) {
      logError(err.message);
      process.exit(1);
    }
    throw err;
  }
}

// The scan or the backup in front of a delete failed. Carries a complete,
// user-facing message; runRemove reports it and exits 1.
class RemoveBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoveBackupError';
  }
}

// Each capability is an isolated dir, so removal is a precise recursive delete
// (siblings never touched). Touches only `capabilities` (never archetypes /
// modules). No arg → the interactive picker; an arg → the named single remove.
async function removeCapability(
  cwd: string,
  config: PharnConfig,
  arg: string | undefined,
): Promise<void> {
  const installed = config.capabilities ?? [];

  if (arg === undefined) {
    await runRemovePicker(cwd, config, installed);
    return;
  }
  await removeNamed(cwd, config, installed, arg);
}

// The per-name delete path (deleteCapabilityDir), its strict-child addressing
// (capabilityDir) and the symlink walk (linkedComponent) live in
// lib/capability-dir.ts, shared with `pharn update` — which deletes the
// directory of a capability it drops from the config — so the two commands can
// never disagree about which directory a capability is, or how it may go. The
// backup scan below addresses targets through the same capabilityDir, so it can
// never read (or back up) more than the delete would remove: a hand-edited `..`
// name is refused there, before either runs.

// Copy every file the coming delete would lose — anything in the target
// directories that is not provably pharn-written-and-unchanged against a usable
// record store (lib/removal-backup.ts) — to `.pharn-backup/<ts>/`, BEFORE the
// first delete. Nothing to save → no backup directory at all.
//
// The order is deterministic control flow demonstrated by tests, not a floor
// primitive (the same honest label lib/backup.ts carries): this runs to
// completion before deleteCapabilityDir is first called, and any failure — a
// directory that cannot be listed, a recorded file that cannot be hashed, a
// symlinked `.pharn-backup`, a copy error — throws RemoveBackupError with every
// file still in place. A failed backup can leave a partly filled backup
// directory behind; it never touches an original.
//
// Announced AT CREATION, as `add` does: the printed directory is the user's only
// pointer back to those bytes, and the deletes after it can still fail.
function backupBeforeDelete(
  cwd: string,
  paths: LayoutPaths,
  targets: InstalledCapability[],
  records: FileRecords | null,
): void {
  // Addressed first, OUTSIDE the wrap: a refused name keeps its own
  // `Refusing path` error rather than being reworded as a backup failure.
  for (const target of targets) capabilityDir(cwd, paths, target);
  const label = targets.map((t) => `${t.name} (${t.role})`).join(', ');
  try {
    const rels = removalBackupSet(
      cwd,
      targets.map((t) => capabilityRelDir(paths, t)),
      records,
    );
    if (rels.length === 0) return;
    const backupDir = createBackup(cwd, rels);
    printBackupNotice({
      dir: backupDir,
      saved: rels.length,
      action: 'removing',
    });
  } catch (err) {
    throw new RemoveBackupError(
      `Could not back up the files in ${label} before removing: ${errorMessage(err).replace(/\.$/, '')}. Nothing was removed.`,
    );
  }
}

// The usable record baseline, or null (absent / corrupt / stamped for another
// install state). Read ONCE per run, inside the lock, and shared by the backup
// decision and the prune, so both judge the same store.
function readRecordsBaseline(
  cwd: string,
  config: PharnConfig,
): FileRecords | null {
  return recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  }).records;
}

// Refuse (exit 1, nothing deleted) when any target's directory path crosses a
// symlinked component below the project root. `rmSync` on `pharn/pharn-review/x`
// resolves every ancestor, so with `pharn -> ../shared` it deletes
// `../shared/pharn-review/x` — outside the project — and `safeJoin` cannot see
// it (lexical). Checked for the WHOLE selection before the first delete (and,
// on the picker path, before the confirm), with no lock held, so the exit
// leaves nothing behind. The same physical walk `update`/`add` use. ENOTDIR (a
// component below a regular file) is not a link: that dir does not exist, and
// the delete's own existsSync already treats it as gone.
function refuseSymlinkedTargets(
  cwd: string,
  paths: LayoutPaths,
  targets: InstalledCapability[],
): void {
  for (const target of targets) {
    const linked = linkedComponent(cwd, paths, target);
    if (linked !== null) {
      logError(
        `Refusing to remove ${target.name} (${target.role}): ${linked} is a symbolic link, so deleting through it would delete files OUTSIDE the project. Nothing was removed. Delete the directory yourself if that is what you want.`,
      );
      process.exit(1);
    }
  }
}

// One source for the capability dir (lib/capability-dir.ts → capabilityRelDir).
// The delete addresses the filesystem and the prune addresses the record store;
// they MUST name the same directory, and sharing it (and, through it, layout.ts's
// capabilitySubtree — the one role → subtree mapping) makes that true by
// construction rather than by two copies staying in sync.

// Drop the removed capabilities' entries from `pharn.records.json`, so `remove`
// honors the same sentence `update` does: the store describes only files pharn
// still manages. Without this, `remove` is the one write path that leaves records
// describing bytes that are gone, and they linger until the next `update` prunes
// them via its manifest.
//
// A key-prefix filter over the STORE, never a filesystem walk: a walk of the
// DEST directory finds nothing once that directory is gone — which is the case
// both AFTER the delete and, on the "its files were already gone" path, before
// it too. So there is no moment at which a walk could see what to prune, and the
// store is the only place the answer still exists.
//
// Only an already-READABLE store is edited: `recordsBaseline` returns null for
// absent, corrupt, AND stamped-for-another-state, and each of those means the
// same thing here — this is not our store to rewrite (the `add` precedent,
// commands/add.ts). Minting one would claim knowledge of files we never hashed.
//
// The baseline `note` is deliberately NOT surfaced, matching `add`: `remove` is a
// local, zero-network operation whose outro already reports exactly what it did,
// and `update` — which is where an unusable store actually changes an outcome —
// is the command that names the reason. Silence here is a choice, not an
// oversight.
async function pruneCapabilityRecords(
  cwd: string,
  config: PharnConfig,
  paths: LayoutPaths,
  targets: InstalledCapability[],
  // readRecordsBaseline's result, read once for the run (the delete before
  // this touches no record, so it is still the store on disk).
  records: FileRecords | null,
): Promise<void> {
  if (records === null) return; // absent/corrupt/stale → leave it alone

  // The trailing slash is load-bearing: without it `lenses/a11y` would also eat
  // every key belonging to `lenses/a11y-extended`.
  const prefixes = targets.map((t) => `${capabilityRelDir(paths, t)}/`);
  const kept: FileRecords = {};
  let dropped = 0;
  for (const [key, hash] of Object.entries(records)) {
    // Keys are COMPARED as strings and never joined into a path — the invariant
    // that makes a hand-edited store unable to drive a filesystem access.
    if (prefixes.some((prefix) => key.startsWith(prefix))) dropped++;
    else kept[key] = hash;
  }
  if (dropped === 0) return; // nothing matched → the store stays byte-identical

  // The stamp does not move: `remove` changes neither `skillsVersion` nor
  // `commit`, so the store is re-written against the same pair the config holds
  // (and still holds after the config write, which touches only `capabilities`). A moved stamp would make the very next `update` read this
  // store as written for another state and ignore it wholesale.
  await writeRecords(cwd, {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
    files: kept,
  });
}

// Warn when a capability being removed will simply come back. Derived from the
// STORED `source` alone — `remove` is zero-network and has no capability index,
// so there is nothing else it could honestly read.
//
// It fires on the LITERAL 'auto' and nothing else. An ABSENT `source` (a config
// written before the field existed) stays SILENT on purpose: absence means the
// provenance is genuinely unknown until `pharn update` infers it against a fresh
// index, and a legacy MANUAL add given an "absent means auto" default would be
// told the exact opposite of the truth. A false warning here is worse than none
// (P5 — the terminal for unknown is to say nothing, never to guess).
function warnIfAutoSelected(targets: InstalledCapability[]): void {
  const auto = targets.filter((c) => c.source === 'auto');
  if (auto.length === 0) return;
  const names = auto.map((c) => `${c.name} (${c.role})`).join(', ');
  const one = auto.length === 1;
  const pronoun = one ? 'it' : 'them';
  // WHEN it comes back, not "the next update": at the version already installed
  // `update` early-returns before re-resolving the archetypes, and nothing local
  // is left to re-open it (this command drops the entry AND its records), so a
  // same-version run can leave the removal in place. The reinstall comes with the
  // next run that re-applies the install — at the latest a new pharn-oss
  // version — or now with `--force`.
  log.warn(
    `${names} ${one ? 'is' : 'are'} selected automatically for your archetypes, so ${one ? 'it comes' : 'they come'} back: the next \`pharn update\` that re-applies your install — at the latest the one that moves to a new pharn-oss version — reinstalls ${pronoun} and names ${pronoun} in its report. Until then \`pharn update\` may answer "Already up to date" and leave ${pronoun} removed; \`pharn update --force\` reinstalls ${pronoun} now.`,
  );
}

// `pharn remove <name>` / `<role>:<name>` — resolve to ONE installed capability
// and delete it. Byte-identical to the pre-picker behavior (now routed through
// the shared deleteCapabilityDir helper).
async function removeNamed(
  cwd: string,
  config: PharnConfig,
  installed: InstalledCapability[],
  address: string,
): Promise<void> {
  const parsed = parseCapabilityArg(address);
  if (parsed.error) {
    logError(parsed.error);
    process.exit(1);
  }
  const matches = installed.filter(
    (c) =>
      c.name === parsed.name &&
      (parsed.role === undefined || c.role === parsed.role),
  );

  // Not installed → an ERROR (exit 1, nothing written), exactly as `pharn add
  // bogus` is: a script that names the wrong capability must not read success.
  // It used to be a warning and exit 0. Without a manifest we list the installed
  // capabilities (the only removable things) as the valid values.
  if (matches.length === 0) {
    const valid = installed.map((c) => `${c.role}:${c.name}`).sort();
    const hint = valid.length
      ? ` Installed: ${valid.join(', ')}.`
      : ' No capabilities are installed.';
    logError(
      `"${address}" is not an installed capability.${hint} Nothing was removed.`,
    );
    process.exit(1);
  }
  if (matches.length > 1) {
    logError(
      `"${parsed.name}" is ambiguous — use ${matches.map((m) => `${m.role}:${m.name}`).join(' or ')}.`,
    );
    process.exit(1);
  }

  const target = matches[0]!;
  const paths = layoutPaths(configLayout(config));
  refuseSymlinkedTargets(cwd, paths, [target]);
  // The single-writer lock spans backup → delete → prune → config: the writes
  // are individually atomic but the sequence is not, so another process must
  // not land between them. `remove` has no prompt on this path and no network,
  // so the held window is the write itself.
  const note = await withProjectLock(cwd, 'remove', async () => {
    assertConfigUnchanged(cwd, config, 'remove');
    const records = readRecordsBaseline(cwd, config);
    backupBeforeDelete(cwd, paths, [target], records);
    const existed = deleteCapabilityDir(cwd, paths, target);

    // Order: backup → delete → prune records → write config (mirroring `add`'s
    // records-before-config). Each of those two writes is individually atomic
    // (lib/atomic-write.ts), but the PAIR is not a transaction, so this remains a
    // benign-failure argument, NOT an atomicity claim (advisory, P0): a prune that
    // fails after the delete leaves exactly today's status quo — stale entries the
    // next `update` prunes — and a config write that fails after the prune leaves
    // the entry listed with its files absent, which the next `update` restores and
    // re-records. Neither direction corrupts, and since the stamp never moves the
    // two files cannot skew relative to each other.
    //
    // `existed` deliberately does NOT gate this: on the "already gone" path the
    // records are exactly what is left to clean up.
    await pruneCapabilityRecords(cwd, config, paths, [target], records);

    // The surviving entries are the ORIGINAL objects, so every other
    // capability's `source` is carried through untouched.
    await writePharnConfig(cwd, {
      ...config,
      capabilities: installed.filter(
        (c) => !(c.name === target.name && c.role === target.role),
      ),
      // `installedAt` rides the spread unchanged: a remove is a partial edit,
      // not an install — init and update set it (F-23).
    });
    return existed ? '' : pc.dim(' (its files were already gone)');
  });

  warnIfAutoSelected([target]);

  outro(`${pc.green('✔')} Removed ${target.name} (${target.role})${note}`);
}

// ---------------------------------------------------------------------------
// Bare `pharn remove` — the interactive multi-select picker (subtractive-only).
// ---------------------------------------------------------------------------

// Nothing installed → benign message (even non-TTY). Otherwise: non-TTY → a
// reworded usage error + exit(1) (NEVER a prompt, P5); TTY → multi-select over
// the installed capabilities, ONE confirm listing the picks (destructive), then
// one backup for the selection, delete each + a single config write dropping
// them all.
async function runRemovePicker(
  cwd: string,
  config: PharnConfig,
  installed: InstalledCapability[],
): Promise<void> {
  if (installed.length === 0) {
    outro('No capabilities are installed.');
    return;
  }
  if (
    !interactiveAllowed({
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
    })
  ) {
    logError(
      'Specify a capability to remove (e.g. `pharn remove a11y`), or run `pharn remove` in an interactive terminal to pick from a list.',
    );
    process.exit(1);
  }

  const { groups } = buildRemoveSelection(installed);
  const picked = await groupMultiselect({
    message: 'Select capabilities to remove',
    options: groups,
    required: false,
    selectableGroups: false,
  });
  if (isCancel(picked)) cancelAndExit();
  const values = picked as string[];
  if (values.length === 0) {
    outro('Nothing selected. No capabilities were removed.');
    return;
  }

  // Map each picked `role:name` back to its installed entry (the options were
  // built from `installed`, so each resolves).
  const targets: InstalledCapability[] = [];
  for (const value of values) {
    const parsed = parseCapabilityArg(value);
    const target = installed.find(
      (c) => c.name === parsed.name && c.role === parsed.role,
    );
    if (target) targets.push(target);
  }

  const paths = layoutPaths(configLayout(config));
  // Before the confirm: a selection that would be refused must not be asked
  // about first.
  refuseSymlinkedTargets(cwd, paths, targets);

  // ONE confirm listing what will be removed (default No — destructive).
  const ok = await confirm({
    message: `Remove ${targets.length} ${plural(targets.length)}: ${targets
      .map((t) => `${t.name} (${t.role})`)
      .join(', ')}?`,
    initialValue: false,
  });
  if (isCancel(ok) || ok !== true) cancelAndExit();

  // Taken AFTER the confirm — holding it across an unanswered destructive
  // prompt would block an agent hook for as long as a human takes to answer —
  // and spanning the whole selection, not one lock per capability.
  await withProjectLock(cwd, 'remove', async () => {
    assertConfigUnchanged(cwd, config, 'remove');
    // ONE backup for the whole selection, after the confirm and before the
    // first delete — a failure here deletes none of the picks.
    const records = readRecordsBaseline(cwd, config);
    backupBeforeDelete(cwd, paths, targets, records);
    for (const target of targets) deleteCapabilityDir(cwd, paths, target);

    // One prune for the whole selection — the same backup → delete → prune →
    // config order as removeNamed, and one store write to match the one config
    // write.
    await pruneCapabilityRecords(cwd, config, paths, targets, records);

    // As in removeNamed: survivors are the original objects, so their `source`
    // is preserved verbatim.
    const removed = new Set(targets.map((t) => `${t.role}:${t.name}`));
    await writePharnConfig(cwd, {
      ...config,
      capabilities: installed.filter(
        (c) => !removed.has(`${c.role}:${c.name}`),
      ),
      // `installedAt` unchanged, as in removeNamed (F-23).
    });
  });

  warnIfAutoSelected(targets);

  outro(
    `${pc.green('✔')} Removed ${targets.length} ${plural(targets.length)}.`,
  );
}

function plural(n: number): string {
  return n === 1 ? 'capability' : 'capabilities';
}
