import {
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  spinner,
} from '@clack/prompts';
import pc from 'picocolors';
import { cancelAndExit } from '../lib/confirm.js';
import { REPO_URL } from '../lib/constants.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { resolveCapabilities } from '../lib/resolve-capabilities.js';
import { collectExpectedInstallPaths } from '../lib/install-manifest.js';
import { applyWrites, ApplyError, readDiskState } from '../lib/apply-update.js';
import { createBackup, BACKUP_DIR } from '../lib/backup.js';
import { sha256File } from '../lib/hash.js';
import { configLayout, detectLayout } from '../lib/layout.js';
import {
  buildRecords,
  readRecords,
  recordsBaseline,
  RECORDS_FILE,
  writeRecords,
} from '../lib/install-records.js';
import { planUpdate, type UpdatePlan } from '../lib/update-decision.js';
import { fetchRepo } from '../lib/repo.js';
import {
  fetchRemoteSkillsVersion,
  readSkillsVersion,
} from '../lib/skills-version.js';
import { row } from '../lib/format.js';
import {
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type { DiskState } from '../lib/update-decision.js';
import type { InstalledCapability, Layout, PharnConfig } from '../types.js';

// `pharn update` refreshes an archetype install: re-resolve the recorded
// archetypes against the latest capability index and re-copy — but DRIFT-SAFELY.
// It compares every expected file against the per-file hashes recorded at install
// time (lib/install-records.ts) and decides per file (lib/update-decision.ts);
// anything it cannot prove pristine is SKIPPED and reported, never overwritten.
// `--force` overwrites the skip buckets after copying each file to
// `.pharn-backup/<timestamp>/`.
export async function runUpdate(opts: { force?: boolean } = {}): Promise<void> {
  intro('pharn update');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);
  await runArchetypeUpdate(config, cwd, opts.force ?? false);
}

// The outcome of the fetch+apply phase, assembled inside the try so cleanup can
// run in the finally and every process.exit happens AFTER it (Node skips finally
// on exit) — the discipline this command has always kept.
interface UpdateOutcome {
  // The version upstream ships (what the clone holds).
  installedVersion: string;
  // The version actually written to pharn.config.json — the same as
  // installedVersion for a complete run, the previous one when skips withheld it.
  recordedVersion: string;
  capCount: number;
  plan: UpdatePlan;
  backupDir: string | null;
  recordsNote: string | null;
  versionWithheld: boolean;
  abandonedLayout: Layout | null;
}

async function runArchetypeUpdate(
  config: PharnConfig,
  cwd: string,
  force: boolean,
): Promise<void> {
  const s = spinner();
  s.start('Checking for updates');
  let latest: string;
  try {
    latest = await fetchRemoteSkillsVersion();
    s.stop(`Latest skills v${latest}`);
  } catch (err) {
    s.stop('Failed to check for updates');
    log.error(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  // The version gate. `--force` deliberately bypasses it: `--force` means "make
  // my tree match upstream, overwriting my edits", which is a request the user
  // can legitimately make at the current version — and it is what `pharn status`
  // tells them to do about locally-changed files.
  const current = config.skillsVersion === latest;
  if (current && !force) {
    outro(`Already up to date (skills v${config.skillsVersion}).`);
    return;
  }

  note(
    [
      current
        ? row('Skills version', `v${config.skillsVersion} (re-applying)`)
        : row('Skills version', `v${config.skillsVersion} → v${latest}`),
      '',
      row('Archetypes', (config.archetypes ?? []).join(', ') || '(none)'),
      '',
      force
        ? pc.dim(
            `  --force: files you changed will be OVERWRITTEN (each is copied to ${BACKUP_DIR}/ first).`,
          )
        : pc.dim(
            '  Files you have changed are kept, not overwritten — they are listed at the end.',
          ),
      pc.dim(
        '  Re-resolves your archetypes against the latest capabilities and re-copies them.',
      ),
      pc.dim('  https://github.com/pharn-dev/pharn-oss/blob/main/CHANGELOG.md'),
    ].join('\n'),
  );
  const ok = await confirm({
    message: force
      ? 'Re-fetch capabilities and overwrite your changes?'
      : 'Re-fetch capabilities at the latest version?',
    initialValue: true,
  });
  if (isCancel(ok) || ok !== true) cancelAndExit();

  const s2 = spinner();
  s2.start(`Updating from ${REPO_URL}`);
  let repo;
  try {
    repo = await fetchRepo();
  } catch (err) {
    s2.stop('Update failed');
    log.error(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  let outcome: UpdateOutcome | null = null;
  let failure: string | null = null;
  try {
    outcome = await applyUpdate(repo.dir, repo.sha, config, cwd, force);
    s2.stop(
      outcome.plan.writes.length ? 'Capabilities updated' : 'Nothing to write',
    );
  } catch (err) {
    s2.stop('Update failed');
    failure = err instanceof Error ? err.message : String(err);
    if (process.env.PHARN_DEBUG) console.error(err);
  } finally {
    repo.cleanup();
  }

  if (failure || !outcome) {
    log.error(`⚠ ${failure ?? 'Update failed.'}`);
    if (!process.env.PHARN_DEBUG) {
      log.info('Re-run with PHARN_DEBUG=1 for full error output.');
    }
    process.exit(1);
  }

  reportOutcome(outcome, force);
}

// The fetch-side work: resolve, hash, decide, back up, write, persist. Pure of
// process.exit — the caller owns cleanup + exit.
async function applyUpdate(
  repoDir: string,
  sha: string | null,
  config: PharnConfig,
  cwd: string,
  force: boolean,
): Promise<UpdateOutcome> {
  const index = parseCapabilityIndex(repoDir);
  const selection = resolveCapabilities(config.archetypes ?? [], index);
  const capabilities: InstalledCapability[] = selection.selected.map((c) => ({
    name: c.name,
    role: c.role,
  }));
  const installedVersion = readSkillsVersion(repoDir);

  // The layout the copy actually mirrors is the CLONE's (this is what
  // installCapabilities has always done) — so it is also what gets RECORDED, and
  // the two can no longer disagree. A project recorded `flat` meeting a `pharn`
  // clone therefore migrates, and the config stops lying about where its files are.
  const layout = detectLayout(repoDir);
  const previousLayout = configLayout(config);

  const expected = collectExpectedInstallPaths({
    repoDir,
    capabilities,
    layout,
  });

  const latestHashes = new Map<string, string>();
  for (const [rel, source] of expected)
    latestHashes.set(rel, sha256File(source));

  const diskStates = new Map<string, DiskState>();
  for (const rel of expected.keys())
    diskStates.set(rel, readDiskState(cwd, rel));

  const { records, note: recordsNote } = recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  });

  const plan = planUpdate({ latestHashes, diskStates, records, force });

  // Back up EVERY about-to-be-clobbered file before a single original is
  // touched; a failure here aborts with the whole tree still intact.
  const backupDir =
    plan.backups.length > 0 ? createBackup(cwd, plan.backups) : null;

  // A run that could not apply everything must not claim the new version: the
  // recorded version describes the last COMPLETE state, so the next `pharn
  // update` still has work to do instead of early-returning forever.
  const versionWithheld = plan.counts.skipped > 0;
  const nextSkillsVersion = versionWithheld
    ? config.skillsVersion
    : installedVersion;
  const nextCommit = versionWithheld ? config.commit : sha;

  let written: string[];
  try {
    written = applyWrites({ projectRoot: cwd, expected, writes: plan.writes });
  } catch (err) {
    // Files pharn just wrote MUST be recorded even on a partial failure — an
    // unrecorded pharn write reads as the user's edit on the next run and would
    // be skipped forever. The config is not written, so the store is stamped with
    // the config's UNCHANGED values and stays consistent with it.
    //
    // `records !== null` matters: with no usable baseline this would MINT a store
    // from a handful of paths, flipping the rest of the install from the honest
    // `unverifiable` to a false `unrecorded` — the same reason `add` only ever
    // extends an already-readable store. With no baseline the partially-written
    // files stay unrecorded, which is the safe (skip) reading.
    if (
      err instanceof ApplyError &&
      err.written.length > 0 &&
      records !== null
    ) {
      await writeRecords(cwd, {
        skillsVersion: config.skillsVersion,
        commit: config.commit,
        files: { ...records, ...buildRecords(cwd, err.written) },
      });
    }
    throw err;
  }

  // Records first, then the config: if the config write fails, the records still
  // describe the bytes on disk, and the stamp mismatch makes them safely ignored
  // rather than wrongly authoritative.
  //
  // Every hash is re-read from the DEST after the copy — never carried over from
  // the clone source. The two are equal whenever copyFileSync behaved, which is
  // exactly the assumption a record exists to avoid making: hashing what landed
  // is what makes "the record cannot disagree with disk" true by construction
  // rather than by trusting the copy (lib/install-records.ts).
  await writeRecords(cwd, {
    skillsVersion: nextSkillsVersion,
    commit: nextCommit,
    files: { ...plan.nextRecords, ...buildRecords(cwd, written) },
  });
  await writePharnConfig(cwd, {
    ...config,
    skillsVersion: nextSkillsVersion,
    commit: nextCommit,
    capabilities,
    layout,
    installedAt: new Date().toISOString(),
  });

  return {
    installedVersion,
    recordedVersion: nextSkillsVersion,
    capCount: capabilities.length,
    plan,
    backupDir,
    recordsNote,
    versionWithheld,
    abandonedLayout:
      previousLayout !== layout && written.length > 0 ? previousLayout : null,
  };
}

// The report. Skips are exit 0 — a skip is a decision the user asked for, not a
// failure — but they are never silent: each bucket is listed with the one action
// that resolves it.
function reportOutcome(outcome: UpdateOutcome, force: boolean): void {
  const { plan, backupDir, recordsNote, versionWithheld } = outcome;
  const { counts } = plan;

  if (recordsNote) log.warn(`⚠ ${recordsNote}`);

  if (plan.skipped.length > 0) {
    const lines: string[] = [];
    for (const group of plan.skipped) {
      lines.push(`  ${skipHeading(group.label)}`);
      for (const rel of group.rels) lines.push(`  ${rel}`);
      lines.push('');
    }
    lines.push(
      pc.dim(
        `  Re-run with --force to overwrite (skipped files are backed up to ${BACKUP_DIR}/ first).`,
      ),
    );
    note(lines.join('\n'), 'SKIPPED');
  }

  if (backupDir) {
    log.info(
      `Backed up ${plan.backups.length} file(s) to ${backupDir} before overwriting.`,
    );
    log.info(
      `${BACKUP_DIR}/ is not gitignored — add it to .gitignore or delete it once you are happy.`,
    );
  }

  if (outcome.abandonedLayout === 'flat') {
    log.warn(
      'Your install moved to the pharn/ layout. The old top-level copies are left behind and are no longer managed by pharn — delete them by hand.',
    );
  }

  if (versionWithheld) {
    log.warn(
      `${counts.skipped} file(s) were skipped, so your install is still recorded as skills v${outcome.recordedVersion} (upstream is v${outcome.installedVersion}) — resolve them, or re-run with --force, to finish the upgrade.`,
    );
  }

  const summary =
    `updated ${counts.updated} · restored ${counts.restored} · ` +
    `unchanged ${counts.ok}` +
    (force ? ` · forced ${counts.forced}` : '') +
    ` · skipped ${counts.skipped}`;

  outro(
    `${pc.green('✔')} ${summary} ${pc.dim(`(${outcome.capCount} capabilit${outcome.capCount === 1 ? 'y' : 'ies'}, skills v${outcome.recordedVersion})`)}`,
  );
}

function skipHeading(label: string): string {
  switch (label) {
    case 'modified':
      return 'MODIFIED — you changed these since pharn wrote them';
    case 'unrecorded':
      return 'UNRECORDED — pharn has no record of writing these';
    case 'unverifiable':
      return `UNVERIFIABLE — no usable ${RECORDS_FILE} to compare against`;
    default:
      return 'UNREADABLE — not a regular readable file';
  }
}
