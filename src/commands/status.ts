import { intro, log, note, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { REPO, REPO_BRANCH } from '../lib/constants.js';
import { fetchRepo } from '../lib/repo.js';
import { detectProxyNotice, resolveDegitProxyRead } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import { diffInstalledCapabilities } from '../lib/diff.js';
import type { InstallDiff } from '../lib/diff.js';
import { configLayout } from '../lib/layout.js';
import { row } from '../lib/format.js';
import { formatModelRoutingLines } from '../lib/model-routing-format.js';
import { loadArchetypeConfigOrExit } from '../lib/pharn-config.js';
import {
  fetchRemoteSkillsVersion,
  readSkillsVersion,
} from '../lib/skills-version.js';
import type { PharnConfig } from '../types.js';

const REF = `${REPO}@${REPO_BRANCH}`;

/**
 * Read-only audit of an archetype install: is it current (version section) and
 * have any PHARN-owned files drifted from `pharn-dev/pharn-oss@main` (drift
 * section)? Never writes, deletes, or overwrites — fixing is `pharn update` /
 * `pharn add`. The module/manifest flow was removed; a pre-archetype config is
 * rejected up front by loadArchetypeConfigOrExit.
 *
 * Default clones the repo once and reuses it for both sections. `--no-drift`
 * skips the clone and only checks the version (via the lightweight SKILLS_VERSION
 * fetch). `--strict` exits 1 when anything is outdated, modified, or missing.
 */
export async function runStatus(
  opts: { strict?: boolean; drift?: boolean } = {},
): Promise<void> {
  const strict = opts.strict ?? false;
  const drift = opts.drift ?? true;

  intro('pharn status');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);
  await runArchetypeStatus(config, { strict, drift }, cwd);
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

  if (!drift) {
    const s = spinner();
    s.start('Checking for updates');
    let latest: string;
    try {
      latest = await fetchRemoteSkillsVersion();
      s.stop(`Latest skills v${latest}`);
    } catch (err) {
      s.stop('Failed to check for updates');
      reportError(err);
      process.exit(1);
    }
    const outdated = printArchetypeVersion(config, latest);
    printModelRouting(config);
    if (strict && outdated) process.exit(1);
    outro(pc.dim('Read-only — nothing changed (drift check skipped).'));
    return;
  }

  // What degit's single lowercase `https_proxy` read means here — emitted before
  // the spinner so it survives the frame and precedes a proxy-caused failure
  // (see src/commands/init.ts). Inside the drift branch, so
  // `status --no-drift` — which never clones — stays silent.
  const proxyNotice = detectProxyNotice(process.env, process.platform);
  if (proxyNotice) {
    log.warn(proxyNoticeMessage(proxyNotice, resolveDegitProxyRead()));
  }

  const s = spinner();
  s.start(`Comparing against ${REF}`);
  let repo;
  try {
    repo = await fetchRepo();
    s.stop(`Compared against ${REF}`);
  } catch (err) {
    s.stop(`Failed to reach ${REPO}`);
    reportError(err);
    process.exit(1);
  }

  let exitCode = 0;
  try {
    const outdated = printArchetypeVersion(config, readSkillsVersion(repo.dir));
    printModelRouting(config);
    const result = diffInstalledCapabilities({
      repoDir: repo.dir,
      projectRoot: cwd,
      capabilities: config.capabilities ?? [],
      layout: configLayout(config),
    });
    printDriftSection(result);
    if (
      strict &&
      (outdated ||
        result.modified.length ||
        result.missing.length ||
        result.unreadable.length)
    ) {
      exitCode = 1;
    }
  } catch (err) {
    reportError(err);
    exitCode = 1;
  } finally {
    repo.cleanup();
  }

  if (exitCode) process.exit(exitCode);
  outro(pc.dim('Read-only — nothing changed.'));
}

// VERSION note for an archetype install: skillsVersion currency + a summary of
// the detected archetypes and installed capability count. Returns outdated.
function printArchetypeVersion(config: PharnConfig, latest: string): boolean {
  const outdated = config.skillsVersion !== latest;
  const skillsLine = outdated
    ? `${row('Skills version', `v${config.skillsVersion} → v${latest}`)} ${pc.dim('(update available, run `pharn update`)')}`
    : `${row('Skills version', `v${config.skillsVersion}`)} ${pc.dim('(up to date)')}`;
  note(
    [
      skillsLine,
      '',
      row('Archetypes', (config.archetypes ?? []).join(', ') || '(none)'),
      row('Capabilities', String((config.capabilities ?? []).length)),
    ].join('\n'),
    'VERSION',
  );
  return outdated;
}

// MODELS note: the per-stage routing recorded in pharn.config.json, rendered
// from the same config via formatModelRoutingLines (the init summary's "Models
// per stage" block, mirrored here). Omitted when `models` is absent — a
// pre-`models` archetype config (P7 additive/legacy). Read-only: display only.
function printModelRouting(config: PharnConfig): void {
  if (config.models === undefined) return;
  note(formatModelRoutingLines(config.models).join('\n'), 'MODELS');
}

// DRIFT note: differing, missing and unreadable PHARN-owned files, or a clean
// bill. Takes the InstallDiff type rather than an inline structural literal, so
// a partition added to the diff cannot be silently left unrendered here.
function printDriftSection(result: InstallDiff): void {
  if (
    result.modified.length === 0 &&
    result.missing.length === 0 &&
    result.unreadable.length === 0
  ) {
    note(`No drift — ${result.okCount} file(s) match ${REF}.`, 'DRIFT');
    return;
  }

  const lines: string[] = [];
  if (result.modified.length) {
    // "DIFFERS FROM …@main", not "locally modified": this comparison is against
    // upstream HEAD, so a file can differ because UPSTREAM moved, not only
    // because the user edited it. `update` is the command that can tell those
    // apart (it has the per-file install records); this report cannot.
    lines.push(`  DIFFERS FROM ${REF} (PHARN-owned)`);
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
  lines.push('', pc.dim(`  ${result.okCount} file(s) match ${REF}.`));
  note(lines.join('\n'), 'DRIFT');
}

function reportError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  log.error(`⚠ ${message}`);
  if (process.env.PHARN_DEBUG) console.error(err);
}
