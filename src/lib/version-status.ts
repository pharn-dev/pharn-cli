import { compareVersionCore } from './semver.js';

// ---------------------------------------------------------------------------
// Is the install current? Pure: no I/O, no clack, so the text note and the
// `--json` report derive their ahead/outdated answers from ONE function.
//
// AHEAD is not outdated: the install holds a version NEWER than the source it
// follows, and `pharn update` refuses that downgrade without `--force` — so
// `--strict` must not fail on it either, or CI would demand a run that does
// nothing. Both channels can be ahead:
// - the release channel, when an install made from `main` was switched to
//   `--ref latest` before the release at its version was cut;
// - the `main` channel, when pharn-oss main moved BACK (a revert of its
//   SKILLS_VERSION) — the tip is then older than what the tip once installed.
// So the answer does not depend on the channel, and the function takes none.
// A version either side cannot order (`compareVersionCore` → null) is never
// ahead: any difference is then outdated, as before.
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
