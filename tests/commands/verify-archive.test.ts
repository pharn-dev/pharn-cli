import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  A11Y,
  fetchStub,
  logs,
  MANIFEST,
  manifestTree,
  proj,
  run,
  SECURITY,
  SHA_V1,
  stderr,
  stdout,
  useHarness,
  watchClones,
  withManifest,
  upstreamTree,
  type Tree,
} from '../support/harness.js';
import {
  codeloadArchive,
  type ArchiveOptions,
} from '../support/tar-fixture.js';
import { runVerifyArchive } from '../../src/commands/verify-archive.js';
import { PHARN_DEBUG_HINT } from '../../src/lib/report-error.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

// `verify-archive` runs the install path's own extractor and manifest checks
// over a LOCAL archive. Every case asserts that nothing was fetched and, where
// a tree was made, that the temp directory is gone afterwards.

const VERSION = '7.25.5';

/** Write a gzipped codeload-shaped archive of `tree` beside the project. */
function archiveFile(
  tree: Tree,
  opts: ArchiveOptions = {},
  name = 'pharn-oss.tar.gz',
): string {
  const path = join(proj(), '..', name);
  writeFileSync(path, codeloadArchive(SHA_V1, tree, opts));
  return path;
}

async function verify(
  file: string,
  expectVersion?: string,
): Promise<number | null> {
  return run(() => runVerifyArchive({ file, expectVersion }));
}

const errors = (): string => logs('error').join('\n');

// What v7.25.5 committed outside its manifest, and more an archive may carry.
const UNLISTED = [
  { path: '.claude/skills/pharn-cli', type: '2' },
  { path: '.dev/hard', type: '1' },
  { path: 'PaxHeaders/long', type: 'x', data: '30 path=pharn-oss/x/y/z.md\n' },
  { path: '.dev/notes.md', type: '0', data: 'unlisted\n' },
];

describe('pharn verify-archive — a good archive passes', () => {
  it('exits 0 with the file name, listed-file count and SKILLS_VERSION, fetching nothing', async () => {
    const left = watchClones();
    const tree = manifestTree(VERSION);
    const listed = (JSON.parse(tree[MANIFEST]!) as { files: unknown[] }).files
      .length;
    expect(await verify(archiveFile(tree))).toBeNull();
    const [summary] = logs('success');
    expect(summary).toContain('pharn-oss.tar.gz');
    expect(summary).toContain(`${listed} files listed in ${MANIFEST}`);
    expect(summary).toContain(`SKILLS_VERSION ${VERSION}`);
    expect(summary).toContain('MIN_CLI none');
    expect(fetchStub).not.toHaveBeenCalled();
    expect(left()).toEqual([]);
    expect(stdout()).toEqual([]);
  });

  it('passes past an unlisted symlink, hard link and pax header (the v7.25.5 shape), leaving nothing behind', async () => {
    const left = watchClones();
    expect(
      await verify(archiveFile(manifestTree(VERSION), { extra: UNLISTED })),
    ).toBeNull();
    expect(logs('success')).toHaveLength(1);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(left()).toEqual([]);
  });

  it('--expect-version that matches passes and says so', async () => {
    expect(
      await verify(archiveFile(manifestTree(VERSION)), VERSION),
    ).toBeNull();
    expect(logs('success')[0]).toContain(
      `SKILLS_VERSION ${VERSION}, as expected`,
    );
  });

  it('names a valid MIN_CLI in the summary', async () => {
    const tree = withManifest({
      ...upstreamTree(VERSION),
      MIN_CLI: '0.14.0\n',
    });
    expect(await verify(archiveFile(tree))).toBeNull();
    expect(logs('success')[0]).toContain('MIN_CLI 0.14.0');
  });

  it('warns about a capability an install would skip, and still passes', async () => {
    const tree = manifestTree(VERSION, (m) => {
      const cap = m.capabilities.find((c) => c.name === 'a11y')!;
      cap.applies = ['mobile'];
    });
    expect(await verify(archiveFile(tree))).toBeNull();
    expect(logs('warn').join('\n')).toMatch(/SKIPPED/);
    expect(logs('warn').join('\n')).toContain('a11y');
    expect(logs('success')).toHaveLength(1);
  });
});

describe('pharn verify-archive — a broken archive is refused, naming the entry and rule', () => {
  it('a listed file whose bytes differ from its sha256', async () => {
    const left = watchClones();
    const tree = manifestTree(VERSION);
    tree[A11Y] = 'altered after the manifest was built\n';
    expect(await verify(archiveFile(tree))).toBe(1);
    expect(errors()).toContain('Archive pharn-oss.tar.gz refused:');
    expect(errors()).toContain(A11Y);
    expect(errors()).toMatch(/sha256/);
    expect(logs('success')).toEqual([]);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(left()).toEqual([]);
  });

  it('a symlink at a listed path', async () => {
    const left = watchClones();
    const file = archiveFile(manifestTree(VERSION), {
      replace: { [SECURITY]: [{ path: SECURITY, type: '2' }] },
    });
    expect(await verify(file)).toBe(1);
    expect(errors()).toMatch(/unsupported type '2'/);
    expect(errors()).toContain(SECURITY);
    expect(left()).toEqual([]);
  });

  it('an archive without pharn-install.json names the --prefix command', async () => {
    const left = watchClones();
    const tree = upstreamTree(VERSION);
    expect(await verify(archiveFile(tree))).toBe(1);
    expect(errors()).toContain(`holds no ${MANIFEST}`);
    expect(errors()).toContain('git archive --prefix=pharn-oss/');
    expect(left()).toEqual([]);
  });

  it('a rootless archive (a plain `git archive`) gets the same --prefix message', async () => {
    expect(
      await verify(archiveFile(manifestTree(VERSION), { rootless: true })),
    ).toBe(1);
    // The extractor's own refusal (a selected path with no root above it),
    // which the command recognises by its text and extends with the fix.
    expect(errors()).toContain('tar entry has no path below the archive root');
    expect(errors()).toContain('one top-level directory');
    expect(errors()).toContain('git archive --prefix=pharn-oss/');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('an archive under a deeper prefix (a/b/) is told it has no manifest under one root', async () => {
    const tree = manifestTree(VERSION);
    const deep = Object.fromEntries(
      Object.entries(tree).map(([rel, body]) => [`deep/${rel}`, body]),
    );
    expect(await verify(archiveFile(deep))).toBe(1);
    expect(errors()).toContain(`holds no ${MANIFEST}`);
    expect(errors()).toContain('git archive --prefix=pharn-oss/');
  });

  it('--expect-version that differs names both versions', async () => {
    const left = watchClones();
    expect(await verify(archiveFile(manifestTree(VERSION)), '7.25.6')).toBe(1);
    expect(errors()).toContain(
      `ships SKILLS_VERSION ${VERSION}, not 7.25.6 (--expect-version)`,
    );
    expect(left()).toEqual([]);
  });

  it('a malformed MIN_CLI', async () => {
    const tree = withManifest({
      ...upstreamTree(VERSION),
      MIN_CLI: 'not-a-version\n',
    });
    expect(await verify(archiveFile(tree))).toBe(1);
    expect(errors()).toContain('MIN_CLI is present but unusable');
    expect(errors()).toContain('not a valid version');
  });

  it('a file that is not gzip', async () => {
    const path = join(proj(), '..', 'junk.tar.gz');
    writeFileSync(path, 'not an archive at all\n');
    expect(await verify(path)).toBe(1);
    expect(errors()).toContain('Archive junk.tar.gz refused:');
    expect(errors()).toMatch(/decompress/);
  });

  it('prints the PHARN_DEBUG hint, and the original error under PHARN_DEBUG=1', async () => {
    const tree = manifestTree(VERSION);
    tree[A11Y] = 'altered\n';
    const file = archiveFile(tree);
    expect(await verify(file)).toBe(1);
    expect(logs('info')).toContain(PHARN_DEBUG_HINT);

    vi.stubEnv('PHARN_DEBUG', '1');
    vi.mocked((await import('@clack/prompts')).log.info).mockClear();
    expect(await verify(file)).toBe(1);
    expect(logs('info')).not.toContain(PHARN_DEBUG_HINT);
    expect(stderr().join('\n')).toMatch(/UpstreamManifestError|sha256/);
  });
});

describe('pharn verify-archive — the input path', () => {
  it('a path that does not exist', async () => {
    expect(await verify(join(proj(), 'missing.tar.gz'))).toBe(1);
    expect(errors()).toContain('missing.tar.gz: it does not exist.');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('a directory', async () => {
    const dir = join(proj(), 'dir.tar.gz');
    mkdirSync(dir);
    expect(await verify(dir)).toBe(1);
    expect(errors()).toContain('is not a regular file');
  });

  // POSIX-only, as tests/bounded-read.test.ts's FIFO case: the gates run on
  // ubuntu only.
  it('a FIFO is refused without waiting on it', async () => {
    const fifo = join(proj(), 'pipe.tar.gz');
    execFileSync('mkfifo', [fifo]);
    expect(await verify(fifo)).toBe(1);
    expect(errors()).toContain('is not a regular file');
  });

  it('a failure that is not a refusal (no temp dir can be made) is reported with the PHARN_DEBUG hint', async () => {
    const file = archiveFile(manifestTree(VERSION));
    vi.stubEnv('TMPDIR', join(proj(), 'no-such-dir'));
    expect(await verify(file)).toBe(1);
    expect(errors()).not.toContain('refused');
    expect(errors()).toMatch(/ENOENT/);
    expect(logs('info')).toContain(PHARN_DEBUG_HINT);
  });

  it('a file over the 32 MiB download cap', async () => {
    const big = join(proj(), 'big.tar.gz');
    writeFileSync(big, '');
    truncateSync(big, 32 * 1024 * 1024 + 1);
    expect(await verify(big)).toBe(1);
    expect(errors()).toContain('is larger than 32 MiB');
  });

  it('an empty file', async () => {
    const empty = join(proj(), 'empty.tar.gz');
    writeFileSync(empty, '');
    expect(await verify(empty)).toBe(1);
    expect(errors()).toContain('empty.tar.gz: it is empty.');
  });

  it('follows a symlinked archive file (the user’s own)', async () => {
    const link = join(proj(), 'link.tar.gz');
    symlinkSync(archiveFile(manifestTree(VERSION)), link);
    expect(await verify(link)).toBeNull();
    expect(logs('success')[0]).toContain('link.tar.gz');
  });

  it('escapes a control character in the path wherever it is printed', async () => {
    expect(await verify(join(proj(), 'evil\u001b[31m.tar.gz'))).toBe(1);
    expect(errors()).not.toContain('\u001b');
    expect(errors()).toContain('evil');

    const tree = manifestTree(VERSION);
    tree[A11Y] = 'altered\n';
    const file = archiveFile(tree, {}, 'bad\u001b[2J.tar.gz');
    expect(await verify(file)).toBe(1);
    expect(errors()).not.toContain('\u001b');
    expect(
      readdirSync(join(proj(), '..')).some((n) => n.startsWith('bad')),
    ).toBe(true);
  });
});
