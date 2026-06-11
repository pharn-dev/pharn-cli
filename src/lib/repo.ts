import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import degit from 'degit';
import { REPO, REPO_BRANCH } from './constants.js';

const API = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 8000;

export interface FetchedRepo {
  dir: string;
  cleanup: () => void;
}

/**
 * Clone the whole pharn-oss repo into a fresh temp directory. The caller reads
 * manifest.json + each module's installs from it, then calls cleanup().
 */
export async function fetchRepo(): Promise<FetchedRepo> {
  const dir = mkdtempSync(join(tmpdir(), 'pharn-'));
  try {
    const emitter = degit(`${REPO}#${REPO_BRANCH}`, {
      force: true,
      cache: false,
    });
    await emitter.clone(dir);
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Best-effort: resolve the current commit SHA of the default branch so it can
 * be pinned in pharn.config.json. Returns null on any failure (rate limit,
 * offline, etc.) — the SHA is informational, not load-bearing.
 */
export async function fetchCommitSha(): Promise<string | null> {
  const url = `${API}/repos/${REPO}/commits/${REPO_BRANCH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { sha?: unknown };
    return typeof body.sha === 'string' ? body.sha : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
