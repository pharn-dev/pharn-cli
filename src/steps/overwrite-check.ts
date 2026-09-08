import { readFileSync } from 'node:fs';
import { confirm, isCancel, log } from '@clack/prompts';
import {
  conflictingWriteTargets,
  PHARN_CONFIG_FILE,
} from '../lib/install-manifest.js';
import { detectLayout } from '../lib/layout.js';
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
// ModelRoutingError / SeamConfigError / CapabilitySourceError PROPAGATE so a bad
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
  try {
    const raw = readFileSync(safeJoin(cwd, PHARN_CONFIG_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
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

// 'proceed' when there is nothing to overwrite or the user confirmed;
// 'decline' on a No; 'cancel' on Ctrl+C. Never exits.
export async function confirmWriteTargets(
  repoDir: string,
  cwd: string,
  selection: Selection,
): Promise<WriteTargetsAction> {
  const conflicts = conflictingWriteTargets({
    repoDir,
    projectRoot: cwd,
    capabilities: selection.selected,
    layout: detectLayout(repoDir),
  });
  if (conflicts.length === 0) return 'proceed'; // zero friction — nothing to overwrite

  const shown = conflicts.slice(0, MAX_LISTED);
  const more = conflicts.length - shown.length;
  const list = shown.map((p) => `  • ${p}`).join('\n');
  const tail = more > 0 ? `\n  …and ${more} more` : '';
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
    `${intro} These paths already exist and may be overwritten:\n${list}${tail}`,
  );
  const result = await confirm({
    message: 'Continue and overwrite?',
    initialValue: false,
  });
  if (isCancel(result)) return 'cancel';
  return result === true ? 'proceed' : 'decline';
}
