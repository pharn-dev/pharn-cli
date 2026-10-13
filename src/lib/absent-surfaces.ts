import type { AbsentSurface } from './install-manifest.js';
import { terminalSafe } from './terminal-safe.js';

// ---------------------------------------------------------------------------
// The words for a declared product surface the fetched pharn-oss does not ship
// (lib/install-manifest.ts → absentInstallSurfaces). One wording, shared by
// `init` (a warning after the copy, and in its `--dry-run` preview) and `update`
// (a NOT SHIPPED note), so the
// two commands describe the same condition the same way. `status` renders its
// own DRIFT section, as it does for every other partition.
//
// Not fatal anywhere: refusing every install the moment upstream reorganizes
// would turn a relocation into an outage, and upstream's `MIN_CLI` is the
// lever for refusing a CLI that is too old (LIMITS.md §3e). The report is what
// ends the silence.
//
// One axis (P3): the absent-surface report's wording.
// ---------------------------------------------------------------------------

const MAX_PATH = 200;

/**
 * The report lines, or null when nothing is absent. `preview` words it for a
 * run that writes nothing (`init --dry-run`).
 */
export function absentSurfaceLines(
  absent: readonly AbsentSurface[],
  opts: { preview?: boolean } = {},
): string[] | null {
  if (absent.length === 0) return null;
  return [
    `pharn-oss ships nothing at these paths, so pharn ${opts.preview === true ? 'would not install' : 'did not install'} them:`,
    ...absent.map(
      ({ surface, path }) =>
        `  ${terminalSafe(path, { max: MAX_PATH })} (${surface})`,
    ),
    'Installed commands, hooks and checkers that use them will not find them.',
    'If pharn-oss moved them, a newer pharn may know where:',
    '  npm i -g @pharn-dev/pharn@latest',
  ];
}
