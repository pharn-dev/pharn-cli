import { withDeadline } from './deadline.js';
import { REPO, REPO_BRANCH } from './constants.js';
import { terminalSafe } from './terminal-safe.js';
import { COMMIT_RE, RELEASE_TAG_RE } from './validate.js';

// ---------------------------------------------------------------------------
// WHICH pharn-oss commit an install takes — the verified-release resolver.
//
// The DEFAULT channel is `main`: every command installs the TIP of pharn-oss
// `main` — whatever merged last, whether or not its post-merge CI has finished
// (LIMITS.md §1d). pharn-oss publishes no releases today, and a channel that
// requires one would refuse every install. `--ref latest` opts a project into
// the newest pharn-oss GitHub RELEASE instead — a tag (`v<SKILLS_VERSION>`)
// pharn-oss is to create only after every required check on that commit has
// passed — and records that choice in the config.
//
// FAIL-CLOSED. When the release cannot be resolved — no release published, the
// API unreachable or rate-limited, a malformed answer — the command refuses and
// names `--ref main`. It never floats to the tip on its own: a project that
// opted into verified releases must not be handed unverified content silently.
// (The `main` channel keeps its own documented degraded mode, LIMITS.md §3b.)
//
// The release is resolved with TWO small GETs against api.github.com — the
// latest release's tag, then that tag's commit — and the tarball is then
// downloaded at that exact commit (lib/repo.ts), whose SKILLS_VERSION must equal
// the tag (`fetchRepo` refuses otherwise). Trust stays provenance, not
// cryptography (LIMITS.md §1b): what this adds is that the provenance points at
// a commit pharn-oss's CI verified, rather than at whatever merged last.
//
// Untrusted input (P2): `tag_name` must match RELEASE_TAG_RE and the commit id
// COMMIT_RE before either becomes a URL segment, a displayed string or a
// recorded value. Network floor as everywhere else: `redirect: 'error'`, an 8 s
// hard deadline per request, and a byte cap on every body.
// ---------------------------------------------------------------------------

const API = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 8000;
// A release object carries its notes (GitHub caps a release body at 125,000
// characters), so 1 MiB bounds the read with room to spare.
const MAX_RELEASE_BYTES = 1024 * 1024;
// `application/vnd.github.sha` answers with the bare 40-character id.
const MAX_SHA_BYTES = 1024;

/** The channel a command installs from: `main`'s tip, or a verified release. */
export type RefChoice = 'main' | 'latest';

/** Every value `--ref` accepts, in the order the usage text names them. */
export const REF_CHOICES: readonly RefChoice[] = ['main', 'latest'];

/** What a command resolved before it fetched. */
export type InstallSource =
  // The newest pharn-oss release: its tag, the version the tag names, and the
  // commit the tag points at — the tarball is downloaded at exactly that commit.
  | { kind: 'release'; tag: string; version: string; sha: string }
  // The tip of `main`, resolved (or floated) by `fetchRepo` itself.
  | { kind: 'main' };

/**
 * The latest verified release could not be resolved. Named so callers can
 * report it as the refusal it is: the message already says what to do.
 */
export class ReleaseResolveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ReleaseResolveError';
  }
}

/** The channel a project's config records: `ref: "latest"`, or the default. */
export function channelOf(config: { ref?: unknown }): RefChoice {
  return config.ref === 'latest' ? 'latest' : 'main';
}

/** `pharn-dev/pharn-oss@v6.54.1` or `pharn-dev/pharn-oss@main`. */
export function sourceLabel(source: InstallSource): string {
  return `${REPO}@${source.kind === 'release' ? source.tag : REPO_BRANCH}`;
}

/** One phrase for a note row: what this source is, verification included. */
export function sourceDescription(source: InstallSource): string {
  return source.kind === 'release'
    ? `verified release ${source.tag}`
    : `${REPO_BRANCH} (tip)`;
}

/**
 * Resolve what to install. `main` needs no request here (`fetchRepo` resolves
 * the tip); `latest` resolves the newest verified release or THROWS a
 * `ReleaseResolveError` — never a fallback.
 */
export async function resolveSource(ref: RefChoice): Promise<InstallSource> {
  if (ref === 'main') return { kind: 'main' };
  return resolveLatestRelease();
}

async function resolveLatestRelease(): Promise<InstallSource> {
  const releaseUrl = `${API}/repos/${REPO}/releases/latest`;
  const release = await get(
    releaseUrl,
    'application/vnd.github+json',
    MAX_RELEASE_BYTES,
  );
  if (release.status === 404) {
    throw refusal(
      `${REPO} has published no release yet (HTTP 404 from ${releaseUrl})`,
    );
  }
  const body = parseRelease(release, releaseUrl);
  if (body.draft === true || body.prerelease === true) {
    // `releases/latest` never returns either today; this is the backstop that
    // keeps "latest" meaning a published, final release if that ever changes.
    throw refusal(
      `the release ${releaseUrl} returned is marked ${body.draft === true ? 'draft' : 'prerelease'}`,
    );
  }
  const tag = body.tag_name;
  const match = typeof tag === 'string' ? RELEASE_TAG_RE.exec(tag) : null;
  if (typeof tag !== 'string' || match === null) {
    throw refusal(
      `the latest release's tag ${shown(tag)} is not a plain vX.Y.Z version`,
    );
  }

  // The tag's COMMIT, dereferenced by GitHub (annotated or lightweight alike).
  // `tag` passed RELEASE_TAG_RE, so it is safe as a URL segment.
  const shaUrl = `${API}/repos/${REPO}/commits/${tag}`;
  const commit = await get(shaUrl, 'application/vnd.github.sha', MAX_SHA_BYTES);
  if (commit.text === null) {
    throw refusal(
      `could not resolve ${tag} to a commit (${httpReason(commit.status, shaUrl)})`,
    );
  }
  const sha = commit.text.trim();
  if (!COMMIT_RE.test(sha)) {
    throw refusal(`${shaUrl} did not answer with a commit id`);
  }
  return { kind: 'release', tag, version: match[1]!, sha };
}

interface Got {
  status: number;
  // The body of a 2xx, or null for any other status (its body is released).
  text: string | null;
}

/**
 * One bounded GET. A transport failure or the deadline becomes a
 * `ReleaseResolveError` naming the URL; a non-2xx is returned (body released)
 * for the caller to word.
 */
async function get(
  url: string,
  accept: string,
  maxBytes: number,
): Promise<Got> {
  try {
    return await withDeadline(
      FETCH_TIMEOUT_MS,
      () => new Error(`timed out after ${FETCH_TIMEOUT_MS / 1000}s`),
      async (signal) => {
        const res = await fetch(url, {
          redirect: 'error',
          signal,
          headers: { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' },
        });
        if (!res.ok) {
          // Released, not left streaming: an unread body holds its socket.
          await res.body?.cancel().catch(() => undefined);
          return { status: res.status, text: null };
        }
        return {
          status: res.status,
          text: await readCapped(res, signal, maxBytes, url),
        };
      },
    );
  } catch (err) {
    if (err instanceof ReleaseResolveError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw refusal(`could not reach ${url}: ${message}`, err);
  }
}

/** The JSON object of a successful release response, or a refusal. */
function parseRelease(got: Got, url: string): Record<string, unknown> {
  if (got.text === null) {
    throw refusal(httpReason(got.status, url));
  }
  let body: unknown;
  try {
    body = JSON.parse(got.text);
  } catch {
    throw refusal(`${url} did not answer with JSON`);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw refusal(`${url} did not answer with a release object`);
  }
  return body as Record<string, unknown>;
}

function httpReason(status: number, url: string): string {
  return status === 403 || status === 429
    ? `GitHub refused the request (HTTP ${status} from ${url}) — the unauthenticated API allows 60 requests an hour per address`
    : `HTTP ${status} from ${url}`;
}

/** The body as UTF-8, read through our own reader under a hard byte cap. */
async function readCapped(
  res: Response,
  signal: AbortSignal,
  maxBytes: number,
  url: string,
): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const cancel = (): void => {
    reader.cancel().catch(() => undefined);
  };
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      cancel();
      throw refusal(`${url} answered with more than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** An untrusted value, displayed: control characters stripped, then quoted. */
function shown(value: unknown): string {
  return typeof value === 'string'
    ? JSON.stringify(terminalSafe(value, { max: 60 }))
    : `(${value === undefined ? 'missing' : typeof value})`;
}

function refusal(reason: string, cause?: unknown): ReleaseResolveError {
  return new ReleaseResolveError(
    `Could not resolve the latest verified ${REPO} release: ${reason}. This project follows verified releases (\`--ref latest\`) — tags pharn-oss creates once its post-merge CI has passed. To install the tip of main instead (the default channel), run \`pharn init --ref main\` (or \`pharn update --ref main\` for an existing install).`,
    cause === undefined ? undefined : { cause },
  );
}
