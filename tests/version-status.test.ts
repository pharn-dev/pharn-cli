import { describe, expect, it } from 'vitest';
import { versionStatus } from '../src/lib/version-status.js';

// The answer does not depend on the channel, so the function takes none: the
// labels name the situation each row stands for.
describe('versionStatus', () => {
  it.each([
    // An install made from main, switched to `--ref latest` before the release
    // at its version was cut.
    ['release, installed newer', '2.0.0', '1.0.0', true, false],
    // pharn-oss main moved BACK (a revert of SKILLS_VERSION): the install is
    // ahead of the tip, and `pharn update` refuses that downgrade without
    // `--force` — F-15.
    ['main, installed newer (main moved back)', '2.0.0', '1.0.0', true, false],
    ['installed older', '1.0.0', '2.0.0', false, true],
    ['equal', '1.0.0', '1.0.0', false, false],
    ['unparseable installed', 'x', '1.0.0', false, true],
    ['unparseable and equal', 'x', 'x', false, false],
    // A prerelease compares EQUAL to its release core: different strings that
    // cannot be ordered apart → outdated, never ahead.
    ['prerelease of the latest', '1.0.0-rc.1', '1.0.0', false, true],
  ] as const)('%s', (_label, installed, latest, ahead, outdated) => {
    expect(versionStatus({ installed, latest })).toEqual({ ahead, outdated });
  });
});
