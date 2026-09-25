import { confirm, isCancel, log } from '@clack/prompts';
import {
  collectExpectedInstallPaths,
  conflictingWriteTargets,
  PHARN_CONFIG_FILE,
} from '../lib/install-manifest.js';
import { detectLayout } from '../lib/layout.js';
import {
  manifestSources,
  scanDest,
  type DriftLabel,
} from '../lib/dest-drift.js';
import { BACKUP_DIR } from '../lib/backup.js';
import { readBoundedFile } from '../lib/bounded-read.js';
import type { FileRecords } from '../lib/install-records.js';
import { safeJoin, VERSION_RE } from '../lib/validate.js';
import type { Selection } from '../types.js';

// ---------------------------------------------------------------------------
// The pre-install write-target conflict check (init stage). PHARN installs into
// an EXISTING project (CLAUDE.md), so the only real init risk is overwriting
// files that already exist. This computes the exact paths the archetype install
// would write (lib/install-manifest.ts, derived from the fetched clone's layout +
// the resolved selection) that ALREADY exist in the project, and — only when that
// set is non-empty — warns listing them and confirms (default No). A conflict-free
// project gets NO prompt at all (zero friction).
//
// Subsumes the old init.ts confirmOverwriteIfExists (which guarded only
// pharn.config.json): conflictingWriteTargets includes pharn.config.json, so a
// re-install still prompts — now naming every file at risk, in one prompt, with no
// double-warn.
//
// Determinism (P5): the branch is `conflicts.length > 0`, a membership test over a
// deterministic set; the terminal fallback is the confirm's default No (a safe
// cancel), never a guess. Trust (P2): the paths come from the untrusted clone but
// are path-contained (safeJoin, in install-manifest) and only displayed as data —
// never executed. One axis (P3): the write-target conflict init stage.
// ---------------------------------------------------------------------------

// Cap the listed paths so a full re-install (which conflicts on hundreds of files)
// stays readable; the count of the remainder is still surfaced.
export const MAX_LISTED = 10;

// The `skillsVersion` the project's own pharn.config.json records, or null when
// there is not one worth showing. Cosmetic input, cosmetic failure.
//
// DELIBERATELY NOT readPharnConfig (lib/pharn-config.ts). That reader lets
// SeamConfigError / CapabilityEntryError / CapabilitySourceError PROPAGATE so a bad
// hand-edit is never collapsed into the "run init" lie — correct for every
// command that must not act on a config it failed to understand. But `init` IS
// the command you run to REPAIR a broken config, and it has no recovery around
// this stage: an unguarded read here would turn a repairable config into an
// aborting init. So this reads the ONE scalar it displays and treats EVERY
// failure (absent, EISDIR, EACCES, truncated JSON, a JSON scalar at top level,
// a missing or wrong-typed field) as "no version to show" — it can never change
// the prompt's outcome, only whether one extra clause is printed.
//
// Kept file-local and UNEXPORTED on purpose (P3): a total-catch reader is right
// for decorating one prompt and wrong for every other caller, so it must not
// become importable from the module whose whole point is that it throws.
//
// Trust (P2): the value reaches a terminal warning, so it is filtered through
// VERSION_RE — the same allowlist readSkillsVersion holds the upstream
// SKILLS_VERSION to — before interpolation. A hand-edited escape sequence is
// DROPPED, never printed. The read is safeJoin-contained under the project root
// even though PHARN_CONFIG_FILE is a compile-time constant. Zero network: this
// is the local config's number, never upstream's.
function recordedSkillsVersion(cwd: string): string | null {
  // Bounded and non-blocking (lib/bounded-read.ts): a FIFO here must not hang
  // the prompt it only decorates.
  const read = readBoundedFile(safeJoin(cwd, PHARN_CONFIG_FILE));
  if (read.kind !== 'ok') return null;
  try {
    const parsed: unknown = JSON.parse(read.bytes.toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const version = (parsed as { skillsVersion?: unknown }).skillsVersion;
    return typeof version === 'string' && VERSION_RE.test(version)
      ? version
      : null;
  } catch {
    return null;
  }
}

/**
 * What the user decided about overwriting existing write targets.
 *
 * Three states, not a boolean, and the third is the point: this stage must
 * NEVER call process.exit. It runs inside init's `try`, whose
 * `finally { repo.cleanup() }` disposes of the multi-megabyte temp clone — and
 * Node does not run `finally` on process.exit. Exiting from here therefore
 * orphaned the clone on every Ctrl+C, which is reachable on ANY re-install
 * since an existing pharn.config.json alone makes the conflict set non-empty.
 *
 * The caller owns the exit and takes it after the finally, exactly as
 * runArchetypeSummary's 'cancel' already does one prompt earlier. `decline` and
 * `cancel` are kept DISTINCT even though init maps both to `cancelled`:
 * collapsing them back into one boolean is precisely how the exit crept in.
 */
export type WriteTargetsAction = 'proceed' | 'decline' | 'cancel';

// How each backed-up file is marked in the list, and in what order the groups
// come — update's skip order, most actionable first (lib/update-decision.ts).
const MARKERS: Record<DriftLabel, string> = {
  modified: '(edited)',
  unrecorded: '(no pharn record)',
  unverifiable: '(differs from upstream)',
};
const LABEL_ORDER: readonly DriftLabel[] = [
  'modified',
  'unrecorded',
  'unverifiable',
];

// One line per group: WHY these files are backed up. "Your edits" is claimed
// only where pharn can show it — a file that changed since pharn recorded
// writing it; without a usable records store the line says so instead.
function labelLine(label: DriftLabel, n: number): string {
  const one = n === 1;
  switch (label) {
    case 'modified':
      return `${n} of them changed since pharn wrote ${one ? 'it' : 'them'} (your edits).`;
    case 'unrecorded':
      return `${n} of them ${one ? 'differs' : 'differ'} from upstream, and pharn has no record of ${one ? 'it' : 'them'}.`;
    case 'unverifiable':
      return `${n} of them ${one ? 'differs' : 'differ'} from upstream — pharn has no record to tell your edits from upstream changes.`;
  }
}

/**
 * What init already knows when it asks: the install manifest it computed once
 * for this run (commands/init.ts), and the records baseline of the install it
 * replaces (steps/install-archetype.ts → reinstallBaseline). Each is optional:
 * no manifest → computed here; no records → every differing file is
 * `unverifiable`.
 */
export interface WriteTargetsContext {
  manifest?: ReadonlyMap<string, string>;
  records?: FileRecords | null;
}

// 'proceed' when there is nothing to overwrite or the user confirmed;
// 'decline' on a No; 'cancel' on Ctrl+C. Never exits.
export async function confirmWriteTargets(
  repoDir: string,
  cwd: string,
  selection: Selection,
  context: WriteTargetsContext = {},
): Promise<WriteTargetsAction> {
  const layout = detectLayout(repoDir);
  const manifest =
    context.manifest ??
    collectExpectedInstallPaths({
      repoDir,
      capabilities: selection.selected,
      layout,
    });
  const conflicts = conflictingWriteTargets({
    repoDir,
    projectRoot: cwd,
    capabilities: selection.selected,
    layout,
    expected: manifest,
  });
  if (conflicts.length === 0) return 'proceed'; // zero friction — nothing to overwrite

  // Which of those the install will back up — the files `update` would have
  // SKIPPED (lib/dest-drift.ts, through update's own table): changed since
  // pharn wrote them, not recorded, or not verifiable. A file still at the hash
  // pharn recorded is pharn's own bytes, merely outdated: not marked, not
  // backed up. Each is compared with its real source (the mapped LICENSE).
  // They are listed first (a 400-path list capped at 10 used to hide them).
  //
  // ADVISORY: runInstallArchetype re-scans under the lock, immediately before
  // the copy, and that scan is the one that backs files up — this snapshot
  // only labels the list. `pharn.config.json` is outside the manifest (init
  // regenerates it), so it is never scanned.
  const { labels } = scanDest({
    repoDir,
    projectRoot: cwd,
    rels: conflicts.filter((p) => manifest.has(p)),
    sources: manifestSources(repoDir, manifest),
    records: context.records ?? null,
  });
  const rank = (p: string): number => {
    const label = labels.get(p);
    return label === undefined
      ? LABEL_ORDER.length
      : LABEL_ORDER.indexOf(label);
  };
  // A stable sort over the already-sorted conflicts: grouped by label, then by
  // path within a group (P5 — deterministic output).
  const ordered = [...conflicts].sort((a, b) => rank(a) - rank(b));
  const shown = ordered.slice(0, MAX_LISTED);
  const more = ordered.length - shown.length;
  const list = shown
    .map((p) => {
      const label = labels.get(p);
      return label === undefined ? `  • ${p}` : `  • ${p} ${MARKERS[label]}`;
    })
    .join('\n');
  const tail = more > 0 ? `\n  …and ${more} more` : '';
  const counts = LABEL_ORDER.map(
    (label) =>
      [label, [...labels.values()].filter((l) => l === label).length] as const,
  ).filter(([, n]) => n > 0);
  const editsLine =
    labels.size > 0
      ? `\n${counts.map(([label, n]) => labelLine(label, n)).join('\n')}\n${labels.size === 1 ? 'It' : `All ${labels.size}`} will be copied to ${BACKUP_DIR}/ before being overwritten.`
      : '';
  // Only when the config itself is at risk — i.e. a re-install over an existing
  // one — and only AFTER the zero-conflict return above, so a conflict-free
  // project still reaches none of this (P5: the branch stays `conflicts.length
  // > 0`, and a banner must never turn a silent install into a prompting one).
  const version = conflicts.includes(PHARN_CONFIG_FILE)
    ? recordedSkillsVersion(cwd)
    : null;
  const intro =
    version === null
      ? 'PHARN installs into your existing project.'
      : `PHARN installs into your existing project (currently at skills v${version}).`;
  // Direct clack rather than a confirm.ts helper, mirroring
  // steps/archetype-summary.ts: every helper there ends in cancelAndExit, and
  // this stage's whole contract is that it does not exit.
  log.warn(
    `${intro} These paths already exist and may be overwritten:\n${list}${tail}${editsLine}`,
  );
  const result = await confirm({
    message: 'Continue and overwrite?',
    initialValue: false,
  });
  if (isCancel(result)) return 'cancel';
  return result === true ? 'proceed' : 'decline';
}
