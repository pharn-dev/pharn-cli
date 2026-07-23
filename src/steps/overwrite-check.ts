import { confirmWarning } from '../lib/confirm.js';
import { conflictingWriteTargets } from '../lib/install-manifest.js';
import { detectLayout } from '../lib/layout.js';
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

// Returns true to proceed with the install (no conflicts, or the user confirmed
// overwrite), false when the user declined. Ctrl+C cancels the whole run
// (confirmWarning → cancelAndExit).
export async function confirmWriteTargets(
  repoDir: string,
  cwd: string,
  selection: Selection,
): Promise<boolean> {
  const conflicts = conflictingWriteTargets({
    repoDir,
    projectRoot: cwd,
    capabilities: selection.selected,
    layout: detectLayout(repoDir),
  });
  if (conflicts.length === 0) return true; // zero friction — nothing to overwrite

  const shown = conflicts.slice(0, MAX_LISTED);
  const more = conflicts.length - shown.length;
  const list = shown.map((p) => `  • ${p}`).join('\n');
  const tail = more > 0 ? `\n  …and ${more} more` : '';
  return confirmWarning(
    `PHARN installs into your existing project. These paths already exist and may be overwritten:\n${list}${tail}`,
    'Continue and overwrite?',
    false,
  );
}
