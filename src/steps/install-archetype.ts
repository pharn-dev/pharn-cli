import {
  deleteRootDocs,
  rootMigrationNoteLines,
} from '../lib/root-migration.js';
import { log, note, outro, spinner } from '@clack/prompts';
import pc from '../lib/color.js';
import {
  CLAUDE_AGENTS_DIR,
  CLAUDE_SETTINGS_FILE,
  FIRST_FEATURE_COMMAND,
  REPO_URL,
} from '../lib/constants.js';
import {
  diffHookWiring,
  freshSettingsHookLines,
  preservedSettingsHookLines,
  upstreamSettingsSummary,
} from '../lib/hook-wiring.js';
import { installPrepared } from '../lib/install-capabilities.js';
import { absentInstallSurfaces } from '../lib/install-manifest.js';
import { absentSurfaceLines } from '../lib/absent-surfaces.js';
import { layoutPaths } from '../lib/layout.js';
import {
  backupAction,
  createBackup,
  legacyBackupNotice,
  printBackupNotice,
  replacedConfigBackup,
} from '../lib/backup.js';
import {
  buildRecords,
  carriedSettingsRecord,
  MODELS_RECORD_KEY,
  modelsRecordHash,
  recordsUnderCapabilities,
  writeRecords,
  type FileRecords,
} from '../lib/install-records.js';
import { findOrphans } from '../lib/orphans.js';
import {
  readCarriedEntries,
  type InitApplyInputs,
  type InstallCarry,
} from '../lib/init-plan.js';
import { removalBackupsNow } from '../lib/capability-removal.js';
import { deleteCapabilityDir } from '../lib/capability-dir.js';
import { checkModelsBlock } from '../lib/model-config.js';
import {
  modelsLabelLines,
  resolvedStageLines,
} from '../lib/model-config-format.js';
import { readUpstreamModels } from '../lib/upstream-models.js';
import { terminalSafe } from '../lib/terminal-safe.js';
import {
  assertConfigFingerprintUnchanged,
  writePharnConfig,
} from '../lib/pharn-config.js';
import {
  applyGitignore,
  backupDirIgnored,
  gitignoreLines,
  planGitignore,
} from '../lib/gitignore.js';
import {
  applyPrettierignore,
  prettierignoreLines,
} from '../lib/prettierignore.js';
import { readSkillsVersion } from '../lib/skills-version.js';
import { PHARN_VERSION } from '../version.js';
import type {
  Archetype,
  InstalledCapability,
  Layout,
  PharnConfig,
  Selection,
} from '../types.js';

// The archetype-install apply stage (`pharn init`): copy the resolved
// capabilities + product surfaces from the already-fetched `repoDir`, then
// write pharn.config.json. Network-free (the commit SHA is passed in). It
// consumes the run's one plan (`buildInitPlan`'s `apply` half, made under the
// same lock before the overwrite prompt) and recomputes none of it; what may
// have changed while a prompt was open is checked at write time.
export async function runInstallArchetype(
  repoDir: string,
  cwd: string,
  archetypes: Archetype[],
  selection: Selection,
  commit: string | null,
  carry: InstallCarry,
  plan: InitApplyInputs,
): Promise<void> {
  const startedAt = Date.now();
  const { prepared, baseline, removals, rootMigration: migration } = plan;

  // 1. pharn.config.json still has the bytes the carry-over read: a hand-edit
  // made while a prompt was open is not overwritten. Before anything is
  // written, the backup included.
  assertConfigFingerprintUnchanged(cwd, plan.fingerprint, 'init');

  // 2. Back up every existing file this install overwrites that `update` would
  // have SKIPPED, by the records baseline through update's own table
  // (lib/dest-drift.ts): a file still at its recorded hash is a clean upgrade;
  // an edited or unrecorded one is backed up; with no usable store every
  // differing file is (`plan.drifted`, scanned once by the plan). A file
  // edited since that scan is caught by the writer (`plan.seen`) and backed up
  // before it is overwritten.
  const deletes = removals.filter((r) => r.present);
  // The replaced config is rewritten below (`models` reset), so an existing one
  // is always saved too, in the SAME backup as the drifted files and a dropped
  // directory's unproven files — that set read again now, so a file edited in
  // a dropped directory while a prompt was open is saved too.
  const overwriteBackups = [...plan.drifted, ...replacedConfigBackup(cwd)];
  const toBackUp = [
    ...new Set([
      ...overwriteBackups,
      ...removalBackupsNow({
        cwd,
        removals,
        records: baseline,
        command: 'init',
      }),
    ]),
  ];
  if (toBackUp.length > 0) {
    const backupDir = createBackup(cwd, toBackUp);
    const action = backupAction(
      overwriteBackups.length > 0,
      deletes.length > 0,
    );
    // Named at creation, so the pointer survives anything that fails after it.
    printBackupNotice({
      dir: backupDir,
      saved: toBackUp.length,
      action,
      // This install may add `pharn/.backup/` to `.gitignore` below.
      gitignored: backupDirIgnored(cwd, planGitignore(cwd)),
    });
  }
  // Deleted BEFORE the copy, after the backup: a failed delete stops the run
  // with the replaced config in place, so the next init drops them again.
  if (deletes.length > 0) {
    const paths = layoutPaths(carry.previousLayout ?? 'flat');
    for (const removal of deletes) deleteCapabilityDir(cwd, paths, removal.cap);
    log.info(
      `Deleted ${deletes.length} capability director${deletes.length === 1 ? 'y' : 'ies'} no longer installed: ${deletes.map((r) => `${r.dir}/`).join(', ')}.`,
    );
  }

  const s = spinner();
  s.start('Installing capabilities');
  let capabilities: InstalledCapability[];
  let settingsPreserved: boolean;
  let settingsWritten: boolean;
  let skillsVersion: string;
  let layout: Layout;
  let docsWritten: string[];
  try {
    // `plan.seen`: a file edited since the plan is backed up, then overwritten.
    const result = installPrepared(
      repoDir,
      cwd,
      selection,
      prepared,
      plan.seen,
    );
    capabilities = result.capabilities;
    settingsPreserved = result.settingsPreserved;
    settingsWritten = result.settingsWritten;
    layout = result.layout;
    docsWritten = result.docs;
    skillsVersion = readSkillsVersion(repoDir);
  } catch (err) {
    // Propagate: the orchestrator cleans up the clone, then reports and exits.
    // Nothing below runs, so no records and no config are written; a part-way
    // failure's message names the files that landed.
    s.stop('Failed to install capabilities');
    throw err;
  }
  s.stop('Capabilities installed');

  // The old root docs, deleted only now that their pharn/ copies have landed
  // and only while still record-equal, re-hashed at the delete: one edited
  // while a prompt was open is kept, with its record, and the install goes on
  // (it deletes nothing of the user's, so nothing needs a backup). A failure
  // keeps the file and its record.
  const docResult =
    migration === null
      ? { deleted: [], kept: [] }
      : deleteRootDocs(cwd, repoDir, migration.docs, baseline);
  const retired = new Set(docResult.deleted);

  // `.claude/settings.json` is user-owned: an existing one is preserved, and
  // only now can its missing PHARN hooks be named — the clone is deleted right
  // after this step — so init prints the HOOKS note `status`/`update` print.
  // A FRESH install wrote upstream's file verbatim, so init lists the hook
  // commands Claude Code will run (the note `init --dry-run` previews).
  if (settingsPreserved) {
    log.info(
      `Existing ${CLAUDE_SETTINGS_FILE} preserved — pharn never overwrites it.`,
    );
    const hookLines = preservedSettingsHookLines(diffHookWiring(repoDir, cwd));
    if (hookLines) note(hookLines.join('\n'), 'HOOKS');
  } else if (settingsWritten) {
    note(
      freshSettingsHookLines(upstreamSettingsSummary(repoDir)).join('\n'),
      'HOOKS',
    );
  }

  // The `models` block is pharn-oss's, copied VERBATIM and checked on the way
  // in (lib/upstream-models.ts). None upstream → none written. One this CLI
  // rejects → none written, each reason named: pharn-oss may have widened its
  // rules past this CLI's copy (LIMITS.md §3e), and `pharn update` writes it
  // after an upgrade.
  const upstreamModels = readUpstreamModels(repoDir);
  if (upstreamModels.kind === 'invalid') {
    log.warn(
      [
        "pharn-oss's models block was not written; this pharn rejects it:",
        ...upstreamModels.reasons.map(
          (reason) => `  ${terminalSafe(reason, { max: 300 })}`,
        ),
        'If pharn-oss changed its models format, upgrade pharn',
        '(npm i -g @pharn-dev/pharn@latest) and run `pharn update`.',
      ].join('\n'),
    );
  }
  const models =
    upstreamModels.kind === 'ok' ? upstreamModels.block : undefined;

  // Every declared product surface the clone shipped NO file for
  // (absentInstallSurfaces). Each copy is existence-guarded so an older clone
  // still installs, but never silently: warned, never fatal — upstream's
  // MIN_CLI is the lever for refusing a too-old CLI.
  const absent = absentInstallSurfaces({ repoDir, layout });
  const absentLines = absentSurfaceLines(absent);
  if (absentLines) log.warn(absentLines.join('\n'));
  const legacyBackups = legacyBackupNotice(cwd);
  if (legacyBackups) log.info(legacyBackups);
  // The `.claude/` surfaces that actually landed, for the outro. Agents are an
  // OPTIONAL surface (pharn-oss < 6.64.0 ships none), named only when the
  // applied manifest holds one.
  const agentsWritten = [...prepared.manifest.keys()].some((rel) =>
    rel.startsWith(`${CLAUDE_AGENTS_DIR}/`),
  );
  const claudeWritten = [
    ...(['commands', 'hooks'] as const).filter(
      (surface) => !absent.some((a) => a.surface === surface),
    ),
    ...(agentsWritten ? (['agents'] as const) : []),
  ];

  const frozenCapabilities = [
    ...new Set(carry.kept.map((c) => `${c.role}:${c.name}`)),
  ].sort();
  const config: PharnConfig = {
    pharnVersion: PHARN_VERSION,
    skillsVersion,
    repo: REPO_URL.replace(/^github\.com\//, ''),
    commit,
    ...(carry.ref === 'latest' ? { ref: 'latest' as const } : {}),
    // SHIM: written for 0.19.x, whose guard needs it (it reads a config without
    // a `modules` array as NO config); stop writing in v0.21.0 (support policy:
    // current + previous minor). See `PharnConfig.modules`.
    modules: [],
    installedAt: new Date().toISOString(),
    // `undefined` is not written.
    models,
    archetypes,
    // `auto` from archetype resolution (update may drop it); `manual` for what
    // a re-run carries over (sticky even when the archetypes also select it).
    // Tagged at the WRITE site so the copy routine stays unaware of provenance.
    // Kept (frozen) entries follow VERBATIM.
    capabilities: [
      ...capabilities.map((c) => ({
        ...c,
        source: carry.manualKeys.has(`${c.role}:${c.name}`)
          ? ('manual' as const)
          : ('auto' as const),
      })),
      ...carry.kept.map((c) => ({ ...c })),
    ],
    // The clone's layout; status/remove address the project by it.
    layout,
    // While non-empty, `pharn update` re-fetches even at the same version.
    ...(frozenCapabilities.length > 0 ? { frozenCapabilities } : {}),
  };
  // Record the hash of every file this install wrote (taken at the DEST, so a
  // record cannot disagree with what landed) BEFORE the config: the baseline
  // `pharn update` tells pharn's bytes from the user's edits by. Keyed by the
  // same manifest the copy applied.
  const files = {
    ...keptRecords(baseline, carry, layout),
    // Recorded files upstream no longer ships that are still on disk keep their
    // record, so `update`/`status` keep naming them (lib/orphans.ts).
    ...Object.fromEntries(
      Object.entries(
        findOrphans({
          projectRoot: cwd,
          records: baseline,
          expected: prepared.manifest,
          capabilities: [...capabilities, ...carry.kept],
          frozen: carry.kept,
        }).records,
      ).filter(([rel]) => !retired.has(rel)),
    ),
    // `.claude/settings.json`: a file this run wrote fresh is recorded so
    // `uninstall` can remove it while unchanged. A PRESERVED one is never
    // recorded anew; a re-run only carries a previous fresh install's record
    // while the file is still there.
    ...(settingsWritten
      ? buildRecords(cwd, [CLAUDE_SETTINGS_FILE])
      : carriedSettingsRecord(cwd, baseline)),
    ...buildRecords(cwd, prepared.manifest.keys()),
    // The block pharn just wrote, so `pharn update` can tell it from an edit.
    ...(models !== undefined
      ? { [MODELS_RECORD_KEY]: modelsRecordHash(models) }
      : {}),
  };
  await writeRecords(cwd, { skillsVersion, commit, files });
  // Carry over the replaced config's keys pharn does not own (upstream's
  // `testResults` / `ship` / `seam`, …: userOwnedConfigEntries). Read HERE,
  // under the lock right before the write, so a key edited while a prompt was
  // open is not lost. Appended AFTER pharn's own keys (disjoint sets), so the
  // committed file's diff is only what init changed.
  await writePharnConfig(cwd, { ...config, ...readCarriedEntries(cwd) });

  // Keep PHARN's run state and backups out of git, after every pharn-owned
  // write and under the same lock. Append-only; a refusal or failed write is a
  // warning naming the lines.
  const gitignore = await applyGitignore(cwd);
  const gitignoreReport = gitignoreLines(gitignore);
  if (gitignoreReport?.warn) log.warn(gitignoreReport.text);

  // When the project uses Prettier, append the `.prettierignore` lines the
  // recorded paths need, the same way.
  const prettierignore = await applyPrettierignore(cwd, Object.keys(files));
  const prettierignoreReport = prettierignoreLines(prettierignore);
  if (prettierignoreReport?.warn) log.warn(prettierignoreReport.text);

  // What the migration did, after every pharn-owned write. Root user data is
  // never moved; the note only hints at it.
  if (migration !== null) {
    const lines = rootMigrationNoteLines(migration, docResult);
    if (lines) note(lines.join('\n'), 'ROOT MIGRATION');
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const check = pc.green('✔');
  const grillers = capabilities.filter((c) => c.role === 'griller').length;
  const lenses = capabilities.filter((c) => c.role === 'lens').length;
  // The block just written, resolved per stage, under the label that says what
  // it is (a declaration, not what any stage ran on). No valid block → no
  // section.
  const modelsCheck = checkModelsBlock(models);
  const modelsSection =
    modelsCheck.kind === 'valid'
      ? [
          '',
          pc.bold('Declared model per stage') +
            ` ${pc.dim('(pharn.config.json → models, from pharn-oss)')}`,
          ...resolvedStageLines(modelsCheck.stages).map((line) => `  ${line}`),
          ...modelsLabelLines(layoutPaths(layout).floor).map(
            (line) => `  ${pc.dim(line)}`,
          ),
        ]
      : [];
  // Report the docs that LANDED, by name — never a count, never the expected
  // list — so a missing doc is visible at a glance.
  const docsLine = docsWritten.length
    ? `${check} ${docsWritten.length} trusted doc${docsWritten.length === 1 ? '' : 's'} written → ${pc.dim(docsWritten.join(', '))}`
    : `${pc.yellow('!')} no trusted docs written ${pc.dim('(the fetched repo shipped none at their expected paths)')}`;
  outro(
    [
      `${check} ${capabilities.length} capabilit${capabilities.length === 1 ? 'y' : 'ies'} installed → ${pc.dim(`(${grillers} griller${grillers === 1 ? '' : 's'}, ${lenses} lens${lenses === 1 ? '' : 'es'})`)}`,
      claudeWritten.length
        ? `${check} PHARN ${claudeWritten.join(' + ')} written → ${pc.dim('.claude/')}`
        : `${pc.yellow('!')} no PHARN commands or hooks written ${pc.dim('(the fetched repo shipped none)')}`,
      docsLine,
      `${check} pharn.config.json written ${pc.dim(`(skills v${skillsVersion}, archetypes: ${archetypes.join(', ')})`)}`,
      ...(gitignore.action === 'create' || gitignore.action === 'append'
        ? [
            `${check} .gitignore ${gitignore.action === 'create' ? 'created' : 'updated'} → ${pc.dim(gitignore.entries.join(', '))}`,
          ]
        : []),
      ...(prettierignore.action === 'create' ||
      prettierignore.action === 'append'
        ? [
            `${check} .prettierignore ${prettierignore.action === 'create' ? 'created' : 'updated'} → ${pc.dim(`${prettierignore.entries.length} path${prettierignore.entries.length === 1 ? '' : 's'} pharn installs or rewrites`)}`,
          ]
        : []),
      `${pc.dim(`Done in ${elapsed}s`)}`,
      ...modelsSection,
      '',
      pc.bold('Next steps'),
      `  ${pc.cyan('1.')}  ${pc.bold('claude')}            ${pc.dim('open Claude Code')}`,
      `  ${pc.cyan('2.')}  ${pc.bold(FIRST_FEATURE_COMMAND)}       ${pc.dim("capture your first feature's intent")}`,
    ].join('\n'),
  );
}

/**
 * The records of every kept (frozen) capability, carried from the store this
 * install replaces, as `update` does. No usable store carries NOTHING. Nothing
 * under a kept capability was touched, so the carried hashes are still true;
 * dropping them would make `update` skip those files as `unrecorded`.
 */
function keptRecords(
  baseline: FileRecords | null,
  carry: InstallCarry,
  layout: Layout,
): FileRecords {
  if (carry.kept.length === 0 || baseline === null) return {};
  return recordsUnderCapabilities(baseline, layoutPaths(layout), carry.kept);
}
