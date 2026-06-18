import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL, ProcessExit, stubProcessExit } from './helpers.js';
import { v2Manifest } from './wizard-fixture.js';
import type {
  InstalledSkill,
  ManifestModule,
  PharnConfig,
} from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
  confirm: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  outro: vi.fn(),
  select: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRemoteManifest = vi.fn();
const optional: ManifestModule[] = [
  {
    name: 'pharn-pipeline',
    version: '0.5.0',
    required: false,
    dependsOn: [],
    description: 'pipeline',
  },
  {
    name: 'pharn-review',
    version: '0.4.0',
    required: false,
    dependsOn: [],
    description: 'review',
  },
];
const stackPacks: ManifestModule[] = [
  {
    name: 'pharn-stack-nextjs',
    version: '0.30.0',
    required: false,
    dependsOn: [],
    exclusiveWith: ['pharn-stack-*'],
    description: 'nextjs',
  },
];
const categorizeModules = vi.fn(() => ({ core: [], optional, stackPacks }));
// The add prereq gate resolves the union; return prereq-less modules so the gate
// is a no-op (prerequisite enforcement itself is covered in prereqs.test.ts).
const resolveModules = vi.fn((_manifest: unknown, selected: string[]) =>
  selected.map((name) => ({
    name,
    version: '0.1.0',
    required: false,
    dependsOn: [],
    description: name,
  })),
);
vi.mock('../src/lib/manifest.js', () => ({
  fetchRemoteManifest,
  categorizeModules,
  resolveModules,
}));

const fetchAndInstall = vi.fn();
vi.mock('../src/lib/installer.js', () => ({ fetchAndInstall }));

const readPharnConfig = vi.fn();
const writePharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  readPharnConfig,
  writePharnConfig,
  toInstalledModules: (m: { name: string; version: string }[]) =>
    m.map(({ name, version }) => ({ name, version })),
}));

const { runAdd } = await import('../src/commands/add.js');
const prompts = await import('@clack/prompts');

function config(modules: string[]): PharnConfig {
  return {
    pharnVersion: '0.2.0',
    skillsVersion: '0.68.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    constitution: 'standard',
    modules: modules.map((name) => ({ name, version: '0.1.0' })),
    installedAt: '2026-06-11T00:00:00.000Z',
  };
}

describe('runAdd', () => {
  stubProcessExit();
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    fetchRemoteManifest.mockResolvedValue({});
  });
  afterEach(() => vi.clearAllMocks());

  it('exits(1) when there is no config', async () => {
    readPharnConfig.mockReturnValue(null);
    await expect(runAdd(undefined)).rejects.toMatchObject(new ProcessExit(1));
  });

  it('reports when everything is already installed', async () => {
    readPharnConfig.mockReturnValue(
      config([
        'pharn-core',
        'pharn-pipeline',
        'pharn-review',
        'pharn-stack-nextjs',
      ]),
    );
    await runAdd(undefined);
    expect(prompts.outro).toHaveBeenCalledWith(
      'Everything available is already installed.',
    );
    expect(fetchAndInstall).not.toHaveBeenCalled();
  });

  it('reports when the requested module is already installed', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-pipeline']));
    await runAdd('pharn-pipeline');
    expect(prompts.outro).toHaveBeenCalledWith(
      'pharn-pipeline is already installed.',
    );
  });

  it('installs a valid module argument and updates the config', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core']));
    fetchAndInstall.mockResolvedValue({
      skillsVersion: '0.68.1',
      commit: 'new',
      resolved: [
        { name: 'pharn-core', version: '0.2.0' },
        { name: 'pharn-review', version: '0.4.0' },
      ],
    });

    await runAdd('pharn-review');

    expect(fetchAndInstall).toHaveBeenCalledWith({
      claudeDir: '/proj/.claude',
      selected: ['pharn-core', 'pharn-review'],
    });
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect(written).toMatchObject({
      skillsVersion: '0.68.1',
      commit: 'new',
      constitution: 'standard',
    });
  });

  it('prompts for a module when the argument is not addable', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core']));
    vi.mocked(prompts.select).mockResolvedValue('pharn-review');
    fetchAndInstall.mockResolvedValue({
      skillsVersion: '0.68.1',
      commit: 'new',
      resolved: [{ name: 'pharn-review', version: '0.4.0' }],
    });

    await runAdd('pharn-nope');

    expect(prompts.log.warn).toHaveBeenCalled();
    expect(prompts.select).toHaveBeenCalled();
    expect(fetchAndInstall).toHaveBeenCalled();
  });

  it('exits(1) when the install fails', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core']));
    fetchAndInstall.mockRejectedValue(new Error('boom'));
    await expect(runAdd('pharn-review')).rejects.toMatchObject(
      new ProcessExit(1),
    );
  });

  it('exits(1) when the module catalog cannot be loaded', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core']));
    fetchRemoteManifest.mockRejectedValueOnce(new Error('offline'));
    await expect(runAdd('pharn-review')).rejects.toMatchObject(
      new ProcessExit(1),
    );
  });
});

// schemaVersion 2: `add <category>:<skill>`.
function configWithSkills(
  skills: InstalledSkill[],
  stackAnswers?: Record<string, string>,
): PharnConfig {
  return {
    ...config(['pharn-core']),
    ...(stackAnswers ? { stackAnswers } : {}),
    installedSkills: skills,
  };
}

describe('runAdd category:skill', () => {
  stubProcessExit();
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    fetchRemoteManifest.mockResolvedValue(v2Manifest());
  });
  afterEach(() => vi.clearAllMocks());

  function mockInstallOk(): void {
    fetchAndInstall.mockResolvedValue({
      skillsVersion: '0.69.0',
      commit: 'new',
      resolved: [{ name: 'pharn-core', version: '0.2.0' }],
      installedSkills: [],
    });
  }

  it('installs a category:skill and appends it to installedSkills', async () => {
    readPharnConfig.mockReturnValue(configWithSkills([]));
    mockInstallOk();

    await runAdd('orm:prisma');

    expect(fetchAndInstall).toHaveBeenCalledWith({
      claudeDir: '/proj/.claude',
      selected: ['pharn-core'],
      wizardSkills: [
        { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
      ],
    });
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect((written as PharnConfig).installedSkills).toEqual([
      { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
    ]);
  });

  it('no-ops when the skill is already installed', async () => {
    readPharnConfig.mockReturnValue(
      configWithSkills([
        { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
      ]),
    );
    await runAdd('orm:prisma');
    expect(prompts.outro).toHaveBeenCalledWith('prisma is already installed.');
    expect(fetchAndInstall).not.toHaveBeenCalled();
  });

  it('warns on a conflicting sibling, installs on yes, leaves stackAnswers untouched', async () => {
    readPharnConfig.mockReturnValue(
      configWithSkills(
        [{ skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' }],
        { orm: 'drizzle' },
      ),
    );
    vi.mocked(prompts.confirm).mockResolvedValue(true);
    mockInstallOk();

    await runAdd('orm:prisma');

    expect(prompts.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('configured with drizzle'),
      }),
    );
    const [, written] = writePharnConfig.mock.calls[0]!;
    expect((written as PharnConfig).installedSkills).toEqual([
      { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
      { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
    ]);
    // stackAnswers is never auto-edited.
    expect((written as PharnConfig).stackAnswers).toEqual({ orm: 'drizzle' });
  });

  it('cancels when the conflict prompt is declined', async () => {
    readPharnConfig.mockReturnValue(
      configWithSkills([
        { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
      ]),
    );
    vi.mocked(prompts.confirm).mockResolvedValue(false);
    await expect(runAdd('orm:prisma')).rejects.toMatchObject(
      new ProcessExit(0),
    );
    expect(fetchAndInstall).not.toHaveBeenCalled();
  });

  it('exits(1) listing valid options for an unknown skill', async () => {
    readPharnConfig.mockReturnValue(configWithSkills([]));
    await expect(runAdd('orm:sequelize')).rejects.toMatchObject(
      new ProcessExit(1),
    );
    const msg = vi.mocked(prompts.log.error).mock.calls[0]![0] as string;
    expect(msg).toContain('orm:prisma');
  });

  it('exits(1) when the skill install fails', async () => {
    readPharnConfig.mockReturnValue(configWithSkills([]));
    fetchAndInstall.mockRejectedValue(new Error('boom'));
    await expect(runAdd('orm:prisma')).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(writePharnConfig).not.toHaveBeenCalled();
  });

  it('exits(1) when the manifest is schemaVersion 1', async () => {
    readPharnConfig.mockReturnValue(configWithSkills([]));
    fetchRemoteManifest.mockResolvedValue({
      schemaVersion: 1,
      skillsVersion: '0.68.1',
      modules: [],
    });
    await expect(runAdd('orm:prisma')).rejects.toMatchObject(
      new ProcessExit(1),
    );
  });
});
