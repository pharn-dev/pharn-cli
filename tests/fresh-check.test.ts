import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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
  countCustomFiles,
  gitCommitCount,
  runFreshCheck,
  CUSTOM_FILE_THRESHOLD,
} = await import('../src/steps/fresh-check.js');
const prompts = await import('@clack/prompts');

function initGit(dir: string, commits: number): void {
  const git = (cmd: string) =>
    execSync(
      `git -c user.email=test@example.com -c user.name=Test -c init.defaultBranch=main ${cmd}`,
      { cwd: dir, stdio: 'ignore' },
    );
  git('init');
  for (let i = 0; i < commits; i++) {
    git(`commit --allow-empty -m "c${i}"`);
  }
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

describe('countCustomFiles', () => {
  const tmp = useTmpDir();

  it('ignores known top-level files and dotfiles', () => {
    writeFileSync(join(tmp.path(), 'package.json'), '{}');
    writeFileSync(join(tmp.path(), 'tsconfig.json'), '{}');
    writeFileSync(join(tmp.path(), '.gitignore'), '');
    writeFileSync(join(tmp.path(), '.env.local'), '');
    expect(countCustomFiles(tmp.path())).toBe(0);
  });

  it('ignores files matching known prefixes (incl. tailwind/prettier)', () => {
    writeFileSync(join(tmp.path(), 'next.config.ts'), '');
    writeFileSync(join(tmp.path(), 'eslint.config.mjs'), '');
    writeFileSync(join(tmp.path(), 'postcss.config.js'), '');
    writeFileSync(join(tmp.path(), 'tailwind.config.ts'), '');
    writeFileSync(join(tmp.path(), 'prettier.config.mjs'), '');
    expect(countCustomFiles(tmp.path())).toBe(0);
  });

  it('counts unknown top-level files and directories', () => {
    writeFileSync(join(tmp.path(), 'random.md'), '');
    mkdirSync(join(tmp.path(), 'features'));
    expect(countCustomFiles(tmp.path())).toBe(2);
  });

  it('counts unknown files inside app/ but ignores known ones', () => {
    mkdirSync(join(tmp.path(), 'app'));
    writeFileSync(join(tmp.path(), 'app', 'page.tsx'), '');
    writeFileSync(join(tmp.path(), 'app', 'layout.tsx'), '');
    writeFileSync(join(tmp.path(), 'app', 'globals.css'), '');
    writeFileSync(join(tmp.path(), 'app', 'extra.tsx'), '');
    expect(countCustomFiles(tmp.path())).toBe(1);
  });

  it('counts 0 for a fresh --src-dir + Biome scaffold', () => {
    writeFileSync(join(tmp.path(), 'package.json'), '{}');
    writeFileSync(join(tmp.path(), 'biome.json'), '{}');
    mkdirSync(join(tmp.path(), 'src', 'app'), { recursive: true });
    writeFileSync(join(tmp.path(), 'src', 'app', 'page.tsx'), '');
    writeFileSync(join(tmp.path(), 'src', 'app', 'layout.tsx'), '');
    writeFileSync(join(tmp.path(), 'src', 'app', 'globals.css'), '');
    writeFileSync(join(tmp.path(), 'src', 'app', 'favicon.ico'), '');
    expect(countCustomFiles(tmp.path())).toBe(0);
  });

  it('counts unknown files inside src/app when root app/ is absent', () => {
    mkdirSync(join(tmp.path(), 'src', 'app'), { recursive: true });
    writeFileSync(join(tmp.path(), 'src', 'app', 'page.tsx'), '');
    writeFileSync(join(tmp.path(), 'src', 'app', 'extra.tsx'), '');
    expect(countCustomFiles(tmp.path())).toBe(1);
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

  it('prompts when commit count >= 2', async () => {
    initGit(tmp.path(), 3);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await runFreshCheck();
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    cwd.mockRestore();
  });

  it('exits when the user declines on a stale repo', async () => {
    initGit(tmp.path(), 7);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(runFreshCheck()).rejects.toMatchObject(new ProcessExit(0));
    cwd.mockRestore();
  });

  it(`prompts when 0 commits and custom files > ${CUSTOM_FILE_THRESHOLD}`, async () => {
    for (let i = 0; i <= CUSTOM_FILE_THRESHOLD + 1; i++) {
      writeFileSync(join(tmp.path(), `custom-${i}.txt`), '');
    }
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockReset().mockResolvedValue(true);
    await runFreshCheck();
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    cwd.mockRestore();
  });

  it('prompts at 1 commit when the project is already customized', async () => {
    initGit(tmp.path(), 1);
    for (let i = 0; i <= CUSTOM_FILE_THRESHOLD + 1; i++) {
      writeFileSync(join(tmp.path(), `custom-${i}.txt`), '');
    }
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(prompts.confirm).mockReset().mockResolvedValue(true);
    await runFreshCheck();
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    cwd.mockRestore();
  });
});
