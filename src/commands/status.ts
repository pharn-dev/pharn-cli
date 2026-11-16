import { diffHookWiring, hookWiringLines } from '../lib/hook-wiring.js';
import { intro, log, note, outro, spinner } from '@clack/prompts';
import pc from '../lib/color.js';
import { REPO } from '../lib/constants.js';
import { fetchRepo } from '../lib/repo.js';
import {
  channelOf,
  resolveLatestReleaseVersion,
  resolveSource,
  sourceDescription,
  sourceLabel,
  type RefChoice,
  type SourceSummary,
} from '../lib/release.js';
import { versionStatus } from '../lib/version-status.js';
import {
  buildStatusReport,
  layoutMismatch,
  serializeStatusReport,
  strictFails,
} from '../lib/status-report.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import { diffInstalledCapabilities } from '../lib/diff.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import type { InstallDiff } from '../lib/diff.js';
import { configLayout, detectLayout, layoutPaths } from '../lib/layout.js';
import {
  absentInstallSurfaces,
  collectExpectedInstallPaths,
  type AbsentSurface,
} from '../lib/install-manifest.js';
import { readRecords, recordsBaseline } from '../lib/install-records.js';
import { findOrphans, orphanNoteLines, type Orphan } from '../lib/orphans.js';
import {
  planPrettierignore,
  prettierignoreLines,
  type PrettierignorePlan,
} from '../lib/prettierignore.js';
import { row } from '../lib/format.js';
import { checkModelsBlock } from '../lib/model-config.js';
import {
  modelsCheckerCommand,
  modelsLabelLines,
  resolvedStageLines,
} from '../lib/model-config-format.js';
import { needsModelsConversion } from '../lib/models-update.js';
import { terminalSafe } from '../lib/terminal-safe.js';
import { nodeFloorLines, nodeFloorStatus } from '../lib/node-floor.js';
import { loadArchetypeConfigOrExit } from '../lib/pharn-config.js';
import {
  errorMessage,
  logErrorPlain,
  reportFatal,
  reportFatalPlain,
} from '../lib/report-error.js';
import {
  fetchRemoteSkillsVersion,
  readSkillsVersion,
} from '../lib/skills-version.js';
import type { InstalledCapability, Layout, PharnConfig } from '../types.js';

/**
 * Read-only audit of an archetype install: is it current (version section),
 * and have any PHARN-owned files drifted from the source it follows (drift
 * section)? Never writes — fixing is `pharn update` / `pharn add`.
 *
 * Default clones once for both sections; `--no-drift` checks the version only.
 * `--strict` exits 1 on anything outdated, modified or missing, a layout
 * mismatch or an unwired upstream hook. `--json` emits ONE object on stdout and
 * nothing else; diagnostics and failures go to stderr. Exit codes match.
 */
export async function runStatus(
  opts: { strict?: boolean; drift?: boolean; json?: boolean } = {},
): Promise<void> {
  const strict = opts.strict ?? false;
  const drift = opts.drift ?? true;
  const json = opts.json ?? false;

  if (!json) intro('pharn status');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd, { json });
  if (json) {
    await runArchetypeStatusJson(config, { strict, drift }, cwd);
    return;
  }
  await runArchetypeStatus(config, { strict, drift }, cwd);
}

// The `--json` twin of runArchetypeStatus: the same fetches in the same order,
// but nothing reaches stdout until the report is complete. A strict failure
// still prints the report and sets `process.exitCode` (no `process.exit`), so a
// large piped object is flushed.
async function runArchetypeStatusJson(
  config: PharnConfig,
  opts: { strict: boolean; drift: boolean },
  cwd: string,
): Promise<void> {
  const { strict, drift } = opts;
  const node = nodeFloorStatus(process.versions.node);

  // A diagnostic, so stderr — and above both fetches, as in text mode.
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) logErrorPlain(proxyNoticeMessage(proxyNotice));

  const channel = channelOf(config);
  const emit = (report: ReturnType<typeof buildStatusReport>): void => {
    console.log(serializeStatusReport(report));
    if (report.strict.failed) process.exitCode = 1;
  };

  if (!drift) {
    let latest: string;
    let source: SourceSummary;
    try {
      ({ latest, source } = await latestWithoutClone(channel));
    } catch (err) {
      reportFatalPlain(errorMessage(err), { err });
      process.exit(1);
    }
    emit(
      buildStatusReport({
        node,
        config,
        channel,
        latest,
        source,
        drift: null,
        prettierignore: statusPrettierignore(cwd),
        strict,
      }),
    );
    return;
  }

  let repo;
  try {
    repo = await fetchRepo(await resolveSource(channel));
  } catch (err) {
    reportFatalPlain(errorMessage(err), { err });
    process.exit(1);
  }

  let report: ReturnType<typeof buildStatusReport> | undefined;
  try {
    const index = parseCapabilityIndex(repo.dir);
    const frozen = new Set(index.unknown.map((u) => `${u.role}:${u.name}`));
    const recordedLayout = configLayout(config);
    const upstreamLayout = detectLayout(repo.dir);
    // Across layouts nothing is compared: the expected set would sit at paths
    // the clone does not use. Otherwise the file diff at the recorded layout,
    // and the surface scan at the CLONE's layout.
    const files = layoutMismatch(recordedLayout, upstreamLayout)
      ? { diff: null, absentUpstream: null }
      : {
          diff: diffInstalledCapabilities({
            repoDir: repo.dir,
            projectRoot: cwd,
            capabilities: (config.capabilities ?? []).filter(
              (cap) => !frozen.has(`${cap.role}:${cap.name}`),
            ),
            layout: recordedLayout,
          }),
          absentUpstream: absentInstallSurfaces({
            repoDir: repo.dir,
            layout: upstreamLayout,
          }),
        };
    report = buildStatusReport({
      node,
      config,
      channel,
      latest: readSkillsVersion(repo.dir),
      source: repo.source,
      drift: {
        ...files,
        hooks: diffHookWiring(repo.dir, cwd),
        unknown: index.unknown,
        orphans: statusOrphans(repo.dir, cwd, config, frozen),
        upstreamLayout,
      },
      prettierignore: statusPrettierignore(cwd),
      strict,
    });
  } catch (err) {
    reportFatalPlain(errorMessage(err), { err });
  } finally {
    repo.cleanup();
  }

  // Cleanup has run; a failure to build the report exits with stdout empty.
  if (report === undefined) process.exit(1);
  emit(report);
}

// Archetype install audit. Cleanup runs before any process.exit, so the exit
// code is recorded and applied only after the finally.
async function runArchetypeStatus(
  config: PharnConfig,
  opts: { strict: boolean; drift: boolean },
  cwd: string,
): Promise<void> {
  const { strict, drift } = opts;

  // NODE note: local, so it prints first and survives a failed fetch. A
  // mismatch is REPORTED, never fatal and never a `--strict` input: refusing to
  // run on this Node is the floor checks' verdict to give.
  note(
    nodeFloorLines(nodeFloorStatus(process.versions.node)).join('\n'),
    'NODE',
  );

  // The proxy notice, emitted ONCE above the branch so it precedes every fetch
  // — `--no-drift` still fetches SKILLS_VERSION (LIMITS.md §3a) — and above both
  // spinners, since a log.warn into a live clack spinner frame is overwritten.
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) {
    log.warn(proxyNoticeMessage(proxyNotice));
  }

  // The channel the install follows, never a flag. An unresolvable release
  // fails the command (exit 1) on both paths.
  const channel = channelOf(config);

  if (!drift) {
    const s = spinner();
    s.start('Checking for updates');
    let latest: string;
    let source: SourceSummary;
    try {
      ({ latest, source } = await latestWithoutClone(channel));
      s.stop(`Latest skills v${latest}`);
    } catch (err) {
      s.stop('Failed to check for updates');
      reportFatal(errorMessage(err), { err });
      process.exit(1);
    }
    const outdated = printArchetypeVersion(config, latest, source, channel);
    printModels(config);
    printPrettierignore(cwd);
    if (strict && strictFails({ outdated })) process.exit(1);
    outro(pc.dim('Read-only — nothing changed (drift check skipped).'));
    return;
  }

  const s = spinner();
  s.start(`Comparing against ${REPO}`);
  let repo;
  try {
    repo = await fetchRepo(await resolveSource(channel));
    s.stop(`Compared against ${sourceLabel(repo.source)}`);
  } catch (err) {
    s.stop(`Failed to reach ${REPO}`);
    reportFatal(errorMessage(err), { err });
    process.exit(1);
  }

  let exitCode = 0;
  try {
    const outdated = printArchetypeVersion(
      config,
      readSkillsVersion(repo.dir),
      repo.source,
      channel,
    );
    printModels(config);
    printPrettierignore(cwd);
    // Exclude FROZEN capabilities: `update` keeps their entry but never writes
    // their files, so comparing them would report drift no command can resolve
    // and fail `--strict` forever over a transient upstream break.
    const index = parseCapabilityIndex(repo.dir);
    const unknownWarning = unknownCapabilitiesWarning(index.unknown);
    if (unknownWarning) log.warn(unknownWarning);
    const frozen = new Set(index.unknown.map((u) => `${u.role}:${u.name}`));
    const recordedLayout = configLayout(config);
    const upstreamLayout = detectLayout(repo.dir);
    // A recorded layout the clone does not ship: nothing is compared, since
    // whole capability dirs would drop out unreported. The LAYOUT note says
    // what moves the install; it fails --strict.
    const mismatch = layoutMismatch(recordedLayout, upstreamLayout);
    let result: InstallDiff | undefined;
    let absentUpstream: readonly AbsentSurface[] | undefined;
    if (mismatch) {
      printLayoutNote(recordedLayout, upstreamLayout);
    } else {
      result = diffInstalledCapabilities({
        repoDir: repo.dir,
        projectRoot: cwd,
        capabilities: (config.capabilities ?? []).filter(
          (cap) => !frozen.has(`${cap.role}:${cap.name}`),
        ),
        layout: recordedLayout,
      });
      // Declared surfaces upstream ships NO file for, at the CLONE's layout.
      absentUpstream = absentInstallSurfaces({
        repoDir: repo.dir,
        layout: upstreamLayout,
      });
      printDriftSection(result, absentUpstream, sourceLabel(repo.source));
    }
    // ORPHANED: report only — no pharn command can clear one.
    const orphanLines = orphanNoteLines(
      statusOrphans(repo.dir, cwd, config, frozen) ?? [],
    );
    if (orphanLines) note(orphanLines.join('\n'), 'ORPHANED');
    // HOOKS: settings.json is never compared as a file; what IS checked is
    // whether every upstream hook is wired here.
    const hooks = diffHookWiring(repo.dir, cwd);
    const hookLines = hookWiringLines(hooks);
    if (hookLines) note(hookLines.join('\n'), 'HOOKS');
    if (
      strict &&
      strictFails({
        outdated,
        diff: result,
        hooks,
        absentUpstream,
        layoutMismatch: mismatch,
      })
    ) {
      exitCode = 1;
    }
  } catch (err) {
    reportFatal(errorMessage(err), { err });
    exitCode = 1;
  } finally {
    repo.cleanup();
  }

  if (exitCode) process.exit(exitCode);
  outro(pc.dim('Read-only — nothing changed.'));
}

// `--no-drift`'s version check without a clone: ONE bounded GET of
// `releases/latest` on `latest`, the tip's SKILLS_VERSION on `main`. Both fail
// closed.
async function latestWithoutClone(
  channel: RefChoice,
): Promise<{ latest: string; source: SourceSummary }> {
  if (channel === 'latest') {
    const release = await resolveLatestReleaseVersion();
    return { latest: release.version, source: release };
  }
  return {
    latest: await fetchRemoteSkillsVersion(),
    source: await resolveSource('main'),
  };
}

// The channel the config records. `main` is the key's absence, so an explicit
// `--ref main` and a pre-`--ref` install read the same.
function channelRow(channel: RefChoice): string {
  return channel === 'latest'
    ? row('Channel', 'latest — verified releases')
    : `${row('Channel', 'main — the pharn-oss tip')} ${pc.dim('(`pharn update --ref latest` follows verified releases)')}`;
}

// VERSION note: skillsVersion currency + an archetype / capability summary.
// Returns outdated. AHEAD is not outdated (lib/version-status.ts): `update`
// refuses that downgrade without `--force`, so `--strict` must not fail on it,
// or CI would demand a run that does nothing.
function printArchetypeVersion(
  config: PharnConfig,
  latest: string,
  source: SourceSummary,
  channel: RefChoice,
): boolean {
  const { ahead, outdated } = versionStatus({
    installed: config.skillsVersion,
    latest,
  });
  // The config's VERSION_RE-validated string, sanitized again.
  const installed = terminalSafe(config.skillsVersion);
  const aheadNote =
    source.kind === 'release'
      ? `(ahead of the latest verified release v${latest} — installed from main)`
      : `(ahead of pharn-oss main (v${latest}) — main has moved back; \`pharn update --force\` downgrades)`;
  // On the release channel: is a newer verified release out than the
  // installed SKILLS_VERSION?
  const outdatedNote =
    source.kind === 'release'
      ? `(newer verified release ${source.tag} — run \`pharn update\`)`
      : '(update available, run `pharn update`)';
  const currentNote =
    source.kind === 'release' ? '(no newer verified release)' : '(up to date)';
  const skillsLine = ahead
    ? `${row('Skills version', `v${installed}`)} ${pc.dim(aheadNote)}`
    : outdated
      ? `${row('Skills version', `v${installed} → v${latest}`)} ${pc.dim(outdatedNote)}`
      : `${row('Skills version', `v${installed}`)} ${pc.dim(currentNote)}`;
  note(
    [
      skillsLine,
      channelRow(channel),
      row('Source', sourceDescription(source)),
      '',
      row('Archetypes', (config.archetypes ?? []).join(', ') || '(none)'),
      row('Capabilities', String((config.capabilities ?? []).length)),
    ].join('\n'),
    'VERSION',
  );
  return outdated;
}

// MODELS note: the `models` block resolved per product stage, labeled as a
// declaration. Omitted when absent. Local, and NOT a `--strict` input: the
// block's verdict is pharn-oss's checker's, reported through this CLI's pinned
// copy of its rules.
function printModels(config: PharnConfig): void {
  if (config.models === undefined) return;
  const floor = layoutPaths(configLayout(config)).floor;
  note(modelsNoteLines(config.models, floor).join('\n'), 'MODELS');
}

function modelsNoteLines(block: unknown, floor: string): string[] {
  if (needsModelsConversion(block)) {
    return [
      'In the format pharn wrote before 0.7.0: a top-level `default` and',
      "model ids such as `opus-4-8`, which Claude Code and pharn-oss's",
      'checker reject.',
      pc.dim('`pharn update` converts it: a block pharn wrote and you never'),
      pc.dim("changed becomes pharn-oss's; an edited one keeps your values."),
    ];
  }
  const check = checkModelsBlock(block);
  if (check.kind === 'invalid') {
    return [
      "pharn-oss's rules reject this block:",
      ...check.reds.map((red) => `  ${terminalSafe(red.detail, { max: 300 })}`),
      pc.dim('Fix it by hand. The checker installed with PHARN says the same:'),
      pc.dim(modelsCheckerCommand(floor, 'validate')),
    ];
  }
  if (check.kind === 'no-stages') {
    return [
      "Declares no stages: pharn-oss's checker reads that as none declared.",
    ];
  }
  return [
    ...resolvedStageLines(check.stages),
    '',
    ...modelsLabelLines(floor).map((line) => pc.dim(line)),
  ];
}

// What `pharn update` would add to `.prettierignore`, derived from the usable
// record store (the same input as update's re-open); null without one. Local,
// so answered with or without `--no-drift`.
function statusPrettierignore(cwd: string): PrettierignorePlan | null {
  const { records } = recordsBaseline(readRecords(cwd));
  return records === null
    ? null
    : planPrettierignore(cwd, Object.keys(records));
}

// PRETTIER note — advisory, never a `--strict` input.
function printPrettierignore(cwd: string): void {
  const plan = statusPrettierignore(cwd);
  const lines =
    plan === null ? null : prettierignoreLines(plan, { status: true });
  if (lines !== null) note(lines.text, 'PRETTIER');
}

// Recorded files the install no longer owns (lib/orphans.ts) — the ONLY reason
// status reads pharn.records.json. null — not "none" — without a usable store,
// or when the clone is at another layout than the install, where nearly every
// recorded file would read as orphaned.
function statusOrphans(
  repoDir: string,
  cwd: string,
  config: PharnConfig,
  frozen: ReadonlySet<string>,
): Orphan[] | null {
  const { records } = recordsBaseline(readRecords(cwd));
  if (records === null) return null;
  const layout = configLayout(config);
  if (detectLayout(repoDir) !== layout) return null;
  const all: InstalledCapability[] = config.capabilities ?? [];
  const isFrozen = (cap: InstalledCapability): boolean =>
    frozen.has(`${cap.role}:${cap.name}`);
  const expected = collectExpectedInstallPaths({
    repoDir,
    capabilities: all.filter((cap) => !isFrozen(cap)),
    layout,
  });
  return findOrphans({
    projectRoot: cwd,
    records,
    expected,
    capabilities: all,
    frozen: all.filter(isFrozen),
  }).orphans;
}

// LAYOUT note, printed in place of DRIFT when the install is recorded at a
// layout the clone does not ship; it fails --strict. At the same skills version
// `update`'s early return answers "Already up to date", so the note names
// `--force` too, with what it costs.
function printLayoutNote(recorded: Layout, upstream: Layout): void {
  note(
    [
      `Recorded at the ${recorded} layout; pharn-oss now ships the ${upstream} layout.`,
      'Drift is not checked across layouts — your files are not where this',
      'source puts them, so neither the file comparison nor the NOT SHIPPED',
      'UPSTREAM check ran.',
      pc.dim(
        'Run `pharn update` to move the install; drift is checked after the move.',
      ),
      pc.dim(
        'If it answers "Already up to date", `pharn update --force` moves it,',
      ),
      pc.dim(
        'but also overwrites files you edited (backed up to pharn/.backup/ first).',
      ),
      pc.dim('`pharn status --strict` fails until the install is moved.'),
    ].join('\n'),
    'LAYOUT',
  );
}

// DRIFT note. Takes the InstallDiff type, so a partition added to the diff
// cannot be silently left unrendered.
function printDriftSection(
  result: InstallDiff,
  absentUpstream: readonly AbsentSurface[],
  ref: string,
): void {
  if (
    result.modified.length === 0 &&
    result.missing.length === 0 &&
    result.unreadable.length === 0 &&
    absentUpstream.length === 0
  ) {
    note(`No drift — ${result.okCount} file(s) match ${ref}.`, 'DRIFT');
    return;
  }

  const lines: string[] = [];
  if (result.modified.length) {
    // "DIFFERS FROM …", not "locally modified": upstream may have moved. Only
    // `update`, with the install records, can tell the two apart.
    lines.push(`  DIFFERS FROM ${ref} (PHARN-owned)`);
    for (const p of result.modified) lines.push(`  ${p}`);
    lines.push(
      pc.dim("  `pharn update` keeps files you've edited and cleanly"),
      pc.dim('  upgrades the rest; `--force` overwrites edits too'),
      pc.dim('  (backed up to pharn/.backup/ first).'),
    );
  }
  if (result.missing.length) {
    if (lines.length) lines.push('');
    lines.push('  MISSING (expected but absent)');
    for (const p of result.missing) lines.push(`  ${p}`);
    // A plain `update` restores these and keeps edits (findMissingInstalled
    // re-opens its early return). `--force` overwrites every edit, so it is
    // only the fallback for what that re-open cannot see.
    lines.push(
      pc.dim(
        '  Run `pharn update` to restore them (files you edited are kept).',
      ),
      pc.dim(
        '  If it answers "Already up to date", `pharn update --force` restores',
      ),
      pc.dim('  them but also overwrites files you edited (backed up first).'),
      pc.dim(
        '  To add a capability not yet in pharn.config.json, use `pharn add`',
      ),
      pc.dim('  (additive-only — already-listed capabilities are a no-op).'),
    );
  }
  if (result.unreadable.length) {
    // Last, as in update's SKIP_ORDER, with update's heading verbatim: only the
    // user can resolve these.
    if (lines.length) lines.push('');
    lines.push('  UNREADABLE — not a regular readable file');
    for (const { rel, reason } of result.unreadable) {
      lines.push(`  ${rel} — ${reason}`);
    }
    lines.push(
      pc.dim(
        '  pharn cannot compare these, and `pharn update` skips them too.',
      ),
      pc.dim('  Inspect each path by hand — a directory, a symlink, or an'),
      pc.dim('  unreadable file sits where pharn expects a regular file.'),
    );
  }
  if (absentUpstream.length) {
    // A declared surface the clone ships no file for; no pharn command fixes it.
    if (lines.length) lines.push('');
    lines.push(`  NOT SHIPPED UPSTREAM — ${ref} has no file here`);
    for (const { surface, path } of absentUpstream) {
      lines.push(`  ${terminalSafe(path, { max: 200 })} (${surface})`);
    }
    lines.push(
      pc.dim('  Installed commands, hooks and checkers that use these will'),
      pc.dim('  not find them. If pharn-oss moved them, a newer pharn may'),
      pc.dim('  know where: npm i -g @pharn-dev/pharn@latest'),
    );
  }
  lines.push('', pc.dim(`  ${result.okCount} file(s) match ${ref}.`));
  note(lines.join('\n'), 'DRIFT');
}
