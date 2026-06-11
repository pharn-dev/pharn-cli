import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPO, REPO_BRANCH } from '../src/lib/constants.js';

const clone = vi.fn();
const degit = vi.fn(() => ({ clone }));
vi.mock('degit', () => ({ default: degit }));

const { fetchRepo, fetchCommitSha } = await import('../src/lib/repo.js');

describe('fetchRepo', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('clones the pinned repo+branch into a temp dir and exposes cleanup', async () => {
    clone.mockResolvedValueOnce(undefined);
    const repo = await fetchRepo();

    expect(degit).toHaveBeenCalledWith(`${REPO}#${REPO_BRANCH}`, {
      force: true,
      cache: false,
    });
    expect(clone).toHaveBeenCalledWith(repo.dir);
    expect(existsSync(repo.dir)).toBe(true);

    repo.cleanup();
    expect(existsSync(repo.dir)).toBe(false);
  });

  it('removes the temp dir and rethrows when clone fails', async () => {
    clone.mockRejectedValueOnce(new Error('boom'));
    await expect(fetchRepo()).rejects.toThrow('boom');
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
