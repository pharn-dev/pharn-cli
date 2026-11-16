import { compareVersionCore } from './semver.js';

// ---------------------------------------------------------------------------
// Is the install current? Pure: no I/O, no clack, so the text note and the
// `--json` report derive their ahead/outdated answers from ONE function.
//
// AHEAD is not outdated: `update` refuses that downgrade without `--force`, so
// `--strict` must not fail on it either. Either channel can be ahead (a
// switched install, or a `main` that moved back), so the function takes no
// channel. An unorderable version is never ahead.
// ---------------------------------------------------------------------------

export interface VersionStatus {
  ahead: boolean;
  outdated: boolean;
}

export function versionStatus(input: {
  installed: string;
  latest: string;
}): VersionStatus {
  const ahead = compareVersionCore(input.installed, input.latest) === 1;
  const outdated = !ahead && input.installed !== input.latest;
  return { ahead, outdated };
}
