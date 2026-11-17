import { diffHookWiring, hookWiringLines } from '../lib/hook-wiring.js';
import { intro, log, note, outro, spinner } from '@clack/prompts';
import pc from '../lib/color.js';
import { REPO } from '../lib/constants.js';
import { fetchRepo, type FetchedRepo } from '../lib/repo.js';
import {
  channelOf,
  resolveLatestReleaseVersion,
  resolveSource,
  sourceDescription,
  sourceLabel,
  type RefChoice,
  type SourceSummary,
} from '../lib/release.js';
import {
  buildStatusReport,
  layoutMismatch,
  serializeStatusReport,
  type StatusReport,
  type StatusReportInput,
} from '../lib/status-report.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import { diffInstalledCapabilities } from '../lib/diff.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import { configLayout, detectLayout, layoutPaths } from '../lib/layout.js';
import {
  absentInstallSurfaces,
  collectExpectedInstallPaths,
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
import { terminalSafe } from '../lib/terminal-safe.js';
import { nodeFloorLines, nodeFloorStatus } from '../lib/node-floor.js';
import { loadArchetypeConfig } from '../lib/pharn-config.js';
import { CliError } from '../lib/cli-error.js';
import { logErrorPlain } from '../lib/report-error.js';
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
 * mismatch or an unwired upstream hook. The work is done once into ONE
 * `StatusReport` (lib/status-report.ts): `--json` prints it, the text notes are
 * rendered from it, and both read `--strict`'s verdict off it. `--json` emits
 * ONE object on stdout and nothing else; diagnostics and failures go to
 * stderr. Exit codes match.
 */
export async function runStatus(
  opts: { strict?: boolean; drift?: boolean; json?: boolean } = {},
): Promise<void> {
  const strict = opts.strict ?? false;
  const drift = opts.drift ?? true;
  const json = opts.json ?? false;

  if (!json) intro('pharn status');

  const cwd = process.cwd();
  const config = loadArchetypeConfig(cwd, { json });
  const node = nodeFloorStatus(process.versions.node);

  // NODE note: local, so it prints first and survives a failed fetch. A
  // mismatch is REPORTED, never fatal and never a `--strict` input: refusing to
  // run on this Node is the floor checks' verdict to give.
  if (!json) note(nodeFloorLines(node).join('\n'), 'NODE');

  // The proxy notice, emitted ONCE and above every fetch — `--no-drift` still
  // fetches SKILLS_VERSION (LIMITS.md §3a) — and above the spinner, since a
  // log.warn into a live clack spinner frame is overwritten. A diagnostic, so
  // stderr under `--json`.
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) {
    const message = proxyNoticeMessage(proxyNotice);
    if (json) logErrorPlain(message);
    else log.warn(message);
  }

  // The channel the install follows, never a flag. An unresolvable release
  // fails the command (exit 1) on both paths.
  const channel = channelOf(config);
  const s = json ? null : spinner();
  let input: StatusReportInput;

  if (!drift) {
    s?.start('Checking for updates');
    let found: { latest: string; source: SourceSummary };
    try {
      found = await latestWithoutClone(channel);
      s?.stop(`Latest skills v${found.latest}`);
    } catch (err) {
      s?.stop('Failed to check for updates');
      throw CliError.failure(err, { json });
    }
    input = {
      node,
      config,
      channel,
      ...found,
      drift: null,
      prettierignore: statusPrettierignore(cwd),
      strict,
    };
  } else {
    s?.start(`Comparing against ${REPO}`);
    let repo: FetchedRepo;
    try {
      repo = await fetchRepo(await resolveSource(channel));
      s?.stop(`Compared against ${sourceLabel(repo.source)}`);
    } catch (err) {
      s?.stop(`Failed to reach ${REPO}`);
      throw CliError.failure(err, { json });
    }
    try {
      input = cloneInput(repo, { node, config, channel, strict }, cwd);
    } catch (err) {
      // A failure to gather ends the run with stdout empty, after the cleanup.
      throw CliError.failure(err, { json });
    } finally {
      repo.cleanup();
    }
  }

  const report = buildStatusReport(input);
  if (json) {
    // A normal return, so a large piped object is flushed.
    console.log(serializeStatusReport(report));
    if (report.strict.failed) process.exitCode = 1;
    return;
  }
  renderStatus(report, input);
  // The notes above are the verdict; only the exit code is left.
  if (report.strict.failed) throw CliError.reported();
  outro(
    pc.dim(
      drift
        ? 'Read-only — nothing changed.'
        : 'Read-only — nothing changed (drift check skipped).',
    ),
  );
}

// Everything the default (clone) path compares, gathered once.
function cloneInput(
  repo: FetchedRepo,
  base: Pick<StatusReportInput, 'node' | 'config' | 'channel' | 'strict'>,
  cwd: string,
): StatusReportInput {
  const { config } = base;
  // Exclude FROZEN capabilities: `update` keeps their entry but never writes
  // their files, so comparing them would report drift no command can resolve
  // and fail `--strict` forever over a transient upstream break.
  const index = parseCapabilityIndex(repo.dir);
  const frozen = new Set(index.unknown.map((u) => `${u.role}:${u.name}`));
  const recordedLayout = configLayout(config);
  const upstreamLayout = detectLayout(repo.dir);
  // Across layouts nothing is compared: the expected set would sit at paths
  // the clone does not use, and whole capability dirs would drop out
  // unreported. Otherwise the file diff at the recorded layout, and the
  // surface scan (declared surfaces upstream ships NO file for) at the CLONE's
  // layout.
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
  return {
    ...base,
    latest: readSkillsVersion(repo.dir),
    source: repo.source,
    drift: {
      ...files,
      // settings.json is never compared as a file; what IS checked is whether
      // every upstream hook is wired here.
      hooks: diffHookWiring(repo.dir, cwd),
      unknown: index.unknown,
      orphans: statusOrphans(repo.dir, cwd, config, frozen),
      upstreamLayout,
    },
    prettierignore: statusPrettierignore(cwd),
  };
}

// The text notes, in order, from the report (and, for the notes whose report
// form is capped for JSON, the input it was built from).
function renderStatus(report: StatusReport, input: StatusReportInput): void {
  printArchetypeVersion(report, input.source);
  printModels(input.config);
  printPrettierignore(input.prettierignore);
  const drift = input.drift;
  if (drift === null) return;
  const unknownWarning = unknownCapabilitiesWarning(drift.unknown);
  if (unknownWarning) log.warn(unknownWarning);
  // `drift` is null in the report exactly on a layout mismatch here: the
  // LAYOUT note says what moves the install; it fails --strict.
  if (report.drift === null) {
    printLayoutNote(report.layout.recorded, drift.upstreamLayout);
  } else {
    printDriftSection(report.drift, sourceLabel(input.source));
  }
  // ORPHANED: report only — no pharn command can clear one.
  const orphanLines = orphanNoteLines(report.orphans ?? []);
  if (orphanLines) note(orphanLines.join('\n'), 'ORPHANED');
  const hookLines = hookWiringLines(drift.hooks);
  if (hookLines) note(hookLines.join('\n'), 'HOOKS');
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
// AHEAD is not outdated (lib/version-status.ts): `update` refuses that
// downgrade without `--force`, so `--strict` must not fail on it, or CI would
// demand a run that does nothing.
function printArchetypeVersion(
  report: StatusReport,
  source: SourceSummary,
): void {
  const { ahead, outdated, latest, channel } = report.version;
  // The config's VERSION_RE-validated string, sanitized again.
  const installed = terminalSafe(report.version.installed);
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
      row('Archetypes', report.archetypes.join(', ') || '(none)'),
      row('Capabilities', String(report.capabilities.count)),
    ].join('\n'),
    'VERSION',
  );
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

// A block in the format pharn wrote before 0.7.0 is an invalid block like any
// other: its REDs are named.
function modelsNoteLines(block: unknown, floor: string): string[] {
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
// record store; null without one. Local,
// so answered with or without `--no-drift`.
function statusPrettierignore(cwd: string): PrettierignorePlan | null {
  const { records } = recordsBaseline(readRecords(cwd));
  return records === null
    ? null
    : planPrettierignore(cwd, Object.keys(records));
}

// PRETTIER note — advisory, never a `--strict` input.
function printPrettierignore(plan: PrettierignorePlan | null): void {
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
// layout the clone does not ship; it fails --strict. A plain `update` moves it,
// at any skills version.
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
      pc.dim('`pharn status --strict` fails until the install is moved.'),
    ].join('\n'),
    'LAYOUT',
  );
}

// DRIFT note, from the report's `drift` — the same object `--json` prints, so
// a partition added there cannot be silently left unrendered here.
function printDriftSection(
  result: NonNullable<StatusReport['drift']>,
  ref: string,
): void {
  const { absentUpstream } = result;
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
    // A plain `update` restores these and keeps edits: every run plans.
    lines.push(
      pc.dim(
        '  Run `pharn update` to restore them (files you edited are kept).',
      ),
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
    // A declared surface the clone ships no file for; no pharn command fixes
    // it. The path is already capped in the report.
    if (lines.length) lines.push('');
    lines.push(`  NOT SHIPPED UPSTREAM — ${ref} has no file here`);
    for (const { surface, path } of absentUpstream) {
      lines.push(`  ${terminalSafe(path)} (${surface})`);
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
