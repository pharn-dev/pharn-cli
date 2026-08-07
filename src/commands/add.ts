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
import { parseCapabilityArg } from '../lib/capability-address.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import {
  buildAddSelection,
  interactiveAllowed,
} from '../lib/capability-picker.js';
import { installCapabilityDirs } from '../lib/install-capabilities.js';
import {
  buildRecords,
  capabilityRecordPaths,
  mergeRecords,
  readRecords,
  recordsBaseline,
  writeRecords,
} from '../lib/install-records.js';
import { detectLayout, layoutPaths } from '../lib/layout.js';
import { fetchRepo } from '../lib/repo.js';
import { readSkillsVersion } from '../lib/skills-version.js';
import {
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type { InstalledCapability, PharnConfig } from '../types.js';

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
    log.error(parsed.error);
    process.exit(1);
  }

  const s = spinner();
  s.start(`Fetching capabilities from ${REPO_URL}`);
  let repo;
  try {
    repo = await fetchRepo();
    s.stop(`Capabilities fetched from ${REPO_URL}`);
  } catch (err) {
    s.stop('Failed to fetch capabilities');
    log.error(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  // Assigned exactly once per path (try or catch), so cleanup runs in the finally
  // and the exit/outro happens after it (Node skips finally on process.exit).
  let result: AddResult;
  try {
    const refusal = versionGate(repo.dir, config);
    result = refusal
      ? { kind: 'error', message: refusal }
      : await resolveArchetypeAdd(repo.dir, repo.sha, config, cwd, parsed, arg);
  } catch (err) {
    if (process.env.PHARN_DEBUG) console.error(err);
    result = {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    repo.cleanup();
  }

  if (result.kind === 'error') {
    log.error(`⚠ ${result.message}`);
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
    log.error(
      'Specify a capability (e.g. `pharn add a11y` or `pharn add lens:n-plus-one`), or run `pharn add` in an interactive terminal to pick from a list.',
    );
    process.exit(1);
  }

  const s = spinner();
  s.start(`Fetching capabilities from ${REPO_URL}`);
  let repo;
  try {
    repo = await fetchRepo();
    s.stop(`Capabilities fetched from ${REPO_URL}`);
  } catch (err) {
    s.stop('Failed to fetch capabilities');
    log.error(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  // Assigned exactly once per path (try or catch) before it is read, so the
  // finally can run cleanup with every exit after it (mirrors resolveArchetypeAdd).
  let outcome: PickerAddOutcome;
  try {
    const refusal = versionGate(repo.dir, config);
    outcome = refusal
      ? { kind: 'error', message: refusal }
      : await resolveAddPicker(repo.dir, repo.sha, config, cwd);
  } catch (err) {
    if (process.env.PHARN_DEBUG) console.error(err);
    outcome = {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    repo.cleanup();
  }

  if (outcome.kind === 'error') {
    log.error(`⚠ ${outcome.message}`);
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
  | { kind: 'error'; message: string };

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
        capabilities: [
          ...(cfg.capabilities ?? []),
          { name: parsed.name, role: parsed.role! },
        ],
      };
    } else if (result.kind === 'noop') {
      // Defensive: the picker only offers not-installed capabilities.
      log.info(`${result.name} is already installed.`);
    } else {
      // Defensive: values come from the validated index, so this is unexpected.
      log.error(`⚠ ${result.message}`);
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
  | { kind: 'error'; message: string };

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
): Promise<AddResult> {
  const index = parseCapabilityIndex(repoDir);
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
  installCapabilityDirs(repoDir, cwd, [{ name: cap.name, role: cap.role }]);
  const version = readSkillsVersion(repoDir);
  // The SHA the tree was pinned to (recorded == fetched, or null when the branch
  // was floated — LIMITS.md §3b); threaded from fetchRepo, no separate fetch.
  const commit = sha;
  const capabilities: InstalledCapability[] = [
    ...existing,
    { name: cap.name, role: cap.role },
  ];
  // Record the files this add just wrote, merged into the existing store, so the
  // capability is not later mistaken for a file pharn never wrote (`unrecorded`)
  // by `pharn update`. Only an already-READABLE store is extended: minting a
  // partial one over an absent/corrupt store would silently relabel the whole
  // install, so absent stays absent (fail closed, lib/install-records.ts). The
  // paths are read back from the project — never guessed — at the layout the copy
  // above actually mirrored.
  await mergeCapabilityRecords(cwd, repoDir, config, cap, version, commit);
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
  repoDir: string,
  config: PharnConfig,
  cap: InstalledCapability,
  skillsVersion: string,
  commit: string | null,
): Promise<void> {
  const { records } = recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  });
  if (records === null) return; // absent/corrupt/stale → leave it alone
  const paths = layoutPaths(detectLayout(repoDir));
  const added = buildRecords(cwd, capabilityRecordPaths(cwd, paths, cap));
  await writeRecords(cwd, {
    skillsVersion,
    commit,
    files: mergeRecords(records, added),
  });
}
