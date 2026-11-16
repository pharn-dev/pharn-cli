import type { AbsentSurface } from './install-manifest.js';
import { terminalSafe } from './terminal-safe.js';

// ---------------------------------------------------------------------------
// The wording for a declared product surface the fetched pharn-oss does not
// ship (absentInstallSurfaces), shared by `init` and `update`. Never fatal: an
// upstream reorganization must not become an outage, and `MIN_CLI` is the lever
// for refusing a too-old CLI.
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
