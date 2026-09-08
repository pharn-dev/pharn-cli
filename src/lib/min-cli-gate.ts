import { REPO_URL } from './constants.js';
import { compareVersionCore } from './semver.js';
import { readMinCli } from './skills-version.js';

// ---------------------------------------------------------------------------
// THE MIN_CLI GATE — the forward-compatibility handshake's POLICY half (the
// reader lives in lib/skills-version.ts, the ordering in lib/semver.ts).
//
// Why it exists: a released CLI always fetches `main` HEAD and can never pin
// older content (lib/repo.ts), so upstream has no way to say "this content needs
// a newer CLI" other than by breaking every deployed CLI at once. MIN_CLI is that
// missing lever — an OPTIONAL one-line file that lets upstream refuse a stale CLI
// CLEANLY, with an actionable message, instead of failing somewhere downstream.
//
// FAIL-OPEN BY DESIGN, in exactly one direction: ONLY a well-formed value whose
// numeric core is strictly GREATER than the installed CLI's ever refuses. Absent,
// unreadable, malformed, or incomparable → NO constraint (plus a named warning
// where a present file could not be used). Anything stricter would turn one
// upstream typo into a fleet-wide exit(1) — the very outage this gate removes.
//
// Placement discipline: call it from INSIDE each command's existing try, so the
// clone's `finally` cleanup still runs before any process.exit (the same rule
// add.ts's versionGate follows).
// ---------------------------------------------------------------------------

export interface MinCliGateResult {
  // The refusal message, or `null` to proceed.
  refusal: string | null;
  // A named reason a present MIN_CLI could not be applied, or `null`.
  warning: string | null;
}

/**
 * Decide whether the installed CLI satisfies the fetched clone's declared
 * minimum. Deterministic (P5): a three-integer compare with an explicit "cannot
 * compare" outcome — no classification, no third meaning, no throw.
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
    // The clone's value passed VERSION_RE, so this can only be the INSTALLED
    // version being unparseable (package.json is not validated anywhere). Warn
    // rather than refuse: refusing on our own malformed metadata would brick the
    // CLI over a fact the user cannot act on.
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
