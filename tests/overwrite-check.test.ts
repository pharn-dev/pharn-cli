import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';

// The stage confirms via lib/confirm.js → @clack/prompts. Mock the prompt surface;
// conflictingWriteTargets + detectLayout run for real over the fake repo/proj.
vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  log: { info: vi.fn(), warn: vi.fn() },
}));

const prompts = await import('@clack/prompts');
const { confirmWriteTargets, MAX_LISTED } =
  await import('../src/steps/overwrite-check.js');
const { installCapabilities } =
  await import('../src/lib/install-capabilities.js');
type Selection = import('../src/types.js').Selection;

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function scaffoldRepo(repo: string): void {
  write(join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'));
  write(join(repo, 'pharn-pipeline/grillers/a11y/evals/cases/c.md'));
  write(join(repo, 'pharn-review/n-plus-one/n-plus-one.md'));
  write(join(repo, '.claude/commands/pharn-plan.md'));
  write(join(repo, '.claude/commands/pharn-ship.md'));
  write(join(repo, '.claude/hooks/set-writes-scope.cjs'));
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'CONSTITUTION.md'));
  write(join(repo, 'ARCHITECTURE.md'));
  write(join(repo, 'THREAT-MODEL.md'));
  write(join(repo, 'LIMITS.md'));
  write(join(repo, 'pharn-contracts/finding-shape.md'));
  write(join(repo, '.dev/floor/validate.mjs'));
}

function scaffoldRepoPharn(repo: string): void {
  write(join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'));
  write(join(repo, 'pharn/pharn-review/n-plus-one/n-plus-one.md'));
  write(join(repo, '.claude/commands/pharn-plan.md'));
  write(join(repo, '.claude/hooks/set-writes-scope.cjs'));
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'pharn/CONSTITUTION.md'));
  write(join(repo, 'pharn/ARCHITECTURE.md'));
  write(join(repo, 'pharn/pharn-contracts/finding-shape.md'));
  write(join(repo, 'pharn/floor/validate.mjs'));
}

function selection(): Selection {
  return {
    selected: [
      { name: 'a11y', role: 'griller', matched: ['ssr'] },
      { name: 'n-plus-one', role: 'lens', matched: ['ssr'] },
    ],
    skipped: [],
  };
}

describe('confirmWriteTargets', () => {
  const tmp = useTmpDir();
  stubProcessExit();

  function dirs(scaffold: (r: string) => void): { repo: string; proj: string } {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(proj, { recursive: true });
    scaffold(repo);
    vi.mocked(prompts.confirm).mockReset();
    vi.mocked(prompts.log.warn).mockReset();
    return { repo, proj };
  }

  it('returns true with NO prompt for a conflict-free project (zero friction)', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      true,
    );
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(prompts.log.warn).not.toHaveBeenCalled();
  });

  it('stays silent for a project with ONLY .claude/settings.json', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, '.claude/settings.json'), '{"user":"cfg"}');
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      true,
    );
    expect(prompts.confirm).not.toHaveBeenCalled();
  });

  it('warns listing the conflicting path and returns the confirm result', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'CONSTITUTION.md'));
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      true,
    );
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
    const warning = vi.mocked(prompts.log.warn).mock.calls[0]![0] as string;
    expect(warning).toContain('already exist and may be overwritten');
    expect(warning).toContain('CONSTITUTION.md');
  });

  it('a declined confirm (default No) returns false — the caller cancels', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'pharn.config.json'), '{}');
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(confirmWriteTargets(repo, proj, selection())).resolves.toBe(
      false,
    );
  });

  it('a cancelled prompt (Ctrl+C) exits the run', async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    write(join(proj, 'pharn.config.json'), '{}');
    vi.mocked(prompts.confirm).mockResolvedValue(CANCEL as never);
    await expect(
      confirmWriteTargets(repo, proj, selection()),
    ).rejects.toMatchObject(new ProcessExit(0));
  });

  it(`caps the list at ${MAX_LISTED} with "…and N more"`, async () => {
    const { repo, proj } = dirs(scaffoldRepo);
    // A full real install into proj makes every manifest path a conflict (>10).
    installCapabilities(repo, proj, selection());
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await confirmWriteTargets(repo, proj, selection());
    const warning = vi.mocked(prompts.log.warn).mock.calls[0]![0] as string;
    expect(warning).toContain('…and');
    expect(warning).toContain('more');
    // Exactly MAX_LISTED bullet lines are shown.
    expect(warning.split('\n').filter((l) => l.includes('•')).length).toBe(
      MAX_LISTED,
    );
  });

  it('respects the pharn/ layout (lists paths under pharn/)', async () => {
    const { repo, proj } = dirs(scaffoldRepoPharn);
    write(join(proj, 'pharn/CONSTITUTION.md'));
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    await confirmWriteTargets(repo, proj, selection());
    const warning = vi.mocked(prompts.log.warn).mock.calls[0]![0] as string;
    expect(warning).toContain('pharn/CONSTITUTION.md');
  });
});
