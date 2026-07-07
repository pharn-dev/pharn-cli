import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';
import { v2Manifest } from './wizard-fixture.js';
import type {
  InstalledSkill,
  Manifest,
  ManifestModule,
  PharnConfig,
} from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

const fetchRemoteManifest = vi.fn();
const optional: ManifestModule[] = [
  {
    name: 'pharn-pipeline',
    version: '0.5.0',
    required: false,
    dependsOn: [],
    description: 'The spec to ship pipeline',
  },
  {
    name: 'pharn-review',
    version: '0.4.0',
    required: false,
    dependsOn: [],
    description: 'Context-lens review',
  },
];
const stackPacks: ManifestModule[] = [
  {
    name: 'pharn-stack-nextjs',
    version: '0.30.0',
    required: false,
    dependsOn: [],
    exclusiveWith: ['pharn-stack-*'],
    description: 'Next.js stack pack',
  },
];
const categorizeModules = vi.fn(() => ({ core: [], optional, stackPacks }));
// wizard.js + format.js are intentionally NOT mocked — list uses the real
// listSkillAddresses / row / shortDescription against the v2 fixture wizard.
vi.mock('../src/lib/manifest.js', () => ({
  fetchRemoteManifest,
  categorizeModules,
}));

const readPharnConfig = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({
  readPharnConfig,
  // Real discriminator logic so the archetype branch is exercised faithfully.
  isArchetypeConfig: (c: PharnConfig) => Array.isArray(c.capabilities),
}));

const { runList } = await import('../src/commands/list.js');
const prompts = await import('@clack/prompts');

function config(
  modules: string[],
  extra: Partial<PharnConfig> = {},
): PharnConfig {
  return {
    pharnVersion: '0.2.0',
    skillsVersion: '0.68.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    constitution: 'standard',
    modules: modules.map((name) => ({ name, version: '0.1.0' })),
    installedAt: '2026-06-11T00:00:00.000Z',
    ...extra,
  };
}

// The body string passed to the note() call rendered under the given title.
function noteBody(title: string): string {
  const call = vi.mocked(prompts.note).mock.calls.find((c) => c[1] === title);
  return (call?.[0] as string | undefined) ?? '';
}

describe('runList', () => {
  stubProcessExit();
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    categorizeModules.mockReturnValue({ core: [], optional, stackPacks });
    fetchRemoteManifest.mockResolvedValue(v2Manifest());
  });
  afterEach(() => vi.clearAllMocks());

  it('exits(1) when there is no config', async () => {
    readPharnConfig.mockReturnValue(null);
    await expect(runList()).rejects.toMatchObject(new ProcessExit(1));
    expect(fetchRemoteManifest).not.toHaveBeenCalled();
  });

  it('exits(1) when the module catalog cannot be loaded', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core']));
    fetchRemoteManifest.mockRejectedValueOnce(new Error('offline'));
    await expect(runList()).rejects.toMatchObject(new ProcessExit(1));
  });

  it('shows installed modules and flags available updates', async () => {
    readPharnConfig.mockReturnValue(
      config(['pharn-core', 'pharn-pipeline'], { skillsVersion: '0.68.0' }),
    );
    const manifest = v2Manifest();
    manifest.skillsVersion = '0.69.0';
    manifest.modules = manifest.modules.map((m) =>
      m.name === 'pharn-pipeline' ? { ...m, version: '0.9.0' } : m,
    );
    fetchRemoteManifest.mockResolvedValue(manifest);

    await runList();

    const installed = noteBody('INSTALLED');
    expect(installed).toContain('pharn-pipeline');
    expect(installed).toContain('v0.1.0');
    expect(installed).toContain('→ v0.9.0');
    expect(installed).toContain('update available');
  });

  it('omits update markers when everything is current', async () => {
    // v2Manifest is skillsVersion 0.69.0 with every module at 0.1.0.
    readPharnConfig.mockReturnValue(
      config(['pharn-core', 'pharn-pipeline'], { skillsVersion: '0.69.0' }),
    );

    await runList();

    const installed = noteBody('INSTALLED');
    expect(installed).not.toContain('update available');
    expect(installed).not.toContain('→ v');
  });

  it('lists available modules, excluding installed ones (parity with add)', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-pipeline']));

    await runList();

    const available = noteBody('AVAILABLE TO ADD');
    expect(available).toContain('pharn-review');
    expect(available).toContain('pharn-stack-nextjs');
    expect(available).not.toContain('pharn-pipeline');
  });

  it('shows "(all installed)" when no modules are available', async () => {
    categorizeModules.mockReturnValue({
      core: [],
      optional: [optional[0]!],
      stackPacks: [],
    });
    readPharnConfig.mockReturnValue(config(['pharn-core', 'pharn-pipeline']));

    await runList();

    expect(noteBody('AVAILABLE TO ADD')).toContain('(all installed)');
  });

  it('lists available category:skill, excluding installed skills', async () => {
    readPharnConfig.mockReturnValue(
      config(['pharn-core'], {
        installedSkills: [
          { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
        ],
      }),
    );

    await runList();

    const available = noteBody('AVAILABLE TO ADD');
    expect(available).toContain('orm:drizzle');
    expect(available).toContain('db:neon');
    expect(available).not.toContain('orm:prisma');

    const installed = noteBody('INSTALLED');
    expect(installed).toContain('prisma');
    expect(installed).toContain('pharn-skills-orm/skills/prisma');
  });

  it('shows "(all installed)" for skills when every wizard skill is installed', async () => {
    const all: InstalledSkill[] = [
      'pharn-skills-db/skills/neon',
      'pharn-skills-orm/skills/drizzle',
      'pharn-skills-orm/skills/prisma',
      'pharn-skills-auth/skills/better-auth',
      'pharn-skills-auth/skills/clerk',
      'pharn-skills-auth/skills/supabase-auth',
      'pharn-skills-email/skills/resend',
      'pharn-skills-payments/skills/stripe',
    ].map((from) => ({ skill: from.split('/').pop()!, from }));
    readPharnConfig.mockReturnValue(
      config(['pharn-core'], { installedSkills: all }),
    );

    await runList();

    const available = noteBody('AVAILABLE TO ADD');
    expect(available).toContain('SKILLS');
    expect(available).toContain('(all installed)');
    expect(available).not.toContain('orm:');
  });

  it('renders an archetype install offline, WITHOUT fetching the manifest', async () => {
    readPharnConfig.mockReturnValue(
      config([], {
        skillsVersion: '1.0.0',
        archetypes: ['ssr'],
        capabilities: [
          { name: 'a11y', role: 'griller' },
          { name: 'security', role: 'griller' },
          { name: 'n-plus-one', role: 'lens' },
        ],
      }),
    );

    await expect(runList()).resolves.toBeUndefined();

    // The crash point (manifest fetch) is never reached for an archetype config.
    expect(fetchRemoteManifest).not.toHaveBeenCalled();
    const installed = noteBody('INSTALLED (archetype)');
    expect(installed).toContain('ssr');
    expect(installed).toContain('a11y');
    expect(installed).toContain('security');
    expect(installed).toContain('n-plus-one');
    expect(installed).toContain('v1.0.0');
  });

  it('handles a schemaVersion 1 manifest with no skills section', async () => {
    const manifest: Manifest = {
      schemaVersion: 1,
      skillsVersion: '0.70.0',
      modules: [
        {
          name: 'pharn-core',
          version: '0.1.0',
          required: true,
          dependsOn: [],
          description: 'core',
        },
      ],
    };
    fetchRemoteManifest.mockResolvedValue(manifest);
    readPharnConfig.mockReturnValue(config(['pharn-core']));

    await expect(runList()).resolves.toBeUndefined();

    expect(noteBody('AVAILABLE TO ADD')).not.toContain('SKILLS');
    expect(noteBody('INSTALLED')).not.toContain('SKILLS');
  });
});

describe('runList --json', () => {
  stubProcessExit();
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    categorizeModules.mockReturnValue({ core: [], optional, stackPacks });
    fetchRemoteManifest.mockResolvedValue(v2Manifest());
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('emits a single JSON object and no decorative output', async () => {
    readPharnConfig.mockReturnValue(
      config(['pharn-core', 'pharn-pipeline'], {
        skillsVersion: '0.68.0',
        installedSkills: [
          { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
        ],
      }),
    );

    await runList({ json: true });

    expect(prompts.intro).not.toHaveBeenCalled();
    expect(prompts.outro).not.toHaveBeenCalled();
    expect(prompts.note).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(payload).toMatchObject({
      skillsVersion: '0.68.0',
      latestSkillsVersion: '0.69.0',
    });
    expect(payload.installed.modules).toContainEqual({
      name: 'pharn-pipeline',
      version: '0.1.0',
      latest: '0.1.0',
    });
    expect(payload.installed.skills).toEqual([
      { skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' },
    ]);
    const addrs = payload.available.skills.map(
      (s: { category: string; skill: string }) => `${s.category}:${s.skill}`,
    );
    expect(addrs).toContain('orm:drizzle');
    expect(addrs).not.toContain('orm:prisma');
  });

  it('emits an archetype-mode JSON object with no manifest fetch', async () => {
    readPharnConfig.mockReturnValue(
      config([], {
        skillsVersion: '1.0.0',
        archetypes: ['ssr'],
        capabilities: [{ name: 'a11y', role: 'griller' }],
      }),
    );

    await runList({ json: true });

    expect(fetchRemoteManifest).not.toHaveBeenCalled();
    expect(prompts.note).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(payload).toEqual({
      mode: 'archetype',
      skillsVersion: '1.0.0',
      archetypes: ['ssr'],
      capabilities: [{ name: 'a11y', role: 'griller' }],
    });
  });

  it('keeps stdout clean and exits(1) when there is no config', async () => {
    readPharnConfig.mockReturnValue(null);
    await expect(runList({ json: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
  });

  it('keeps stdout clean and exits(1) when the fetch fails', async () => {
    readPharnConfig.mockReturnValue(config(['pharn-core']));
    fetchRemoteManifest.mockRejectedValueOnce(new Error('offline'));
    await expect(runList({ json: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('offline');
  });
});
