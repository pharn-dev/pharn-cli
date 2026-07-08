import { execFileSync, execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(),
  isCancel: () => false,
  log: { info: vi.fn(), warn: vi.fn() },
  note: vi.fn(),
}));

const {
  gitCommitCount,
  gitTrackedFileCount,
  runFreshCheck,
  TRACKED_FILE_THRESHOLD,
} = await import('../src/steps/fresh-check.js');
const prompts = await import('@clack/prompts');

function git(dir: string, cmd: string): void {
  execSync(
    `git -c user.email=test@example.com -c user.name=Test -c init.defaultBranch=main ${cmd}`,
    { cwd: dir, stdio: 'ignore' },
  );
}

function initGit(dir: string, commits: number): void {
  git(dir, 'init');
  for (let i = 0; i < commits; i++) {
    git(dir, `commit --allow-empty -m "c${i}"`);
  }
}

// Init a repo, write `fileCount` files, stage them, and optionally commit.
function initGitWithFiles(
  dir: string,
  fileCount: number,
  commit: boolean,
): void {
  git(dir, 'init');
  for (let i = 0; i < fileCount; i++) {
    writeFileSync(join(dir, `file-${i}.txt`), '');
  }
  git(dir, 'add -A');
  if (commit) git(dir, 'commit -m "snapshot"');
}

// Write a malicious core.fsmonitor into the repo's .git/config the way an attacker
// would — the target project's config is attacker-controlled. argv form stores the
// payload verbatim as the config value (no outer shell interprets the `;` at
// set-time). If any git command later honors it (the vulnerability), git
// shell-executes `touch <sentinel>`, so the sentinel's presence == code executed.
function setMaliciousFsmonitor(dir: string, sentinel: string): void {
  execFileSync(
    'git',
    ['config', 'core.fsmonitor', `touch '${sentinel}'; false`],
    { cwd: dir },
  );
}

describe('gitCommitCount', () => {
  const tmp = useTmpDir();

  it('returns 0 outside a git repo', () => {
    expect(gitCommitCount(tmp.path())).toBe(0);
  });

  it('returns the actual commit count', () => {
    initGit(tmp.path(), 3);
    expect(gitCommitCount(tmp.path())).toBe(3);
  });
});

describe('gitTrackedFileCount', () => {
  const tmp = useTmpDir();

  it('returns 0 outside a git repo', () => {
    expect(gitTrackedFileCount(tmp.path())).toBe(0);
  });

  it('counts committed tracked files', () => {
    initGitWithFiles(tmp.path(), 5, true);
    expect(gitTrackedFileCount(tmp.path())).toBe(5);
  });

  it('counts staged-but-uncommitted files', () => {
    initGitWithFiles(tmp.path(), 3, false);
    expect(gitTrackedFileCount(tmp.path())).toBe(3);
  });
});

describe('runFreshCheck', () => {
  const tmp = useTmpDir();
  stubProcessExit();

  it('is a no-op for a clean project with 1 commit', async () => {
    initGit(tmp.path(), 1);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await expect(runFreshCheck()).resolves.toBeUndefined();
    expect(prompts.confirm).not.toHaveBeenCalled();
    cwd.mockRestore();
  });

  it('is a no-op for a fresh scaffold (1 commit, few tracked files)', async () => {
    initGitWithFiles(tmp.path(), 5, true);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockReset().mockResolvedValue(true);
    await expect(runFreshCheck()).resolves.toBeUndefined();
    expect(prompts.confirm).not.toHaveBeenCalled();
    cwd.mockRestore();
  });

  it('prompts when commit count >= 2', async () => {
    initGit(tmp.path(), 3);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockReset().mockResolvedValue(true);
    await runFreshCheck();
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    cwd.mockRestore();
  });

  it('exits when the user declines on a stale repo', async () => {
    initGit(tmp.path(), 7);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockReset().mockResolvedValue(false);
    await expect(runFreshCheck()).rejects.toMatchObject(new ProcessExit(0));
    cwd.mockRestore();
  });

  it(`prompts at 1 commit when tracked files > ${TRACKED_FILE_THRESHOLD}`, async () => {
    initGitWithFiles(tmp.path(), TRACKED_FILE_THRESHOLD + 1, true);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockReset().mockResolvedValue(true);
    await runFreshCheck();
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    cwd.mockRestore();
  });

  it(`prompts at 0 commits when staged files > ${TRACKED_FILE_THRESHOLD}`, async () => {
    initGitWithFiles(tmp.path(), TRACKED_FILE_THRESHOLD + 1, false);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockReset().mockResolvedValue(true);
    await runFreshCheck();
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    cwd.mockRestore();
  });
});

// Regression: the target project's .git/config is attacker-controlled, so no git
// invocation may honor a config-driven hook (core.fsmonitor / hooks). Each case
// FAILS against the pre-hardening code (plain `git ls-files` executes the injected
// core.fsmonitor) and passes once every git call is hardened — it demonstrates the
// invariant, it does not merely assert it (P1).
describe('git-config injection hardening (RCE)', () => {
  const tmp = useTmpDir();
  stubProcessExit();

  it('gitTrackedFileCount does not execute a malicious core.fsmonitor', () => {
    initGitWithFiles(tmp.path(), 5, true);
    const sentinel = join(tmp.path(), 'PWNED_ls_files');
    setMaliciousFsmonitor(tmp.path(), sentinel);
    const count = gitTrackedFileCount(tmp.path());
    expect(existsSync(sentinel)).toBe(false); // no code executed
    expect(count).toBe(5); // freshness signal preserved
  });

  it('gitCommitCount does not execute a malicious core.fsmonitor', () => {
    initGit(tmp.path(), 3);
    const sentinel = join(tmp.path(), 'PWNED_rev_list');
    setMaliciousFsmonitor(tmp.path(), sentinel);
    const count = gitCommitCount(tmp.path());
    expect(existsSync(sentinel)).toBe(false);
    expect(count).toBe(3);
  });

  it('runFreshCheck does not execute a malicious core.fsmonitor on the fresh path', async () => {
    // 1 commit + few files → the fresh path, which still reaches gitTrackedFileCount.
    initGitWithFiles(tmp.path(), 5, true);
    const sentinel = join(tmp.path(), 'PWNED_fresh_check');
    setMaliciousFsmonitor(tmp.path(), sentinel);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockReset().mockResolvedValue(true);
    await expect(runFreshCheck()).resolves.toBeUndefined();
    expect(existsSync(sentinel)).toBe(false);
    expect(prompts.confirm).not.toHaveBeenCalled();
    cwd.mockRestore();
  });
});
