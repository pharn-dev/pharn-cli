import { log, note, outro } from '@clack/prompts';
import { hookWiringLines, type HookWiringDiff } from './hook-wiring.js';
import { absentSurfaceLines } from './absent-surfaces.js';
import type { AbsentSurface } from './install-manifest.js';
import type { CapabilityRemoval, UpdatePlanReport } from './update-plan.js';
import pc from './color.js';
import type { CapabilityChange } from './merge-capabilities.js';
import { BACKUP_DIR, printBackupNotice, type BackupAction } from './backup.js';
import { RECORDS_FILE } from './install-records.js';
import { modelsLabelLines } from './model-config-format.js';
import type { ModelsUpdate } from './models-update.js';
import { terminalSafe } from './terminal-safe.js';
import { orphanNoteLines, type Orphan } from './orphans.js';
import type { UpdateLabel, UpdatePlan } from './update-decision.js';
import { channelOf, type RefChoice } from './release.js';
import { CONFIG_FILENAME } from './pharn-config.js';
import type { Layout, PharnConfig } from '../types.js';

// The renderers of `pharn update` (src/commands/update.ts): the PLAN, SKIPPED,
// CAPABILITIES, MODELS, HOOKS, ORPHANED and NOT SHIPPED notes, the layout
// warnings, the backup pointer and the closing summary, for the real run and
// the dry run alike. Kept apart from the command, which holds only the flow;
// nothing here plans, decides or writes a project file — each function
// prints what the plan or the outcome it is handed already says.

// Where the `--force` copies went, and how many there are — the two facts the
// report needs. One shape, so the count is never re-derived at a second site and
// cannot drift from the directory it describes.
export interface Backup {
  dir: string;
  count: number;
  // What the copies were made ahead of — the notice says it, and the abort
  // line says what may already be gone.
  action: BackupAction;
}

// The outcome of the fetch+apply phase, assembled inside the try so cleanup can
// run in the finally and every process.exit happens AFTER it (Node skips finally
// on exit) — the discipline this command has always kept.
export interface UpdateOutcome {
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
export function reportOutcome(outcome: UpdateOutcome, force: boolean): void {
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

// The preview report. It reuses the real run's renderers for the membership,
// models, hooks and skip notes, in the same order, and adds the PLAN note —
// the per-file verdicts the real run acts on without listing.
export function reportDryRun(
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
export function reportBackup(backup: Backup, opts: { aborted: boolean }): void {
  const output = opts.aborted ? process.stderr : process.stdout;
  if (opts.aborted) {
    // Said plainly, because the tree is now in a state the user did not ask for:
    // the run stopped between the first overwrite and the last.
    log.warn(
      `The update stopped part-way — some originals may already have been ${ABORTED_PHRASE[backup.action]}.`,
      { output },
    );
  }
  // The pointer (and, on success, the .gitignore advice) — lib/backup.ts's one
  // wording, shared with every other command that makes a backup.
  printBackupNotice(
    { dir: backup.dir, saved: backup.count, action: backup.action },
    opts,
  );
}

// What a backup was made ahead of: overwrites (`--force` casualties) and/or
// directory deletes. Two booleans, no third case; with neither, no backup exists
// (a backup always has a reason, so `overwriting` is the honest default).
export function backupAction(
  overwrites: boolean,
  removals: boolean,
): BackupAction {
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
