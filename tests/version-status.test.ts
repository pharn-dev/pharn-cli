import { describe, expect, it } from 'vitest';
import type { InstallSource } from '../src/lib/release.js';
import { versionStatus } from '../src/lib/version-status.js';

const release = (version: string): InstallSource => ({
  kind: 'release',
  tag: `v${version}`,
  version,
  sha: 'b'.repeat(40),
});
const main: InstallSource = { kind: 'main' };

describe('versionStatus', () => {
  it.each([
    [
      'release, installed newer',
      '2.0.0',
      '1.0.0',
      release('1.0.0'),
      true,
      false,
    ],
    [
      'release, installed older',
      '1.0.0',
      '2.0.0',
      release('2.0.0'),
      false,
      true,
    ],
    ['release, equal', '1.0.0', '1.0.0', release('1.0.0'), false, false],
    ['main, different version', '2.0.0', '1.0.0', main, false, true],
    ['main, equal', '1.0.0', '1.0.0', main, false, false],
    [
      'release, unparseable installed',
      'x',
      '1.0.0',
      release('1.0.0'),
      false,
      true,
    ],
    [
      'release, unparseable and equal',
      'x',
      'x',
      release('1.0.0'),
      false,
      false,
    ],
  ] as const)('%s', (_label, installed, latest, source, ahead, outdated) => {
    expect(versionStatus({ installed, latest, source })).toEqual({
      ahead,
      outdated,
    });
  });
});
