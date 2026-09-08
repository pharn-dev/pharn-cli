import {
  groupMultiselect,
  intro,
  isCancel,
  log,
  outro,
  spinner,
} from '@clack/prompts';
import pc from 'picocolors';
import { REPO_URL } from '../lib/constants.js';
import { cancelAndExit } from '../lib/confirm.js';
import {
  errorMessage,
  logError,
  reportFatal,
  type FatalCause,
} from '../lib/report-error.js';
import { parseCapabilityArg } from '../lib/capability-address.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import { minCliGate } from '../lib/min-cli-gate.js';
import { PHARN_VERSION } from '../version.js';
import {
  buildAddSelection,
  interactiveAllowed,
} from '../lib/capability-picker.js';
import { createBackup } from '../lib/backup.js';
import { scanDest } from '../lib/dest-drift.js';
import { installCapabilityDirs } from '../lib/install-capabilities.js';
import { capabilityCloneFiles } from '../lib/install-manifest.js';
import {
  buildRecords,
  mergeRecords,
  readRecords,
  recordsBaseline,
  writeRecords,
} from '../lib/install-records.js';
import { configLayout, detectLayout, layoutPaths } from '../lib/layout.js';
import { fetchRepo } from '../lib/repo.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import { readSkillsVersion } from '../lib/skills-version.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import {
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type {
  CapabilityIndex,
  InstalledCapability,
  PharnConfig,
} from '../types.js';

// `pharn add <name>` / `add <role>:<name>` installs one capability into an
// archetype project. Bare `pharn add` in a terminal opens a grouped multi-select
// over the not-yet-installed capabilities — sugar over the SAME per-name install
// path (resolveArchetypeAdd), never a second installer. Non-TTY keeps a usage
// error. The legacy module/manifest flow was removed (live pharn-oss ships no
// manifest.json); a pre-archetype config is rejected up front by
// loadArchetypeConfigOrExit with the single LEGACY_CONFIG_MESSAGE.
export async function runAdd(capabilityArg: string | undefined): Promise<void> {
  intro('pharn add');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);
  await runArchetypeAdd(config, cwd, capabilityArg);
}

// THE VERSION GATE. `add` fetches @main, so the clone can be AHEAD of what this
// project installed. Stamping that clone's SKILLS_VERSION into pharn.config.json
// while every previously-installed file still holds the OLD version's bytes is
// what made `pharn update`'s `config.skillsVersion === latest` early-return lie —
// it printed "Already up to date" over a stale (or nearly empty) install, and the
// skew only self-healed on the next upstream release. So `add` refuses unless the
// two agree, and names the one command that resolves it.
//
// Direction-agnostic by construction: it fires on `!==`, never `<`. A clone OLDER
// than the config (a rollback, a hand edit) is the same mismatch and gets the same
// symmetric wording — never a guessed direction.
//
// Determinism (P5): exact string equality, no heuristic and no third outcome. The
// clone value is VERSION_RE-validated by readSkillsVersion; the config value is
// only TYPE-checked at ingest (lib/pharn-config.ts, deliberately — the same
// reasoning lib/install-records.ts records for its stamp). That asymmetry is safe
// here precisely because an unparseable hand-edited value compares UNEQUAL and so
// refuses: the fail-closed direction.
//
// Returns the refusal message, or null to proceed. Called ONCE per command from
// INSIDE each path's existing try — not after fetchRepo — because readSkillsVersion
// throws on a missing/invalid SKILLS_VERSION, and only inside the try does that
// throw still reach the finally that cleans the clone up (P0: cleanup before exit).
function versionGate(repoDir: string, config: PharnConfig): string | null {
  const fetched = readSkillsVersion(repoDir);
  if (fetched === config.skillsVersion) return null;
  return `Skills version mismatch: pharn.config.json records v${config.skillsVersion}, but the fetched ${REPO_URL} is at v${fetched}. \`pharn add\` installs only at the version your project is already on — run \`pharn update\` first, then re-run \`pharn add\`.`;
}

// THE LAYOUT GATE — the sibling of versionGate, and the same shape for the same
// reason. `add` copies at the CLONE's layout (installCapabilityDirs' default) and
// records at the clone's layout (mergeCapabilityRecords below), but EVERY reader
// of the install addresses the project through configLayout: remove (both paths),
// status/diff.ts, update's migration warning. When those two disagree, `add`
// writes where nothing will ever look: the capability lands under pharn/, and the
// next `pharn remove` reports "its files were already gone" while deleting only
// the config entry — orphaning the directory permanently.
//
// So the gate refuses rather than migrating. Recording the clone's layout here
// (what `update` does) would be strictly worse: `update` may record it only
// because it rewrites the ENTIRE tree at that layout, while `add` rewrites ONE
// capability — flipping config.layout would re-address every other capability,
// doc, contract, and floor file that is still at the old paths, turning one
// orphan into an install-wide one. Only `update` can migrate a tree, so the
// refusal names it.
//
// Compares configLayout(config), never the raw config.layout field: configLayout
// IS the definition of "where this project is addressed", and agreeing with the
// readers is the whole invariant. Both sides are the two-value Layout enum, so a
// hand-edited garbage value resolves to `flat`, mismatches a `pharn` clone, and
// refuses — fail-closed — and neither interpolated value is an unvalidated config
// string reaching the terminal.
//
// Returns the refusal message, or null to proceed. Called from INSIDE each path's
// existing try, immediately after versionGate (P0: cleanup before exit).
function layoutGate(repoDir: string, config: PharnConfig): string | null {
  const clone = detectLayout(repoDir);
  const recorded = configLayout(config);
  if (clone === recorded) return null;
  return `Install layout mismatch: pharn.config.json records the \`${recorded}\` layout, but the fetched ${REPO_URL} uses the \`${clone}\` layout. \`pharn add\` installs only at the layout your project is already recorded at — adding here would put files where \`pharn remove\` and \`pharn status\` will never look for them. Run \`pharn update --force\` first, then re-run \`pharn add\`.`;
}

// Install one capability into an archetype project (a manual override of
// archetype auto-selection). Appends to `capabilities`, never touches
// `archetypes`. The clone lives across no interactive prompt (named path), but
// cleanup still runs in a finally with every process.exit after it.
async function runArchetypeAdd(
  config: PharnConfig,
  cwd: string,
  arg: string | undefined,
): Promise<void> {
  // Bare invocation → interactive picker (in a TTY) or a usage error (non-TTY).
  if (arg === undefined) {
    await runAddPicker(config, cwd);
    return;
  }

  const parsed = parseCapabilityArg(arg);
  if (parsed.error) {
    logError(parsed.error);
    process.exit(1);
  }

  // What degit's single lowercase `https_proxy` read means here — emitted before
  // the spinner so it survives the frame and precedes a proxy-caused failure
  // (see src/commands/init.ts for the full rationale).
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) {
    log.warn(proxyNoticeMessage(proxyNotice));
  }

  const s = spinner();
  s.start(`Fetching capabilities from ${REPO_URL}`);
  let repo;
  try {
    repo = await fetchRepo();
    s.stop(`Capabilities fetched from ${REPO_URL}`);
  } catch (err) {
    s.stop('Failed to fetch capabilities');
    reportFatal(errorMessage(err), { err });
    process.exit(1);
  }

  // Assigned exactly once per path (try or catch), so cleanup runs in the finally
  // and the exit/outro happens after it (Node skips finally on process.exit).
  let result: AddResult;
  try {
    // `??` and not two ifs: short-circuit evaluation is what makes "version wins
    // when BOTH mismatch" structural rather than a property of statement order a
    // later edit could silently invert. The realistic both-mismatch case is an old
    // flat project meeting a new clone, where `pharn update` fixes version AND
    // layout in one pass — so the version message is the one worth printing.
    const gate = minCliGate(repo.dir, PHARN_VERSION);
    if (gate.warning) log.warn(gate.warning);
    // MIN_CLI leads the chain: a CLI too old for this content cannot be fixed by
    // `pharn update` (which the version gate would name), because `update` would
    // be refused for the same reason. Upgrading is the only real action, so its
    // message must be the one the user sees.
    const refusal =
      gate.refusal ??
      versionGate(repo.dir, config) ??
      layoutGate(repo.dir, config);
    result = refusal
      ? { kind: 'error', message: refusal }
      : await withProjectLock(cwd, 'add', () =>
          resolveArchetypeAdd(repo.dir, repo.sha, config, cwd, parsed, arg),
        );
  } catch (err) {
    // The exception is carried BOXED, not flattened to a message: the box's
    // presence is the single axis that separates a caught exception (which earns
    // the PHARN_DEBUG affordance) from the gate refusals that reach this same
    // `{kind:'error'}` outcome above. Boxed rather than bare because `throw
    // undefined` is legal, and a bare field could not tell it from "absent".
    //
    // A held lock is on the REFUSAL side of that axis, so it goes unboxed: the
    // message already names the one action that resolves it, and offering a
    // stack trace for it would be offering to debug someone else's running
    // process.
    result =
      err instanceof ProjectLockedError
        ? { kind: 'error', message: err.message }
        : { kind: 'error', message: errorMessage(err), cause: { err } };
  } finally {
    repo.cleanup();
  }

  if (result.kind === 'error') {
    reportFatal(result.message, result.cause);
    process.exit(1);
  }
  if (result.kind === 'noop') {
    outro(`${result.name} is already installed.`);
    return;
  }
  outro(
    `${pc.green('✔')} Added ${result.name} ${pc.dim(`(skills v${result.version})`)}`,
  );
}

// ---------------------------------------------------------------------------
// Bare `pharn add` — the interactive multi-select picker (additive-only).
// ---------------------------------------------------------------------------

// Non-TTY (CI, a pipe) → NEVER prompt: a reworded usage error + exit(1), before
// any fetch (P5 — the terminal fallback is a hard-fail, not a guess). In a TTY,
// fetch once, then resolve the picker (which lives across the multi-select), with
// cleanup in a finally and every exit after it.
async function runAddPicker(config: PharnConfig, cwd: string): Promise<void> {
  if (
    !interactiveAllowed({
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
    })
  ) {
    logError(
      'Specify a capability (e.g. `pharn add a11y` or `pharn add lens:n-plus-one`), or run `pharn add` in an interactive terminal to pick from a list.',
    );
    process.exit(1);
  }

  // What degit's single lowercase `https_proxy` read means here — emitted before
  // the spinner so it survives the frame and precedes a proxy-caused failure
  // (see src/commands/init.ts for the full rationale).
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) {
    log.warn(proxyNoticeMessage(proxyNotice));
  }

  const s = spinner();
  s.start(`Fetching capabilities from ${REPO_URL}`);
  let repo;
  try {
    repo = await fetchRepo();
    s.stop(`Capabilities fetched from ${REPO_URL}`);
  } catch (err) {
    s.stop('Failed to fetch capabilities');
    reportFatal(errorMessage(err), { err });
    process.exit(1);
  }

  // Assigned exactly once per path (try or catch) before it is read, so the
  // finally can run cleanup with every exit after it (mirrors resolveArchetypeAdd).
  let outcome: PickerAddOutcome;
  try {
    // Same ordered pair as the named path (see there), and for the same reason it
    // sits before resolveAddPicker: both gates must fire before groupMultiselect
    // renders, or the user picks capabilities only to be refused afterwards.
    const gate = minCliGate(repo.dir, PHARN_VERSION);
    if (gate.warning) log.warn(gate.warning);
    const refusal =
      gate.refusal ??
      versionGate(repo.dir, config) ??
      layoutGate(repo.dir, config);
    outcome = refusal
      ? { kind: 'error', message: refusal }
      : // ONE lock for the whole selection loop, not one per pick:
        // resolveArchetypeAdd persists config + records on every iteration, so a
        // per-pick lock would leave a gap between picks for another process to
        // interleave into.
        await withProjectLock(cwd, 'add', () =>
          resolveAddPicker(repo.dir, repo.sha, config, cwd),
        );
  } catch (err) {
    // Same axis as the named path: the boxed exception travels with the outcome
    // so a crash gets the PHARN_DEBUG hint, while a gate refusal and a held lock
    // do not.
    outcome =
      err instanceof ProjectLockedError
        ? { kind: 'error', message: err.message }
        : { kind: 'error', message: errorMessage(err), cause: { err } };
  } finally {
    repo.cleanup();
  }

  if (outcome.kind === 'error') {
    reportFatal(outcome.message, outcome.cause);
    process.exit(1);
  }
  if (outcome.kind === 'all-installed') {
    outro('All available capabilities are already installed.');
    return;
  }
  if (outcome.kind === 'cancelled') cancelAndExit();
  if (outcome.kind === 'none') {
    outro('Nothing selected. No capabilities were added.');
    return;
  }
  outro(
    `${pc.green('✔')} Added ${outcome.added.length} ${plural(outcome.added.length)}.`,
  );
}

type PickerAddOutcome =
  | { kind: 'installed'; added: string[] }
  | { kind: 'all-installed' }
  | { kind: 'none' }
  | { kind: 'cancelled' }
  // `cause` is present ONLY when this outcome came from a caught exception. Its
  // absence is what keeps the PHARN_DEBUG hint off a curated gate refusal, which
  // reaches the very same variant.
  | { kind: 'error'; message: string; cause?: FatalCause };

// Build the menu (available = index − installed), multi-select, then install each
// pick via the EXISTING per-name path (resolveArchetypeAdd), threading the
// growing config forward so the FINAL pharn.config.json holds every pick — not
// just the last (resolveArchetypeAdd persists per call off the config passed in).
// Pure of process.exit — the caller owns cleanup + exit.
async function resolveAddPicker(
  repoDir: string,
  sha: string | null,
  config: PharnConfig,
  cwd: string,
): Promise<PickerAddOutcome> {
  const index = parseCapabilityIndex(repoDir);
  // No silent skips (P5): named immediately after the parse, so it precedes both
  // the `all-installed` outro and the picker itself — the user never reads
  // "all available capabilities are already installed" without also being told
  // that something upstream was skipped. ONCE per command: the index is threaded
  // into every pick below rather than re-parsed, so an N-pick run does not repeat
  // the same warning N times.
  const unknownWarning = unknownCapabilitiesWarning(index.unknown);
  if (unknownWarning) log.warn(unknownWarning);
  const installed = config.capabilities ?? [];
  const { groups, availableCount } = buildAddSelection(index, installed);
  if (availableCount === 0) return { kind: 'all-installed' };

  if (installed.length > 0) {
    log.info(
      `Installed (${installed.length}): ${installed.map((c) => `${c.name} (${c.role})`).join(', ')}`,
    );
  }

  const picked = await groupMultiselect({
    message: 'Select capabilities to add',
    options: groups,
    required: false,
    selectableGroups: false,
  });
  if (isCancel(picked)) return { kind: 'cancelled' };
  const values = picked as string[];
  if (values.length === 0) return { kind: 'none' };

  // Thread the config forward across the per-pick installs (grill F1): each
  // resolveArchetypeAdd writes pharn.config.json off the `cfg` passed in, so cfg
  // must accumulate every prior pick or the writes clobber down to the last one.
  const added: string[] = [];
  let cfg = config;
  for (const value of values) {
    const parsed = parseCapabilityArg(value);
    const result = await resolveArchetypeAdd(
      repoDir,
      sha,
      cfg,
      cwd,
      parsed,
      value,
      index,
    );
    if (result.kind === 'added') {
      log.info(`${pc.green('✔')} Added ${result.name}`);
      added.push(result.name);
      // parsed.role is always defined — our option `value`s are `role:name`.
      // Carry EVERY field resolveArchetypeAdd persisted, not just capabilities:
      // `cfg` must mirror the config just written, or the next pick reads a
      // config that disagrees with disk. (Concretely: the records store is
      // stamped with the persisted skillsVersion/commit, so a stale `cfg` makes
      // the next pick's stamp check fail and silently drop its records.)
      cfg = {
        ...cfg,
        skillsVersion: result.version,
        commit: sha,
        // Mirrors the entry resolveArchetypeAdd just persisted — INCLUDING its
        // `source: 'manual'`. This is the second entry-construction site, and it
        // must not diverge: the next pick spreads THIS array into its own config
        // write, so an untagged mirror would persist every earlier pick without
        // its provenance and `pharn update` would delete them.
        capabilities: [
          ...(cfg.capabilities ?? []),
          { name: parsed.name, role: parsed.role!, source: 'manual' },
        ],
      };
    } else if (result.kind === 'noop') {
      // Defensive: the picker only offers not-installed capabilities.
      log.info(`${result.name} is already installed.`);
    } else {
      // Defensive: values come from the validated index, so this is unexpected.
      // `logError`, not `reportFatal`: this does not exit — the loop continues to
      // the next pick — and `resolveArchetypeAdd` only ever returns CURATED
      // errors here (unknown / ambiguous), so there is no stack to offer.
      logError(`⚠ ${result.message}`);
    }
  }
  return { kind: 'installed', added };
}

function plural(n: number): string {
  return n === 1 ? 'capability' : 'capabilities';
}

type AddResult =
  | { kind: 'added'; name: string; version: string }
  | { kind: 'noop'; name: string }
  // See PickerAddOutcome: `cause` present ⇔ this came from an exception.
  | { kind: 'error'; message: string; cause?: FatalCause };

// Resolve the arg against the fetched index and, if it uniquely names a not-yet-
// installed capability, copy it + append to config. Pure of process.exit — the
// caller owns cleanup + exit (this returns a typed outcome instead).
async function resolveArchetypeAdd(
  repoDir: string,
  sha: string | null,
  config: PharnConfig,
  cwd: string,
  parsed: { name: string; role?: 'griller' | 'lens' },
  arg: string,
  // The already-parsed index, when the caller holds one. The picker passes its
  // own so an N-pick run parses ONCE and warns ONCE; the named path omits it and
  // parses here. Either way the unknown list is surfaced exactly once per
  // command — naming it at only some parses is how a skipped capability becomes
  // invisible, and naming it at every pick is just noise for the same fact.
  parsedIndex?: CapabilityIndex,
): Promise<AddResult> {
  let index = parsedIndex;
  if (index === undefined) {
    index = parseCapabilityIndex(repoDir);
    // No silent skips (P5).
    const unknownWarning = unknownCapabilitiesWarning(index.unknown);
    if (unknownWarning) log.warn(unknownWarning);
  }
  const matches = index.capabilities.filter(
    (c) =>
      c.name === parsed.name &&
      (parsed.role === undefined || c.role === parsed.role),
  );
  if (matches.length === 0) {
    const valid = index.capabilities.map((c) => `${c.role}:${c.name}`).sort();
    return {
      kind: 'error',
      message: `Unknown capability "${arg}". Valid capabilities:\n  ${valid.join('\n  ')}`,
    };
  }
  if (matches.length > 1) {
    return {
      kind: 'error',
      message: `"${parsed.name}" is ambiguous — use ${matches.map((m) => `${m.role}:${m.name}`).join(' or ')}.`,
    };
  }
  const cap = matches[0]!;
  const existing = config.capabilities ?? [];
  if (existing.some((c) => c.name === cap.name && c.role === cap.role)) {
    return { kind: 'noop', name: cap.name };
  }
  // The files the copy is about to write, enumerated in the CLONE — the one list
  // that drives BOTH the drift set below and the records merge further down, so
  // the two can never disagree about what this add actually wrote.
  const paths = layoutPaths(detectLayout(repoDir));
  const cloneRels = capabilityCloneFiles(repoDir, paths, cap);

  // DESTINATION-DRIFT PROTECTION. `add` was the only write path with none of the
  // product's three edit-protections: no prompt (init's confirmWriteTargets), no
  // per-file skip (update's records table), no backup (update --force). And the
  // destructive sequence is one `update` MANUFACTURES and announces: a
  // dropped-unselected capability's files are left on disk ("update never
  // deletes"), the user edits them, and a later `add` of that capability is not a
  // config no-op — so cpSync's `force: true` replaced the edits with pristine
  // upstream bytes, unrecoverably.
  //
  // So every file whose destination bytes DIFFER from the clone's is copied to
  // `.pharn-backup/<ts>/` first (lib/backup.ts — the same directory
  // `update --force` uses). `add` still overwrites; it no longer does so
  // irrecoverably. Byte-identical is not drift, so a drop-then-re-add of unedited
  // files stays silent (lib/dest-drift.ts).
  //
  // BEFORE the copy, and before installCapabilityDirs' pre-flight can throw: a
  // failed backup must abort with every original intact, which is exactly
  // createBackup's contract. The scan skips an unreadable source rather than
  // throwing, so a missing/symlinked capability dir still gets the pre-flight's
  // curated message rather than a raw ENOENT from here.
  const scan = scanDest({ repoDir, projectRoot: cwd, rels: cloneRels });

  // REFUSE rather than write through a symlink. Measured on node v24.13.1: with a
  // symlinked INTERMEDIATE directory under the capability dir, cpSync writes
  // straight THROUGH it, replacing bytes wherever the link points — outside the
  // project included. Skipping those paths would be worse than doing nothing: the
  // copy still writes through the link while the backup meant to protect it
  // silently omits the file. Backing them up is not an option either —
  // createBackup refuses a symlinked component by design, and copyFileSync would
  // save the TARGET's bytes rather than the link. So `add` writes NOTHING and
  // names the offending component, the same shape as its version and layout gates
  // (lib/dest-drift.ts carries the full measurement).
  if (scan.unsafe.length > 0) {
    const first = scan.unsafe[0]!;
    const more =
      scan.unsafe.length > 1
        ? ` (and ${scan.unsafe.length - 1} more under the same capability)`
        : '';
    return {
      kind: 'error',
      message: `Refusing to add ${cap.name}: \`${first.link}\` in your project is a symlink, and \`${first.rel}\` sits under it${more}. \`pharn add\` copies the whole capability directory, which would write THROUGH that link and replace files it points at — possibly outside your project — and those cannot be backed up. Replace the symlink with a real directory (or move it aside), then re-run \`pharn add ${cap.name}\`.`,
    };
  }

  if (scan.drifted.length > 0) {
    const backupDir = createBackup(cwd, scan.drifted);
    // Announced AT CREATION, not only on success: this path is the user's ONLY
    // pointer back to their pre-overwrite bytes (lib/backup.ts), and everything
    // after this line can still throw — the pre-flight, the records write, the
    // config write. Printing here is what keeps the pointer reachable on the very
    // path that most needs it.
    log.info(
      `Backed up ${scan.drifted.length} file(s) to ${backupDir} before overwriting.`,
    );
  }

  installCapabilityDirs(repoDir, cwd, [{ name: cap.name, role: cap.role }]);
  const version = readSkillsVersion(repoDir);
  // The SHA the tree was pinned to (recorded == fetched, or null when the branch
  // was floated — LIMITS.md §3b); threaded from fetchRepo, no separate fetch.
  const commit = sha;
  // `source: 'manual'` — the user asked for this capability BY NAME, so it is
  // theirs, not archetype resolution's. `pharn update` reads that tag and
  // PRESERVES the entry instead of replacing it with the re-resolved auto set
  // (lib/merge-capabilities.ts, rows 3/6). Without the tag, the next update would
  // silently delete this add and orphan its files.
  const capabilities: InstalledCapability[] = [
    ...existing,
    { name: cap.name, role: cap.role, source: 'manual' },
  ];
  // Record the files this add just wrote, merged into the existing store, so the
  // capability is not later mistaken for a file pharn never wrote (`unrecorded`)
  // by `pharn update`. Only an already-READABLE store is extended: minting a
  // partial one over an absent/corrupt store would silently relabel the whole
  // install, so absent stays absent (fail closed, lib/install-records.ts).
  //
  // The paths come from the CLONE — what the copy wrote — never from a walk of
  // the destination. A leftover capability directory can hold files the user put
  // there, and a dest walk recorded those as pharn-written: if upstream later
  // shipped a file at that path, record==dest would make `update` read the user's
  // file as cleanly upgradeable instead of `modified`. The hashes are still taken
  // at the DEST (buildRecords), so a record can never disagree with what landed.
  await mergeCapabilityRecords(cwd, config, cloneRels, version, commit);
  await writePharnConfig(cwd, {
    ...config,
    skillsVersion: version,
    commit,
    capabilities,
    installedAt: new Date().toISOString(),
  });
  return { kind: 'added', name: cap.name, version };
}

// Extend `pharn.records.json` with one just-installed capability's files. The
// store is re-stamped with the same (skillsVersion, commit) written to the config
// beside it, so the two stay consistent — a stamp that disagrees with the config
// is how a store written by another tool is detected and ignored.
async function mergeCapabilityRecords(
  cwd: string,
  config: PharnConfig,
  // The CLONE-derived paths the copy just wrote (capabilityCloneFiles), not a
  // walk of the destination — see the call site.
  cloneRels: string[],
  skillsVersion: string,
  commit: string | null,
): Promise<void> {
  const { records } = recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  });
  if (records === null) return; // absent/corrupt/stale → leave it alone
  const added = buildRecords(cwd, cloneRels);
  await writeRecords(cwd, {
    skillsVersion,
    commit,
    files: mergeRecords(records, added),
  });
}
