import { REPO_URL } from './constants.js';
import { compareVersionCore } from './semver.js';
import { readMinCli } from './skills-version.js';

// ---------------------------------------------------------------------------
// THE MIN_CLI GATE — the policy half of the forward-compatibility handshake
// (reader: lib/skills-version.ts). Upstream content can outpace deployed CLIs;
// an OPTIONAL one-line MIN_CLI file lets upstream refuse a stale CLI cleanly,
// with an actionable message, instead of failing somewhere downstream.
//
// FAIL-OPEN in one direction: ONLY a well-formed value whose numeric core is
// strictly GREATER than the installed CLI's refuses. Absent, unreadable,
// malformed or incomparable → no constraint (plus a named warning for a
// present file), so one upstream typo cannot become a fleet-wide exit(1).
//
// Call it from INSIDE each command's try, so the clone's `finally` cleanup
// runs on the refusal too.
// ---------------------------------------------------------------------------

export interface MinCliGateResult {
  // The refusal message, or `null` to proceed.
  refusal: string | null;
  // A named reason a present MIN_CLI could not be applied, or `null`.
  warning: string | null;
}

/**
 * Decide whether the installed CLI satisfies the fetched clone's declared
 * minimum: a three-integer compare with an explicit "cannot compare" outcome.
 */
export function minCliGate(
  repoDir: string,
  cliVersion: string,
): MinCliGateResult {
  const read = readMinCli(repoDir);
  if (read.version === null) {
    return { refusal: null, warning: read.warning };
  }

  const cmp = compareVersionCore(read.version, cliVersion);
  if (cmp === null) {
    // The clone's value passed VERSION_RE, so this is the INSTALLED version
    // being unparseable. Warn rather than refuse: refusing on our own malformed
    // metadata would brick the CLI over a fact the user cannot act on.
    return {
      refusal: null,
      warning: `Could not compare the installed pharn version (${cliVersion}) against the minimum ${REPO_URL} declares (${read.version}); continuing without a minimum-version constraint.`,
    };
  }
  if (cmp <= 0) return { refusal: null, warning: null };

  return {
    refusal: `This pharn is too old for the current ${REPO_URL}: it requires @pharn-dev/pharn v${read.version} or newer, and v${cliVersion} is installed. Upgrade (\`npm install -g @pharn-dev/pharn@latest\`, or run \`npx @pharn-dev/pharn@latest\`), then re-run this command. Nothing was written.`,
    warning: null,
  };
}
