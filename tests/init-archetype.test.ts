import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers.js';

// runInstallArchetype uses clack for progress UI only — mock it so the fixture
// e2e exercises the copy + config-write apply path without a real terminal.
vi.mock('@clack/prompts', () => ({
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
  outro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { detectArchetypesFromProject } =
  await import('../src/lib/detect-archetype.js');
const { parseCapabilityIndex } = await import('../src/lib/capability-index.js');
const { resolveCapabilities } =
  await import('../src/lib/resolve-capabilities.js');
const { runInstallArchetype } =
  await import('../src/steps/install-archetype.js');
const { readPharnConfig } = await import('../src/lib/pharn-config.js');
const { DEFAULT_MODEL_ROUTING } = await import('../src/lib/model-routing.js');
const { readRecords } = await import('../src/lib/install-records.js');
const { collectExpectedInstallPaths } =
  await import('../src/lib/install-manifest.js');
const { sha256File } = await import('../src/lib/hash.js');
const prompts = await import('@clack/prompts');

// The single string runInstallArchetype passed to outro() — the same
// mocked-call read tests/status.test.ts uses for note() bodies. The outro is a
// user-visible claim surface, so its copy is pinned, not just its existence.
function outroBody(): string {
  const call = vi.mocked(prompts.outro).mock.calls.at(-1);
  return (call?.[0] as string | undefined) ?? '';
}

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function cap(role: string, applies: string): string {
  return `---\nname: c\nrole: ${role}\napplies: ${applies}\n---\n# c\n`;
}

// A fake fetched pharn-oss clone: two grillers, two lenses (one backend-only, so
// it is skipped for an ssr project), the product + dev surfaces, and the root
// SKILLS_VERSION the archetype flow reads in place of a manifest.
function scaffoldRepo(repo: string): void {
  write(
    join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'),
    cap('griller', '["ssr", "spa"]'),
  );
  write(
    join(repo, 'pharn-pipeline/grillers/security/security.md'),
    cap('griller', '["universal"]'),
  );
  write(
    join(repo, 'pharn-review/n-plus-one/n-plus-one.md'),
    cap('lens', '["backend", "ssr"]'),
  );
  write(
    join(repo, 'pharn-review/path-traversal/path-traversal.md'),
    cap('lens', '["backend"]'),
  );
  write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
  write(join(repo, '.claude/commands/pharn-dev-plan.md'), 'DEV');
  write(join(repo, '.claude/hooks/enforce-writes-scope.cjs'), 'hook');
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'CONSTITUTION.md'), 'C');
  write(join(repo, 'pharn-contracts/finding-shape.md'), 'fs');
  write(join(repo, '.dev/floor/validate.mjs'), 'floor');
  write(join(repo, '.dev/features/x/PLAN.md'), 'DEVPLAN');
  write(join(repo, 'SKILLS_VERSION'), '1.0.0\n');
}

describe('archetype install (fixture e2e)', () => {
  const tmp = useTmpDir();

  it('detect → resolve → install: correct capabilities, dev-only excluded, config written', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    // Fixture project: a Next.js app → archetype ssr.
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );

    const { archetypes } = detectArchetypesFromProject(proj);
    expect(archetypes).toEqual(['ssr']);

    const index = parseCapabilityIndex(repo);
    const selection = resolveCapabilities(archetypes, index);
    // ssr selects: a11y (ssr), security (universal), n-plus-one (ssr). Skips the
    // backend-only path-traversal lens — the headline invariant.
    expect(selection.selected.map((c) => c.name).sort()).toEqual([
      'a11y',
      'n-plus-one',
      'security',
    ]);
    expect(selection.skipped.map((c) => c.name)).toEqual(['path-traversal']);

    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    // Selected capabilities installed; the skipped backend-only lens is absent.
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'))).toBe(
      true,
    );
    expect(
      existsSync(join(proj, 'pharn-review/n-plus-one/n-plus-one.md')),
    ).toBe(true);
    expect(existsSync(join(proj, 'pharn-review/path-traversal'))).toBe(false);

    // Product command present; dev-only command + feature tree excluded.
    expect(existsSync(join(proj, '.claude/commands/pharn-plan.md'))).toBe(true);
    expect(existsSync(join(proj, '.claude/commands/pharn-dev-plan.md'))).toBe(
      false,
    );
    expect(existsSync(join(proj, '.dev/floor/validate.mjs'))).toBe(true);
    expect(existsSync(join(proj, '.dev/features'))).toBe(false);

    // pharn.config.json written with the archetype fields.
    const config = readPharnConfig(proj);
    expect(config).not.toBeNull();
    expect(config!.archetypes).toEqual(['ssr']);
    expect(config!.skillsVersion).toBe('1.0.0');
    expect(config!.commit).toBe('sha123');
    expect(config!.modules).toEqual([]);
    expect(config!.constitution).toBeUndefined();
    // Model routing written on every fresh install (archetype path too).
    expect(config!.models).toEqual(DEFAULT_MODEL_ROUTING);
    // The spend-safe default: review resolves to opus-4-8/high, not fable-5/max.
    expect(config!.models?.stages.review).toEqual({
      model: 'opus-4-8',
      effort: 'high',
    });
    // The outro still RENDERS the routing it just wrote...
    const outro = outroBody();
    expect(outro).toContain('Models per stage');
    expect(outro).toContain('review');
    // ...but no longer invites an edit that would change which model a stage
    // runs: nothing installed reads models.stages yet. Both directions are
    // pinned — the old promise gone AND the honest replacement present — so a
    // later copy edit cannot quietly re-promise the effect with the test green.
    expect(outro).not.toContain('Change per-stage routing anytime');
    expect(outro).toContain('no installed stage reads it yet');
    // Everything a fresh install writes came from archetype resolution, so it is
    // `auto` — update owns it. Only `pharn add` writes `manual`.
    expect(config!.capabilities).toEqual([
      { name: 'a11y', role: 'griller', source: 'auto' },
      { name: 'security', role: 'griller', source: 'auto' },
      { name: 'n-plus-one', role: 'lens', source: 'auto' },
    ]);
  });

  // A fresh install MUST leave a record for every file it wrote. Without it the
  // very first `pharn update` finds no baseline, labels everything
  // `unverifiable`, and stops updating anything — the feature's headline
  // guarantee turned inside out.
  it('records a hash for EVERY file the install wrote, stamped to match the config', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );

    const { archetypes } = detectArchetypesFromProject(proj);
    const selection = resolveCapabilities(
      archetypes,
      parseCapabilityIndex(repo),
    );
    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    const read = readRecords(proj);
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;

    // Exactly the install manifest — nothing missing, nothing invented.
    const expected = collectExpectedInstallPaths({
      repoDir: repo,
      capabilities: selection.selected.map((c) => ({
        name: c.name,
        role: c.role,
      })),
      layout: 'flat',
    });
    expect(Object.keys(read.store.files).sort()).toEqual(
      [...expected.keys()].sort(),
    );

    // Each hash describes the bytes that actually LANDED (the dest), which is
    // what makes the record un-fakeable by a bad source read.
    for (const rel of expected.keys()) {
      expect(read.store.files[rel]).toBe(sha256File(join(proj, rel)));
    }

    // The stamp matches the config written beside it — that pairing is what
    // detects a store some other tool left behind.
    const config = readPharnConfig(proj)!;
    expect(read.store.skillsVersion).toBe(config.skillsVersion);
    expect(read.store.commit).toBe(config.commit);
  });

  it('does not record the user-owned .claude/settings.json', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    write(join(proj, 'package.json'), '{}');

    const { archetypes } = detectArchetypesFromProject(proj);
    const selection = resolveCapabilities(
      archetypes,
      parseCapabilityIndex(repo),
    );
    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    const read = readRecords(proj);
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect(read.store.files['.claude/settings.json']).toBeUndefined();
    // ...even though the install DID write it.
    expect(existsSync(join(proj, '.claude/settings.json'))).toBe(true);
  });

  // THE LIVE REPRO, end to end on a real fixture tree. An untracked WIP directory
  // upstream (no markdown) is a shape pharn-oss's own floor validator does not
  // catch — and before the forward-compatibility contract it aborted the whole
  // install. It must now be skipped and reported, its bytes never copied, while
  // everything else installs exactly as before.
  it('an md-less upstream directory is skipped, reported, and NEVER copied', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    // The WIP dir, with a real file under it so "nothing was copied" is a claim
    // about the fix rather than about an empty directory.
    write(
      join(repo, 'pharn-pipeline/grillers/backwards-compat/NOTES.md'),
      'WIP',
    );
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );

    const { archetypes } = detectArchetypesFromProject(proj);
    const index = parseCapabilityIndex(repo);

    expect(index.unknown).toEqual([
      {
        name: 'backwards-compat',
        role: 'griller',
        subtree: 'pharn-pipeline/grillers',
        reason: expect.stringMatching(
          /missing its markdown/,
        ) as unknown as string,
      },
    ]);
    expect(index.capabilities.map((c) => c.name).sort()).toEqual([
      'a11y',
      'n-plus-one',
      'path-traversal',
      'security',
    ]);

    const selection = resolveCapabilities(archetypes, index);
    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    // The good capabilities landed...
    expect(existsSync(join(proj, 'pharn-pipeline/grillers/a11y/a11y.md'))).toBe(
      true,
    );
    // ...and NOTHING under the unparseable directory did (fail closed on
    // installing), nor is it recorded in pharn.config.json.
    expect(
      existsSync(join(proj, 'pharn-pipeline/grillers/backwards-compat')),
    ).toBe(false);
    expect(
      readPharnConfig(proj)!.capabilities!.map((c) => c.name),
    ).not.toContain('backwards-compat');
  });

  // The outro is the install's only claim surface, and it used to print
  // `PHARN commands + hooks + docs written` unconditionally — so two docs that
  // every install silently dropped still read as success. Each doc copy stays
  // existence-guarded (P7); what changes is that a no-op is now visible.
  async function install(repo: string, proj: string): Promise<void> {
    const { archetypes } = detectArchetypesFromProject(proj);
    const selection = resolveCapabilities(
      archetypes,
      parseCapabilityIndex(repo),
    );
    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');
  }

  function project(proj: string): void {
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );
  }

  it('names the docs it wrote, and warns about the ones the clone did not ship', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo); // ships CONSTITUTION.md only, of the four
    project(proj);
    vi.mocked(prompts.log.warn).mockClear();

    await install(repo, proj);

    const outro = outroBody();
    expect(outro).toContain('1 trusted doc written');
    expect(outro).toContain('CONSTITUTION.md');
    // The old unconditional claim is gone in BOTH its halves: no combined line,
    // and nothing asserts docs landed in .claude/ (they never did).
    expect(outro).not.toContain('commands + hooks + docs written');
    expect(outro).toContain('PHARN commands + hooks written');
    // The three the clone did not ship are NAMED, not silently absent.
    const warned = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(warned).toContain('ARCHITECTURE.md');
    expect(warned).toContain('THREAT-MODEL.md');
    expect(warned).toContain('LIMITS.md');
  });

  // The branch that matters most to this fix, and the one a fixture never
  // reaches by accident: a clone shipping NO trusted doc at all. The whole
  // finding is that an existence-guarded no-op used to read as success, so the
  // zero case must be pinned, not merely reasoned about.
  it('never renders "docs written" when the clone shipped no doc at all', async () => {
    const repo = join(tmp.path(), 'nodocs-repo');
    const proj = join(tmp.path(), 'nodocs-proj');
    scaffoldRepo(repo);
    rmSync(join(repo, 'CONSTITUTION.md'));
    project(proj);
    vi.mocked(prompts.log.warn).mockClear();

    await install(repo, proj);

    const outro = outroBody();
    expect(outro).toContain('no trusted docs written');
    expect(outro).not.toContain('docs written →');
    expect(outro).not.toContain('1 trusted doc');
    // The install still SUCCEEDS — the guard is deliberate (P7); only its
    // silence was the defect.
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(true);
    const warned = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(warned).toContain('CONSTITUTION.md');
    expect(warned).toContain('LIMITS.md');
  });

  it('reports all four and warns about none when the clone ships them all', async () => {
    const repo = join(tmp.path(), 'full-repo');
    const proj = join(tmp.path(), 'full-proj');
    scaffoldRepo(repo);
    write(join(repo, 'ARCHITECTURE.md'), 'A');
    write(join(repo, 'THREAT-MODEL.md'), 'T');
    write(join(repo, 'LIMITS.md'), 'L');
    project(proj);
    vi.mocked(prompts.log.warn).mockClear();

    await install(repo, proj);

    expect(outroBody()).toContain('4 trusted docs written');
    // A flat clone puts all four at the project root, and this is the shape the
    // pharn layout now mirrors for the two docs upstream keeps there.
    expect(readFileSync(join(proj, 'THREAT-MODEL.md'), 'utf8')).toBe('T');
    expect(readFileSync(join(proj, 'LIMITS.md'), 'utf8')).toBe('L');
    const warned = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(warned).not.toContain('not installed');
  });
});

// PHARN-11: re-running `init` over an existing install used to overwrite local
// edits with no copy anywhere, and rewrote the config from archetype
// resolution alone — dropping every capability the user had added by hand.
describe('re-running init over an existing install (PHARN-11)', () => {
  const tmp = useTmpDir();

  async function firstInstall(repo: string, proj: string) {
    scaffoldRepo(repo);
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );
    const { archetypes } = detectArchetypesFromProject(proj);
    const index = parseCapabilityIndex(repo);
    const selection = resolveCapabilities(archetypes, index);
    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');
    return { archetypes, selection };
  }

  it('copies an edited file to .pharn-backup/ before overwriting it, and names the directory', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    const { archetypes, selection } = await firstInstall(repo, proj);
    write(join(proj, '.claude/commands/pharn-plan.md'), 'MY LOCAL EDIT');
    vi.mocked(prompts.log.info).mockClear();

    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    const backups = readdirSync(join(proj, '.pharn-backup'));
    expect(backups).toHaveLength(1);
    expect(
      readFileSync(
        join(
          proj,
          '.pharn-backup',
          backups[0]!,
          '.claude/commands/pharn-plan.md',
        ),
        'utf8',
      ),
    ).toBe('MY LOCAL EDIT');
    expect(
      readFileSync(join(proj, '.claude/commands/pharn-plan.md'), 'utf8'),
    ).toBe('plan');
    const info = vi
      .mocked(prompts.log.info)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(info).toContain(`.pharn-backup/${backups[0]!}`);
  });

  it('makes NO backup when nothing was edited (byte-identical is not an edit)', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    const { archetypes, selection } = await firstInstall(repo, proj);

    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');

    expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
  });

  it('records the carried-over manual capabilities as `manual`', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    const { archetypes, selection } = await firstInstall(repo, proj);
    const withManual = {
      ...selection,
      selected: [
        ...selection.selected,
        { name: 'path-traversal', role: 'lens' as const, matched: [] },
      ],
    };

    await runInstallArchetype(
      repo,
      proj,
      archetypes,
      withManual,
      'sha123',
      new Set(['lens:path-traversal']),
    );

    const caps = readPharnConfig(proj)!.capabilities!;
    expect(caps).toContainEqual({
      name: 'path-traversal',
      role: 'lens',
      source: 'manual',
    });
    expect(caps.filter((c) => c.source === 'manual')).toHaveLength(1);
    expect(
      existsSync(join(proj, 'pharn-review/path-traversal/path-traversal.md')),
    ).toBe(true);
  });
});

// Upstream pharn-oss (6.15.0+) reads top-level keys this CLI does not own and
// users add by hand: `testResults` (the per-test results runners `/pharn-test`
// and `/pharn-verify` read — without it `/pharn-loop` stops `blocked:
// no-test-runner`) and `ship.requireAttestation`. add/update/remove keep them
// (readPharnConfig's spread); a re-run init rebuilt the config from its own
// fields alone and dropped them.
describe('re-running init keeps the config keys pharn does not own', () => {
  const tmp = useTmpDir();

  const testResults = { test: 'vitest-json', 'test:e2e': 'playwright-json' };
  const ship = { requireAttestation: true };

  async function install(repo: string, proj: string): Promise<void> {
    const { archetypes } = detectArchetypesFromProject(proj);
    const selection = resolveCapabilities(
      archetypes,
      parseCapabilityIndex(repo),
    );
    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');
  }

  async function firstInstall(repo: string, proj: string): Promise<void> {
    scaffoldRepo(repo);
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );
    await install(repo, proj);
  }

  const configFile = (proj: string): string => join(proj, 'pharn.config.json');
  const readRaw = (proj: string): Record<string, unknown> =>
    JSON.parse(readFileSync(configFile(proj), 'utf8')) as Record<
      string,
      unknown
    >;
  // Hand-edit the installed config, the way upstream's README says to.
  const handEdit = (
    proj: string,
    edit: (config: Record<string, unknown>) => void,
  ): void => {
    const config = readRaw(proj);
    edit(config);
    writeFileSync(configFile(proj), JSON.stringify(config, null, 2));
  };

  it('keeps a valid testResults block (and ship) from the config it replaces', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    await firstInstall(repo, proj);
    const cliKeys = Object.keys(readRaw(proj));
    handEdit(proj, (c) => {
      c.testResults = testResults;
      c.ship = ship;
    });

    await install(repo, proj);

    const written = readRaw(proj);
    expect(written.testResults).toEqual(testResults);
    expect(written.ship).toEqual(ship);
    // Verbatim, and nothing else: the fresh install's own keys plus exactly the
    // two the user wrote.
    expect(Object.keys(written).sort()).toEqual(
      [...cliKeys, 'ship', 'testResults'].sort(),
    );
    // Still a config every other command loads, carried keys included.
    expect(readPharnConfig(proj)).toMatchObject({ testResults, ship });
  });

  it('never carries a key pharn owns — init rewrites every one of them', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    await firstInstall(repo, proj);
    const fresh = readRaw(proj);
    handEdit(proj, (c) => {
      c.testResults = testResults;
      // State an earlier run recorded, stale the moment init reinstalls.
      c.pharnVersion = '0.0.1';
      c.skillsVersion = '0.0.1';
      c.repo = 'someone/else';
      c.commit = 'stale-sha';
      c.pendingSkillsVersion = '0.0.2';
      c.frozenCapabilities = ['lens:path-traversal'];
      c.layout = 'pharn';
      c.archetypes = ['backend'];
      c.capabilities = [
        { name: 'path-traversal', role: 'lens', source: 'auto' },
      ];
      c.models = {
        default: { model: 'haiku-4-5', effort: 'low' },
        stages: {},
      };
      c.seam = { resolutionOrder: ['ask'] };
      // Module-era fields: nothing writes them any more, but they are still
      // pharn's, not the user's.
      c.modules = [{ name: 'core', version: '1.0.0' }];
      c.constitution = 'minimal';
      c.isMultiTenant = true;
      c.stackAnswers = { db: 'postgres' };
      c.installedSkills = [{ skill: 'x', from: 'y' }];
    });

    await install(repo, proj);

    // Exactly what a fresh install writes, plus the one key pharn does not own.
    expect({ ...readRaw(proj), installedAt: null }).toEqual({
      ...fresh,
      installedAt: null,
      testResults,
    });
  });

  // The recovery path pharn itself prescribes: a config with no `modules` array
  // is answered by every other command with "No pharn.config.json found. Run
  // `pharn init` first." Taking that advice must not cost the user their keys —
  // nor may a bad hand-edit of a block pharn owns.
  it.each<[string, (config: Record<string, unknown>) => void]>([
    [
      'has no `modules` array ("run `pharn init`")',
      (c) => {
        delete c.modules;
      },
    ],
    [
      'has an invalid `seam` block (a named hand-edit error)',
      (c) => {
        c.seam = { resolutionOrder: ['model'] };
      },
    ],
  ])(
    'keeps them from a config that every other command refuses: it %s',
    async (_label, damage) => {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      await firstInstall(repo, proj);
      handEdit(proj, (c) => {
        c.testResults = testResults;
        damage(c);
      });
      // The premise: the command-side reader will not use this config.
      let usable: boolean;
      try {
        usable = readPharnConfig(proj) !== null;
      } catch {
        usable = false;
      }
      expect(usable).toBe(false);

      await install(repo, proj);

      expect(readRaw(proj).testResults).toEqual(testResults);
      expect(readPharnConfig(proj)).not.toBeNull();
    },
  );

  it.each([
    ['not JSON', '{ "testResults": '],
    ['a JSON array', '[{ "testResults": {} }]'],
    ['a JSON scalar', '"testResults"'],
  ])(
    'carries nothing, and still installs, when the replaced config is %s',
    async (_label, text) => {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      await firstInstall(repo, proj);
      writeFileSync(configFile(proj), text);

      await install(repo, proj);

      const written = readRaw(proj);
      expect(written).not.toHaveProperty('testResults');
      expect(written.skillsVersion).toBe('1.0.0');
    },
  );

  // Carried as DATA. Keys named like Object.prototype members are the user's
  // keys like any other (an `in` test against a plain object would read them as
  // pharn's), and `__proto__` — an OWN key after JSON.parse — must round-trip as
  // a key, never become the written object's prototype.
  it('carries keys named like Object.prototype members as plain data', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    await firstInstall(repo, proj);
    writeFileSync(
      configFile(proj),
      readFileSync(configFile(proj), 'utf8').replace(
        /^\{/,
        '{\n  "__proto__": { "polluted": true },\n  "constructor": "mine",\n  "toString": 1,',
      ),
    );

    await install(repo, proj);

    const written = readRaw(proj);
    expect(
      Object.getOwnPropertyDescriptor(written, '__proto__')?.value,
    ).toEqual({ polluted: true });
    expect(Object.getPrototypeOf(written)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(written, 'constructor')?.value).toBe(
      'mine',
    );
    expect(Object.getOwnPropertyDescriptor(written, 'toString')?.value).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
