import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  fetchRemoteSkillsVersion,
  readMinCli,
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

// ---------------------------------------------------------------------------
// readMinCli - the OPTIONAL upstream minimum-CLI handshake file, read from the
// clone beside SKILLS_VERSION. It deliberately does NOT mirror readSkillsVersion's
// throw: SKILLS_VERSION is required (a missing one is an upstream packaging bug),
// while MIN_CLI is optional, so "no constraint" is already a legal state. A throw
// here would become exit(1) in init/add/update, so one upstream typo in a one-line
// file would brick the whole released fleet - the exact outage the handshake exists
// to prevent. Tolerate-and-report instead: no constraint, plus a named warning.
// ---------------------------------------------------------------------------

describe('readMinCli', () => {
  const tmp = useTmpDir();

  it('absent file -> no constraint, and SILENT (upstream ships none today)', () => {
    expect(readMinCli(tmp.path())).toEqual({ version: null, warning: null });
  });

  it('reads and trims a well-formed value', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), '0.9.0\n');
    expect(readMinCli(tmp.path())).toEqual({ version: '0.9.0', warning: null });
  });

  it('accepts a prerelease value (VERSION_RE admits a trailing suffix)', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), '1.2.3-rc.1\n');
    expect(readMinCli(tmp.path()).version).toBe('1.2.3-rc.1');
  });

  it('malformed value -> no constraint PLUS a named warning, never a throw', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), 'not-a-version\n');
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning).toContain('MIN_CLI');
  });

  it('empty value -> no constraint plus a warning', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), '   \n');
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning).not.toBeNull();
  });

  it('unreadable (a directory at the path) -> no constraint plus a warning', () => {
    mkdirSync(join(tmp.path(), 'MIN_CLI'), { recursive: true });
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning).not.toBeNull();
  });

  it('never echoes untrusted bytes into the warning (P2)', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), 'x'.repeat(4000));
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning!.length).toBeLessThan(400);
  });

  // The bytes come from an untrusted clone, so the size is checked BEFORE the
  // read — a file too large to be a version is never slurped into a string.
  it('refuses to READ an oversized MIN_CLI, and still imposes no constraint', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), 'x'.repeat(2048));
    const read = readMinCli(tmp.path());
    expect(read.version).toBeNull();
    expect(read.warning).toContain('too large');
  });

  it('a version at the size boundary still reads normally', () => {
    writeFileSync(join(tmp.path(), 'MIN_CLI'), '1.2.3\n');
    expect(readMinCli(tmp.path()).version).toBe('1.2.3');
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
