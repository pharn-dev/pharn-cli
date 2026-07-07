import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  fetchRemoteSkillsVersion,
  readSkillsVersion,
} from '../src/lib/skills-version.js';
import { ManifestValidationError } from '../src/lib/validate.js';

function fakeResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => String(body.length) },
    text: async () => body,
  } as unknown as Response;
}

describe('readSkillsVersion', () => {
  const tmp = useTmpDir();

  it('reads and trims a valid SKILLS_VERSION', () => {
    writeFileSync(join(tmp.path(), 'SKILLS_VERSION'), '1.0.0\n');
    expect(readSkillsVersion(tmp.path())).toBe('1.0.0');
  });

  it('throws when the file is missing', () => {
    expect(() => readSkillsVersion(tmp.path())).toThrow(
      ManifestValidationError,
    );
  });

  it('throws on a non-semver value (P2 validation)', () => {
    writeFileSync(join(tmp.path(), 'SKILLS_VERSION'), 'not-a-version');
    expect(() => readSkillsVersion(tmp.path())).toThrow(/invalid format/);
  });
});

describe('fetchRemoteSkillsVersion', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches and validates the remote version', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse('1.2.3\n'));
    await expect(fetchRemoteSkillsVersion()).resolves.toBe('1.2.3');
  });

  it('uses redirect:error and an abort signal (network guards)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(fakeResponse('1.0.0'));
    await fetchRemoteSkillsVersion();
    const opts = spy.mock.calls[0]![1]!;
    expect(opts.redirect).toBe('error');
    expect(opts.signal).toBeDefined();
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse('nope', 404));
    await expect(fetchRemoteSkillsVersion()).rejects.toThrow(/fetch failed/);
  });

  it('throws on an invalid remote value', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse('garbage!!'));
    await expect(fetchRemoteSkillsVersion()).rejects.toThrow(
      ManifestValidationError,
    );
  });
});
