import { log, note, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import {
  CLAUDE_SETTINGS_FILE,
  FIRST_FEATURE_COMMAND,
  REPO_URL,
} from '../lib/constants.js';
import {
  diffHookWiring,
  preservedSettingsHookLines,
} from '../lib/hook-wiring.js';
import {
  installCapabilities,
  prepareInstall,
} from '../lib/install-capabilities.js';
import {
  absentInstallSurfaces,
  collectExpectedInstallPaths,
} from '../lib/install-manifest.js';
import { absentSurfaceLines } from '../lib/absent-surfaces.js';
import { detectLayout, layoutPaths } from '../lib/layout.js';
import { manifestSources, scanDest } from '../lib/dest-drift.js';
import { createBackup, replacedConfigBackup } from '../lib/backup.js';
import {
  buildRecords,
  MODELS_RECORD_KEY,
  modelsRecordHash,
  recordsUnderCapabilities,
  writeRecords,
  type FileRecords,
} from '../lib/install-records.js';
import { findOrphans } from '../lib/orphans.js';
import {
  readCarriedEntries,
  reinstallBaseline,
  type InstallCarry,
} from '../lib/init-plan.js';
import { checkModelsBlock } from '../lib/model-config.js';
import {
  modelsLabelLines,
  resolvedStageLines,
} from '../lib/model-config-format.js';
import { readUpstreamModels } from '../lib/upstream-models.js';
import { terminalSafe } from '../lib/terminal-safe.js';
import { DEFAULT_SEAM_CONFIG } from '../lib/seam-config.js';
import { writePharnConfig } from '../lib/pharn-config.js';
import { readSkillsVersion } from '../lib/skills-version.js';
import { PHARN_VERSION } from '../version.js';
import type {
  Archetype,
  InstalledCapability,
  Layout,
  PharnConfig,
  Selection,
} from '../types.js';

/**
 * Every file installing `selection` from `repoDir` writes, dest → source, at
 * the clone's own layout (lib/install-manifest.ts). init computes it ONCE per
 * run, before its overwrite prompt, and passes the same map to the prompt and
 * to runInstallArchetype.
 */
export function installManifest(
  repoDir: string,
  selection: Selection,
): Map<string, string> {
  return collectExpectedInstallPaths({
    repoDir,
    capabilities: selection.selected,
    layout: detectLayout(repoDir),
  });
}

/**
 * The install's destination pre-flight (lib/install-capabilities.ts →
 * prepareInstall) over the manifest init built, run BEFORE init's overwrite
 * prompt: a project the install cannot finish in is refused without first
 * being asked "Continue and overwrite?". Read-only; throws
 * ManifestValidationError.
 *
 * The EARLY answer, not the authoritative one — the tree can change while the
 * prompt is open. runInstallArchetype runs the same checks again under the
 * lock, before its backup, and installCapabilities once more before the copy,
 * so that no caller can copy without them. Keep all three: each is a read-only
 * walk (an lstat per path component) over the manifest.
 */
export function preflightInstall(
  repoDir: string,
  cwd: string,
  selection: Selection,
  manifest: ReadonlyMap<string, string>,
): void {
  prepareInstall(repoDir, cwd, selection.selected, manifest);
}

// The carry type and the records baseline live in lib/init-plan.ts (init's
// planning, shared with `init --dry-run`); re-exported here, where init has
// always imported them from.
export { reinstallBaseline, type InstallCarry };

const NO_CARRY: InstallCarry = {
  manualKeys: new Set(),
  kept: [],
  previousStamp: null,
};

// The archetype-install apply stage (`pharn init`). Copies the
// resolved capabilities + product surfaces from the already-fetched `repoDir`,
// then writes pharn.config.json. Network-free (the commit SHA is passed in by
// the orchestrator) so it is exercised end-to-end by the fixture test. Mirrors
// steps/install.ts. One axis (P3): the archetype apply/config stage.
export async function runInstallArchetype(
  repoDir: string,
  cwd: string,
  archetypes: Archetype[],
  selection: Selection,
  commit: string | null,
  carry: InstallCarry = NO_CARRY,
  // The install manifest for this selection, when the caller already computed
  // it — init computes it ONCE per run and passes the same map to its prompt
  // and here. Absent → computed by the pre-flight below.
  manifest?: ReadonlyMap<string, string>,
): Promise<void> {
  const startedAt = Date.now();

  // 1. The destination pre-flight, FIRST: a project the copy cannot finish in
  // (a symlink on the way, a type in the way) is refused before anything is
  // written — the backup below included, so a refused re-install leaves no
  // `.pharn-backup/` behind and prints no "Backed up" line for a copy that
  // never happens. installCapabilities repeats it immediately before copying.
  const prepared = prepareInstall(repoDir, cwd, selection.selected, manifest);

  // 2. Back up every existing file this install is about to overwrite that
  // `update` would have SKIPPED — a re-run `init` used to discard local edits
  // with no copy anywhere, then over-corrected into backing up every file that
  // differed from upstream, calling pharn's own outdated bytes "your edits".
  // The records baseline decides (lib/dest-drift.ts, through update's own
  // table): a file still at the hash pharn recorded writing is a clean upgrade;
  // one that changed since, or that pharn has no record of, is backed up; with
  // no usable store every differing file is. Each file is compared with its
  // REAL source, so the mapped LICENSE is covered.
  //
  // Taken HERE, under init's lock and immediately before the copy, not at the
  // prompt: an edit made while the prompt was open must be covered too, so this
  // scan is the authoritative one — the prompt's labels are advisory.
  const baseline = reinstallBaseline(cwd, carry.previousStamp);
  const scan = scanDest({
    repoDir,
    projectRoot: cwd,
    rels: [...prepared.manifest.keys()],
    sources: manifestSources(repoDir, prepared.manifest),
    records: baseline,
  });
  // The config this install replaces is rewritten below (`seam` and `models`
  // reset), so an existing one is always saved too — in the SAME backup, even
  // alone (lib/backup.ts → replacedConfigBackup). None on a fresh install.
  const toBackUp = [...scan.drifted, ...replacedConfigBackup(cwd)];
  // `unsafe` is empty after a passing pre-flight; non-empty means a link
  // appeared since, and installCapabilities' own pre-flight refuses the run —
  // so no backup is made for a copy that will not happen.
  if (toBackUp.length > 0 && scan.unsafe.length === 0) {
    const backupDir = createBackup(cwd, toBackUp);
    // Named at creation, so the pointer survives anything that fails after it.
    log.info(
      `Backed up ${toBackUp.length} file(s) to ${backupDir} before overwriting.`,
    );
  }

  const s = spinner();
  s.start('Installing capabilities');
  let capabilities: InstalledCapability[];
  let settingsPreserved: boolean;
  let skillsVersion: string;
  let layout: Layout;
  let docsWritten: string[];
  try {
    const result = installCapabilities(
      repoDir,
      cwd,
      selection,
      prepared.manifest,
    );
    capabilities = result.capabilities;
    settingsPreserved = result.settingsPreserved;
    layout = result.layout;
    docsWritten = result.docs;
    skillsVersion = readSkillsVersion(repoDir);
  } catch (err) {
    // Stop the spinner and propagate — the orchestrator cleans up the fetched
    // temp clone in its finally, then formats + exits (cleanup before exit).
    s.stop('Failed to install capabilities');
    throw err;
  }
  s.stop('Capabilities installed');

  // `.claude/settings.json` is user-owned: an existing one is preserved, never
  // overwritten or merged. What the user needs to know is which PHARN hooks it
  // does not wire — and only now can that be answered: the clone is deleted
  // right after this step. So init prints the same paste-ready HOOKS note
  // `status` and `update` print (lib/hook-wiring.ts), plus the consequence
  // `status` would report. Nothing on a fresh install: the file was just
  // written from upstream. diffHookWiring never throws — an unreadable project
  // file is a status of its own, reported in the note.
  if (settingsPreserved) {
    log.info(
      `Existing ${CLAUDE_SETTINGS_FILE} preserved — pharn never overwrites it.`,
    );
    const hookLines = preservedSettingsHookLines(diffHookWiring(repoDir, cwd));
    if (hookLines) note(hookLines.join('\n'), 'HOOKS');
  }

  // The `models` block is pharn-oss's: copied VERBATIM from its root
  // pharn.config.json, checked on the way in (lib/upstream-models.ts). None
  // upstream → none written, never an invented one. One this CLI will not
  // apply → none written, and each reason named: pharn-oss may have widened its
  // rules past this CLI's copy of them (LIMITS.md §3e), which an upgrade fixes
  // — `pharn update` then writes it (the block's `restored` row).
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

  // Every declared product surface the fetched repo shipped NO file for —
  // commands, hooks, each trusted doc, the LICENSE, the features README,
  // contracts, core, floor (lib/install-manifest.ts → absentInstallSurfaces,
  // the same enumeration the copy's manifest comes from). Each copy is
  // existence-guarded on purpose (an older or reorganized clone must still
  // install, P7), but its silence was the defect: two docs were absent from
  // every install while the outro said "docs written", and a relocated
  // surface — or an `.mjs` hook — was dropped with no word at all. Warned, never
  // fatal: upstream's MIN_CLI is the lever for refusing a too-old CLI.
  const absentLines = absentSurfaceLines(
    absentInstallSurfaces({ repoDir, layout }),
  );
  if (absentLines) log.warn(absentLines.join('\n'));

  const frozenCapabilities = [
    ...new Set(carry.kept.map((c) => `${c.role}:${c.name}`)),
  ].sort();
  const config: PharnConfig = {
    pharnVersion: PHARN_VERSION,
    skillsVersion,
    repo: REPO_URL.replace(/^github\.com\//, ''),
    commit,
    ...(carry.ref === 'latest' ? { ref: 'latest' as const } : {}),
    // No constitution variant: the archetype install copies pharn-oss's canonical
    // CONSTITUTION.md verbatim. No modules: capabilities are the install unit.
    modules: [],
    installedAt: new Date().toISOString(),
    // pharn-oss's `models` block, or no key at all (`undefined` is not written).
    models,
    // Seam-resolution policy, written on every fresh install (P7 — additive).
    seam: DEFAULT_SEAM_CONFIG,
    archetypes,
    // An entry from archetype resolution is `auto` — `pharn update` owns it and
    // may drop it when the archetypes stop selecting it. `manual` is what
    // `pharn add` writes, and what a re-run init carries over from the config it
    // replaces (`carry.manualKeys` — sticky even when the archetypes ALSO select
    // it, as in update's merge), so a hand-added capability survives. Tagged at
    // the WRITE site so lib/install-capabilities.ts (the copy routine) stays
    // unaware of provenance, which is not its axis (P3). Kept (frozen) entries
    // follow VERBATIM — a parse failure upstream is not evidence of provenance.
    capabilities: [
      ...capabilities.map((c) => ({
        ...c,
        source: carry.manualKeys.has(`${c.role}:${c.name}`)
          ? ('manual' as const)
          : ('auto' as const),
      })),
      ...carry.kept.map((c) => ({ ...c })),
    ],
    // The layout mirrored from the fetched clone (flat OR pharn/) — status/remove
    // read this back to address the project the same way (lib/layout.ts).
    layout,
    // While non-empty, `pharn update` re-fetches even at the same skills version,
    // so a kept capability is re-checked once this CLI can read it (types.ts).
    ...(frozenCapabilities.length > 0 ? { frozenCapabilities } : {}),
  };
  // Record sha256 of every file this install just wrote (hashed at the DEST, so
  // the record cannot disagree with what landed) BEFORE the config, and stamped
  // with the config values written beside it. This is the baseline `pharn update`
  // compares against so it can tell pharn's bytes from the user's edits
  // (lib/install-records.ts). Without it every later update is degraded.
  //
  // Keyed by the SAME manifest the copy just applied — it depends only on the
  // clone, the selection and the layout, none of which change during a run.
  await writeRecords(cwd, {
    skillsVersion,
    commit,
    files: {
      ...keptRecords(baseline, carry, layout),
      // Files the replaced install recorded that upstream no longer ships and
      // that are still on disk keep their record, so `update` and `status`
      // keep naming them (lib/orphans.ts). Disjoint from the manifest.
      ...findOrphans({
        projectRoot: cwd,
        records: baseline,
        expected: prepared.manifest,
        capabilities: [...capabilities, ...carry.kept],
        frozen: carry.kept,
      }).records,
      ...buildRecords(cwd, prepared.manifest.keys()),
      // The block pharn just wrote, so `pharn update` can tell it from an edit.
      ...(models !== undefined
        ? { [MODELS_RECORD_KEY]: modelsRecordHash(models) }
        : {}),
    },
  });
  // The config this install replaces may hold keys pharn does not own —
  // upstream's `testResults` / `ship`, which users add by hand — and the object
  // above is built from pharn's own fields alone. Carry them over (why every
  // such key: userOwnedConfigEntries). Read HERE, inside init's project lock and
  // immediately before the write, for the reason the backup scan above is taken
  // late: a key edited while a prompt was open must not be lost. (Under init, an
  // edit made while a prompt was open never gets this far: init refuses, writing
  // nothing, when the file changed after it read it — commands/init.ts,
  // assertConfigFingerprintUnchanged.) Appended AFTER pharn's own keys: the two
  // sets are disjoint by construction, and this keeps the user's keys where they
  // most likely added them, so the committed file's diff is only what init
  // actually changed.
  await writePharnConfig(cwd, { ...config, ...readCarriedEntries(cwd) });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const check = pc.green('✔');
  const grillers = capabilities.filter((c) => c.role === 'griller').length;
  const lenses = capabilities.filter((c) => c.role === 'lens').length;
  // The block just written, resolved per stage, under the label that says what
  // it is: read by /pharn-ship and /pharn-loop to pick the model they request
  // for the stages they route (never effort), and the source of truth each
  // /pharn-* command's frontmatter is held to. The outro shows a declaration,
  // not what any stage ran on. No block (or one that declares no stages) → no
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
  // Report the docs that LANDED, by name — never a count and never the expected
  // list. A count would hide exactly the silence this line exists to end, and
  // the names are what let a user see at a glance that (say) LIMITS.md is not
  // among them. Zero docs cannot render as "docs written" at all.
  const docsLine = docsWritten.length
    ? `${check} ${docsWritten.length} trusted doc${docsWritten.length === 1 ? '' : 's'} written → ${pc.dim(docsWritten.join(', '))}`
    : `${pc.yellow('!')} no trusted docs written ${pc.dim('(the fetched repo shipped none at their expected paths)')}`;
  outro(
    [
      `${check} ${capabilities.length} capabilit${capabilities.length === 1 ? 'y' : 'ies'} installed → ${pc.dim(`(${grillers} griller${grillers === 1 ? '' : 's'}, ${lenses} lens${lenses === 1 ? '' : 'es'})`)}`,
      `${check} PHARN commands + hooks written → ${pc.dim('.claude/')}`,
      docsLine,
      `${check} pharn.config.json written ${pc.dim(`(skills v${skillsVersion}, archetypes: ${archetypes.join(', ')})`)}`,
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
 * install replaces — the pair `update` uses for its frozen entries
 * (`recordsBaseline` + `recordsUnderCapabilities`). A store that is absent,
 * unreadable, or stamped for a different install state carries NOTHING: never
 * minted, never blessed. Nothing under a kept capability was touched, so the
 * hashes it does carry are still true; dropping them would make the next
 * `update` read those files as `unrecorded` and skip them. Keyed at the clone's
 * layout, as in `update`. `baseline` is reinstallBaseline's, read before the
 * copy — the store exactly as this install found it.
 */
function keptRecords(
  baseline: FileRecords | null,
  carry: InstallCarry,
  layout: Layout,
): FileRecords {
  if (carry.kept.length === 0 || baseline === null) return {};
  return recordsUnderCapabilities(baseline, layoutPaths(layout), carry.kept);
}
