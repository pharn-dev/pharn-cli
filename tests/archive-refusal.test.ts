import { describe, expect, it } from 'vitest';
import {
  archiveRefusalMessage,
  noteArchiveRefusal,
  refusalText,
} from '../src/lib/archive-refusal.js';
import { ReleaseResolveError } from '../src/lib/release.js';
import type { InstallSource } from '../src/lib/release.js';
import { TarExtractError } from '../src/lib/tar-extract.js';
import { UpstreamManifestError } from '../src/lib/upstream-manifest.js';
import { ManifestValidationError } from '../src/lib/validate.js';

const SHA = 'a'.repeat(40);
const RELEASE: InstallSource = {
  kind: 'release',
  tag: 'v7.25.5',
  version: '7.25.5',
  sha: SHA,
};
const MAIN: InstallSource = { kind: 'main' };

describe('noteArchiveRefusal + archiveRefusalMessage', () => {
  it.each([
    ['TarExtractError', new TarExtractError('tar entry has a bad type')],
    ['ManifestValidationError', new ManifestValidationError('bad version')],
    ['UpstreamManifestError', new UpstreamManifestError('bad manifest')],
  ])('notes a %s with the ref and its own reason', (_, err) => {
    noteArchiveRefusal(err, RELEASE, SHA);
    const message = archiveRefusalMessage(err);
    expect(message).toContain(
      `pharn-oss release v7.25.5 (commit ${SHA}) was refused`,
    );
    expect(message).toContain(`Reason: ${err.message}`);
  });

  it('leaves a network error and a release-resolution refusal unnoted', () => {
    const network = new TypeError('fetch failed');
    const resolve = new ReleaseResolveError('no release');
    noteArchiveRefusal(network, MAIN, SHA);
    noteArchiveRefusal(resolve, RELEASE, SHA);
    expect(archiveRefusalMessage(network)).toBeUndefined();
    expect(archiveRefusalMessage(resolve)).toBeUndefined();
  });

  it('leaves the refusal of a malformed main SHA unnoted: no archive was fetched', () => {
    const err = new ManifestValidationError('commit SHA is invalid');
    noteArchiveRefusal(err, MAIN, 'not-a-sha\u001b[2J');
    expect(archiveRefusalMessage(err)).toBeUndefined();
  });

  it('answers undefined for an error never noted, and for a non-object', () => {
    expect(archiveRefusalMessage(new TarExtractError('x'))).toBeUndefined();
    expect(archiveRefusalMessage(undefined)).toBeUndefined();
    expect(archiveRefusalMessage('a string')).toBeUndefined();
  });
});

describe('refusalText', () => {
  it('names an unresolved main tip without a SHA', () => {
    expect(refusalText(MAIN, null, 'r')).toContain(
      'pharn-oss main (refs/heads/main, commit not resolved) was refused',
    );
  });

  it('escapes an unsafe character left in the reason', () => {
    const text = refusalText(MAIN, SHA, 'entry \u001b[31mred');
    expect(text).not.toContain('\u001b');
    expect(text).toContain('Reason: entry \\u001b[31mred');
  });

  it('offers only --ref values the CLI accepts', () => {
    for (const text of [
      refusalText(RELEASE, SHA, 'r'),
      refusalText(MAIN, SHA, 'r'),
    ]) {
      const refs = [...text.matchAll(/--ref (\S+?)`/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(['main', 'latest']).toContain(ref);
    }
  });
});
