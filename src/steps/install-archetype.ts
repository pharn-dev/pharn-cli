import { readFileSync } from 'node:fs';
import { log, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { FIRST_FEATURE_COMMAND, REPO_URL } from '../lib/constants.js';
import {
  installCapabilities,
  prepareInstall,
} from '../lib/install-capabilities.js';
import { collectExpectedInstallPaths } from '../lib/install-manifest.js';
import { detectLayout, layoutPaths } from '../lib/layout.js';
import { manifestSources, scanDest } from '../lib/dest-drift.js';
import { createBackup } from '../lib/backup.js';
import {
  buildRecords,
  readRecords,
  recordsBaseline,
  recordsUnderCapabilities,
  writeRecords,
  type FileRecords,
} from '../lib/install-records.js';
import { DEFAULT_MODEL_ROUTING } from '../lib/model-routing.js';
import { formatModelRoutingLines } from '../lib/model-routing-format.js';
import { DEFAULT_SEAM_CONFIG } from '../lib/seam-config.js';
import {
  configPath,
  userOwnedConfigEntries,
  writePharnConfig,
} from '../lib/pharn-config.js';
import { readSkillsVersion } from '../lib/skills-version.js';
import { isPlainObject } from '../lib/validate.js';
import { PHARN_VERSION } from '../version.js';
import type {
  Archetype,
  InstalledCapability,
  Layout,
  PharnConfig,
  Selection,
} from '../types.js';

/**
 * What a re-run `init` carries over from the config it replaces (built by
 * commands/init.ts, which reads that config tolerantly). Empty for a first
 * install.
 */
export interface InstallCarry {
  // `role:name` of every capability the user added by hand (`pharn add` →
  // `source: 'manual'`) that the fetched index still has — selected by the
  // archetypes or not. Recorded `manual`, so `pharn update` keeps them (its merge
  // table, rows 3 and 6); every other installed entry is `auto`.
  manualKeys: ReadonlySet<string>;
  // Previous entries, of ANY source, whose capability upstream still ships but
  // this CLI could not PARSE (`index.unknown`) — `update`'s row 0. Nothing is
  // copied for them: each is written back VERBATIM, listed in
  // `frozenCapabilities` so `update` re-checks it, and keeps its records.
  kept: readonly InstalledCapability[];
  // The (skillsVersion, commit) of the config being replaced — the stamp the
  // records store must carry for a kept entry's records to be trusted.
  previousStamp: { skillsVersion: string; commit: string | null } | null;
}

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

const NO_CARRY: InstallCarry = {
  manualKeys: new Set(),
  kept: [],
  previousStamp: null,
};

// The archetype-install apply stage (pharn init --archetype). Copies the
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
  // `unsafe` is empty after a passing pre-flight; non-empty means a link
  // appeared since, and installCapabilities' own pre-flight refuses the run —
  // so no backup is made for a copy that will not happen.
  if (scan.drifted.length > 0 && scan.unsafe.length === 0) {
    const backupDir = createBackup(cwd, scan.drifted);
    // Named at creation, so the pointer survives anything that fails after it.
    log.info(
      `Backed up ${scan.drifted.length} file(s) to ${backupDir} before overwriting.`,
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

  if (settingsPreserved) {
    log.warn(
      'Existing .claude/settings.json preserved — compare it against pharn-oss to wire the PHARN hooks if needed.',
    );
  }

  // Which trusted docs the fetched repo did NOT ship at their expected path. A
  // set difference over two CLI-owned string arrays — the expected list from the
  // layout resolver, the written list from the copy routine itself, so a doc can
  // only be "missing" here because its existence guard rejected it.
  //
  // The guard is deliberate (an older clone that predates a doc must still
  // install, P7), but its silence is not: two docs were absent from every pharn
  // install while the outro reported "docs written" regardless. Naming them is
  // the whole point — the copy is still a no-op, it just no longer reads as
  // success.
  const docsMissing = layoutPaths(layout).docs.filter(
    (doc) => !docsWritten.includes(doc),
  );
  if (docsMissing.length) {
    log.warn(
      `The fetched repo shipped no ${docsMissing.join(', ')} — not installed. Installed commands and checkers that cite ${docsMissing.length === 1 ? 'it' : 'them'} by path will not resolve.`,
    );
  }

  const frozenCapabilities = [
    ...new Set(carry.kept.map((c) => `${c.role}:${c.name}`)),
  ].sort();
  const config: PharnConfig = {
    pharnVersion: PHARN_VERSION,
    skillsVersion,
    repo: REPO_URL.replace(/^github\.com\//, ''),
    commit,
    // No constitution variant: the archetype install copies pharn-oss's canonical
    // CONSTITUTION.md verbatim. No modules: capabilities are the install unit.
    modules: [],
    installedAt: new Date().toISOString(),
    // Per-stage model routing, written on every fresh install (P7 — additive).
    models: DEFAULT_MODEL_ROUTING,
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
      ...buildRecords(cwd, prepared.manifest.keys()),
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
  // Render the per-stage routing from the config just written (not a second
  // hardcoded copy), so the recorded intent is legible right after install.
  // config.models is set on every fresh install; the guard narrows its optional
  // type (P7 legacy). The hint below says plainly that no installed STAGE
  // consumes the block yet: it is written, validated and displayed — this line
  // and status's MODELS note are two of its readers — but nothing reads it to
  // PICK a model (docs/roadmap.md carries the Planned row). Claiming an edit
  // here changes a stage's model would document unimplemented behavior
  // (CLAUDE.md).
  const modelLines = config.models
    ? formatModelRoutingLines(config.models)
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
      '',
      pc.bold('Models per stage'),
      ...modelLines.map((line) => `  ${line}`),
      `  ${pc.dim('Recorded in pharn.config.json → models.stages — no installed stage reads it yet')}`,
      '',
      pc.bold('Next steps'),
      `  ${pc.cyan('1.')}  ${pc.bold('claude')}            ${pc.dim('open Claude Code')}`,
      `  ${pc.cyan('2.')}  ${pc.bold(FIRST_FEATURE_COMMAND)}       ${pc.dim("capture your first feature's intent")}`,
    ].join('\n'),
  );
}

/**
 * The records a re-install tells pharn's bytes from the user's by: the store
 * the install replaces, through `update`'s own gate (`recordsBaseline`) against
 * the stamp of the config it replaces. `null` — a first install, or a store
 * that is absent, corrupt or stamped for another install state — means every
 * file that differs from upstream is `unverifiable`, and so backed up: never
 * minted, never blessed, never guessed about.
 *
 * Keyed by PATH, at the layout of the install that wrote it. A re-install
 * whose clone changed layout (flat → pharn/) writes to new paths, which the
 * project does not have yet, and leaves the old files in place (init never
 * deletes) — so it backs up nothing extra. Only a file of the user's own
 * already at one of the new paths has no record there, and is backed up
 * (`unrecorded`). Pinned by tests/init-archetype.test.ts.
 *
 * Exported for init's prompt (commands/init.ts), which labels the same files
 * before the lock; the scan above, under the lock, is the one that acts.
 */
export function reinstallBaseline(
  cwd: string,
  previousStamp: InstallCarry['previousStamp'],
): FileRecords | null {
  return previousStamp === null
    ? null
    : recordsBaseline(readRecords(cwd), previousStamp).records;
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

/**
 * The user-owned top-level entries (`userOwnedConfigEntries`) of the
 * pharn.config.json this install is about to replace — `{}` on ANY failure.
 * Read TOLERANTLY, like init's readPreviousConfig: init is the command every
 * other one points at for recovery, so an absent, unreadable or unparseable
 * config means "nothing to carry over", never a refusal.
 *
 * Deliberately NOT readPharnConfig, whose verdict is about the keys pharn OWNS:
 * it returns null for a config with no `modules` array — which every other
 * command answers with "Run `pharn init` first" — and throws on a bad
 * `models`/`seam` hand-edit. Neither says anything about the user's own keys,
 * and reading through it would drop `testResults` on exactly the recovery path
 * pharn prescribes. So the one requirement is a JSON object at top level — the
 * same shape-only read steps/overwrite-check.ts makes for its one display
 * scalar, and file-local for the same reason: a total-catch reader must not be
 * importable from the module whose point is that it throws.
 */
function readCarriedEntries(cwd: string): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(readFileSync(configPath(cwd), 'utf8'));
    return isPlainObject(raw) ? userOwnedConfigEntries(raw) : {};
  } catch {
    return {};
  }
}
