import {
  confirm,
  groupMultiselect,
  intro,
  isCancel,
  log,
  outro,
} from '@clack/prompts';
import pc from '../lib/color.js';
import { CliError } from '../lib/cli-error.js';
import { configLayout, layoutPaths, type LayoutPaths } from '../lib/layout.js';
import {
  capabilityDir,
  capabilityRelDir,
  deleteCapabilityDir,
  linkedComponent,
} from '../lib/capability-dir.js';
import { parseCapabilityArg } from '../lib/capability-address.js';
import { errorMessage } from '../lib/report-error.js';
import { createBackup, printBackupNotice } from '../lib/backup.js';
import { backupDirIgnored } from '../lib/gitignore.js';
import { removalBackupSet } from '../lib/removal-backup.js';
import {
  buildRemoveSelection,
  interactiveAllowed,
} from '../lib/capability-picker.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import {
  assertConfigFingerprintUnchanged,
  configFingerprint,
  loadArchetypeConfig,
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
// project (no clone, no network). The confirm contract is PER PATH: the NAMED
// remove (`pharn remove a11y`) never prompts, while bare `pharn remove` in a
// terminal opens a multi-select and confirms ONCE (default No) before deleting
// each pick through the same deleteCapabilityDir; non-TTY keeps a usage error.
// So there is NO `--yes`: the named path has no prompt to skip, and the
// picker's confirm IS the destructive gate.
//
// Neither path deletes a file it cannot prove is pharn's without saving it
// first: every regular file not at its recorded hash in a usable
// `pharn.records.json` is copied to `pharn/.backup/<ts>/` BEFORE the first
// delete, and a failed backup refuses the removal with nothing deleted.
//
// THE SINGLE-WRITER LOCK is taken FIRST — before the config is read — and held
// across the picker's prompts to the config write; the backup → delete →
// prune → config sequence is not atomic, and a second pharn writer is refused
// meanwhile.
export async function runRemove(arg: string | undefined): Promise<void> {
  intro('pharn remove');

  const cwd = process.cwd();
  try {
    await withProjectLock(cwd, 'remove', async () => {
      // Taken BEFORE the read: checked again before the first write.
      const fingerprint = configFingerprint(cwd);
      const config = loadArchetypeConfig(cwd);
      await removeCapability(cwd, config, arg, fingerprint);
    });
  } catch (err) {
    // A held lock is a policy refusal, not a crash: no stack trace. A failed
    // backup fired BEFORE the first delete, so "Nothing was removed" is true.
    // A target under a symlinked component is refused before any write. The
    // unwinding has already released the lock.
    if (
      err instanceof ProjectLockedError ||
      err instanceof RemoveBackupError ||
      err instanceof SymlinkedTargetError
    ) {
      throw CliError.error(err.message);
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

// A target directory's path crosses a symlinked component. Carries a complete,
// user-facing message; runRemove reports it and exits 1.
class SymlinkedTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SymlinkedTargetError';
  }
}

// Each capability is an isolated dir, so removal is a precise recursive delete.
// Touches only `capabilities`. No arg → the picker; an arg → the named remove.
async function removeCapability(
  cwd: string,
  config: PharnConfig,
  arg: string | undefined,
  fingerprint: string,
): Promise<void> {
  const installed = config.capabilities ?? [];

  if (arg === undefined) {
    await runRemovePicker(cwd, config, installed, fingerprint);
    return;
  }
  await removeNamed(cwd, config, installed, arg, fingerprint);
}

// The delete (deleteCapabilityDir), its strict-child addressing (capabilityDir)
// and the symlink walk (linkedComponent) live in lib/capability-dir.ts, shared
// with `update`, so the two cannot disagree about which directory a capability
// is. The backup scan addresses targets through the same capabilityDir, so it
// never reads more than the delete would remove.

// Copy every file the coming delete would lose — anything not provably
// pharn-written-and-unchanged against a usable record store
// (lib/removal-backup.ts) — to `pharn/.backup/<ts>/`, BEFORE the first delete.
// Nothing to save → no backup directory. Any failure (an unlistable dir, an
// unhashable file, a symlinked `pharn/.backup`, a copy error) throws
// RemoveBackupError with every file still in place; a partly filled backup dir
// may be left. Announced AT CREATION: the deletes after it can still fail.
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
      gitignored: backupDirIgnored(cwd),
    });
  } catch (err) {
    throw new RemoveBackupError(
      `Could not back up the files in ${label} before removing: ${errorMessage(err).replace(/\.$/, '')}. Nothing was removed.`,
    );
  }
}

// The usable record baseline, or null (absent / corrupt). Read ONCE per run,
// inside the lock, and shared by the backup decision and the prune.
function readRecordsBaseline(cwd: string): FileRecords | null {
  return recordsBaseline(readRecords(cwd)).records;
}

// Refuse when any target's path crosses a symlinked component: `rmSync`
// resolves ancestors, so with `pharn -> ../shared` it would delete outside the
// project, and `safeJoin` is lexical. Run right before the backup scan, so a
// refusal saves and deletes nothing — on the picker path also before its
// confirm, so a refused selection is never asked about (a parent may be
// swapped to a link while the confirm is open). deleteCapabilityDir walks
// again at the delete. Not atomic with `rmSync` (no userland walk can be). It
// THROWS so the lock is released before runRemove's exit. ENOTDIR is not a
// link: that dir does not exist.
function refuseSymlinkedTargets(
  cwd: string,
  paths: LayoutPaths,
  targets: InstalledCapability[],
): void {
  for (const target of targets) {
    const linked = linkedComponent(cwd, paths, target);
    if (linked !== null) {
      throw new SymlinkedTargetError(
        `Refusing to remove ${target.name} (${target.role}): ${linked} is a symbolic link, so deleting through it would delete files OUTSIDE the project. Nothing was removed. Delete the directory yourself if that is what you want.`,
      );
    }
  }
}

// Drop the removed capabilities' entries from `pharn.records.json`, so the
// store describes only files pharn still manages.
//
// A key-prefix filter over the STORE, never a filesystem walk: after the
// delete (and on the "already gone" path, before it) the directory is gone, so
// the store is the only place the answer exists. Only an already-readable store
// is edited (as `add` does); minting one would claim files we never hashed. The
// baseline `note` is not surfaced — `update` names an unusable store.
async function pruneCapabilityRecords(
  cwd: string,
  config: PharnConfig,
  paths: LayoutPaths,
  targets: InstalledCapability[],
  // readRecordsBaseline's result for the run (the delete touches no record).
  records: FileRecords | null,
): Promise<void> {
  if (records === null) return; // absent/corrupt → leave it alone

  // The trailing slash is load-bearing: without it `lenses/a11y` would also eat
  // every key belonging to `lenses/a11y-extended`.
  const prefixes = targets.map((t) => `${capabilityRelDir(paths, t)}/`);
  const kept: FileRecords = {};
  let dropped = 0;
  for (const [key, hash] of Object.entries(records)) {
    // Keys are COMPARED as strings and never joined into a path, so a
    // hand-edited store cannot drive a filesystem access.
    if (prefixes.some((prefix) => key.startsWith(prefix))) dropped++;
    else kept[key] = hash;
  }
  if (dropped === 0) return; // nothing matched → the store stays byte-identical

  // The stamp does not move: `remove` changes neither `skillsVersion` nor
  // `commit`, so the store is re-written against the config's pair.
  await writeRecords(cwd, {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
    files: kept,
  });
}

// Warn when a capability being removed will come back. Derived from the STORED
// `source` alone (no index offline), and only for the LITERAL 'auto': an ABSENT
// `source` means unknown provenance, and a false warning to a legacy manual add
// is worse than none.
function warnIfAutoSelected(targets: InstalledCapability[]): void {
  const auto = targets.filter((c) => c.source === 'auto');
  if (auto.length === 0) return;
  const names = auto.map((c) => `${c.name} (${c.role})`).join(', ');
  const one = auto.length === 1;
  const pronoun = one ? 'it' : 'them';
  // WHEN it comes back, not "the next update": at the installed version
  // `update` early-returns, and nothing local re-opens it (the entry and its
  // records are gone). It comes back with the next run that re-applies the
  // install, or now with `--force`.
  log.warn(
    `${names} ${one ? 'is' : 'are'} selected automatically for your archetypes, so ${one ? 'it comes' : 'they come'} back: the next \`pharn update\` that re-applies your install — at the latest the one that moves to a new pharn-oss version — reinstalls ${pronoun} and names ${pronoun} in its report. Until then \`pharn update\` may answer "Already up to date" and leave ${pronoun} removed; \`pharn update --force\` reinstalls ${pronoun} now.`,
  );
}

// `pharn remove <name>` / `<role>:<name>` — resolve to ONE installed capability
// and delete it.
async function removeNamed(
  cwd: string,
  config: PharnConfig,
  installed: InstalledCapability[],
  address: string,
  fingerprint: string,
): Promise<void> {
  const parsed = parseCapabilityArg(address);
  if (parsed.error) throw CliError.error(parsed.error);
  const matches = installed.filter(
    (c) =>
      c.name === parsed.name &&
      (parsed.role === undefined || c.role === parsed.role),
  );

  // Not installed → an ERROR (exit 1), as `pharn add bogus` is: a script that
  // names the wrong capability must not read success. Lists the installed
  // capabilities as the valid values.
  if (matches.length === 0) {
    const valid = installed.map((c) => `${c.role}:${c.name}`).sort();
    const hint = valid.length
      ? ` Installed: ${valid.join(', ')}.`
      : ' No capabilities are installed.';
    throw CliError.error(
      `"${address}" is not an installed capability.${hint} Nothing was removed.`,
    );
  }
  if (matches.length > 1) {
    throw CliError.error(
      `"${parsed.name}" is ambiguous — use ${matches.map((m) => `${m.role}:${m.name}`).join(' or ')}.`,
    );
  }

  const target = matches[0]!;
  const paths = layoutPaths(configLayout(config));
  // Under runRemove's lock: backup → delete → prune → config, each write
  // atomic but the sequence not. No prompt and no network on this path.
  refuseSymlinkedTargets(cwd, paths, [target]);
  assertConfigFingerprintUnchanged(cwd, fingerprint, 'remove');
  const records = readRecordsBaseline(cwd);
  backupBeforeDelete(cwd, paths, [target], records);
  const existed = deleteCapabilityDir(cwd, paths, target);

  // Order: backup → delete → prune → config (records before config, as in
  // `add`). The PAIR is not a transaction, only benign on failure: a failed
  // prune leaves stale entries the next `update` prunes; a failed config
  // write leaves the entry listed with its files absent, which the next
  // `update` restores. `existed` does not gate the prune: on the "already
  // gone" path the records are what is left to clean up.
  await pruneCapabilityRecords(cwd, config, paths, [target], records);

  // Survivors are the ORIGINAL objects, so their `source` is carried through.
  await writePharnConfig(cwd, {
    ...config,
    capabilities: installed.filter(
      (c) => !(c.name === target.name && c.role === target.role),
    ),
    // `installedAt` rides the spread: a remove is a partial edit.
  });
  const note = existed ? '' : pc.dim(' (its files were already gone)');

  warnIfAutoSelected([target]);

  outro(`${pc.green('✔')} Removed ${target.name} (${target.role})${note}`);
}

// ---------------------------------------------------------------------------
// Bare `pharn remove` — the interactive multi-select picker (subtractive-only).
// ---------------------------------------------------------------------------

// Nothing installed → benign message (even non-TTY). Non-TTY → a usage error +
// exit(1), never a prompt; TTY → multi-select, ONE confirm listing the picks,
// then one backup, the deletes and a single config write.
async function runRemovePicker(
  cwd: string,
  config: PharnConfig,
  installed: InstalledCapability[],
  fingerprint: string,
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
    throw CliError.error(
      'Specify a capability to remove (e.g. `pharn remove a11y`), or run `pharn remove` in an interactive terminal to pick from a list.',
    );
  }

  const { groups } = buildRemoveSelection(installed);
  const picked = await groupMultiselect({
    message: 'Select capabilities to remove',
    options: groups,
    required: false,
    selectableGroups: false,
  });
  if (isCancel(picked)) throw CliError.cancel();
  const values = picked as string[];
  if (values.length === 0) {
    outro('Nothing selected. No capabilities were removed.');
    return;
  }

  // Map each picked `role:name` back to its installed entry.
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
  if (isCancel(ok) || ok !== true) throw CliError.cancel();

  // Still under runRemove's lock, spanning the whole selection. The write-time
  // checks for what may have changed while the prompts were open: a parent
  // swapped to a link, a hand-edited config.
  refuseSymlinkedTargets(cwd, paths, targets);
  assertConfigFingerprintUnchanged(cwd, fingerprint, 'remove');
  // ONE backup for the whole selection — a failure deletes none of the picks.
  const records = readRecordsBaseline(cwd);
  backupBeforeDelete(cwd, paths, targets, records);
  for (const target of targets) deleteCapabilityDir(cwd, paths, target);

  // One prune for the whole selection, one store write to match the one
  // config write.
  await pruneCapabilityRecords(cwd, config, paths, targets, records);

  // Survivors are the original objects, as in removeNamed.
  const removed = new Set(targets.map((t) => `${t.role}:${t.name}`));
  await writePharnConfig(cwd, {
    ...config,
    capabilities: installed.filter((c) => !removed.has(`${c.role}:${c.name}`)),
  });

  warnIfAutoSelected(targets);

  outro(
    `${pc.green('✔')} Removed ${targets.length} ${plural(targets.length)}.`,
  );
}

function plural(n: number): string {
  return n === 1 ? 'capability' : 'capabilities';
}
