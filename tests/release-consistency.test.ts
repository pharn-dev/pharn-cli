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

// F-31: the link definitions at the foot of CHANGELOG.md pointed at tags that do
// not exist (`v0.8.0`, `v0.3.1`, `v0.1.0`), so their compare pages 404ed. Every
// `compare/A...B` and `releases/tag/T` link is now checked against the tags the
// repo really has.
//
// An explicit allowlist, not `git tag`: the CI checkout is `actions/checkout`
// with its defaults (fetch-depth 1, no tags — .github/workflows/ci.yml), so the
// required `Test` check sees no tags at all, and a developer clone may lack the
// newest one. `git ls-remote --tags origin` is the source; a tag is added here
// once `publish.yml` has created it. The version being released (package.json)
// is allowed before its tag exists, because the bump PR adds its link and the
// tag is created only after that PR merges.
const KNOWN_TAGS: readonly string[] = [
  'v0.3.0',
  '0.3.1', // the one tag without a `v` (the first OIDC release)
  'v0.3.2',
  'v0.4.0',
  'v0.5.0',
  'v0.6.0',
  'v0.7.0',
  'v0.7.1',
  'v0.9.0',
  'v0.10.0',
  'v0.11.0',
  'v0.12.0',
];
// Sections with no tag at all, and so no link: 0.8.0 was bumped and superseded
// by 0.9.0 on the same day, never tagged or published; 0.2.0 / 0.1.0 predate
// the tags (0.2.0 was published, then unpublished).
const UNTAGGED_VERSIONS: readonly string[] = ['0.8.0', '0.2.0', '0.1.0'];

const REPO_URL = 'https://github.com/pharn-dev/pharn-cli/';

function tagOf(version: string): string {
  return KNOWN_TAGS.includes(version) ? version : `v${version}`;
}

describe('CHANGELOG.md link definitions', () => {
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const links = [...changelog.matchAll(/^\[([^\]]+)\]: (\S+)$/gm)].map((m) => ({
    label: m[1]!,
    url: m[2]!,
  }));
  // Version headings, newest first, as they appear.
  const versions = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(
    (m) => m[1]!,
  );
  const allowed = new Set([...KNOWN_TAGS, `v${pkg.version}`]);

  // The refs one link names: [from, to] for a compare, [tag] for a tag page.
  function refsOf(url: string): string[] {
    const compare =
      /^https:\/\/github\.com\/pharn-dev\/pharn-cli\/compare\/(.+?)\.\.\.(.+)$/.exec(
        url,
      );
    if (compare) return [compare[1]!, compare[2]!];
    if (url.startsWith(`${REPO_URL}releases/tag/`)) {
      return [url.slice(`${REPO_URL}releases/tag/`.length)];
    }
    throw new Error(`not a compare or tag link: ${url}`);
  }

  it('finds the link block (not vacuous)', () => {
    expect(links.length).toBeGreaterThan(10);
    expect(versions.length).toBeGreaterThan(10);
  });

  it('names only tags that exist (or the version being released)', () => {
    for (const { label, url } of links) {
      for (const ref of refsOf(url)) {
        if (label === 'Unreleased' && ref === 'HEAD') continue;
        expect(allowed.has(ref), `[${label}] names "${ref}"`).toBe(true);
      }
    }
  });

  it('gives every tagged version a link, and an untagged one none', () => {
    const labels = links.map((l) => l.label);
    for (const v of versions) {
      expect(labels.includes(v), v).toBe(!UNTAGGED_VERSIONS.includes(v));
    }
    // ... and no link for a version with no heading.
    for (const label of labels) {
      if (label !== 'Unreleased') expect(versions, label).toContain(label);
    }
  });

  it('compares each version from the previous linked one to its own tag', () => {
    const linked = versions.filter((v) => !UNTAGGED_VERSIONS.includes(v));
    const urlOf = (label: string) => links.find((l) => l.label === label)?.url;
    expect(refsOf(urlOf('Unreleased')!)).toEqual([tagOf(linked[0]!), 'HEAD']);
    linked.forEach((v, i) => {
      const previous = linked[i + 1];
      expect(refsOf(urlOf(v)!), v).toEqual(
        previous === undefined ? [tagOf(v)] : [tagOf(previous), tagOf(v)],
      );
    });
  });

  it('would catch a link to a tag that does not exist (not vacuous)', () => {
    expect(
      refsOf(`${REPO_URL}compare/v0.7.1...v0.8.0`).every((r) => allowed.has(r)),
    ).toBe(false);
  });
});
