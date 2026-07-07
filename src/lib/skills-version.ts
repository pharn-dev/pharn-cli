import { existsSync, readFileSync } from 'node:fs';
import { REPO, REPO_BRANCH, SKILLS_VERSION_FILE } from './constants.js';
import { safeJoin } from './install-modules.js';
import {
  assertSafeString,
  ManifestValidationError,
  VERSION_RE,
} from './validate.js';

// SKILLS_VERSION reading — pharn-oss ships a root `SKILLS_VERSION` file in place
// of a manifest.json, so the archetype flow (init/status/update) reads the
// version from here. Untrusted (P2): every value is trimmed and VERSION_RE-
// validated before use/persist. One axis (P3): obtaining the skills version.

const RAW = 'https://raw.githubusercontent.com';
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Read + validate `SKILLS_VERSION` from a fetched clone. Missing file is an
 * upstream packaging bug — surfaced, not defaulted.
 */
export function readSkillsVersion(repoDir: string): string {
  const path = safeJoin(repoDir, SKILLS_VERSION_FILE);
  if (!existsSync(path)) {
    throw new ManifestValidationError(
      `${SKILLS_VERSION_FILE} is missing in the fetched repo.`,
    );
  }
  return assertSafeString(
    readFileSync(path, 'utf8').trim(),
    SKILLS_VERSION_FILE,
    VERSION_RE,
  );
}

/**
 * Fetch the latest `SKILLS_VERSION` from `@main` without cloning — the
 * lightweight currency check `status --no-drift` uses. Mirrors
 * `fetchRemoteManifest`'s three network guards (redirect:'error', an 8s timeout,
 * a 256KB body cap) and validates the result (P2).
 */
export async function fetchRemoteSkillsVersion(): Promise<string> {
  const url = `${RAW}/${REPO}/${REPO_BRANCH}/${SKILLS_VERSION_FILE}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'error', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`SKILLS_VERSION fetch failed (${res.status}) from ${url}`);
  }
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error(`SKILLS_VERSION too large (${declared} bytes) from ${url}`);
  }
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error(
      `SKILLS_VERSION too large (${text.length} bytes) from ${url}`,
    );
  }
  return assertSafeString(text.trim(), SKILLS_VERSION_FILE, VERSION_RE);
}
