import { intro, log, outro, spinner } from '@clack/prompts';
import pc from '../lib/color.js';
import { REPO_URL } from '../lib/constants.js';
import { cancelAndExit } from '../lib/confirm.js';
import { errorMessage, logError, reportFatal } from '../lib/report-error.js';
import { parseCapabilityArg } from '../lib/capability-address.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import { minCliGate } from '../lib/min-cli-gate.js';
import { PHARN_VERSION } from '../version.js';
import {
  resolveAddPicker,
  type AddResult,
  type PickerAddOutcome,
} from '../steps/add-picker.js';
import { interactiveAllowed } from '../lib/capability-picker.js';
import { createBackup, printBackupNotice } from '../lib/backup.js';
import { backupDirIgnored } from '../lib/gitignore.js';
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
import {
  channelOf,
  resolveSource,
  sourceLabel,
  type InstallSource,
} from '../lib/release.js';
import { versionStatus } from '../lib/version-status.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import { readSkillsVersion } from '../lib/skills-version.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import {
  assertConfigUnchanged,
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
// path (resolveArchetypeAdd). Non-TTY keeps a usage error.
export async function runAdd(capabilityArg: string | undefined): Promise<void> {
  intro('pharn add');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);
  await runArchetypeAdd(config, cwd, capabilityArg);
}

// THE VERSION GATE. The clone can be ahead of (or behind) what this project
// installed, and stamping its SKILLS_VERSION over files still at the old bytes
// would make `pharn update`'s same-version early return lie ("Already up to
// date" over a stale install). So `add` refuses unless the two agree: exact
// `!==`, direction-agnostic. The config value is only type-checked at ingest;
// an unparseable hand-edit compares unequal and refuses (fail closed).
//
// Called from INSIDE each path's try, because readSkillsVersion throws on a
// missing/invalid SKILLS_VERSION and only there does the throw reach the
// finally that cleans the clone up.
//
// A `pendingSkillsVersion` also passes: `update` records it only when the bump
// was withheld solely by the user's kept edits (directly, or through the
// executable-unit hold they caused), so everything outside those edits and the
// unit is at that version — and `add` writes capability dirs only, outside the
// unit. Without a pending version `add` cannot tell "update not run yet" from
// "update cannot finish", so the refusal names `pharn update`, `--dry-run` and
// the two ways out.
//
// An install AHEAD of its source (lib/version-status.ts) gets its own wording:
// `pharn update` would refuse to downgrade without `--force` and loop the user.
function versionGate(
  repoDir: string,
  config: PharnConfig,
  source: InstallSource,
): string | null {
  const fetched = readSkillsVersion(repoDir);
  if (fetched === config.skillsVersion) return null;
  if (fetched === config.pendingSkillsVersion) return null;
  if (
    versionStatus({ installed: config.skillsVersion, latest: fetched }).ahead
  ) {
    return source.kind === 'release'
      ? `Your install (skills v${config.skillsVersion}) is ahead of the latest verified ${REPO_URL} release (${source.tag}) — it came from pharn-oss main, and \`pharn add\` installs only at the version your project is already on. Run \`pharn update --ref main\` to follow main (\`pharn add\` then fetches from it too), or wait for a release at v${config.skillsVersion}.`
      : `Your install (skills v${config.skillsVersion}) is newer than ${REPO_URL} main (v${fetched}) — pharn-oss main has moved back to an older version, and \`pharn add\` installs only at the version your project is already on. Wait for main to reach v${config.skillsVersion} again, or run \`pharn update --force\` to downgrade to v${fetched} first (it backs up the files you edited to pharn/.backup/), then re-run \`pharn add\`.`;
  }
  const partly =
    config.pendingSkillsVersion === undefined
      ? ''
      : ` (partly at v${config.pendingSkillsVersion})`;
  return `Skills version mismatch: pharn.config.json records v${config.skillsVersion}${partly}, but the fetched ${REPO_URL} is at v${fetched}. \`pharn add\` installs only at the version your project is already on. Run \`pharn update\` to move it to v${fetched}; if update cannot finish (\`pharn update --dry-run\` shows which files block it), revert those files or run \`pharn update --force\` (it backs them up to pharn/.backup/ first), then re-run \`pharn add\`.`;
}

// The (skillsVersion, commit) pair `add` writes to the config and the records
// stamp: normally the clone's. At a PENDING version it stays the config's own —
// the newer version would claim an upgrade the kept edits (and a unit they held
// back) never received, and `update` would early-return "up to date".
function addStamp(
  config: PharnConfig,
  version: string,
  sha: string | null,
): { skillsVersion: string; commit: string | null } {
  return version === config.skillsVersion
    ? { skillsVersion: version, commit: sha }
    : { skillsVersion: config.skillsVersion, commit: config.commit };
}

// THE LAYOUT GATE. `add` copies and records at the CLONE's layout, but every
// reader (remove, status/diff.ts, update) addresses the project through
// configLayout. On a mismatch the capability lands where nothing looks, and the
// next `remove` drops the config entry and orphans the directory.
//
// So it refuses rather than migrating: recording the clone's layout (what
// `update` does, because it rewrites the whole tree) would re-address every
// other file still at the old paths. Compares configLayout(config), never the
// raw field, so a garbage hand-edited value resolves to `flat` and fails closed.
// Called inside each path's try, right after versionGate.
function layoutGate(repoDir: string, config: PharnConfig): string | null {
  const clone = detectLayout(repoDir);
  const recorded = configLayout(config);
  if (clone === recorded) return null;
  return `Install layout mismatch: pharn.config.json records the \`${recorded}\` layout, but the fetched ${REPO_URL} uses the \`${clone}\` layout. \`pharn add\` installs only at the layout your project is already recorded at — adding here would put files where \`pharn remove\` and \`pharn status\` will never look for them. Run \`pharn update --force\` first, then re-run \`pharn add\`.`;
}

// Install one capability into an archetype project (a manual override of
// archetype auto-selection). Appends to `capabilities`, never touches
// `archetypes`. Cleanup runs in a finally with every process.exit after it.
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

  // Assigned exactly once per path (try or catch), so the exit/outro happens
  // after the clone cleanup (Node skips finally on process.exit).
  let result: AddResult;
  try {
    // The lock is taken BEFORE the fetch, so a refused run downloads nothing;
    // this path has no prompt. The fetch is inside `fn` so a fetch failure
    // unwinds through withProjectLock's `finally` and releases the lock.
    //
    // Cost: an UNKNOWN or AMBIGUOUS name is resolved against the index in the
    // clone, so under a held lock `pharn add bogus` reports the lock instead of
    // listing valid addresses. Errors decidable without the clone still win.
    result = await withProjectLock(cwd, 'add', async () => {
      assertConfigUnchanged(cwd, config, 'add');
      // The proxy notice (fetch never uses a proxy) goes before the spinner so
      // it survives the frame; inside the lock, so a refused run does not print it.
      const proxyNotice = detectProxyNotice(process.env);
      if (proxyNotice) {
        log.warn(proxyNoticeMessage(proxyNotice));
      }

      const s = spinner();
      s.start(`Fetching capabilities from ${REPO_URL}`);
      let repo;
      try {
        // The channel the config records — `add` has no `--ref` of its own.
        repo = await fetchRepo(await resolveSource(channelOf(config)));
        s.stop(`Capabilities fetched from ${sourceLabel(repo.source)}`);
      } catch (err) {
        s.stop('Failed to fetch capabilities');
        // Re-thrown, not exited, so the lock releases; the catch below turns it
        // into a boxed `{kind:'error'}`.
        throw err;
      }
      try {
        // `??` chain: short-circuit evaluation makes the order of the gates
        // structural. Version wins over layout when both mismatch, since
        // `pharn update` fixes both in one pass.
        const gate = minCliGate(repo.dir, PHARN_VERSION);
        if (gate.warning) log.warn(gate.warning);
        // MIN_CLI leads: a CLI too old for this content cannot be fixed by
        // `pharn update` (refused for the same reason), so upgrading is the
        // message the user must see.
        const refusal =
          gate.refusal ??
          versionGate(repo.dir, config, repo.source) ??
          layoutGate(repo.dir, config);
        return refusal
          ? { kind: 'error' as const, message: refusal }
          : await resolveArchetypeAdd(
              repo.dir,
              repo.sha,
              config,
              cwd,
              parsed,
              arg,
            );
      } finally {
        repo.cleanup();
      }
    });
  } catch (err) {
    // The exception is carried BOXED: the box separates a caught exception
    // (which earns the PHARN_DEBUG affordance) from a gate refusal, and survives
    // `throw undefined`. A held lock is a refusal, so it goes unboxed.
    result =
      err instanceof ProjectLockedError
        ? { kind: 'error', message: err.message }
        : { kind: 'error', message: errorMessage(err), cause: { err } };
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

// Non-TTY (CI, a pipe) → NEVER prompt: a usage error + exit(1), before any
// fetch. In a TTY, fetch once, then resolve the picker, with cleanup in a
// finally and every exit after it.
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

  // Assigned exactly once per path before it is read, so the exit/outro happens
  // after the clone cleanup.
  let outcome: PickerAddOutcome;
  try {
    // ONE lock for the whole selection loop: resolveArchetypeAdd persists config
    // and records on every pick, so a per-pick lock would let another process
    // interleave between picks. Taken before the fetch, like the named path.
    // This path holds the lock across a human prompt (groupMultiselect); the
    // download only adds a bounded wait to that hold.
    outcome = await withProjectLock(cwd, 'add', async () => {
      assertConfigUnchanged(cwd, config, 'add');
      // The proxy notice goes before the spinner so it survives the frame.
      const proxyNotice = detectProxyNotice(process.env);
      if (proxyNotice) {
        log.warn(proxyNoticeMessage(proxyNotice));
      }

      const s = spinner();
      s.start(`Fetching capabilities from ${REPO_URL}`);
      let repo;
      try {
        // The channel the config records — `add` has no `--ref` of its own.
        repo = await fetchRepo(await resolveSource(channelOf(config)));
        s.stop(`Capabilities fetched from ${sourceLabel(repo.source)}`);
      } catch (err) {
        s.stop('Failed to fetch capabilities');
        // Re-thrown rather than exited, so the lock releases — see the named path.
        throw err;
      }
      try {
        // Same gate chain as the named path; it runs before resolveAddPicker so
        // the user is never refused after picking.
        const gate = minCliGate(repo.dir, PHARN_VERSION);
        if (gate.warning) log.warn(gate.warning);
        const refusal =
          gate.refusal ??
          versionGate(repo.dir, config, repo.source) ??
          layoutGate(repo.dir, config);
        return refusal
          ? { kind: 'error' as const, message: refusal }
          : await resolveAddPicker(
              repo.dir,
              repo.sha,
              config,
              cwd,
              resolveArchetypeAdd,
            );
      } finally {
        repo.cleanup();
      }
    });
  } catch (err) {
    // Same boxing as the named path.
    outcome =
      err instanceof ProjectLockedError
        ? { kind: 'error', message: err.message }
        : { kind: 'error', message: errorMessage(err), cause: { err } };
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
  const n = outcome.added.length;
  if (outcome.failed.length === 0) {
    outro(`${pc.green('✔')} Added ${n} ${plural(n)}.`);
    return;
  }
  // A failed pick (each already reported) makes the run a failure: named again
  // and exit 1. The names are `role:name` values from the validated index.
  const failures = `${outcome.failed.length} failed: ${outcome.failed.join(', ')}.`;
  outro(
    n === 0
      ? `No capabilities were added; ${failures}`
      : `Added ${n} ${plural(n)}; ${failures}`,
  );
  process.exit(1);
}

function plural(n: number): string {
  return n === 1 ? 'capability' : 'capabilities';
}

// Resolve the arg against the fetched index and, if it uniquely names a
// not-yet-installed capability, copy it + append to config. Returns a typed
// outcome; the caller owns cleanup + exit.
async function resolveArchetypeAdd(
  repoDir: string,
  sha: string | null,
  config: PharnConfig,
  cwd: string,
  parsed: { name: string; role?: 'griller' | 'lens' },
  arg: string,
  // The already-parsed index, when the caller holds one (the picker), so the
  // unknown-capabilities warning prints exactly once per command.
  parsedIndex?: CapabilityIndex,
): Promise<AddResult> {
  let index = parsedIndex;
  if (index === undefined) {
    index = parseCapabilityIndex(repoDir);
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
  // The files the copy will write, enumerated in the CLONE — one list drives
  // both the drift set and the records merge, so they cannot disagree.
  const paths = layoutPaths(detectLayout(repoDir));
  const cloneRels = capabilityCloneFiles(repoDir, paths, cap);

  // DESTINATION-DRIFT PROTECTION. A capability directory can outlive its config
  // entry (left by an older pharn, or made by hand) and hold edited bytes, so
  // `add` is not then a no-op. Every file whose destination bytes differ from
  // the clone's is backed up to `pharn/.backup/<ts>/` before the copy;
  // byte-identical is not drift (lib/dest-drift.ts). The scan skips an
  // unreadable source, so installCapabilityDirs' pre-flight message still wins.
  const scan = scanDest({ repoDir, projectRoot: cwd, rels: cloneRels });

  // REFUSE a symlinked component under the capability dir: cpSync writes
  // THROUGH a symlinked intermediate directory (pinned by tests/add.test.ts,
  // "REFUSES rather than copy through a symlinked directory"), and such a path
  // cannot be backed up either.
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
    // Announced AT CREATION: everything after this can still throw, and this is
    // the user's only pointer back to the pre-overwrite bytes.
    printBackupNotice({
      dir: backupDir,
      saved: scan.drifted.length,
      action: 'overwriting',
      gitignored: backupDirIgnored(cwd),
    });
  }

  installCapabilityDirs(repoDir, cwd, [{ name: cap.name, role: cap.role }]);
  const version = readSkillsVersion(repoDir);
  // The pinned SHA (null when the branch was floated — LIMITS.md §3b), unless
  // the clone is at a pending version (see addStamp).
  const stamp = addStamp(config, version, sha);
  // `source: 'manual'` — the user asked for it by name, so `pharn update` keeps
  // it instead of replacing it with the re-resolved auto set
  // (lib/merge-capabilities.ts).
  const capabilities: InstalledCapability[] = [
    ...existing,
    { name: cap.name, role: cap.role, source: 'manual' },
  ];
  // Record the files this add wrote, so `update` does not later read them as
  // `unrecorded`. Only an already-readable store is extended (absent stays
  // absent). Keys come from the CLONE, never a dest walk, so a user's own file
  // in a leftover capability dir is not recorded as pharn's; hashes are taken
  // at the DEST, so a record matches what landed.
  await mergeCapabilityRecords(
    cwd,
    config,
    cloneRels,
    stamp.skillsVersion,
    stamp.commit,
  );
  await writePharnConfig(cwd, {
    ...config,
    ...stamp,
    // `installedAt` is carried by the spread: an add is a partial edit.
    capabilities,
  });
  return { kind: 'added', name: cap.name, version, stamp };
}

// Extend `pharn.records.json` with one capability's files, re-stamped with the
// (skillsVersion, commit) written to the config beside it.
async function mergeCapabilityRecords(
  cwd: string,
  config: PharnConfig,
  // The CLONE-derived paths the copy wrote — see the call site.
  cloneRels: string[],
  skillsVersion: string,
  commit: string | null,
): Promise<void> {
  const { records } = recordsBaseline(readRecords(cwd));
  if (records === null) return; // absent/corrupt → leave it alone
  const added = buildRecords(cwd, cloneRels);
  await writeRecords(cwd, {
    skillsVersion,
    commit,
    files: mergeRecords(records, added),
  });
}
