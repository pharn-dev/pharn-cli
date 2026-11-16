import { gitignoreLines, type GitignoreOutcome } from './gitignore.js';
import {
  prettierignoreLines,
  type PrettierignoreOutcome,
} from './prettierignore.js';
import { log, note, outro } from '@clack/prompts';
import { hookWiringLines, type HookWiringDiff } from './hook-wiring.js';
import { absentSurfaceLines } from './absent-surfaces.js';
import type { AbsentSurface } from './install-manifest.js';
import type { CapabilityRemoval, UpdatePlanReport } from './update-plan.js';
import pc from './color.js';
import type { CapabilityChange } from './merge-capabilities.js';
import {
  BACKUP_DIR,
  backupAction,
  printBackupNotice,
  type BackupAction,
} from './backup.js';
import { RECORDS_FILE } from './install-records.js';
import { changesNoFiles } from './update-next.js';
import { modelsLabelLines } from './model-config-format.js';
import type { ModelsUpdate } from './models-update.js';
import { escapeUnsafe, terminalSafe } from './terminal-safe.js';
import { orphanNoteLines, type Orphan } from './orphans.js';
import {
  rootMigrationNoteLines,
  type RootMigration,
  type RootMigrationResult,
} from './root-migration.js';
import type { SkipLabel, UnitHold, UpdatePlan } from './update-decision.js';
import { channelOf, type RefChoice } from './release.js';
import { CONFIG_FILENAME } from './pharn-config.js';
import type { Layout, PharnConfig } from '../types.js';

// The renderers of `pharn update`: every note, the backup pointer and the
// closing summary, for the real run and the dry run alike. Nothing here plans,
// decides or writes a project file — each function prints what the plan or
// outcome it is handed already says.

/**
 * The one line `update` prints when the install follows `main` only because
 * its config says so (or records nothing): new installs default to verified
 * releases, and this one is NOT moved. `null` when `--ref` was passed this run
 * or the install already follows releases.
 */
export function defaultChannelNotice(
  config: { ref?: unknown },
  ref: RefChoice | undefined,
): string | null {
  if (ref !== undefined || channelOf(config) !== 'main') return null;
  return 'Verified releases are now the default for new installs. This install keeps following pharn-oss main; run `pharn update --ref latest` to switch (recorded on first use).';
}

// Where the `--force` copies went and how many — one shape, so the count cannot
// drift from the directory it describes.
export interface Backup {
  dir: string;
  count: number;
  // What the copies were made ahead of.
  action: BackupAction;
  // `pharn/.backup/` is gitignored, or this run adds it: the notice then drops
  // its advice.
  gitignored?: boolean;
}

// The outcome of the fetch+apply phase, assembled inside the try whose finally
// removes the clone.
export interface UpdateOutcome {
  // The version upstream ships (what the clone holds).
  installedVersion: string;
  // The version written to pharn.config.json — the previous one when skips
  // withheld the bump.
  recordedVersion: string;
  capCount: number;
  // Every membership change. Empty ⇒ nothing is printed about capabilities.
  capabilityChanges: CapabilityChange[];
  // The directories deleted for the capabilities this run dropped.
  removals: CapabilityRemoval[];
  plan: UpdatePlan;
  backup: Backup | null;
  recordsNote: string | null;
  versionWithheld: boolean;
  abandonedLayout: Layout | null;
  featuresReadmeRelocation: boolean;
  // Upstream hooks the project does not wire (report only). Absent on paths
  // that never saw a clone.
  hookWiring?: HookWiringDiff;
  // Declared surfaces the clone ships no file for. Absent without a clone.
  absentUpstream?: AbsentSurface[];
  // The `models` block's outcome, and the floor dir its checker is under.
  models: ModelsUpdate;
  modelsFloor: string;
  // Recorded files upstream no longer ships, still on disk (lib/orphans.ts).
  orphans: Orphan[];
  // What this run did to `.gitignore`; absent on paths that never applied.
  gitignore?: GitignoreOutcome;
  // The same for `.prettierignore`.
  prettierignore?: PrettierignoreOutcome;
  // The old root footprint this run retired, and what the writer did. Both
  // null when nothing applied.
  rootMigration: RootMigration | null;
  rootMigrationResult: RootMigrationResult | null;
  // True when the plan changed nothing: no confirm, no write, and the report
  // ends with the no-change verdict instead of the counts.
  unchanged?: boolean;
}

/**
 * The closing words of a run whose plan changes nothing. "Up to date." only
 * when nothing is skipped either and the recorded version is the installed
 * one; otherwise "Nothing to change." after the notes that name why. ONE
 * wording for both outros.
 */
export function noChangeVerdict(
  r: Pick<UpdatePlanReport, 'counts' | 'recordedVersion' | 'installedVersion'>,
): 'Up to date.' | 'Nothing to change.' {
  return r.counts.skipped === 0 && r.recordedVersion === r.installedVersion
    ? 'Up to date.'
    : 'Nothing to change.';
}

/**
 * The files a `--force` run overwrites, grouped by why each is not pharn's to
 * overwrite without it — plus `pharn.config.json` when the models block is
 * replaced. ONE list for the dry run's PLAN (`WOULD`) and the real run's note
 * before its confirm (`WILL`). Empty groups are left out.
 */
export function forcedOverwriteSections(
  r: Pick<UpdatePlanReport, 'files' | 'models'>,
  verb: 'WOULD' | 'WILL',
): { heading: string; rels: string[] }[] {
  const sections = (['modified', 'unrecorded', 'unverifiable'] as const).map(
    (label) => ({
      heading: `${verb} OVERWRITE (--force) — ${label}`,
      rels: r.files
        .filter((f) => f.action === 'write' && f.forced && f.label === label)
        .map((f) => f.rel),
    }),
  );
  sections.push({
    heading: `${verb} OVERWRITE (--force) — your models block`,
    rels: r.models.backup ? [CONFIG_FILENAME] : [],
  });
  return sections.filter((s) => s.rels.length > 0);
}

/**
 * The real run's `--force` note, printed BEFORE its confirm (and under `--yes`
 * too): every file "overwrite your changes" refers to.
 */
export function reportForcedOverwrites(
  r: Pick<UpdatePlanReport, 'files' | 'models' | 'backups'>,
): void {
  const sections = forcedOverwriteSections(r, 'WILL');
  if (sections.length === 0) return;
  const lines: string[] = [];
  for (const { heading, rels } of sections) {
    lines.push(`  ${heading}`);
    for (const rel of rels) lines.push(`  ${rel}`);
    lines.push('');
  }
  lines.push(
    pc.dim(
      `  Each is copied to ${BACKUP_DIR}/<timestamp>/ first (${r.backups.length} file(s)).`,
    ),
  );
  note(lines.join('\n'), 'OVERWRITE');
}

// The ROOT MIGRATION note; nothing when there is nothing to say.
export function reportRootMigration(
  m: RootMigration | null,
  result: RootMigrationResult | null,
): void {
  const lines = m === null ? null : rootMigrationNoteLines(m, result);
  if (lines) note(lines.join('\n'), 'ROOT MIGRATION');
}

// The skip buckets `--force` actually overrides, mirroring `skipOrForce` in
// lib/update-decision.ts. Membership, not a negation: an unrecognised label
// gets no advice rather than a command that cannot work. It must list the same
// labels `skipHeading` switches on — by convention, not a check.
const FORCEABLE_SKIPS = new Set<SkipLabel>([
  'modified',
  'unrecorded',
  'unverifiable',
  // `--force` writes the whole unit, so it clears a hold too.
  'held',
]);

// How many blocking (or missing) files the EXECUTABLE UNIT note lists.
const MAX_UNIT_BLOCKERS = 20;

/**
 * The EXECUTABLE UNIT note: why the unit's writes were withheld, the files
 * that blocked it, and the two ways out. Null when nothing was held.
 */
export function executableUnitLines(
  hold: UnitHold | null,
  preview: boolean,
): string[] | null {
  if (hold === null) return null;
  return [
    ...unitBlockerLines(hold, preview),
    ...unitMissingLines(hold.missing ?? [], preview),
    '',
    '  To upgrade the unit: revert the skipped files, or run',
    `  \`pharn update --force\` (it backs them up to ${BACKUP_DIR}/ first).`,
  ];
}

function unitBlockerLines(hold: UnitHold, preview: boolean): string[] {
  const shown = hold.blocking.slice(0, MAX_UNIT_BLOCKERS);
  const more = hold.blocking.length - shown.length;
  return [
    '  The floor, the hooks and the pharn-* commands run together, so pharn',
    '  writes them all or none. These unit files ' +
      (preview ? 'would be skipped' : 'were skipped') +
      ':',
    ...shown.map(
      (b) => `  ${b.label.padEnd(12)} ${terminalSafe(b.rel, { max: 300 })}`,
    ),
    ...(more > 0 ? [`  … and ${more} more`] : []),
    '',
    `  So ${hold.held.length} other unit file(s) ` +
      (preview ? 'would not be written' : 'were not written') +
      ' either, and the',
    '  unit stays at the version you had: upgrading part of it would mix two',
    '  versions that may not load together.',
  ];
}

// Held files not on disk: a deleted hook stays off until the hold ends.
function unitMissingLines(missing: string[], preview: boolean): string[] {
  if (missing.length === 0) return [];
  const shown = missing.slice(0, MAX_UNIT_BLOCKERS);
  const more = missing.length - shown.length;
  return [
    '',
    '  Of those, these are not on disk, so they ' +
      (preview ? 'would stay' : 'stay') +
      ' missing until the hold ends:',
    ...shown.map((rel) => `  ${terminalSafe(rel, { max: 300 })}`),
    ...(more > 0 ? [`  … and ${more} more`] : []),
  ];
}

/** Print the EXECUTABLE UNIT note; nothing when no hold happened. */
export function reportExecutableUnit(
  hold: UnitHold | null,
  preview: boolean,
): void {
  const lines = executableUnitLines(hold, preview);
  if (lines) note(lines.join('\n'), 'EXECUTABLE UNIT');
}

// The report. Skips are exit 0 — a decision the user asked for — but never
// silent: each bucket is listed with the one action that resolves it.
export function reportOutcome(outcome: UpdateOutcome, force: boolean): void {
  const { plan, recordsNote, versionWithheld } = outcome;
  const { counts } = plan;

  // The note quotes strings from the hand-editable pharn.records.json: escape
  // the VALUE here, never the line. The JSON report carries it raw.
  if (recordsNote) log.warn(`⚠ ${escapeUnsafe(recordsNote)}`);

  reportCapabilityChanges(outcome.capabilityChanges, outcome.removals, false);
  reportModels(outcome.models, outcome.modelsFloor, outcome.backup);

  const hookLines = outcome.hookWiring
    ? hookWiringLines(outcome.hookWiring)
    : null;
  if (hookLines) note(hookLines.join('\n'), 'HOOKS');
  reportAbsentSurfaces(outcome.absentUpstream ?? []);

  reportExecutableUnit(plan.held, false);
  const forceable = reportSkipped(plan.skipped, false);
  reportOrphans(outcome.orphans);
  reportRootMigration(outcome.rootMigration, outcome.rootMigrationResult);

  // The backup pointer was printed when the backup was created (onBackup).

  reportLayoutWarnings(
    outcome.abandonedLayout,
    outcome.featuresReadmeRelocation,
    false,
  );

  if (versionWithheld) {
    // `--force` is offered only while a bucket it can clear is still skipped.
    log.warn(
      withheldVersionLine({
        skipped: counts.skipped,
        recordedVersion: outcome.recordedVersion,
        installedVersion: outcome.installedVersion,
        forceable,
        preview: false,
      }),
    );
  }

  if (outcome.unchanged) {
    outro(
      `${noChangeVerdict({ counts, recordedVersion: outcome.recordedVersion, installedVersion: outcome.installedVersion })} ${pc.dim(`(unchanged ${counts.ok} · skipped ${counts.skipped} · ${outcome.capCount} capabilit${outcome.capCount === 1 ? 'y' : 'ies'}, skills v${outcome.recordedVersion})`)}`,
    );
    return;
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

// The NOT SHIPPED note (wording: lib/absent-surfaces.ts). Report only — it
// withholds nothing. Nothing absent → no note.
function reportAbsentSurfaces(absent: readonly AbsentSurface[]): void {
  const lines = absentSurfaceLines(absent);
  if (lines) note(lines.join('\n'), 'NOT SHIPPED');
}

/**
 * The warning under a run that skipped files. At a NEWER skills version the
 * skips withhold the bump and resolving them finishes the upgrade; at the SAME
 * version there is nothing to finish, so the line names only what still
 * applies. `--force` is named only when a bucket it can clear was skipped.
 */
export function withheldVersionLine(o: {
  skipped: number;
  recordedVersion: string;
  installedVersion: string;
  forceable: boolean;
  preview: boolean;
}): string {
  const { skipped, recordedVersion, installedVersion, forceable, preview } = o;
  if (recordedVersion === installedVersion) {
    const action = forceable
      ? `${preview ? 'run' : 're-run'} with --force to overwrite them (backed up to ${BACKUP_DIR}/ first), or keep them as they are`
      : 'resolve them by hand';
    return `${skipped} file(s) ${preview ? 'would be' : 'were'} skipped; your install is already at skills v${installedVersion}, so there is no upgrade to finish — ${action}.`;
  }
  return preview
    ? `${skipped} file(s) would be skipped, so your install would stay recorded as skills v${recordedVersion} (upstream is v${installedVersion}) — resolve them${forceable ? ', or run with --force,' : ''} to finish the upgrade.`
    : `${skipped} file(s) were skipped, so your install is still recorded as skills v${recordedVersion} (upstream is v${installedVersion}) — resolve them${forceable ? ', or re-run with --force,' : ''} to finish the upgrade.`;
}

// The SKIPPED note (`preview` changes only the tense). Returns whether any
// skipped bucket is one `--force` can clear.
function reportSkipped(
  skipped: UpdatePlan['skipped'],
  preview: boolean,
): boolean {
  // An unhashable destination is skipped BEFORE the decision table, and
  // `force` is not an input to that branch, so `--force` must not be
  // prescribed for it: a run whose skips are all unreadable would be told to
  // re-run forever.
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
      // The closing lines are `pharn status`'s drift report verbatim: same
      // situation, same sentence.
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

// The ORPHANED note — the same in report and preview; nothing when none.
function reportOrphans(orphans: readonly Orphan[]): void {
  const lines = orphanNoteLines(orphans);
  if (lines) note(lines.join('\n'), 'ORPHANED');
}

// Both directions are named; `=== 'pharn'` rather than `else`, so a third
// Layout member prints nothing instead of this message.
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

// The preview report: the real run's renderers in the same order, plus the
// PLAN note — the per-file verdicts the real run acts on without listing.
export function reportDryRun(
  r: UpdatePlanReport,
  force: boolean,
  channel: RefChoice,
  config: PharnConfig,
): void {
  // Escaped at print, as in reportOutcome.
  if (r.recordsNote) log.warn(`⚠ ${escapeUnsafe(r.recordsNote)}`);

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
    ...forcedOverwriteSections(r, 'WOULD'),
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
  // What a real run would append to `.gitignore`; a refusal is a warning,
  // printed after the note.
  const gitignore = gitignoreLines(r.gitignore, { preview: true });
  if (gitignore !== null && !gitignore.warn)
    lines.push(`  ${gitignore.text}`, '');
  // The same for `.prettierignore`.
  const prettierignore = prettierignoreLines(r.prettierignore, {
    preview: true,
  });
  if (prettierignore !== null && !prettierignore.warn)
    lines.push(`  ${prettierignore.text}`, '');
  // THE "changes nothing" predicate (lib/update-next.ts). When only the state
  // files would change, say which.
  const stateFiles = [
    ...(r.stateChanges.config ? [CONFIG_FILENAME] : []),
    ...(r.stateChanges.records ? [RECORDS_FILE] : []),
  ];
  if (r.changesNothing) lines.push('  Nothing would be written.', '');
  else if (changesNoFiles(r))
    lines.push(`  Would rewrite only ${stateFiles.join(' and ')}.`, '');
  lines.push(
    `  UNCHANGED ${r.counts.ok} file(s) · SKIPPED ${r.counts.skipped} file(s)`,
  );
  if (channel !== channelOf(config)) {
    lines.push('', `  Would record channel: ${channel}`);
  }
  note(lines.join('\n'), 'PLAN');
  if (gitignore?.warn) log.warn(gitignore.text);
  if (prettierignore?.warn) log.warn(prettierignore.text);

  reportCapabilityChanges(r.capabilityChanges, r.removals, true);
  reportModels(r.models, r.modelsFloor, null, true);

  const hookLines = hookWiringLines(r.hookWiring);
  if (hookLines) note(hookLines.join('\n'), 'HOOKS');
  reportAbsentSurfaces(r.absentUpstream);

  reportExecutableUnit(r.executableUnit, true);
  const forceable = reportSkipped(r.skipped, true);
  reportOrphans(r.orphans);
  reportRootMigration(r.rootMigration, null);
  reportLayoutWarnings(r.abandonedLayout, r.featuresReadmeRelocation, true);

  if (r.versionWithheld) {
    log.warn(
      withheldVersionLine({
        skipped: r.counts.skipped,
        recordedVersion: r.recordedVersion,
        installedVersion: r.installedVersion,
        forceable,
        preview: true,
      }),
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

  if (r.changesNothing) {
    outro(
      `Dry run — ${noChangeVerdict(r)} Unchanged ${r.counts.ok} · skipped ${r.counts.skipped}. A real run would ask nothing and write nothing.`,
    );
    return;
  }
  outro(
    `Dry run — would write ${writes.length}${deletes.length > 0 ? ` · delete ${deletes.length} director${deletes.length === 1 ? 'y' : 'ies'}` : ''} · back up ${backupRels.length} · unchanged ${r.counts.ok} · skipped ${r.counts.skipped}. Nothing was changed. Run \`pharn update${force ? ' --force' : ''}\` to apply.`,
  );
}

// The backup pointer — ONE wording for the success report and the failure
// branch, so the two never say different things about the user's only route
// back. An aborted run's notice is part of its fatal output and goes to
// stderr (lib/report-error.ts); the success notice stays on stdout.
export function reportBackup(backup: Backup, opts: { aborted: boolean }): void {
  const output = opts.aborted ? process.stderr : process.stdout;
  if (opts.aborted) {
    // The run stopped between the first overwrite and the last.
    log.warn(
      `The update stopped part-way — some originals may already have been ${ABORTED_PHRASE[backup.action]}.`,
      { output },
    );
  }
  // The pointer (and, on success, the .gitignore advice): lib/backup.ts.
  printBackupNotice(
    {
      dir: backup.dir,
      saved: backup.count,
      action: backup.action,
      gitignored: backup.gitignored,
    },
    opts,
  );
}

// Re-exported from lib/backup.ts for the command.
export { backupAction };

const ABORTED_PHRASE: Record<BackupAction, string> = {
  overwriting: 'overwritten',
  removing: 'removed',
  'overwriting and removing': 'overwritten or removed',
};

// The order change groups are reported in: additions, departures, then the
// one-time legacy tagging — deterministic, never the merge's iteration order.
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

// Name EVERY membership change; zero changes prints nothing. A REMOVED line
// also says what happened to the directory (deleted, after a backup, or
// already gone). `preview` switches the tense.
export function reportCapabilityChanges(
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

// The MODELS note, for every outcome but `ok` and a quiet `upstream-absent`.
// Every string quoted from a block goes through `terminalSafe`. Lines stay
// within 70 columns so an 80-column box never wraps one.
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
    case 'held':
      return 'HELD — not written, so the executable unit stays at one version';
    default:
      return 'UNREADABLE — not a regular readable file';
  }
}
