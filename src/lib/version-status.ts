import { compareVersionCore } from './semver.js';
import type { InstallSource } from './release.js';

// ---------------------------------------------------------------------------
// Is the install current? Pure: no I/O, no clack, so the text note and the
// `--json` report derive their ahead/outdated answers from ONE function.
//
// AHEAD is not outdated: an install made from `main` can hold a version newer
// than the newest verified release, and `pharn update` refuses to downgrade it
// without `--force` — so `--strict` must not fail on it either, or CI would
// demand a run that does nothing. Only the release channel can be ahead: on
// `main` the tip IS the latest, so any difference is outdated.
// ---------------------------------------------------------------------------

export interface VersionStatus {
  ahead: boolean;
  outdated: boolean;
}

export function versionStatus(input: {
  installed: string;
  latest: string;
  source: InstallSource;
}): VersionStatus {
  const ahead =
    input.source.kind === 'release' &&
    compareVersionCore(input.installed, input.latest) === 1;
  const outdated = !ahead && input.installed !== input.latest;
  return { ahead, outdated };
}
