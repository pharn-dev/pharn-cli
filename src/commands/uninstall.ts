import { lstatSync, rmdirSync, unlinkSync } from 'node:fs';
import { posix } from 'node:path';
import { confirm, intro, isCancel, log, note, outro } from '@clack/prompts';
import pc from '../lib/color.js';
import { BACKUP_DIR, createBackup } from '../lib/backup.js';
import { interactiveAllowed } from '../lib/capability-picker.js';
import { cancelAndExit } from '../lib/confirm.js';
import { displayHook, hooksReferencing } from '../lib/hook-wiring.js';
import {
  readRecords,
  recordsBaseline,
  RECORDS_FILE,
  recordsPath,
  type FileRecords,
} from '../lib/install-records.js';
import {
  assertConfigUnchanged,
  CONFIG_FILENAME,
  configPath,
  loadArchetypeConfigOrExit,
} from '../lib/pharn-config.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import { errorMessage, logError } from '../lib/report-error.js';
import { CLAUDE_HOOKS_DIR, CLAUDE_SETTINGS_FILE } from '../lib/constants.js';
import { escapeUnsafe } from '../lib/terminal-safe.js';
import { isInstallRootPath } from '../lib/orphans.js';
import { planUninstall, type UninstallPlan } from '../lib/uninstall-plan.js';
import { safeJoin } from '../lib/validate.js';
import type { PharnConfig } from '../types.js';

// `pharn uninstall` — remove PHARN from a project, deleting only what pharn can
// PROVE it wrote and nobody changed (lib/uninstall-plan.ts): a file recorded in a
// usable `pharn.records.json`, at a path an install writes, still at its
// recorded sha256. Everything else stays where it is — an edited file, a file
// pharn has no record of, `.claude/settings.json` (never written), and every
// `.pharn-backup/` directory — and the edited/unverifiable files are listed.
//
// Offline, like `remove`: no clone, no network, no repo module imported. The
// only proof is the local record store, so a project without a usable one is
// refused rather than guessed at (P5) — the manual procedure is documented in
// docs/troubleshooting.md.
//
// Order, inside the project lock: re-check the config → re-plan (the plan shown
// before the prompt is advisory; this one is authoritative) → back up
// pharn.config.json → delete the provable files → remove directories left empty
// → delete pharn.records.json → delete pharn.config.json LAST. The config is the
// "installed" marker, so any failure before it leaves a state a re-run finishes:
// the files already deleted simply read as `absent`. That is an ordering
// argument (advisory, P0), not a transaction.
//
// The confirm runs BEFORE the lock (a prompt is unbounded work); `--yes` skips
// it, and off a TTY without `--yes` the command refuses rather than prompting
// into a dead stream.

/** Most paths any one list in the notes shows before "…and N more". */
const MAX_LISTED = 10;

export interface UninstallOptions {
  yes?: boolean;
}

// A refusal or failure with a complete, user-facing message; runUninstall
// reports it and exits 1.
class UninstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UninstallError';
  }
}

interface UninstallResult {
  plan: UninstallPlan;
  deleted: string[];
  removedDirs: string[];
  keptDirs: string[];
  backupDir: string;
  records: FileRecords;
}

export async function runUninstall(opts: UninstallOptions = {}): Promise<void> {
  intro('pharn uninstall');
  const cwd = process.cwd();

  // Nothing there at all is the one benign case: a second run after a
  // successful uninstall lands here. A config that EXISTS but is unreadable or
  // legacy still goes through the shared loader's exit 1.
  if (lstatSync(configPath(cwd), { throwIfNoEntry: false }) === undefined) {
    outro(
      `PHARN is not installed here (no ${CONFIG_FILENAME}). Nothing was removed.`,
    );
    return;
  }
  const config = loadArchetypeConfigOrExit(cwd);

  const records = usableRecords(cwd, config);
  if (typeof records === 'string') {
    logError(records);
    process.exit(1);
  }
  const preview = planUninstall(cwd, records);
  if (preview.unsafe.length > 0) {
    logError(unsafeMessage(preview));
    process.exit(1);
  }
  note(planLines(preview).join('\n'), 'PLAN');

  if (!opts.yes) {
    if (
      !interactiveAllowed({
        stdinIsTTY: process.stdin.isTTY,
        stdoutIsTTY: process.stdout.isTTY,
      })
    ) {
      logError(
        '`pharn uninstall` asks for confirmation, and this is not an interactive terminal. Re-run it in a terminal, or pass --yes to uninstall without asking. Nothing was removed.',
      );
      process.exit(1);
    }
    const ok = await confirm({
      message: `Uninstall PHARN — delete ${preview.delete.length} file(s), ${RECORDS_FILE} and ${CONFIG_FILENAME}?`,
      initialValue: false,
    });
    if (isCancel(ok) || ok !== true) cancelAndExit();
  }

  let result: UninstallResult;
  try {
    result = await withProjectLock(cwd, 'uninstall', () =>
      applyUninstall(cwd, config),
    );
  } catch (err) {
    // Both are refusals with a complete message, not crashes. The lock was
    // released by the unwinding that got us here.
    if (err instanceof ProjectLockedError || err instanceof UninstallError) {
      logError(err.message);
      process.exit(1);
    }
    throw err;
  }

  reportResult(cwd, result);
  outro(`${pc.green('✔')} PHARN was uninstalled.`);
}

// The validated, stamp-checked record store, or the refusal naming why there
// is none. Absent, corrupt and stamped-for-another-state all mean the same
// thing here: nothing is provable, so nothing may be deleted.
function usableRecords(cwd: string, config: PharnConfig): FileRecords | string {
  const read = readRecords(cwd);
  const baseline = recordsBaseline(read, {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  });
  if (baseline.records !== null) return baseline.records;
  const reason =
    read.kind === 'absent'
      ? `there is no ${RECORDS_FILE}`
      : read.kind === 'invalid'
        ? escapeUnsafe(read.message)
        : `${RECORDS_FILE} was written for a different install state than ${CONFIG_FILENAME}`;
  return `Cannot uninstall: ${reason}. ${RECORDS_FILE} is the only proof of which files pharn wrote, so without a usable one nothing was removed. Remove PHARN by hand instead (docs/troubleshooting.md, "Removing PHARN by hand").`;
}

function unsafeMessage(plan: UninstallPlan): string {
  const first = plan.unsafe[0]!;
  return `Refusing to uninstall: ${escapeUnsafe(first.component)} is a symbolic link, so deleting ${escapeUnsafe(first.rel)} through it would delete a file OUTSIDE the project. Nothing was removed.`;
}

// The write half. Runs inside the project lock.
async function applyUninstall(
  cwd: string,
  config: PharnConfig,
): Promise<UninstallResult> {
  assertConfigUnchanged(cwd, config, 'uninstall');
  // Re-read and re-plan under the lock: the prompt may have been open while the
  // tree changed, and THIS plan is the one that decides.
  const records = usableRecords(cwd, config);
  if (typeof records === 'string') throw new UninstallError(records);
  const plan = planUninstall(cwd, records);
  if (plan.unsafe.length > 0) throw new UninstallError(unsafeMessage(plan));

  // Before anything is deleted: a config that cannot be saved stops the run
  // with every file in place. Announced at creation — it is the user's only
  // pointer back to their `models` / `seam` / own keys.
  let backupDir: string;
  try {
    backupDir = createBackup(cwd, [CONFIG_FILENAME]);
  } catch (err) {
    throw new UninstallError(
      `Could not back up ${CONFIG_FILENAME} before uninstalling: ${errorMessage(err).replace(/\.$/, '')}. Nothing was removed.`,
    );
  }
  log.info(`Backed up ${CONFIG_FILENAME} to ${backupDir}.`);

  const deleted: string[] = [];
  for (const rel of plan.delete) {
    try {
      unlinkSync(safeJoin(cwd, rel));
      deleted.push(rel);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new UninstallError(
        `Could not delete ${escapeUnsafe(rel)}: ${errorMessage(err).replace(/\.$/, '')}. ${deleted.length} file(s) were deleted before it; ${RECORDS_FILE} and ${CONFIG_FILENAME} were kept, so re-running \`pharn uninstall\` continues from here.`,
      );
    }
  }
  const { removedDirs, keptDirs } = removeEmptyDirs(cwd, deleted);

  // Records first, config LAST (see the header).
  unlinkIfPresent(recordsPath(cwd), RECORDS_FILE);
  unlinkIfPresent(configPath(cwd), CONFIG_FILENAME);

  return { plan, deleted, removedDirs, keptDirs, backupDir, records };
}

function unlinkIfPresent(abs: string, label: string): void {
  try {
    unlinkSync(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new UninstallError(
      `Could not delete ${label}: ${errorMessage(err).replace(/\.$/, '')}. Every file pharn could prove it wrote is already gone; delete ${label} yourself to finish.`,
    );
  }
}

// Remove the directories the deletes left EMPTY, deepest first, climbing from
// each deleted file toward — never to — the project root. `rmdirSync` is
// non-recursive: the kernel refuses a directory that still holds anything, so a
// user's feature folder, an edited or unrecorded file, or `.claude/settings.json`
// keeps its directory by construction (the floor here is the syscall, not this
// code's judgment). A directory that could not be removed blocks every ancestor
// (they cannot be empty), and only the deepest such directories are reported.
function removeEmptyDirs(
  cwd: string,
  deleted: readonly string[],
): { removedDirs: string[]; keptDirs: string[] } {
  const candidates = new Set<string>();
  for (const rel of deleted) {
    for (let dir = posix.dirname(rel); dir !== '.'; dir = posix.dirname(dir)) {
      candidates.add(dir);
    }
  }
  const deepestFirst = [...candidates].sort(
    (a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b),
  );
  const removedDirs: string[] = [];
  const keptDirs: string[] = [];
  const blocked = new Set<string>();
  for (const dir of deepestFirst) {
    if (blocked.has(dir)) continue;
    try {
      rmdirSync(safeJoin(cwd, dir));
      removedDirs.push(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      keptDirs.push(dir);
      for (let up = posix.dirname(dir); up !== '.'; up = posix.dirname(up)) {
        blocked.add(up);
      }
    }
  }
  return { removedDirs: removedDirs.sort(), keptDirs: keptDirs.sort() };
}

// Up to MAX_LISTED escaped paths, one per line, then "…and N more".
function listed(rels: readonly string[]): string[] {
  const shown = rels.slice(0, MAX_LISTED).map((r) => `  • ${escapeUnsafe(r)}`);
  const more = rels.length - MAX_LISTED;
  return more > 0 ? [...shown, `  …and ${more} more`] : shown;
}

const UNTOUCHED = `${CLAUDE_SETTINGS_FILE}, .claude/settings.local.json and every ${BACKUP_DIR}/ directory are left untouched.`;

function planLines(plan: UninstallPlan): string[] {
  const lines = [
    `Delete ${plan.delete.length} file(s) pharn installed and nobody changed.`,
  ];
  if (plan.edited.length > 0) {
    lines.push(
      `Keep ${plan.edited.length} file(s) you changed (they stay where they are):`,
      ...listed(plan.edited),
    );
  }
  if (plan.unverifiable.length > 0) {
    lines.push(
      `Keep ${plan.unverifiable.length} path(s) that cannot be verified (not a regular file, or unreadable):`,
      ...listed(plan.unverifiable),
    );
  }
  if (plan.outside.length > 0) {
    lines.push(
      `Leave ${plan.outside.length} recorded path(s) outside pharn's install paths (never deleted, whatever their hash):`,
      ...listed(plan.outside),
    );
  }
  if (plan.absent.length > 0) {
    lines.push(`${plan.absent.length} recorded file(s) are already gone.`);
  }
  lines.push(
    `Then remove directories left empty, and delete ${RECORDS_FILE} and ${CONFIG_FILENAME} (backed up to ${BACKUP_DIR}/ first).`,
    `Files pharn has no record of are never deleted. ${UNTOUCHED}`,
  );
  return lines;
}

function reportResult(cwd: string, result: UninstallResult): void {
  const { plan, deleted, removedDirs, keptDirs, backupDir } = result;
  const lines = [
    `Deleted ${deleted.length} file(s) and ${removedDirs.length} empty director${removedDirs.length === 1 ? 'y' : 'ies'}, plus ${RECORDS_FILE} and ${CONFIG_FILENAME}.`,
  ];
  const kept = [...plan.edited, ...plan.unverifiable].sort();
  if (kept.length > 0) {
    lines.push(
      `Kept ${kept.length} file(s) pharn could not prove are unchanged — they are yours now:`,
      ...listed(kept),
    );
  }
  if (keptDirs.length > 0) {
    lines.push(
      `Left ${keptDirs.length} director${keptDirs.length === 1 ? 'y' : 'ies'} that still hold other files:`,
      ...listed(keptDirs),
    );
  }
  lines.push(
    `${CONFIG_FILENAME} was backed up to ${backupDir}.`,
    `${UNTOUCHED} Delete ${BACKUP_DIR}/ yourself once you no longer need it.`,
  );
  note(lines.join('\n'), 'UNINSTALLED');

  const hookLines = danglingHookLines(cwd, result.records);
  if (hookLines.length > 0) note(hookLines.join('\n'), 'HOOKS');
}

// The hook wiring left pointing at a recorded `.claude/hooks/*` script that is
// gone now (deleted by this run, or already absent). pharn never writes the
// settings files, so this is a list for the user to act on.
// Only keys that name an installed hook script are considered (the same
// isInstallRootPath bound the deletes use), and they are only lstat-ed.
function danglingHookLines(cwd: string, records: FileRecords): string[] {
  const gone = Object.keys(records).filter(
    (rel) =>
      rel.startsWith(`${CLAUDE_HOOKS_DIR}/`) &&
      isInstallRootPath(rel) &&
      isGone(cwd, rel),
  );
  const refs = hooksReferencing(cwd, gone);
  if (refs.length === 0) return [];
  const lines: string[] = [];
  for (const ref of refs) {
    if (ref.kind === 'unreadable') {
      lines.push(
        `  ${ref.file} could not be read (${ref.reason}); check it for hooks that run a removed script.`,
      );
      continue;
    }
    lines.push(
      `  ${ref.file} still wires ${ref.entries.length} hook(s) whose script was removed:`,
      ...ref.entries.map((e) => `  ${displayHook(e)}`),
    );
  }
  lines.push(
    '',
    '  pharn never edits these files — remove those entries by hand.',
    '  Matching is textual: a hook that reaches a removed script another way is not listed.',
  );
  return lines;
}

// Nothing at `rel` any more. A component that is not a directory (ENOTDIR)
// means nothing can be there either.
function isGone(cwd: string, rel: string): boolean {
  try {
    return (
      lstatSync(safeJoin(cwd, rel), { throwIfNoEntry: false }) === undefined
    );
  } catch {
    return true;
  }
}
