import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';

// scripts/release-notes.mjs prints one version's CHANGELOG section — the body of
// the GitHub Release publish.yml creates. Exercised as a subprocess, exactly as
// the workflow runs it.
const SCRIPT = 'scripts/release-notes.mjs';

function notes(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const CHANGELOG = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '- not released yet',
  '',
  '## [1.10.0] — 2026-10-12',
  '',
  '### Added',
  '',
  '- ten',
  '',
  '## [1.2.0] — 2026-10-11',
  '',
  '### Fixed',
  '',
  '- two',
  '',
  '## [1.1.0] — 2026-10-10',
  '',
  '- one',
  '',
  '[Unreleased]: https://example.test/compare/v1.10.0...HEAD',
  '[1.10.0]: https://example.test/compare/v1.2.0...v1.10.0',
  '',
].join('\n');

describe('release-notes', () => {
  const tmp = useTmpDir();
  function file(text: string): string {
    const p = join(tmp.path(), 'CHANGELOG.md');
    writeFileSync(p, text);
    return p;
  }

  it('prints the body under the heading, up to the next ## heading', () => {
    expect(notes(['1.2.0', file(CHANGELOG)])).toEqual({
      status: 0,
      stdout: '### Fixed\n\n- two\n',
      stderr: '',
    });
  });

  it('stops the last section at the link-reference block', () => {
    expect(notes(['1.1.0', file(CHANGELOG)]).stdout).toBe('- one\n');
  });

  it('matches the version literally: 1.1.0 is not 1.10.0, . is not a wildcard', () => {
    expect(notes(['1.10.0', file(CHANGELOG)]).stdout).toBe(
      '### Added\n\n- ten\n',
    );
    const lookalike = file(CHANGELOG.replace('## [1.2.0]', '## [1x2x0]'));
    expect(notes(['1.2.0', lookalike]).status).toBe(1);
  });

  it('accepts CRLF line endings', () => {
    expect(
      notes(['1.2.0', file(CHANGELOG.replace(/\n/g, '\r\n'))]).stdout,
    ).toBe('### Fixed\n\n- two\n');
  });

  it('never returns [Unreleased]', () => {
    const r = notes(['0.0.0', file(CHANGELOG)]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
  });

  it('refuses an absent heading, a repeated heading, and an empty body', () => {
    const cases: [string, string, RegExp][] = [
      ['9.9.9', CHANGELOG, /no "## \[9\.9\.9\]" heading/],
      [
        '1.2.0',
        CHANGELOG.replace('## [1.1.0] — 2026-10-10', '## [1.2.0] — again'),
        /appears 2 times/,
      ],
      [
        '1.2.0',
        CHANGELOG.replace('### Fixed\n\n- two\n', ''),
        /section of .* is empty/,
      ],
    ];
    for (const [version, text, message] of cases) {
      const r = notes([version, file(text)]);
      expect(r.status, version).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toMatch(message);
    }
  });

  it('refuses a version that is not plain X.Y.Z', () => {
    for (const version of [
      '1.2.0-rc.1',
      'v1.2.0',
      '01.2.0',
      '1.2',
      '../x',
      '.*',
    ]) {
      const r = notes([version, file(CHANGELOG)]);
      expect(r.status, version).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toMatch(/version must be X\.Y\.Z/);
    }
    expect(notes([]).status).toBe(1);
  });

  it('refuses an unreadable changelog', () => {
    const r = notes(['1.2.0', join(tmp.path(), 'missing.md')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cannot read .*ENOENT/);
  });
});
