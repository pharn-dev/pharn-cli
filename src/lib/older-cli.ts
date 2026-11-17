import { log } from '@clack/prompts';
import { CONFIG_FILENAME } from './pharn-config.js';
import { logErrorPlain } from './report-error.js';
import { terminalSafe } from './terminal-safe.js';
import { VERSION_RE } from './validate.js';
import { PHARN_VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// The older-CLI warning (the support policy's mixed-version rule,
// docs/contributing.md "Mixed CLI versions in one team"). pharn.config.json
// records `pharnVersion`, the CLI that last wrote it. A teammate on an older
// `pharn` can rewrite the install with older upstream rules and undo what the
// newer one did, so a CLI whose major.minor is BELOW the recorded one WARNS.
// It never refuses: the policy's call, since a refusal would strand a teammate
// who cannot upgrade right now, and the newer CLI repairs on its next run.
//
// FAIL-QUIET: `pharnVersion` is hand-editable, so an absent, non-string or
// non-VERSION_RE value means "no warning", never an error. Only major.minor
// count: a patch or prerelease difference changes no install rule.
//
// The writers (`init` over an existing config, `add`, `remove`, `update`,
// `uninstall`) call `warnIfOlderCli` right after reading the config under the
// lock, before their first prompt or write; `status` and the dry runs call it
// at the same point. Always stderr, so a `--json` stdout stays one object.
// ---------------------------------------------------------------------------

// The longest version string printed; VERSION_RE admits any prerelease length.
const VERSION_DISPLAY_MAX = 64;

/** `[major, minor]` of a VERSION_RE-valid string, else `null`. */
function majorMinor(version: unknown): [number, number] | null {
  if (typeof version !== 'string' || !VERSION_RE.test(version)) return null;
  const [major, minor] = version.split('.');
  return [Number(major), Number(minor)];
}

/**
 * The warning when `running` (this CLI) is older than `recorded` (the config's
 * `pharnVersion`) at major.minor, else `null`. Pure. `recorded` is untrusted:
 * anything that is not a VERSION_RE string yields `null`, and so does an
 * unparseable `running`.
 */
export function olderCliWarning(
  recorded: unknown,
  running: string,
): string | null {
  const theirs = majorMinor(recorded);
  const ours = majorMinor(running);
  if (theirs === null || ours === null) return null;
  const older =
    ours[0] < theirs[0] || (ours[0] === theirs[0] && ours[1] < theirs[1]);
  if (!older) return null;
  // VERSION_RE already admits no unsafe character; escaped where printed anyway.
  const shown = terminalSafe(recorded as string, { max: VERSION_DISPLAY_MAX });
  return `${CONFIG_FILENAME} was written by pharn ${shown}; this is pharn ${terminalSafe(running, { max: VERSION_DISPLAY_MAX })}. Upgrade pharn (\`npm install -g @pharn-dev/pharn@latest\`, or run \`npx @pharn-dev/pharn@latest\`) so teammates on different versions don't undo each other's changes. Continuing.`;
}

/**
 * Print `olderCliWarning` for `config` against this CLI, once, on stderr: a
 * clack warning, or a plain line under `--json`. Prints nothing otherwise.
 */
export function warnIfOlderCli(
  config: { pharnVersion?: unknown } | null,
  opts: { json?: boolean } = {},
): void {
  const warning = olderCliWarning(config?.pharnVersion, PHARN_VERSION);
  if (warning === null) return;
  if (opts.json) logErrorPlain(warning);
  else log.warn(warning, { output: process.stderr });
}
