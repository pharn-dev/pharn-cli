import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  select: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

// Only fetchRepo is mocked — §B exercises the REAL readManifest /
// readModuleManifest / resolveModules against a real tmp repo on disk.
const cleanup = vi.fn();
const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));

const readPharnConfig = vi.fn();
const writePharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  readPharnConfig,
  writePharnConfig,
  toInstalledModules: (m: { name: string; version: string }[]) =>
    m.map(({ name, version }) => ({ name, version })),
}));

const { runRemove } = await import('../src/commands/remove.js');
const prompts = await import('@clack/prompts');

function write(path: string, content = 'x'): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

interface ModSpec {
  name: string;
  version?: string;
  required?: boolean;
  dependsOn?: string[];
  exclusiveWith?: string[];
  installs?: Record<string, string>;
  files?: Record<string, string>;
}

// Build a real fetched-repo tree: manifest.json catalog + each module's
// module.json + its source files.
function scaffoldRepo(repoDir: string, mods: ModSpec[]): void {
  write(
    join(repoDir, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      skillsVersion: '0.70.0',
      modules: mods.map((m) => ({
        name: m.name,
        version: m.version ?? '0.1.0',
        required: m.required ?? false,
        dependsOn: m.dependsOn ?? [],
        ...(m.exclusiveWith ? { exclusiveWith: m.exclusiveWith } : {}),
        description: m.name,
      })),
    }),
  );
  for (const m of mods) {
    if (m.installs) {
      write(
        join(repoDir, m.name, 'module.json'),
        JSON.stringify({
          name: m.name,
          version: m.version ?? '0.1.0',
          required: m.required ?? false,
          dependsOn: m.dependsOn ?? [],
          description: m.name,
          installs: m.installs,
        }),
      );
    }
    for (const [p, content] of Object.entries(m.files ?? {})) {
      write(join(repoDir, m.name, p), content);
    }
  }
}

function config(
  modules: string[],
  extra: Partial<PharnConfig> = {},
): PharnConfig {
  return {
    pharnVersion: '0.2.0',
    skillsVersion: '0.70.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    constitution: 'standard',
    modules: modules.map((name) => ({ name, version: '0.1.0' })),
    installedAt: '2026-06-11T00:00:00.000Z',
    ...extra,
  };
}

// A core + review repo where both modules merge into commands/, used by the
// precise-deletion and picker tests.
function scaffoldCoreReview(repoDir: string, projDir: string): void {
  scaffoldRepo(repoDir, [
    {
      name: 'pharn-core',
      required: true,
      installs: { commands: 'commands/', skills: 'skills/' },
      files: { 'commands/pharn-init.md': 'init', 'skills/base/SKILL.md': 's' },
    },
    {
      name: 'pharn-review',
      dependsOn: ['pharn-core'],
      installs: { commands: 'commands/', rules: 'rules/' },
      // rules/ has a nested subdir so removal exercises the recursive walk.
      files: { 'commands/pharn-review.md': 'rev', 'rules/sub/lens.md': 'l' },
    },
  ]);
  write(join(projDir, '.claude', 'commands', 'pharn-init.md'), 'init');
  write(join(projDir, '.claude', 'commands', 'pharn-review.md'), 'rev');
  write(join(projDir, '.claude', 'skills', 'base', 'SKILL.md'), 's');
  write(join(projDir, '.claude', 'rules', 'sub', 'lens.md'), 'l');
}

function lastWritten(): PharnConfig {
  return writePharnConfig.mock.calls[0]![1] as PharnConfig;
}

const tmp = useTmpDir();
let proj = '';
let repo = '';

describe('runRemove', () => {
  stubProcessExit();
  beforeEach(() => {
    proj = join(tmp.path(), 'proj');
    repo = join(tmp.path(), 'repo');
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    fetchRepo.mockResolvedValue({ dir: repo, cleanup });
  });
  afterEach(() => vi.clearAllMocks());

  it('exits(1) when there is no config', async () => {
    readPharnConfig.mockReturnValue(null);
    await expect(runRemove('pharn-review')).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  // §A — category:skill removal (no clone, no network) -----------------------

  it('removes an installed skill and leaves siblings + config fields intact', async () => {
    write(join(proj, '.claude', 'skills', 'prisma', 'SKILL.md'), 'p');
    write(join(proj, '.claude', 'skills', 'drizzle', 'SKILL.md'), 'd');
    readPharnConfig.mockReturnValue(
      config(['pharn-core'], {
        stackAnswers: { orm: 'prisma' },
        installedSkills: [
          { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
          { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
        ],
      }),
    );

    await runRemove('orm:prisma');

    expect(existsSync(join(proj, '.claude', 'skills', 'prisma'))).toBe(false);
    expect(
      existsSync(join(proj, '.claude', 'skills', 'drizzle', 'SKILL.md')),
    ).toBe(true);
    // No clone / network on the skill path.
    expect(fetchRepo).not.toHaveBeenCalled();

    const written = lastWritten();
    expect(written.installedSkills).toEqual([
      { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
    ]);
    // stackAnswers + modules are never touched.
    expect(written.stackAnswers).toEqual({ orm: 'prisma' });
    expect(written.modules).toEqual([{ name: 'pharn-core', version: '0.1.0' }]);
  });

  it('drops the config entry even when the skill dir is already gone', async () => {
    readPharnConfig.mockReturnValue(
      config(['pharn-core'], {
        installedSkills: [
          { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
        ],
      }),
    );

    await runRemove('orm:prisma');

    expect(lastWritten().installedSkills).toEqual([]);
  });

  it('no-ops without writing when the skill is not installed', async () => {
    readPharnConfig.mockReturnValue(
      config(['pharn-core'], {
        installedSkills: [
          { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
        ],
      }),
    );

    await runRemove('orm:prisma');

    expect(writePharnConfig).not.toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('lists installed skills (not the manifest) for an unrecognized skill', async () => {
    readPharnConfig.mockReturnValue(
      config(['pharn-core'], {
        installedSkills: [
          { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
        ],
      }),
    );

    await runRemove('foo:bar');

    const msg = vi.mocked(prompts.log.warn).mock.calls[0]![0] as string;
    expect(msg).toContain('orm:drizzle');
    // A manifest-only skill that isn't installed is never offered as valid.
    expect(msg).not.toContain('prisma');
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  // §B — module removal (clones once) ----------------------------------------

  it('refuses to remove pharn-core before any clone', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-review']));
    await expect(runRemove('pharn-core')).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(fetchRepo).not.toHaveBeenCalled();
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('refuses to remove a module that is not installed, before any clone', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core']));
    await expect(runRemove('pharn-review')).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('refuses to remove a module with installed dependents, naming them', async () => {
    scaffoldRepo(repo, [
      { name: 'pharn-core', required: true },
      { name: 'pharn-stack-react', dependsOn: ['pharn-core'] },
      {
        name: 'pharn-stack-nextjs',
        dependsOn: ['pharn-core', 'pharn-stack-react'],
        exclusiveWith: ['pharn-stack-*'],
      },
    ]);
    write(join(proj, '.claude', 'commands', 'init.md'), 'i');
    readPharnConfig.mockReturnValue(
      config(['pharn-core', 'pharn-stack-react', 'pharn-stack-nextjs']),
    );

    await expect(runRemove('pharn-stack-react')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    const msg = vi.mocked(prompts.log.error).mock.calls[0]![0] as string;
    expect(msg).toContain('pharn-stack-nextjs');
    expect(writePharnConfig).not.toHaveBeenCalled();
    // Nothing deleted; clone cleaned up after the post-clone refusal.
    expect(existsSync(join(proj, '.claude', 'commands', 'init.md'))).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('refuses on a transitive dependent (not only direct ones)', async () => {
    // pharn-top → pharn-mid → pharn-base: removing the base must be refused
    // because pharn-top depends on it transitively.
    scaffoldRepo(repo, [
      { name: 'pharn-core', required: true },
      { name: 'pharn-base', dependsOn: ['pharn-core'] },
      { name: 'pharn-mid', dependsOn: ['pharn-base'] },
      { name: 'pharn-top', dependsOn: ['pharn-mid'] },
    ]);
    readPharnConfig.mockReturnValue(
      config(['pharn-core', 'pharn-base', 'pharn-mid', 'pharn-top']),
    );

    await expect(runRemove('pharn-base')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    const msg = vi.mocked(prompts.log.error).mock.calls[0]![0] as string;
    expect(msg).toContain('pharn-mid');
    expect(msg).toContain('pharn-top');
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('deletes only the target files, keeps shared-dir siblings, prunes empties', async () => {
    scaffoldCoreReview(repo, proj);
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-review']));

    await runRemove('pharn-review', { yes: true });

    // review's contributions are gone…
    expect(
      existsSync(join(proj, '.claude', 'commands', 'pharn-review.md')),
    ).toBe(false);
    // …and its now-empty private dir is pruned.
    expect(existsSync(join(proj, '.claude', 'rules'))).toBe(false);
    // core's files in the shared commands/ dir survive.
    expect(existsSync(join(proj, '.claude', 'commands', 'pharn-init.md'))).toBe(
      true,
    );
    expect(
      existsSync(join(proj, '.claude', 'skills', 'base', 'SKILL.md')),
    ).toBe(true);

    expect(lastWritten().modules).toEqual([
      { name: 'pharn-core', version: '0.1.0' },
    ]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('handles a module whose installs maps a single file', async () => {
    scaffoldRepo(repo, [
      {
        name: 'pharn-core',
        required: true,
        installs: { commands: 'commands/' },
        files: { 'commands/init.md': 'i' },
      },
      {
        name: 'pharn-extras',
        dependsOn: ['pharn-core'],
        installs: { 'extras/license': 'license' },
        files: { 'extras/license': 'MIT' },
      },
    ]);
    write(join(proj, '.claude', 'commands', 'init.md'), 'i');
    write(join(proj, '.claude', 'license'), 'MIT');
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-extras']));

    await runRemove('pharn-extras', { yes: true });

    expect(existsSync(join(proj, '.claude', 'license'))).toBe(false);
    expect(existsSync(join(proj, '.claude', 'commands', 'init.md'))).toBe(true);
  });

  it('preserves survivors recorded versions (never resamples the @main manifest)', async () => {
    // Clone @main ships core@0.2.0, but the install recorded 0.1.0. remove
    // deletes files without reinstalling, so it must NOT bump the recorded
    // version — doing so would mask a pending `pharn update`.
    scaffoldRepo(repo, [
      {
        name: 'pharn-core',
        required: true,
        version: '0.2.0',
        installs: { commands: 'commands/' },
        files: { 'commands/init.md': 'i' },
      },
      {
        name: 'pharn-review',
        dependsOn: ['pharn-core'],
        version: '0.2.0',
        installs: { rules: 'rules/' },
        files: { 'rules/lens.md': 'l' },
      },
    ]);
    write(join(proj, '.claude', 'commands', 'init.md'), 'i');
    write(join(proj, '.claude', 'rules', 'lens.md'), 'l');
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-review']));

    await runRemove('pharn-review', { yes: true });

    expect(lastWritten().modules).toEqual([
      { name: 'pharn-core', version: '0.1.0' },
    ]);
  });

  it('refuses to remove a required (non-core) module instead of no-op success', async () => {
    scaffoldRepo(repo, [
      { name: 'pharn-core', required: true },
      {
        name: 'pharn-pipeline',
        required: true,
        dependsOn: ['pharn-core'],
        installs: { commands: 'commands/' },
        files: { 'commands/plan.md': 'p' },
      },
    ]);
    write(join(proj, '.claude', 'commands', 'plan.md'), 'p');
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-pipeline']));

    await expect(
      runRemove('pharn-pipeline', { yes: true }),
    ).rejects.toMatchObject(new ProcessExit(1));

    const msg = vi.mocked(prompts.log.error).mock.calls[0]![0] as string;
    expect(msg).toContain('required');
    expect(writePharnConfig).not.toHaveBeenCalled();
    expect(existsSync(join(proj, '.claude', 'commands', 'plan.md'))).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('never deletes CONSTITUTION.md or the memory bank', async () => {
    scaffoldRepo(repo, [
      {
        name: 'pharn-core',
        required: true,
        installs: { commands: 'commands/' },
        files: { 'commands/init.md': 'i' },
      },
      {
        name: 'pharn-rogue',
        dependsOn: ['pharn-core'],
        installs: { mb: 'memory-bank/' },
        files: { 'mb/architecture-context.md': 'x' },
      },
    ]);
    write(join(proj, '.claude', 'commands', 'init.md'), 'i');
    write(join(proj, '.claude', 'CONSTITUTION.md'), 'user-owned');
    write(
      join(proj, '.claude', 'memory-bank', 'architecture-context.md'),
      'user-owned',
    );
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-rogue']));

    await runRemove('pharn-rogue', { yes: true });

    expect(existsSync(join(proj, '.claude', 'CONSTITUTION.md'))).toBe(true);
    expect(
      existsSync(
        join(proj, '.claude', 'memory-bank', 'architecture-context.md'),
      ),
    ).toBe(true);
  });

  it('asks for confirmation and removes on yes', async () => {
    scaffoldCoreReview(repo, proj);
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-review']));
    vi.mocked(prompts.confirm).mockResolvedValue(true);

    await runRemove('pharn-review');

    expect(prompts.confirm).toHaveBeenCalled();
    expect(
      existsSync(join(proj, '.claude', 'commands', 'pharn-review.md')),
    ).toBe(false);
  });

  it('cancels without deleting or writing when the confirm is declined', async () => {
    scaffoldCoreReview(repo, proj);
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-review']));
    vi.mocked(prompts.confirm).mockResolvedValue(false);

    await expect(runRemove('pharn-review')).rejects.toMatchObject(
      new ProcessExit(0),
    );

    expect(
      existsSync(join(proj, '.claude', 'commands', 'pharn-review.md')),
    ).toBe(true);
    expect(writePharnConfig).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('reports a clean error (not a raw throw) and cleans up when the manifest cannot be read', async () => {
    write(join(repo, 'manifest.json'), 'not json');
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-review']));

    await expect(
      runRemove('pharn-review', { yes: true }),
    ).rejects.toMatchObject(new ProcessExit(1));
    expect(prompts.log.error).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('exits(1) when the clone fails', async () => {
    fetchRepo.mockRejectedValue(new Error('offline'));
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-review']));
    await expect(
      runRemove('pharn-review', { yes: true }),
    ).rejects.toMatchObject(new ProcessExit(1));
  });

  // Interactive picker (no arg) ----------------------------------------------

  it('picker lists only removable items and removes the chosen module', async () => {
    scaffoldCoreReview(repo, proj);
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-review']));
    vi.mocked(prompts.select).mockResolvedValue('pharn-review');

    await runRemove(undefined);

    const options = (
      vi.mocked(prompts.select).mock.calls[0]![0] as {
        options: { value: string }[];
      }
    ).options.map((o) => o.value);
    expect(options).toContain('pharn-review');
    expect(options).not.toContain('pharn-core');

    expect(
      existsSync(join(proj, '.claude', 'commands', 'pharn-review.md')),
    ).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('picker can remove an installed skill', async () => {
    scaffoldRepo(repo, [{ name: 'pharn-core', required: true }]);
    write(join(proj, '.claude', 'skills', 'prisma', 'SKILL.md'), 'p');
    readPharnConfig.mockReturnValue(
      config(['pharn-core'], {
        installedSkills: [
          { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
        ],
      }),
    );
    vi.mocked(prompts.select).mockResolvedValue('orm:prisma');

    await runRemove(undefined);

    expect(existsSync(join(proj, '.claude', 'skills', 'prisma'))).toBe(false);
    expect(lastWritten().installedSkills).toEqual([]);
    // No optional module installed → skill-only picker needs no clone.
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('picker reports nothing to remove when only core is installed', async () => {
    scaffoldRepo(repo, [{ name: 'pharn-core', required: true }]);
    readPharnConfig.mockReturnValue(config(['pharn-core']));

    await runRemove(undefined);

    expect(prompts.select).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalled();
    // Nothing module-shaped to resolve → no wasted clone.
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it('picker cancels cleanly, cleaning up the clone', async () => {
    scaffoldCoreReview(repo, proj);
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-review']));
    vi.mocked(prompts.select).mockResolvedValue(CANCEL);

    await expect(runRemove(undefined)).rejects.toMatchObject(
      new ProcessExit(0),
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(writePharnConfig).not.toHaveBeenCalled();
  });
});
