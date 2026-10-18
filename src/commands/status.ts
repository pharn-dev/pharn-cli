import { diffHookWiring, hookWiringLines } from '../lib/hook-wiring.js';
import { intro, log, note, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { REPO } from '../lib/constants.js';
import { fetchRepo } from '../lib/repo.js';
import {
  channelOf,
  resolveSource,
  sourceDescription,
  sourceLabel,
  type InstallSource,
} from '../lib/release.js';
import { versionStatus } from '../lib/version-status.js';
import {
  buildStatusReport,
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
 * Read-only audit of an archetype install: is it current (version section) and
 * have any PHARN-owned files drifted from what it follows — pharn-oss `main`,
 * or the newest verified release for a config that records `ref: "latest"` (drift
 * section)? Never writes, deletes, or overwrites — fixing is `pharn update` /
 * `pharn add`. The module/manifest flow was removed; a pre-archetype config is
 * rejected up front by loadArchetypeConfigOrExit.
 *
 * Default clones the repo once and reuses it for both sections. `--no-drift`
 * skips the clone and only checks the version (via the lightweight SKILLS_VERSION
 * fetch). `--strict` exits 1 when anything is outdated, modified, or missing,
 * or when a hook upstream wires is not wired in `.claude/settings.json`.
 *
 * `--json` emits ONE JSON object on stdout and nothing else there — no clack
 * chrome at all; diagnostics and every failure go to stderr, with stdout empty.
 * It carries what the text notes report, and the exit codes are the same.
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
// but NOTHING reaches stdout until the report is complete — every failure
// before that point writes to stderr and exits 1 with stdout empty. A strict
// failure still prints the report (it is a finding, not a failure to report)
// and sets `process.exitCode` rather than calling `process.exit`, so a large
// object piped to `jq` is flushed, not cut off; the code is the text mode's.
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
    let source: InstallSource;
    try {
      source = await resolveSource(channel);
      latest =
        source.kind === 'release'
          ? source.version
          : await fetchRemoteSkillsVersion();
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
    const diff = diffInstalledCapabilities({
      repoDir: repo.dir,
      projectRoot: cwd,
      capabilities: (config.capabilities ?? []).filter(
        (cap) => !frozen.has(`${cap.role}:${cap.name}`),
      ),
      layout: configLayout(config),
    });
    // At the CLONE's own layout: "absent" means upstream ships nothing there,
    // never "the install is recorded at another layout" (that is `layout`).
    const upstreamLayout = detectLayout(repo.dir);
    report = buildStatusReport({
      node,
      config,
      channel,
      latest: readSkillsVersion(repo.dir),
      source: repo.source,
      drift: {
        diff,
        hooks: diffHookWiring(repo.dir, cwd),
        unknown: index.unknown,
        orphans: statusOrphans(repo.dir, cwd, config, frozen),
        absentUpstream: absentInstallSurfaces({
          repoDir: repo.dir,
          layout: upstreamLayout,
        }),
        upstreamLayout,
      },
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

// Archetype install audit: version via SKILLS_VERSION + capability drift.
// Cleanup runs before any process.exit (Node skips finally on exit), so the
// desired exit code is recorded and applied only after the finally.
async function runArchetypeStatus(
  config: PharnConfig,
  opts: { strict: boolean; drift: boolean },
  cwd: string,
): Promise<void> {
  const { strict, drift } = opts;

  // NODE note: local and instant, so it prints first and survives a failed
  // fetch. A mismatch is REPORTED, never fatal and never a `--strict` input:
  // `status` is the read-only report, and the verdict that matters — PHARN's
  // floor checks refusing to run on this Node — is theirs to give.
  note(
    nodeFloorLines(nodeFloorStatus(process.versions.node)).join('\n'),
    'NODE',
  );

  // What a configured proxy means here (nothing: fetch never uses one), emitted
  // ONCE above the branch so it precedes EVERY fetch this command can make —
  // `--no-drift`'s SKILLS_VERSION read and the drift path's clone alike. BOTH
  // branches are network-bearing, and that is the whole correction: this block
  // used to sit inside the drift branch, justified by "`--no-drift` never
  // clones". True, and irrelevant — never clones is not never fetches, and
  // `--no-drift` still reaches the network at `fetchRemoteSkillsVersion`. So the
  // one user the notice exists for (proxy-only, direct egress blocked) got an
  // unexplained timeout from the single path that skipped it, against
  // LIMITS.md §3a: EVERY network-bearing command warns before fetching.
  //
  // Above both spinners for the same reason it was always pre-spinner: a
  // log.warn into a live clack spinner frame is overwritten, and each branch
  // starts its own spinner below (see src/commands/init.ts for the full
  // rationale). Still below loadArchetypeConfigOrExit, so a legacy-config
  // refusal keeps winning at zero round-trips.
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) {
    log.warn(proxyNoticeMessage(proxyNotice));
  }

  // The channel the install follows, never a flag: `status` reports on the
  // install as it is configured. A release that cannot be resolved fails the
  // command (exit 1) on both paths, exactly like an unreachable fetch did.
  const channel = channelOf(config);

  if (!drift) {
    const s = spinner();
    s.start('Checking for updates');
    let latest: string;
    let source: InstallSource;
    try {
      source = await resolveSource(channel);
      latest =
        source.kind === 'release'
          ? source.version
          : await fetchRemoteSkillsVersion();
      s.stop(`Latest skills v${latest}`);
    } catch (err) {
      s.stop('Failed to check for updates');
      reportFatal(errorMessage(err), { err });
      process.exit(1);
    }
    const outdated = printArchetypeVersion(config, latest, source);
    printModels(config);
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
    );
    printModels(config);
    // Exclude FROZEN capabilities — the ones the fetch boundary could not parse
    // in this clone. `update` deliberately keeps their config entry but never
    // writes their files, so comparing them here would report drift that no
    // command can ever resolve and make `status --strict` exit 1 forever over a
    // transient upstream grammar break. The two commands must agree about which
    // capabilities this install actually owns bytes for.
    const index = parseCapabilityIndex(repo.dir);
    const unknownWarning = unknownCapabilitiesWarning(index.unknown);
    if (unknownWarning) log.warn(unknownWarning);
    const frozen = new Set(index.unknown.map((u) => `${u.role}:${u.name}`));
    const result = diffInstalledCapabilities({
      repoDir: repo.dir,
      projectRoot: cwd,
      capabilities: (config.capabilities ?? []).filter(
        (cap) => !frozen.has(`${cap.role}:${cap.name}`),
      ),
      layout: configLayout(config),
    });
    // The declared product surfaces upstream ships NO file for, at the CLONE's
    // own layout — so the label means exactly that. A recorded layout that
    // differs from it is the LAYOUT note's to say, and is not a --strict input.
    const upstreamLayout = detectLayout(repo.dir);
    const absentUpstream = absentInstallSurfaces({
      repoDir: repo.dir,
      layout: upstreamLayout,
    });
    printLayoutNote(configLayout(config), upstreamLayout);
    printDriftSection(result, absentUpstream, sourceLabel(repo.source));
    // ORPHANED: report only — never a --strict input (no pharn command can
    // clear one; update never deletes).
    const orphanLines = orphanNoteLines(
      statusOrphans(repo.dir, cwd, config, frozen) ?? [],
    );
    if (orphanLines) note(orphanLines.join('\n'), 'ORPHANED');
    // HOOKS: settings.json is user-owned and never compared as a file above;
    // what IS checked is whether every hook upstream wires is wired here.
    const hooks = diffHookWiring(repo.dir, cwd);
    const hookLines = hookWiringLines(hooks);
    if (hookLines) note(hookLines.join('\n'), 'HOOKS');
    if (
      strict &&
      strictFails({ outdated, diff: result, hooks, absentUpstream })
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

// VERSION note for an archetype install: skillsVersion currency + a summary of
// the detected archetypes and installed capability count. Returns outdated.
//
// AHEAD is not outdated (lib/version-status.ts): the install is newer than the
// source it follows — ahead of the newest verified release (installed from
// main, then switched), or ahead of main itself (main moved back) — and
// `pharn update` refuses that downgrade without `--force`, so `--strict` must
// not fail on it either, or CI would demand a run that does nothing.
function printArchetypeVersion(
  config: PharnConfig,
  latest: string,
  source: InstallSource,
): boolean {
  const { ahead, outdated } = versionStatus({
    installed: config.skillsVersion,
    latest,
  });
  // The config's own string: validated at load (VERSION_RE, F-18) and
  // sanitized again at the one place it reaches the terminal.
  const installed = terminalSafe(config.skillsVersion);
  const aheadNote =
    source.kind === 'release'
      ? `(ahead of the latest verified release v${latest} — installed from main)`
      : `(ahead of pharn-oss main (v${latest}) — main has moved back; \`pharn update --force\` downgrades)`;
  const skillsLine = ahead
    ? `${row('Skills version', `v${installed}`)} ${pc.dim(aheadNote)}`
    : outdated
      ? `${row('Skills version', `v${installed} → v${latest}`)} ${pc.dim('(update available, run `pharn update`)')}`
      : `${row('Skills version', `v${installed}`)} ${pc.dim('(up to date)')}`;
  note(
    [
      skillsLine,
      row('Source', sourceDescription(source)),
      '',
      row('Archetypes', (config.archetypes ?? []).join(', ') || '(none)'),
      row('Capabilities', String((config.capabilities ?? []).length)),
    ].join('\n'),
    'VERSION',
  );
  return outdated;
}

// MODELS note: the `models` block, resolved per product stage — a declaration,
// labeled as one. /pharn-ship and /pharn-loop read it to pick the model they
// request for routed stages (never effort); a directly invoked /pharn-* stage
// uses its own frontmatter, which the block is held to, and pharn-oss's
// checker (installed under the floor dir) compares the two on request. Omitted
// when `models` is absent (P7 additive/legacy). Read-only, local (no clone),
// and NOT a `--strict` input: the block's verdict is pharn-oss's checker's to
// give — this note reports it, through this CLI's pinned copy of its rules.
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

// Recorded files the install no longer owns (lib/orphans.ts), or null when
// that cannot be determined. This is the ONLY reason status reads
// pharn.records.json: the drift section above stays a records-free byte compare.
//
// null — not "none" — when the store is absent / invalid / stamped for another
// state (no baseline to name a file by), or when the clone is at another layout
// than the install: the expected set is then derived at paths the clone does
// not have, so nearly every recorded file would read as orphaned. `update` is
// the command that migrates the layout, and it names the copies it leaves.
function statusOrphans(
  repoDir: string,
  cwd: string,
  config: PharnConfig,
  frozen: ReadonlySet<string>,
): Orphan[] | null {
  const { records } = recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  });
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

// LAYOUT note: the install is recorded at a layout the fetched clone no longer
// ships. Advisory and never a --strict input: the drift check still compares
// the files at the recorded layout, and `pharn update` is what moves the
// install (it records the clone's layout). Nothing printed when they agree.
function printLayoutNote(recorded: Layout, upstream: Layout): void {
  if (recorded === upstream) return;
  note(
    [
      `Recorded at the ${recorded} layout; pharn-oss now ships the ${upstream} layout.`,
      pc.dim('`pharn update` moves the install to it. Until then the drift'),
      pc.dim(`check compares your files at the ${recorded} layout's paths.`),
    ].join('\n'),
    'LAYOUT',
  );
}

// DRIFT note: differing, missing and unreadable PHARN-owned files, the declared
// surfaces upstream ships nothing for, or a clean bill. Takes the InstallDiff
// type rather than an inline structural literal, so a partition added to the
// diff cannot be silently left unrendered here.
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
    // "DIFFERS FROM …", not "locally modified": this comparison is against
    // what upstream ships NOW, so a file can differ because UPSTREAM moved, not only
    // because the user edited it. `update` is the command that can tell those
    // apart (it has the per-file install records); this report cannot.
    lines.push(`  DIFFERS FROM ${ref} (PHARN-owned)`);
    for (const p of result.modified) lines.push(`  ${p}`);
    lines.push(
      pc.dim("  `pharn update` keeps files you've edited and cleanly"),
      pc.dim('  upgrades the rest; `--force` overwrites edits too'),
      pc.dim('  (backed up to .pharn-backup/ first).'),
    );
  }
  if (result.missing.length) {
    if (lines.length) lines.push('');
    lines.push('  MISSING (expected but absent)');
    for (const p of result.missing) lines.push(`  ${p}`);
    lines.push(
      pc.dim(
        '  For recorded capabilities: `pharn update` when a newer skills version is',
      ),
      pc.dim(
        '  available, or `pharn update --force` at the current version (a plain',
      ),
      pc.dim('  `pharn update` exits early when already up to date).'),
      pc.dim(
        '  To add a capability not yet in pharn.config.json, use `pharn add`',
      ),
      pc.dim('  (additive-only — already-listed capabilities are a no-op).'),
    );
  }
  if (result.unreadable.length) {
    // Last, mirroring update's SKIP_ORDER: these are neither an edit nor an
    // absence, and nothing pharn can run resolves them — only the user can.
    // The heading is update's skip heading verbatim, because the write side
    // refuses these exact paths for the exact same reason.
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
    // Not a file of the project's: a surface the install declares and the
    // clone ships no file for, so nothing was installed there. No pharn
    // command can fix it — upstream moved or dropped it.
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
