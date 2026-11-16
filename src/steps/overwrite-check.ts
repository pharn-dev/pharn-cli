import { confirm, isCancel, log } from '@clack/prompts';
import {
  collectExpectedInstallPaths,
  PHARN_CONFIG_FILE,
} from '../lib/install-manifest.js';
import { detectLayout } from '../lib/layout.js';
import type { DriftLabel } from '../lib/dest-drift.js';
import {
  DRIFT_LABEL_ORDER,
  MAX_LISTED,
  planWriteTargets,
  removalLines,
  targetLines,
} from '../lib/write-targets.js';
import type { CapabilityRemoval } from '../lib/capability-removal.js';
import { BACKUP_DIR } from '../lib/backup.js';
import { readJsonBounded } from '../lib/bounded-read.js';
import type { FileRecords } from '../lib/install-records.js';
import { safeJoin, VERSION_RE } from '../lib/validate.js';
import type { Selection } from '../types.js';

// ---------------------------------------------------------------------------
// The pre-install write-target conflict check. PHARN installs into an EXISTING
// project, so init's real risk is overwriting files that already exist: this
// lists the install's write targets that ALREADY exist (pharn.config.json
// included) and, only then, confirms (default No). A conflict-free project gets
// no prompt. The paths come from the untrusted clone but are safeJoin-contained
// and only displayed.
// ---------------------------------------------------------------------------

// The list cap, shared with init's --yes refusal (lib/write-targets.ts).
export { MAX_LISTED };

// The `skillsVersion` the project's own pharn.config.json records, or null when
// there is none worth showing — cosmetic input, cosmetic failure.
//
// Deliberately NOT readPharnConfig, which throws on a bad hand-edit: `init` is
// the command that REPAIRS a broken config, so this reads the one scalar it
// displays and treats every failure as "no version to show". File-local and
// unexported: a total-catch reader is wrong for any other caller. Filtered
// through VERSION_RE before reaching the terminal, so an escape sequence is
// dropped, never printed.
function recordedSkillsVersion(cwd: string): string | null {
  // Bounded and non-blocking: a FIFO must not hang the prompt it decorates.
  const read = readJsonBounded(safeJoin(cwd, PHARN_CONFIG_FILE));
  if (read.kind !== 'ok') return null;
  const parsed = read.value;
  if (typeof parsed !== 'object' || parsed === null) return null;
  const version = (parsed as { skillsVersion?: unknown }).skillsVersion;
  return typeof version === 'string' && VERSION_RE.test(version)
    ? version
    : null;
}

/**
 * What the user decided about overwriting existing write targets. Three
 * states, and this stage NEVER calls process.exit: it runs inside init's `try`,
 * whose `finally` disposes of the temp clone, which Node skips on exit. The
 * caller exits after the finally. `decline` and `cancel` stay DISTINCT even
 * though init maps both to `cancelled`.
 */
export type WriteTargetsAction = 'proceed' | 'decline' | 'cancel';

// One line per group: WHY these files are backed up. "Your edits" is claimed
// only where pharn can show it.
function labelLine(label: DriftLabel, n: number): string {
  const one = n === 1;
  switch (label) {
    case 'modified':
      return `${n} of them changed since pharn wrote ${one ? 'it' : 'them'} (your edits).`;
    case 'unrecorded':
      return `${n} of them ${one ? 'differs' : 'differ'} from upstream, and pharn has no record of ${one ? 'it' : 'them'}.`;
    case 'unverifiable':
      return `${n} of them ${one ? 'differs' : 'differ'} from upstream — pharn has no record to tell your edits from upstream changes.`;
  }
}

/**
 * What init already knows when it asks: the manifest it computed once and the
 * replaced install's records baseline. No manifest → computed here; no records
 * → every differing file is `unverifiable`.
 */
export interface WriteTargetsContext {
  manifest?: ReadonlyMap<string, string>;
  records?: FileRecords | null;
  // The dropped capability directories this install would delete, listed in
  // the same prompt; any deletion shows the prompt even with no overwrite.
  removals?: readonly CapabilityRemoval[];
}

// 'proceed' when there is nothing to overwrite or the user confirmed;
// 'decline' on a No; 'cancel' on Ctrl+C. Never exits.
export async function confirmWriteTargets(
  repoDir: string,
  cwd: string,
  selection: Selection,
  context: WriteTargetsContext = {},
): Promise<WriteTargetsAction> {
  const manifest =
    context.manifest ??
    collectExpectedInstallPaths({
      repoDir,
      capabilities: selection.selected,
      layout: detectLayout(repoDir),
    });
  // Which targets exist, which will be backed up (the files `update` would
  // have SKIPPED), and their order — one computation shared with `init
  // --dry-run` and `init --yes` (lib/write-targets.ts). ADVISORY: the install
  // re-scans under the lock right before the copy. An existing
  // `pharn.config.json` is always backed up and ranked right after the
  // labelled files, so the MAX_LISTED cap cannot hide it.
  const { conflicts, labels, configBackedUp, removals } = planWriteTargets({
    repoDir,
    projectRoot: cwd,
    capabilities: selection.selected,
    manifest,
    records: context.records ?? null,
    removals: context.removals,
  });
  const deletes = removalLines(removals);
  // Nothing to overwrite and nothing to delete → no prompt. A deletion always
  // asks.
  if (conflicts.length === 0 && deletes.length === 0) return 'proceed';
  const deleteBackups = removals
    .filter((r) => r.present)
    .reduce((n, r) => n + r.backups.length, 0);
  const deleteBlock =
    deletes.length > 0
      ? `${conflicts.length > 0 ? '\n' : ''}These capability directories are no longer selected and will be DELETED (pharn runs every capability directory on disk):\n${deletes.join('\n')}${deleteBackups > 0 ? `\n${deleteBackups} file(s) in them pharn did not write will be copied to ${BACKUP_DIR}/ first.` : ''}`
      : '';
  if (conflicts.length === 0) {
    log.warn(`PHARN installs into your existing project. ${deleteBlock}`);
    const result = await confirm({
      message: 'Continue and delete them?',
      initialValue: false,
    });
    if (isCancel(result)) return 'cancel';
    return result === true ? 'proceed' : 'decline';
  }

  const list = targetLines(
    { conflicts, labels, configBackedUp },
    MAX_LISTED,
  ).join('\n');
  const counts = DRIFT_LABEL_ORDER.map(
    (label) =>
      [label, [...labels.values()].filter((l) => l === label).length] as const,
  ).filter(([, n]) => n > 0);
  const editsLine =
    labels.size > 0
      ? `\n${counts.map(([label, n]) => labelLine(label, n)).join('\n')}\n${labels.size === 1 ? 'It' : `All ${labels.size}`} will be copied to ${BACKUP_DIR}/ before being overwritten.`
      : '';
  const configLine = configBackedUp
    ? `\n${PHARN_CONFIG_FILE} will be rewritten (models reset to its default); it will be copied to ${BACKUP_DIR}/ first.`
    : '';
  // Only on a re-install over an existing config, and only after the
  // zero-conflict return above, so a banner never makes a silent install prompt.
  const version = conflicts.includes(PHARN_CONFIG_FILE)
    ? recordedSkillsVersion(cwd)
    : null;
  const intro =
    version === null
      ? 'PHARN installs into your existing project.'
      : `PHARN installs into your existing project (currently at skills v${version}).`;
  // Direct clack rather than a confirm.ts helper: every helper there ends in
  // cancelAndExit, and this stage must not exit.
  log.warn(
    `${intro} These paths already exist and may be overwritten:\n${list}${editsLine}${configLine}${deleteBlock ? `\n${deleteBlock}` : ''}`,
  );
  const result = await confirm({
    message:
      deletes.length > 0
        ? 'Continue, overwrite and delete?'
        : 'Continue and overwrite?',
    initialValue: false,
  });
  if (isCancel(result)) return 'cancel';
  return result === true ? 'proceed' : 'decline';
}
