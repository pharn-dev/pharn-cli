import { lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { posix } from 'node:path';
import { confirm, intro, isCancel, note, outro } from '@clack/prompts';
import pc from '../lib/color.js';
import { BACKUP_DIR, createBackup, printBackupNotice } from '../lib/backup.js';
import { backupDirIgnored } from '../lib/gitignore.js';
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
import {
  LOCK_DIR,
  ProjectLockedError,
  withProjectLock,
} from '../lib/project-lock.js';
import { errorMessage, logError } from '../lib/report-error.js';
import { CLAUDE_HOOKS_DIR, CLAUDE_SETTINGS_FILE } from '../lib/constants.js';
import { escapeUnsafe } from '../lib/terminal-safe.js';
import { isInstallRootPath } from '../lib/orphans.js';
import { planUninstall, type UninstallPlan } from '../lib/uninstall-plan.js';
import { safeJoin } from '../lib/validate.js';
import type { PharnConfig } from '../types.js';

// `pharn uninstall` — remove PHARN from a project, deleting only what pharn can
// PROVE it wrote and nobody changed (lib/uninstall-plan.ts): a file recorded in
// a usable `pharn.records.json`, at an install path, still at its recorded hash
// (a `.claude/settings.json` a fresh `init` wrote is recorded too). Edited and
// unrecorded files and every `pharn/.backup/` stay, and the kept ones are
// listed. Offline: without a usable store it refuses rather than guesses
// (manual procedure: docs/troubleshooting.md).
//
// Order, inside the lock: re-check the config → re-plan (the pre-prompt plan
// is advisory) → back up pharn.config.json → delete the provable files →
// remove emptied directories → delete pharn.records.json → delete
// pharn.config.json LAST. The config is the "installed" marker, so a failure
// before it leaves a state a re-run finishes (an ordering, not a transaction).
//
// The confirm runs BEFORE the lock; `--yes` skips it, and off a TTY without
// `--yes` the command refuses rather than prompting into a dead stream.

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

  // Nothing there is the one benign case (a second run lands here). A config
  // that EXISTS but is unreadable or legacy still exits 1 via the loader.
  if (lstatSync(configPath(cwd), { throwIfNoEntry: false }) === undefined) {
    outro(
      `PHARN is not installed here (no ${CONFIG_FILENAME}). Nothing was removed.`,
    );
    return;
  }
  const config = loadArchetypeConfigOrExit(cwd);

  const records = usableRecords(cwd);
  if (typeof records === 'string') {
    logError(records);
    process.exit(1);
  }
  const preview = planUninstall(cwd, records);
  if (preview.unsafe.length > 0) {
    logError(unsafeMessage(preview));
    process.exit(1);
  }
  note(planLines(preview, settingsRecorded(records)).join('\n'), 'PLAN');

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
    // Refusals with a complete message, not crashes; the unwinding released the
    // lock.
    if (err instanceof ProjectLockedError || err instanceof UninstallError) {
      logError(err.message);
      process.exit(1);
    }
    throw err;
  }

  reportResult(cwd, result, finishPharnDir(cwd));
  outro(`${pc.green('✔')} PHARN was uninstalled.`);
}

// The validated record store, or the refusal naming why there is none. Absent
// and corrupt both mean nothing is provable. A store stamped for another
// install state is still usable: only a file whose hash equals its record is
// ever deleted.
function usableRecords(cwd: string): FileRecords | string {
  const read = readRecords(cwd);
  const baseline = recordsBaseline(read);
  if (baseline.records !== null) return baseline.records;
  const reason =
    read.kind === 'invalid'
      ? escapeUnsafe(read.message)
      : `there is no ${RECORDS_FILE}`;
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
  // Re-plan under the lock: the tree may have changed while the prompt was open.
  const records = usableRecords(cwd);
  if (typeof records === 'string') throw new UninstallError(records);
  const plan = planUninstall(cwd, records);
  if (plan.unsafe.length > 0) throw new UninstallError(unsafeMessage(plan));

  // Before anything is deleted: a config that cannot be saved stops the run.
  // Announced at creation — the user's only pointer to their `models` / `seam`
  // / own keys.
  let backupDir: string;
  try {
    backupDir = createBackup(cwd, [CONFIG_FILENAME]);
  } catch (err) {
    throw new UninstallError(
      `Could not back up ${CONFIG_FILENAME} before uninstalling: ${errorMessage(err).replace(/\.$/, '')}. Nothing was removed.`,
    );
  }
  printBackupNotice({
    dir: backupDir,
    saved: CONFIG_FILENAME,
    gitignored: backupDirIgnored(cwd),
  });

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

// Remove the directories the deletes left EMPTY, deepest first, climbing toward
// — never to — the project root. `rmdirSync` is non-recursive, so the kernel
// keeps any directory that still holds something. A directory that could not
// be removed blocks its ancestors; only the deepest are reported.
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

// Whether the store records `.claude/settings.json` (a fresh `init` wrote it):
// its fate is then in the plan's buckets, so it is not also called untouched.
function settingsRecorded(records: FileRecords): boolean {
  return Object.hasOwn(records, CLAUDE_SETTINGS_FILE);
}

// What uninstall never touches.
function untouchedLine(settingsIsRecorded: boolean): string {
  const settings = settingsIsRecorded ? '' : `${CLAUDE_SETTINGS_FILE}, `;
  return `${settings}.claude/settings.local.json, every ${BACKUP_DIR}/ directory and the lines pharn added to .gitignore and .prettierignore are left untouched.`;
}

function planLines(plan: UninstallPlan, settingsIsRecorded: boolean): string[] {
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
    `Files pharn has no record of are never deleted. ${untouchedLine(settingsIsRecorded)}`,
  );
  return lines;
}

// After the lock is released: remove `pharn/` if the run left it EMPTY (the
// lock file sat in it until now). One non-recursive rmdir; ENOENT and
// ENOTEMPTY count as success. Returns what is left (unrecorded files uninstall
// never deletes), or null when it is gone.
function finishPharnDir(cwd: string): string[] | null {
  const dir = safeJoin(cwd, LOCK_DIR);
  try {
    rmdirSync(dir);
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    try {
      return readdirSync(dir).sort();
    } catch {
      return [];
    }
  }
}

function reportResult(
  cwd: string,
  result: UninstallResult,
  pharnLeft: string[] | null,
): void {
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
    `${untouchedLine(settingsRecorded(result.records))} Delete ${BACKUP_DIR}/ yourself once you no longer need it.`,
  );
  if (pharnLeft !== null) {
    const names = pharnLeft.slice(0, MAX_LISTED).map((n) => escapeUnsafe(n));
    const more = pharnLeft.length - names.length;
    lines.push(
      `${LOCK_DIR}/ was left because it still holds files pharn has no record of${names.length > 0 ? ` (${names.join(', ')}${more > 0 ? `, …and ${more} more` : ''})` : ''} — you may delete it once you no longer need them.`,
    );
  }
  note(lines.join('\n'), 'UNINSTALLED');

  const hookLines = danglingHookLines(cwd, result.records);
  if (hookLines.length > 0) note(hookLines.join('\n'), 'HOOKS');
}

// The hook wiring left pointing at a recorded `.claude/hooks/*` script that is
// gone now. pharn never writes the settings files, so this is a list for the
// user. Only keys within the isInstallRootPath bound are considered, lstat only.
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

// Nothing at `rel` any more (ENOTDIR counts: nothing can be there either).
function isGone(cwd: string, rel: string): boolean {
  try {
    return (
      lstatSync(safeJoin(cwd, rel), { throwIfNoEntry: false }) === undefined
    );
  } catch {
    return true;
  }
}
