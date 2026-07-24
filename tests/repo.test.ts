import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPO, REPO_BRANCH } from '../src/lib/constants.js';
import { ManifestValidationError } from '../src/lib/validate.js';

const clone = vi.fn();
const degit = vi.fn(() => ({ clone }));
vi.mock('degit', () => ({ default: degit }));

const { fetchRepo, fetchCommitSha } = await import('../src/lib/repo.js');

// A real 40-char lowercase-hex commit SHA (the SHA-1 of the empty blob) — the
// form fetchRepo now validates against COMMIT_RE before it clones / records it.
const VALID_SHA = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';

describe('fetchRepo', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // Stub the GitHub-API SHA resolution fetchRepo now performs before cloning.
  function stubSha(sha: string | null): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sha === null
          ? { ok: false, json: async () => ({}) }
          : { ok: true, json: async () => ({ sha }) },
      ),
    );
  }

  it('pins degit to the resolved commit SHA and records it (recorded == fetched)', async () => {
    stubSha(VALID_SHA);
    clone.mockResolvedValueOnce(undefined);
    const repo = await fetchRepo();

    // Pinned to the SHA, not the floating branch — and the SAME value recorded.
    expect(degit).toHaveBeenCalledWith(`${REPO}#${VALID_SHA}`, {
      force: true,
      cache: false,
    });
    expect(repo.sha).toBe(VALID_SHA);
    expect(clone).toHaveBeenCalledWith(repo.dir);
    expect(existsSync(repo.dir)).toBe(true);

    repo.cleanup();
    expect(existsSync(repo.dir)).toBe(false);
  });

  it('falls back to the branch and records sha:null when the SHA is unresolved (LIMITS §3b)', async () => {
    stubSha(null);
    clone.mockResolvedValueOnce(undefined);
    const repo = await fetchRepo();

    expect(degit).toHaveBeenCalledWith(`${REPO}#${REPO_BRANCH}`, {
      force: true,
      cache: false,
    });
    expect(repo.sha).toBeNull();

    repo.cleanup();
  });

  it('removes the temp dir and rethrows when clone fails', async () => {
    stubSha(VALID_SHA);
    clone.mockRejectedValueOnce(new Error('boom'));
    await expect(fetchRepo()).rejects.toThrow('boom');
  });

  it('rejects a malformed (non-40-hex) sha before cloning or creating a temp dir (P2)', async () => {
    stubSha('deadbeefcafe'); // 12 hex chars — not a full 40-hex commit SHA
    await expect(fetchRepo()).rejects.toThrow(ManifestValidationError);
    // Boundary reject: the guard runs before degit is constructed / clone is called.
    expect(degit).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
  });
});

describe('fetchCommitSha', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(impl: () => unknown): void {
    vi.stubGlobal('fetch', vi.fn(impl));
  }

  it('returns the sha on a successful response', async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ sha: 'abc123' }) }));
    expect(await fetchCommitSha()).toBe('abc123');
  });

  it('returns null on a non-ok response', async () => {
    stubFetch(() => ({ ok: false, json: async () => ({}) }));
    expect(await fetchCommitSha()).toBeNull();
  });

  it('returns null when the sha is not a string', async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ sha: 42 }) }));
    expect(await fetchCommitSha()).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    stubFetch(() => {
      throw new Error('offline');
    });
    expect(await fetchCommitSha()).toBeNull();
  });
});
