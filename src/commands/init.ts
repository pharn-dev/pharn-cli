import { gitignoreLines } from '../lib/gitignore.js';
import { prettierignoreLines } from '../lib/prettierignore.js';
import { intro, log, note, outro, spinner } from '@clack/prompts';
import { showBanner } from '../lib/banner.js';
import { CliError } from '../lib/cli-error.js';
import { errorMessage, logErrorPlain } from '../lib/report-error.js';
import { CLAUDE_SETTINGS_FILE, REPO_URL } from '../lib/constants.js';
import { detectArchetypesFromProject } from '../lib/detect-archetype.js';
import { recordedArchetypes } from '../lib/archetype.js';
import type { ArchetypeOrigin } from '../lib/archetype.js';
import { interactiveAllowed } from '../lib/capability-picker.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import { minCliGate } from '../lib/min-cli-gate.js';
import { PHARN_VERSION } from '../version.js';
import { warnIfOlderCli } from '../lib/older-cli.js';
import { fetchRepo } from '../lib/repo.js';
import { UpstreamManifestError } from '../lib/upstream-manifest.js';
import {
  DEFAULT_INIT_REF,
  ReleaseResolveError,
  resolveSource,
  sourceLabel,
  type RefChoice,
} from '../lib/release.js';
import { ProjectLockedError, withProjectLock } from '../lib/project-lock.js';
import { detectProxyNotice } from '../lib/proxy-env.js';
import { proxyNoticeMessage } from '../lib/proxy-env-format.js';
import {
  freshSettingsHookLines,
  preservedSettingsHookLines,
} from '../lib/hook-wiring.js';
import { serializeJsonReport } from '../lib/json-report.js';
import { terminalSafe } from '../lib/terminal-safe.js';
import { BACKUP_DIR } from '../lib/backup.js';
import {
  buildInitPlan,
  capabilityKey,
  previousChannelLines,
  previousConfigLines,
  resolveInitSelection,
  type InitCarry,
  type InitPlanReport,
} from '../lib/init-plan.js';
import { buildInitReport } from '../lib/init-report.js';
import {
  existingConfigRefusal,
  OverwriteRefusedError,
  refuseExistingTargets,
  removalLines,
  targetLines,
} from '../lib/write-targets.js';
import { CapabilityRemovalError } from '../lib/capability-removal.js';
import { runGitPrereq } from '../steps/prereqs.js';
import { runNodePrereq } from '../steps/node-prereq.js';
import { confirmWriteTargets } from '../steps/overwrite-check.js';
import {
  archetypeSummaryLines,
  runArchetypeSummary,
} from '../steps/archetype-summary.js';
import { runInstallArchetype } from '../steps/install-archetype.js';
import { absentSurfaceLines } from '../lib/absent-surfaces.js';
import type { Archetype } from '../types.js';

export interface InitOptions {
  ref?: RefChoice;
  // `--archetype`: install for these instead of the detected archetypes.
  archetypes?: Archetype[];
  // Install without prompts — ONLY where nothing would be overwritten.
  yes?: boolean;
  // Plan, print, write nothing.
  dryRun?: boolean;
  // The plan as ONE JSON object on stdout, nothing else (implies `dryRun`).
  json?: boolean;
}

export async function runInit(opts: InitOptions = {}): Promise<void> {
  const yes = opts.yes ?? false;
  const json = opts.json ?? false;
  // `--json` is the dry run's machine-readable form, so it implies the dry run
  // (the argv parser applies the same rule).
  const dryRun = (opts.dryRun ?? false) || json;
  // FIRST: the Node floor is environmental and nothing later can repair it; an
  // install on a Node the floor checkers refuse would fail mid-run.
  runNodePrereq('init', { json });

  runGitPrereq({ json });

  // Non-TTY (CI, a pipe) → hard-fail BEFORE `fetchRepo`: the first prompt would
  // render into a dead stream and end as a cancel (exit 0), a silent no-op that had already paid for a clone. The git prerequisite runs
  // first so a directory with no `.git` gets the more useful error.
  //
  // `--dry-run` prompts nothing. `--yes` skips the summary confirm and NEVER
  // answers the destructive overwrite one: it installs only when none of init's
  // write targets exists, and otherwise refuses (a re-install always does).
  if (
    !dryRun &&
    !yes &&
    !interactiveAllowed({
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
    })
  ) {
    throw CliError.error(
      'pharn init is interactive — run it in an interactive terminal. To install without prompts, pass --yes: it installs only into a project where none of its files exists yet, and never overwrites. To see what init would do, pass --dry-run.',
    );
  }

  // `--yes` over an existing `pharn.config.json` is a CERTAIN refusal (that file
  // is always a write target), so it is decided from one local existence test
  // rather than after downloading the tarball. Same exit and ways forward as the
  // in-run refusal, which still guards every other target. A policy refusal: no
  // PHARN_DEBUG hint.
  if (yes && !dryRun) {
    const refusal = existingConfigRefusal(process.cwd());
    if (refusal !== null) throw CliError.refusal(refusal);
  }

  // The banner and intro only now, after every refusal above, so a refused init
  // prints its one error and no logo. Under `--json` stdout holds only the report.
  if (!json) {
    showBanner();
    intro(dryRun ? 'pharn init --dry-run' : 'init wizard');
  }

  // The archetype-driven install, the only init flow: detect the project's
  // archetype(s) and install the applicable capabilities.
  const run = (): Promise<void> =>
    runInitArchetype({
      // A NEW install takes the newest verified release unless `--ref main`;
      // `refExplicit` lets a re-run's summary say when the default moved it
      // off `main`.
      channel: opts.ref ?? DEFAULT_INIT_REF,
      refExplicit: opts.ref !== undefined,
      override: opts.archetypes,
      yes,
      dryRun,
      json,
    });
  if (dryRun) {
    // The preview writes nothing, so it takes no lock.
    await run();
    return;
  }
  // THE SINGLE-WRITER LOCK, taken before the fetch and the config read and
  // held across both prompts to the last write: the run plans once, and a
  // second pharn writer is refused (naming this one) while a prompt is open.
  try {
    await withProjectLock(process.cwd(), 'init', run);
  } catch (err) {
    if (err instanceof ProjectLockedError) throw CliError.refusal(err.message);
    throw err;
  }
}

// A spinner that draws nothing, for `--json`: stdout stays the one report.
function silentSpinner(): Pick<ReturnType<typeof spinner>, 'start' | 'stop'> {
  return { start: () => undefined, stop: () => undefined };
}

interface RunMode {
  channel: RefChoice;
  refExplicit: boolean;
  override: Archetype[] | undefined;
  yes: boolean;
  dryRun: boolean;
  json: boolean;
}

// Detect archetypes, fetch pharn-oss, resolve the capability index, confirm,
// then copy the capabilities + product surfaces. The temp clone lives across
// the prompts and is removed in a finally; a refusal, a failure and a cancel
// are THROWN, so that finally runs on every path.
async function runInitArchetype(mode: RunMode): Promise<void> {
  const { channel, refExplicit, override, yes, dryRun, json } = mode;
  // `--json` swaps the sinks, not the logic.
  const warn = json
    ? (message: string) => logErrorPlain(message)
    : (message: string) => log.warn(message);
  const cwd = process.cwd();
  // `--archetype` REPLACES detection: it is what is resolved, installed and
  // recorded. Detection still runs (local, bounded) so the summary can show it.
  const detection = detectArchetypesFromProject(cwd);
  const archetypes = override ?? detection.archetypes;
  const origin: ArchetypeOrigin = override
    ? {
        kind: 'flag',
        detected: detection.archetypes,
        evidence: detection.evidence,
        truncated: detection.truncated,
      }
    : {
        kind: 'detected',
        evidence: detection.evidence,
        truncated: detection.truncated,
      };
  // The archetypes are printed ONCE, in the summary (archetypeOriginLines).

  // Node's global fetch reads NO proxy variable, so a configured proxy is
  // unused and a blocked network only times out (LIMITS.md §3a). Emitted BEFORE
  // the spinner: a log.warn into an active clack spinner frame is overwritten.
  const proxyNotice = detectProxyNotice(process.env);
  if (proxyNotice) {
    warn(proxyNoticeMessage(proxyNotice));
  }

  const s = json ? silentSpinner() : spinner();
  s.start(`Fetching PHARN from ${REPO_URL}`);
  let repo: Awaited<ReturnType<typeof fetchRepo>>;
  try {
    // WHICH commit first: the newest verified release, or main's tip with
    // `--ref main`. An unresolvable release REFUSES (never the tip), naming
    // `--ref main`.
    repo = await fetchRepo(await resolveSource(channel));
  } catch (err) {
    s.stop('Failed to fetch PHARN');
    throw CliError.failure(err, {
      json,
      message:
        err instanceof ReleaseResolveError ||
        err instanceof UpstreamManifestError
          ? err.message
          : `Could not reach ${REPO_URL}: ${errorMessage(err)}`,
    });
  }

  s.stop(`PHARN fetched from ${sourceLabel(repo.source)}`);

  if (dryRun) {
    await runInitDryRun(repo, cwd, archetypes, origin, {
      channel,
      refExplicit,
      json,
    });
    return;
  }

  try {
    // THE MIN_CLI GATE — refuse a too-old CLI cleanly, before the index parse
    // and any prompt or write; inside the try so the clone is cleaned up first.
    const gate = minCliGate(repo.dir, PHARN_VERSION);
    if (gate.warning) log.warn(gate.warning);
    if (gate.refusal) {
      throw CliError.refusal(gate.refusal);
    } else {
      const index = parseCapabilityIndex(repo.dir);
      // Name every capability the fetch boundary refused, before the summary.
      const unknownWarning = unknownCapabilitiesWarning(index.unknown);
      if (unknownWarning) log.warn(unknownWarning);
      // The archetypes' selection plus what a re-run carries over — the dry
      // run's computation (lib/init-plan.ts).
      const chosen = resolveInitSelection({ cwd, archetypes, index });
      const { previous, carry, selection } = chosen;
      // The config this run replaces, read under the lock: before any prompt.
      warnIfOlderCli(previous.config);
      reportCarry(carry);
      // What the replaced config recorded, for display only, so an earlier
      // `--archetype` never disappears silently.
      const recorded = recordedArchetypes(previous.config?.archetypes);
      // A config that exists but could not be read is named BEFORE any
      // prompt, then a move off `main` when the new default makes one.
      const rerunLines = [
        ...previousConfigLines(previous),
        ...previousChannelLines({
          previous: previous.config,
          channel,
          explicit: refExplicit,
          source: repo.source,
        }),
      ];

      // `--yes` answers the summary's question and nothing else; the summary
      // still prints, so a CI log says what was installed.
      let action: 'install' | 'cancel';
      if (yes) {
        note(
          archetypeSummaryLines(
            archetypes,
            selection,
            origin,
            recorded,
            rerunLines,
          ).join('\n'),
        );
        action = 'install';
      } else {
        action = await runArchetypeSummary(
          archetypes,
          selection,
          origin,
          recorded,
          rerunLines,
        );
      }
      // Both prompts return a VALUE; the one cancel is thrown below, inside
      // the try whose finally disposes of the clone.
      if (action !== 'install') throw CliError.cancel();
      // THE PLAN, built once — after the summary, so a cancelled summary
      // builds no manifest — and consumed by the overwrite prompt and the
      // install alike (lib/init-plan.ts). Its destination pre-flight runs
      // here, so a project the install cannot finish in is refused before the
      // user is asked to overwrite anything.
      const planned = buildInitPlan({
        repoDir: repo.dir,
        cwd,
        sha: repo.sha,
        source: repo.source,
        channel,
        archetypes,
        origin,
        index,
        chosen,
        refExplicit,
      });
      const targets = planned.apply.targets;
      if (yes) {
        // `--yes` never answers the overwrite question: any existing write
        // target refuses (OverwriteRefusedError). It never deletes either: a
        // removal comes only from a replaced pharn.config.json, which refused
        // `--yes` before the fetch, and one that appeared since is itself a
        // conflict here. No prompt follows, so this one check suffices.
        refuseExistingTargets(targets);
      } else {
        const overwrite = await confirmWriteTargets(repo.dir, cwd, selection, {
          targets,
        });
        // The overwrite question was answered no (or cancelled).
        if (overwrite !== 'proceed') throw CliError.cancel();
      }
      // Reuse the SHA the tree was pinned to (null when the branch was
      // floated — LIMITS.md §3b); no separate fetch (TOCTOU).
      await runInstallArchetype(
        repo.dir,
        cwd,
        archetypes,
        selection,
        repo.sha,
        channel === 'latest' ? { ...carry, ref: 'latest' } : carry,
        planned.apply,
      );
    }
  } catch (err) {
    // A `--yes` run that met an existing file, or an unsafe removal, is a
    // policy refusal: named, no PHARN_DEBUG hint. A CliError thrown above
    // passes through; anything else is a failure.
    if (
      err instanceof OverwriteRefusedError ||
      err instanceof CapabilityRemovalError
    )
      throw CliError.refusal(err.message);
    throw CliError.failure(err);
  } finally {
    repo.cleanup();
  }
}

// What a re-run carries over, named before the summary — the real run and the
// preview alike.
function reportCarry(carry: InitCarry): void {
  if (carry.extra.length) {
    log.info(
      `Keeping ${carry.extra.length} capabilit${carry.extra.length === 1 ? 'y' : 'ies'} you added by hand: ${carry.extra.map(capabilityKey).join(', ')}.`,
    );
  }
  if (carry.kept.length) {
    log.info(
      `Keeping ${carry.kept.length} capabilit${carry.kept.length === 1 ? 'y' : 'ies'} as installed — upstream still ships ${carry.kept.length === 1 ? 'it' : 'them'} but this pharn cannot read ${carry.kept.length === 1 ? 'it' : 'them'} (see above): ${carry.kept.map(capabilityKey).join(', ')}. Files and config entries are left as they are; \`pharn update\` re-checks them.`,
    );
  }
  if (carry.gone.length) {
    log.warn(
      `Not keeping ${carry.gone.length} capabilit${carry.gone.length === 1 ? 'y' : 'ies'} you added by hand that upstream no longer ships: ${carry.gone.map(capabilityKey).join(', ')}. ${carry.gone.length === 1 ? 'It is' : 'They are'} dropped from pharn.config.json, and ${carry.gone.length === 1 ? 'its directory is' : 'their directories are'} deleted (files pharn did not write are backed up first).`,
    );
  }
  // The rest of what this install drops — `auto` (and source-less) entries the
  // archetypes no longer select — named, since their directories are deleted.
  const goneKeys = new Set(carry.gone.map(capabilityKey));
  const unselected = carry.dropped.filter(
    (d) => !goneKeys.has(capabilityKey(d.cap)),
  );
  if (unselected.length) {
    log.warn(
      `Not keeping ${unselected.length} capabilit${unselected.length === 1 ? 'y' : 'ies'} your archetypes no longer select${unselected.some((d) => d.reason === 'dropped-gone') ? ' (or upstream no longer ships)' : ''}: ${unselected.map((d) => capabilityKey(d.cap)).join(', ')}. ${unselected.length === 1 ? 'It is' : 'They are'} dropped from pharn.config.json, and ${unselected.length === 1 ? 'its directory is' : 'their directories are'} deleted (files pharn did not write are backed up first).`,
    );
  }
}

// `--dry-run`: the real run's steps up to its first prompt, then the rest of
// the plan (lib/init-plan.ts), printed, exit 0. It writes NOTHING: no prompt,
// lock, backup, copy, records or config function is reachable from here; only
// the clone's temp dir is created and removed. `--json` swaps the sinks, not
// the logic, and ends in a normal return so a large piped object is flushed.
async function runInitDryRun(
  repo: Awaited<ReturnType<typeof fetchRepo>>,
  cwd: string,
  archetypes: Archetype[],
  origin: ArchetypeOrigin,
  mode: { channel: RefChoice; refExplicit: boolean; json: boolean },
): Promise<void> {
  const { channel, refExplicit, json } = mode;
  const warn = json
    ? (message: string) => logErrorPlain(message)
    : (message: string) => log.warn(message);
  let plan: InitPlanReport;
  let carry: InitCarry;
  try {
    const gate = minCliGate(repo.dir, PHARN_VERSION);
    if (gate.warning) warn(gate.warning);
    if (gate.refusal) throw CliError.refusal(gate.refusal, { json });
    const index = parseCapabilityIndex(repo.dir);
    const unknownWarning = unknownCapabilitiesWarning(index.unknown);
    if (unknownWarning) warn(unknownWarning);
    const chosen = resolveInitSelection({ cwd, archetypes, index });
    warnIfOlderCli(chosen.previous.config, { json });
    carry = chosen.carry;
    plan = buildInitPlan({
      repoDir: repo.dir,
      cwd,
      sha: repo.sha,
      source: repo.source,
      channel,
      archetypes,
      origin,
      index,
      chosen,
      refExplicit,
    }).report;
  } catch (err) {
    // A directory the real run would refuse to delete: the same named refusal.
    if (err instanceof CapabilityRemovalError)
      throw CliError.refusal(err.message, { json });
    throw CliError.failure(err, { json });
  } finally {
    repo.cleanup();
  }

  if (json) {
    console.log(serializeJsonReport(buildInitReport(plan)));
    return;
  }
  reportCarry(carry);
  reportInitDryRun(plan);
}

// The preview: the summary, a PLAN note (overwrites marked as the prompt marks
// them, creates as a count, deletes, backups, the config), then the notes a
// real run would print.
function reportInitDryRun(r: InitPlanReport): void {
  note(
    archetypeSummaryLines(
      r.archetypes,
      r.selection,
      r.archetypeOrigin,
      r.previousArchetypes,
      [...r.previousConfigLines, ...r.channelLines],
    ).join('\n'),
  );

  const labels = new Map(
    r.targets.flatMap((t) =>
      t.label === null || t.label === 'rewritten'
        ? []
        : [[t.rel, t.label] as const],
    ),
  );
  const lines: string[] = [];
  if (r.counts.overwrite > 0) {
    lines.push(`  WOULD OVERWRITE ${r.counts.overwrite} existing file(s)`);
    lines.push(
      ...targetLines({
        conflicts: r.conflicts,
        labels,
        configBackedUp: r.configBackedUp,
      }),
    );
  } else {
    lines.push('  Nothing in your project would be overwritten.');
  }
  lines.push('', `  WOULD CREATE ${r.counts.create} file(s)`);
  const deletes = removalLines(r.removals);
  if (deletes.length > 0) {
    lines.push(
      '',
      `  WOULD DELETE ${deletes.length} capability director${deletes.length === 1 ? 'y' : 'ies'} dropped from your config`,
      ...deletes,
    );
  }
  if (r.counts.backup > 0) {
    lines.push(
      '',
      `  WOULD BACK UP ${r.counts.backup} file(s) to ${BACKUP_DIR}/<timestamp>/ first — the marked ones above${deletes.length > 0 ? ' and the deleted directories’ files pharn did not write' : ''}`,
    );
  }
  lines.push(
    '',
    `  Would write pharn.config.json (skills v${r.skillsVersion}, ${r.layout} layout, archetypes: ${r.archetypes.join(', ')})`,
  );
  // The prompt's own line for the replaced config (steps/overwrite-check.ts).
  if (r.configBackedUp) {
    lines.push(
      `  The existing pharn.config.json would be rewritten (models reset to its default); it would be copied to ${BACKUP_DIR}/ first.`,
    );
  }
  if (r.carriedConfigKeys.length > 0) {
    lines.push(
      `  Would keep your own pharn.config.json keys: ${r.carriedConfigKeys.map((k) => terminalSafe(k, { max: 200 })).join(', ')}`,
    );
  }
  if (r.settingsPreserved) {
    lines.push(
      `  Would preserve the existing ${CLAUDE_SETTINGS_FILE} — pharn never overwrites it.`,
    );
  } else if (r.freshSettings !== null) {
    lines.push(
      `  Would write ${CLAUDE_SETTINGS_FILE} from upstream; see HOOKS.`,
    );
  }
  // What the install would append to `.gitignore`; a refusal is a warning,
  // printed after the note.
  const gitignore = gitignoreLines(r.gitignore, { preview: true });
  if (gitignore !== null && !gitignore.warn) lines.push(`  ${gitignore.text}`);
  // The same for `.prettierignore`.
  const prettierignore = prettierignoreLines(r.prettierignore, {
    preview: true,
  });
  if (prettierignore !== null && !prettierignore.warn)
    lines.push(`  ${prettierignore.text}`);
  lines.push(
    '',
    // A deletion needs a replaced pharn.config.json, itself an overwrite, so
    // the overwrite count alone decides.
    r.counts.overwrite === 0
      ? '  `pharn init --yes` would install (nothing would be overwritten).'
      : `  \`pharn init --yes\` would refuse: ${r.counts.overwrite} existing file(s) would be overwritten.`,
  );
  note(lines.join('\n'), 'PLAN');
  if (gitignore?.warn) log.warn(gitignore.text);
  if (prettierignore?.warn) log.warn(prettierignore.text);

  // The note a real run prints over a preserved or freshly written
  // settings.json, from the same functions.
  const hookLines =
    r.hookWiring !== null
      ? preservedSettingsHookLines(r.hookWiring)
      : r.freshSettings !== null
        ? freshSettingsHookLines(r.freshSettings)
        : null;
  if (hookLines) note(hookLines.join('\n'), 'HOOKS');

  // The not-shipped warning a real run prints after the copy, as a preview.
  const absentLines = absentSurfaceLines(r.absentUpstream, { preview: true });
  if (absentLines) log.warn(absentLines.join('\n'));

  if (r.models.outcome === 'rejected') {
    log.warn(
      [
        "pharn-oss's models block would not be written; this pharn rejects it:",
        ...r.models.reasons.map(
          (reason) => `  ${terminalSafe(reason, { max: 300 })}`,
        ),
      ].join('\n'),
    );
  }

  outro(
    `Dry run — would create ${r.counts.create} · overwrite ${r.counts.overwrite}${deletes.length > 0 ? ` · delete ${deletes.length} director${deletes.length === 1 ? 'y' : 'ies'}` : ''} · back up ${r.counts.backup}. Nothing was changed. Run \`pharn init\` to apply.`,
  );
}
