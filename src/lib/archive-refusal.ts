import { REPO_BRANCH, REPO_URL } from './constants.js';
import type { InstallSource } from './release.js';
import { TarExtractError } from './tar-extract.js';
import { escapeUnsafe } from './terminal-safe.js';
import { COMMIT_RE, ManifestValidationError } from './validate.js';

// ---------------------------------------------------------------------------
// The archive-refusal message. `fetchRepo` (lib/repo.ts) refuses a fetched
// pharn-oss archive in two places: the extractor (TarExtractError) and the
// tree checks after it (ManifestValidationError: the install manifest, its
// sha256s, a release's SKILLS_VERSION). Their own text names one entry and one
// rule and nothing else, so a user cannot tell that the published archive is
// at fault, that no flag gets past it, or what to try.
//
// fetchRepo throws the refusal UNCHANGED (its class is the contract callers and
// tests rely on) and notes here which ref it fetched. The command boundary
// asks `archiveRefusalMessage(err)` for the user-facing text: the ref fetched,
// the blame on the archive, the original reason, and only next steps this CLI
// supports (`--ref` takes `latest` or `main`). Every other error (network,
// release resolution) gets no note and keeps its own message. The raw error
// stays the CliError's cause, which `PHARN_DEBUG=1` prints.
//
// "Nothing in your project was changed" holds because every command fetches
// before its first project write (the lock aside, which its `finally` removes).
// ---------------------------------------------------------------------------

// The refusals fetchRepo noted, keyed by the thrown object itself: nothing is
// added to the error, and an entry goes with it.
const refused = new WeakMap<object, string>();

// The same address as upstream-manifest.ts's PHARN_OSS_ISSUES_URL, built from
// the shared constant so this module stays free of the manifest parser.
const ISSUES_URL = `https://${REPO_URL}/issues`;

const UPGRADE_STEP =
  '- upgrade pharn (`npm install -g @pharn-dev/pharn@latest`): a newer pharn may accept this archive';

/** Which ref was fetched, as the first words of the message. */
function fetchedRef(source: InstallSource, sha: string | null): string {
  if (source.kind === 'release') {
    return `pharn-oss release ${source.tag} (commit ${source.sha})`;
  }
  return sha === null
    ? `pharn-oss ${REPO_BRANCH} (refs/heads/${REPO_BRANCH}, commit not resolved)`
    : `pharn-oss ${REPO_BRANCH} at commit ${sha}`;
}

/** The next steps for the channel that was fetched: only what the CLI has. */
function nextSteps(source: InstallSource): string[] {
  if (source.kind === 'release') {
    return [
      '- install the tip of main instead: `pharn init --ref main` (`pharn update --ref main` for an existing install)',
      UPGRADE_STEP,
      `- or re-run once pharn-oss publishes a fixed release, and report this at ${ISSUES_URL}`,
    ];
  }
  return [
    '- go back to verified releases: `pharn init --ref latest` (`pharn update --ref latest` for an existing install)',
    UPGRADE_STEP,
    `- or re-run later, once main is fixed, and report this at ${ISSUES_URL}`,
  ];
}

/**
 * The text for a refused archive. `reason` is the original refusal's message;
 * any unsafe character left in it is escaped here (it can carry archive bytes).
 */
export function refusalText(
  source: InstallSource,
  sha: string | null,
  reason: string,
): string {
  return [
    `${fetchedRef(source, sha)} was refused: its published archive failed pharn's checks. ` +
      'The problem is in that pharn-oss archive, not in your project; nothing in your project was changed.',
    `Reason: ${escapeUnsafe(reason)}`,
    'No option skips this check: forcing an update or answering yes does not help. Next steps:',
    ...nextSteps(source),
  ].join('\n');
}

/**
 * Called by fetchRepo on its way out of a failed fetch: notes `err` with the
 * ref when it is an archive refusal (TarExtractError or
 * ManifestValidationError, exactly); anything else is left alone. A `main`
 * SHA that is not a full commit id is GitHub's answer refused before any
 * download (a ManifestValidationError too), not an archive: never noted, so
 * the untrusted token never reaches the message.
 */
export function noteArchiveRefusal(
  err: unknown,
  source: InstallSource,
  sha: string | null,
): void {
  if (sha !== null && !COMMIT_RE.test(sha)) return;
  if (
    err instanceof TarExtractError ||
    err instanceof ManifestValidationError
  ) {
    refused.set(err, refusalText(source, sha, err.message));
  }
}

/** The spinner's stop line for a refused archive, so it does not say "failed to reach". */
export const ARCHIVE_REFUSED_SPINNER = 'pharn-oss archive refused';

/** The user-facing text for `err` if fetchRepo noted it as refused, else undefined. */
export function archiveRefusalMessage(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null ? refused.get(err) : undefined;
}
