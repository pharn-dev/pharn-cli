import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessExit,
  restoreTTY,
  setTTY,
  snapshotTree,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';

// `pharn init --yes`: a real install without prompts, ONLY into a project where
// none of its write targets exists. It never answers the overwrite question —
// with anything to overwrite it refuses, before the lock and again under it.

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  note: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  select: vi.fn(async () => 'install'),
  confirm: vi.fn(async () => true),
  isCancel: () => false,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
}));
vi.mock('../src/lib/banner.js', () => ({ showBanner: vi.fn() }));

const fetchRepo = vi.fn();
const cleanup = vi.fn();
vi.mock('../src/lib/repo.js', () => ({
  fetchRepo: async (source: unknown) => ({
    source,
    ...(await fetchRepo(source)),
  }),
}));
vi.mock('../src/lib/release.js', async () => ({
  ...(await vi.importActual<typeof import('../src/lib/release.js')>(
    '../src/lib/release.js',
  )),
  resolveSource: vi.fn(async () => ({ kind: 'main' as const })),
}));
// A pass-through lock, so a case can make a target appear INSIDE it — after the
// pre-lock check, before the install.
const beforeLockedWork = vi.fn();
vi.mock('../src/lib/project-lock.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/lib/project-lock.js')
  >('../src/lib/project-lock.js');
  return {
    ...actual,
    withProjectLock: (
      cwd: string,
      cmd: string,
      fn: () => Promise<unknown> | unknown,
    ) =>
      actual.withProjectLock(cwd, cmd, () => {
        beforeLockedWork();
        return fn();
      }),
  };
});

const { runInit } = await import('../src/commands/init.js');
const prompts = await import('@clack/prompts');

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function cap(role: string, applies: string): string {
  return `---\nname: c\nrole: ${role}\napplies: ${applies}\n---\n# c\n`;
}

function fixture(root: string): { repo: string; proj: string } {
  const repo = join(root, 'repo');
  const proj = join(root, 'proj');
  write(
    join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'),
    cap('griller', '["universal"]'),
  );
  write(
    join(repo, 'pharn-review/n-plus-one/n-plus-one.md'),
    cap('lens', '["backend"]'),
  );
  write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'CONSTITUTION.md'), 'C');
  write(join(repo, 'SKILLS_VERSION'), '1.0.0\n');
  write(join(proj, 'package.json'), '{}');
  mkdirSync(join(proj, '.git'));
  return { repo, proj };
}

async function init(
  repo: string,
  proj: string,
  opts: Parameters<typeof runInit>[0],
): Promise<void> {
  fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(proj);
  try {
    await runInit(opts);
  } finally {
    cwd.mockRestore();
  }
}

function errors(): string {
  return vi
    .mocked(prompts.log.error)
    .mock.calls.map((c) => stripVTControlCharacters(String(c[0])))
    .join('\n');
}

describe('pharn init --yes', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  beforeEach(() => setTTY(undefined, undefined));
  afterEach(() => {
    vi.clearAllMocks();
    restoreTTY();
  });

  it('installs a fresh project off a TTY, with no prompt', async () => {
    const { repo, proj } = fixture(tmp.path());
    await init(repo, proj, { yes: true });

    expect(prompts.select).not.toHaveBeenCalled();
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(true);
    expect(existsSync(join(proj, 'pharn.records.json'))).toBe(true);
    expect(
      readFileSync(join(proj, '.claude/commands/pharn-plan.md'), 'utf8'),
    ).toBe('plan');
    // The summary is still printed, so a CI log says what was installed.
    const summary = vi
      .mocked(prompts.note)
      .mock.calls.map((c) => String(c[0]))
      .find((b) => b.includes('PHARN Install Summary'));
    expect(summary).toContain('a11y (griller)');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  // F-17: `--yes` composes with `--archetype` — installed and RECORDED for the
  // flag, the summary printed with its origin.
  it('`--yes --archetype backend` installs and records the flag’s archetypes', async () => {
    const { repo, proj } = fixture(tmp.path());
    await init(repo, proj, { yes: true, archetypes: ['backend'] });

    expect(prompts.select).not.toHaveBeenCalled();
    expect(prompts.confirm).not.toHaveBeenCalled();
    const config = JSON.parse(
      readFileSync(join(proj, 'pharn.config.json'), 'utf8'),
    ) as { archetypes: string[]; capabilities: { name: string }[] };
    expect(config.archetypes).toEqual(['backend']);
    expect(config.capabilities.map((c) => c.name).sort()).toEqual([
      'a11y',
      'n-plus-one',
    ]);
    const summary = vi
      .mocked(prompts.note)
      .mock.calls.map((c) => stripVTControlCharacters(String(c[0])))
      .find((b) => b.includes('PHARN Install Summary'))!;
    expect(summary).toMatch(/Archetypes \(--archetype\)\s+backend/);
    expect(summary).toContain('detection found lib (not used)');
  });

  it('never prompts in a TTY either', async () => {
    setTTY(true, true);
    const { repo, proj } = fixture(tmp.path());
    await init(repo, proj, { yes: true });
    expect(prompts.select).not.toHaveBeenCalled();
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(true);
  });

  it('refuses when any target exists — exit 1, nothing written, the targets named', async () => {
    const { repo, proj } = fixture(tmp.path());
    write(join(proj, '.claude/commands/pharn-plan.md'), 'mine');
    const before = snapshotTree(proj);

    const err = await init(repo, proj, { yes: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ProcessExit);
    expect((err as ProcessExit).code).toBe(1);
    expect(snapshotTree(proj)).toEqual(before);
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(beforeLockedWork).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    const msg = errors();
    expect(msg).toContain(
      '.claude/commands/pharn-plan.md (differs from upstream)',
    );
    expect(msg).toContain('pharn init --dry-run');
  });

  it('refuses a re-install (pharn.config.json alone) and points to pharn update', async () => {
    const { repo, proj } = fixture(tmp.path());
    await init(repo, proj, { yes: true });
    vi.clearAllMocks();
    const before = snapshotTree(proj);

    const err = await init(repo, proj, { yes: true }).catch((e) => e);
    expect((err as ProcessExit).code).toBe(1);
    expect(snapshotTree(proj)).toEqual(before);
    expect(errors()).toContain('pharn.config.json');
    expect(errors()).toContain('pharn update');
  });

  it('refuses under the lock when a target appears after the first check', async () => {
    const { repo, proj } = fixture(tmp.path());
    beforeLockedWork.mockImplementationOnce(() =>
      write(join(proj, 'CONSTITUTION.md'), 'appeared'),
    );

    const err = await init(repo, proj, { yes: true }).catch((e) => e);
    expect((err as ProcessExit).code).toBe(1);
    expect(beforeLockedWork).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(proj, 'CONSTITUTION.md'), 'utf8')).toBe(
      'appeared',
    );
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);
    expect(existsSync(join(proj, '.claude/commands/pharn-plan.md'))).toBe(
      false,
    );
    expect(errors()).toContain('CONSTITUTION.md');
    // The refusal is thrown inside the lock, which is released on the way out.
    expect(existsSync(join(proj, '.pharn.lock'))).toBe(false);
  });

  it('refuses a dangling symlink at a target (the pre-flight), writing nothing', async () => {
    const { repo, proj } = fixture(tmp.path());
    mkdirSync(join(proj, '.claude/commands'), { recursive: true });
    symlinkSync(
      join(tmp.path(), 'nowhere'),
      join(proj, '.claude/commands/pharn-plan.md'),
    );
    const before = snapshotTree(proj);

    const err = await init(repo, proj, { yes: true }).catch((e) => e);
    expect((err as ProcessExit).code).toBe(1);
    expect(snapshotTree(proj)).toEqual(before);
    expect(beforeLockedWork).not.toHaveBeenCalled();
  });

  it('plain init off a TTY still refuses, naming --yes and --dry-run', async () => {
    const { repo, proj } = fixture(tmp.path());
    const err = await init(repo, proj, {}).catch((e) => e);
    expect((err as ProcessExit).code).toBe(1);
    expect(fetchRepo).not.toHaveBeenCalled();
    const msg = errors();
    expect(msg).toContain('--yes');
    expect(msg).toContain('--dry-run');
    expect(msg).toContain('never overwrites');
  });
});
