import { resolve } from 'node:path';
import { intro, log, note, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { REPO, REPO_BRANCH } from '../lib/constants.js';
import {
  fetchRemoteManifest,
  readManifest,
  resolveModules,
} from '../lib/manifest.js';
import { fetchRepo } from '../lib/repo.js';
import { diffInstalled, diffInstalledCapabilities } from '../lib/diff.js';
import { row } from '../lib/format.js';
import { isArchetypeConfig, loadConfigOrExit } from '../lib/pharn-config.js';
import {
  fetchRemoteSkillsVersion,
  readSkillsVersion,
} from '../lib/skills-version.js';
import type { Manifest, PharnConfig } from '../types.js';

const REF = `${REPO}@${REPO_BRANCH}`;

/**
 * Read-only audit: is the install current (version section) and have any
 * PHARN-owned files drifted from `pharn-dev/pharn-oss@main` (drift section)?
 * Never writes, deletes, or overwrites — fixing is `pharn update` / `pharn add`.
 *
 * Default clones the repo once and reuses it for both sections. `--no-drift`
 * skips the clone and only checks the version (via the lightweight manifest
 * fetch). `--strict` exits 1 when anything is outdated, modified, or missing.
 */
export async function runStatus(
  opts: { strict?: boolean; drift?: boolean } = {},
): Promise<void> {
  const strict = opts.strict ?? false;
  const drift = opts.drift ?? true;

  intro('pharn status');

  const cwd = process.cwd();
  const config = loadConfigOrExit(cwd);
  const claudeDir = resolve(cwd, '.claude');

  // Archetype (capability) install: version via SKILLS_VERSION (there is no
  // manifest) + capability drift. Separate path so the legacy audit is unchanged.
  if (isArchetypeConfig(config)) {
    await runArchetypeStatus(config, { strict, drift }, cwd);
    return;
  }

  // Version-only: no clone, just the manifest fetch list/update already use.
  if (!drift) {
    const s = spinner();
    s.start('Checking for updates');
    let manifest;
    try {
      manifest = await fetchRemoteManifest();
      s.stop(`Latest skills v${manifest.skillsVersion}`);
    } catch (err) {
      s.stop('Failed to check for updates');
      reportError(err);
      process.exit(1);
    }
    const { outdated } = printVersionSection(config, manifest);
    if (strict && outdated) process.exit(1);
    outro(pc.dim('Read-only — nothing changed (drift check skipped).'));
    return;
  }

  // Default: clone once; the HEAD manifest is both the "latest" for the version
  // section and the source for the byte-level drift comparison (no double fetch).
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

  // cleanup() must run before any process.exit (Node skips finally on exit), so
  // record the desired code and exit only after the finally has cleaned up.
  let exitCode = 0;
  try {
    const manifest = readManifest(repo.dir);
    const { outdated } = printVersionSection(config, manifest);

    const resolved = resolveModules(
      manifest,
      config.modules.map((m) => m.name),
    );
    const result = diffInstalled({
      repoDir: repo.dir,
      claudeDir,
      moduleNames: resolved.map((m) => m.name),
      skills: config.installedSkills ?? [],
    });
    printDriftSection(result);

    if (
      strict &&
      (outdated || result.modified.length || result.missing.length)
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

// Archetype install audit: version via SKILLS_VERSION + capability drift. Mirrors
// the module path's structure (cleanup before exit; --strict gate) but reads the
// version from SKILLS_VERSION and diffs the copied capabilities/product surfaces.
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
    if (strict && outdated) process.exit(1);
    outro(pc.dim('Read-only — nothing changed (drift check skipped).'));
    return;
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
    const result = diffInstalledCapabilities({
      repoDir: repo.dir,
      projectRoot: cwd,
      capabilities: config.capabilities ?? [],
    });
    printDriftSection(result);
    if (
      strict &&
      (outdated || result.modified.length || result.missing.length)
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

// VERSION note: skillsVersion + any per-module version bumps. Returns whether
// the install is behind upstream (drives the --strict gate). Mirrors the diff
// computation in `pharn update`.
function printVersionSection(
  config: PharnConfig,
  manifest: Manifest,
): { outdated: boolean } {
  const latest = new Map(manifest.modules.map((m) => [m.name, m.version]));
  const changes = config.modules
    .filter((m) => latest.has(m.name) && latest.get(m.name) !== m.version)
    .map((m) => ({ name: m.name, from: m.version, to: latest.get(m.name)! }));
  const outdated =
    config.skillsVersion !== manifest.skillsVersion || changes.length > 0;

  const skillsLine =
    config.skillsVersion === manifest.skillsVersion
      ? `${row('Skills version', `v${config.skillsVersion}`)} ${pc.dim('(up to date)')}`
      : `${row('Skills version', `v${config.skillsVersion} → v${manifest.skillsVersion}`)} ${pc.dim('(update available, run `pharn update`)')}`;

  const lines = [skillsLine];
  if (changes.length) {
    lines.push('', '  MODULE UPDATES');
    for (const c of changes) lines.push(row(c.name, `v${c.from} → v${c.to}`));
  }
  note(lines.join('\n'), 'VERSION');
  return { outdated };
}

// DRIFT note: locally-modified and missing PHARN-owned files, or a clean bill.
function printDriftSection(result: {
  modified: string[];
  missing: string[];
  okCount: number;
}): void {
  if (result.modified.length === 0 && result.missing.length === 0) {
    note(`No drift — ${result.okCount} file(s) match ${REF}.`, 'DRIFT');
    return;
  }

  const lines: string[] = [];
  if (result.modified.length) {
    lines.push('  LOCALLY MODIFIED (PHARN-owned)');
    for (const p of result.modified) lines.push(`  ${p}`);
    lines.push(pc.dim('  `pharn update` will overwrite these.'));
  }
  if (result.missing.length) {
    if (lines.length) lines.push('');
    lines.push('  MISSING (expected but absent)');
    for (const p of result.missing) lines.push(`  ${p}`);
    lines.push(
      pc.dim('  Re-run `pharn update` (or `pharn add`) to restore them.'),
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
