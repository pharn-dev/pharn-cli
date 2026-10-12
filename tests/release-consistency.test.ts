import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Releases publish on merge (publish.yml): a PR that bumps `version` IS the
// release. These run on every PR (the required `Test` check), so a bump that
// forgot the lockfile or its CHANGELOG section fails before the merge, not in
// the post-merge release. Whether a PR SHOULD bump, and to which level, stays
// the author's and reviewer's call — nothing here can know that.
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string;
};
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  version: string;
  packages: Record<string, { version?: string }>;
};

function sectionFor(version: string, changelog = 'CHANGELOG.md') {
  return spawnSync(
    process.execPath,
    ['scripts/release-notes.mjs', version, changelog],
    { encoding: 'utf8' },
  );
}

describe('release consistency', () => {
  it('package.json version is plain X.Y.Z', () => {
    expect(pkg.version).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  });

  it('package-lock.json carries the same version (root and packages[""])', () => {
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages['']?.version).toBe(pkg.version);
  });

  it('CHANGELOG.md has a non-empty section for that version', () => {
    const r = sectionFor(pkg.version);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).not.toBe('');
  });

  it('a bumped version with no CHANGELOG section is caught (not vacuous)', () => {
    const [major, minor] = pkg.version.split('.').map(Number);
    const bumped = `${major}.${minor! + 1}.0`;
    const r = sectionFor(bumped);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no "## \[.*\]" heading/);
  });
});
