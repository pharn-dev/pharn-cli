import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessExit,
  restoreTTY,
  setTTY,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';

// runInstallArchetype uses clack for progress UI only — mock it so the fixture
// e2e exercises the copy + config-write apply path without a real terminal.
// The prompt members serve the whole-`init` cases at the end of the file: the
// summary answers "install" and the overwrite confirm answers yes.
vi.mock('@clack/prompts', () => ({
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
  outro: vi.fn(),
  intro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  select: vi.fn(async () => 'install'),
  confirm: vi.fn(async () => true),
  isCancel: () => false,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The whole-`init` cases run the REAL steps; only what leaves the machine or
// the test is stubbed: the network fetch (a fixture clone stands in) and the
// banner.
const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({ fetchRepo }));
vi.mock('../src/lib/banner.js', () => ({ showBanner: vi.fn() }));

// A pass-through spy on the manifest builder, so a run can COUNT how often it
// is computed. A module mock sees only calls that cross a module boundary —
// every caller of it after this fix does.
vi.mock('../src/lib/install-manifest.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/lib/install-manifest.js')>();
  return {
    ...actual,
    collectExpectedInstallPaths: vi.fn(actual.collectExpectedInstallPaths),
  };
});

const { detectArchetypesFromProject } =
  await import('../src/lib/detect-archetype.js');
const { parseCapabilityIndex } = await import('../src/lib/capability-index.js');
const { resolveCapabilities } =
  await import('../src/lib/resolve-capabilities.js');
const { runInstallArchetype } =
  await import('../src/steps/install-archetype.js');
const { readPharnConfig } = await import('../src/lib/pharn-config.js');
const { MODELS_RECORD_KEY, modelsRecordHash, readRecords, writeRecords } =
  await import('../src/lib/install-records.js');
const { collectExpectedInstallPaths } =
  await import('../src/lib/install-manifest.js');
const { sha256File } = await import('../src/lib/hash.js');
const { runInit } = await import('../src/commands/init.js');
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

// pharn-oss's own `models` block, as its root pharn.config.json carries it.
const UPSTREAM_MODELS = {
  stages: {
    default: { model: 'sonnet', effort: 'high' },
    plan: { model: 'opus', effort: 'high' },
    review: { model: 'opus', effort: 'high' },
  },
};

// A fake fetched pharn-oss clone: two grillers, two lenses (one backend-only, so
// it is skipped for an ssr project), the product + dev surfaces, the root
// SKILLS_VERSION the archetype flow reads in place of a manifest, and
// pharn-oss's root pharn.config.json — whose `models` block init copies, and
// whose other keys it must not.
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
  write(
    join(repo, 'pharn.config.json'),
    JSON.stringify({
      _models_stages_note: "pharn-oss's own note — not copied",
      models: UPSTREAM_MODELS,
      ship: { requireAttestation: true },
    }),
  );
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
    // pharn-oss's `models` block, copied verbatim — and nothing else from its
    // root config (its note and its `ship` are pharn-oss's, not the user's).
    expect(config!.models).toEqual(UPSTREAM_MODELS);
    const raw = JSON.parse(
      readFileSync(join(proj, 'pharn.config.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(raw._models_stages_note).toBeUndefined();
    expect(raw.ship).toBeUndefined();
    // The outro shows the block resolved per stage, under a label that says
    // what it is: Claude Code applies each command's own frontmatter, and the
    // block is the source of truth that frontmatter is held to. Both
    // directions are pinned — the old claims gone AND the honest label present.
    const outro = outroBody();
    expect(outro).toContain('Declared model per stage');
    expect(outro).toContain('plan             opus · high');
    expect(outro).toContain('ship             sonnet · high  (default)');
    expect(outro).toContain(
      "Claude Code applies each /pharn-* command's own model:/effort:",
    );
    expect(outro).toContain('node .dev/floor/check-model-config.mjs agreement');
    expect(outro).not.toContain('Models per stage');
    expect(outro).not.toContain('Change per-stage routing anytime');
    expect(outro).not.toMatch(/rout/i);
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

    // Exactly the install manifest, plus the models block it wrote into the
    // config — nothing missing, nothing invented.
    const expected = collectExpectedInstallPaths({
      repoDir: repo,
      capabilities: selection.selected.map((c) => ({
        name: c.name,
        role: c.role,
      })),
      layout: 'flat',
    });
    expect(Object.keys(read.store.files).sort()).toEqual(
      [...expected.keys(), MODELS_RECORD_KEY].sort(),
    );
    // The block's record is the block as written — read back from the config.
    expect(read.store.files[MODELS_RECORD_KEY]).toBe(
      modelsRecordHash(readPharnConfig(proj)!.models),
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

  // pharn-oss owns the `models` block. init copies pharn-oss's — and never
  // invents one, never writes one pharn-oss's rules reject.
  describe('the models block', () => {
    async function installWith(rootConfig: string | null): Promise<string> {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      scaffoldRepo(repo);
      if (rootConfig === null) rmSync(join(repo, 'pharn.config.json'));
      else write(join(repo, 'pharn.config.json'), rootConfig);
      write(join(proj, 'package.json'), '{}');
      const { archetypes } = detectArchetypesFromProject(proj);
      const selection = resolveCapabilities(
        archetypes,
        parseCapabilityIndex(repo),
      );
      await runInstallArchetype(repo, proj, archetypes, selection, 'sha123');
      return proj;
    }
    const rawConfig = (proj: string): Record<string, unknown> =>
      JSON.parse(readFileSync(join(proj, 'pharn.config.json'), 'utf8'));
    const recordKeys = (proj: string): string[] => {
      const read = readRecords(proj);
      return read.kind === 'ok' ? Object.keys(read.store.files) : [];
    };

    // Pre-check P2: pharn-oss's own checker RED-failed the block init used to
    // write, three times. The block init writes now passes it.
    it("writes a block pharn-oss's own checker passes", async () => {
      const proj = await installWith(
        JSON.stringify({ models: UPSTREAM_MODELS }),
      );
      const checker = join(
        import.meta.dirname,
        'fixtures/pharn-oss/check-model-config.mjs',
      );
      const r = spawnSync(
        process.execPath,
        [checker, 'validate', '--config', join(proj, 'pharn.config.json')],
        { encoding: 'utf8' },
      );
      expect(r.stdout).toMatch(/^GREEN/);
      expect(r.status).toBe(0);
    });

    it('writes no models key when pharn-oss ships no block — never invents one', async () => {
      for (const root of [null, '{"ship":{}}', '{"models":null}']) {
        vi.mocked(prompts.outro).mockClear();
        const proj = await installWith(root);
        expect('models' in rawConfig(proj)).toBe(false);
        expect(recordKeys(proj)).not.toContain(MODELS_RECORD_KEY);
        expect(outroBody()).not.toContain('Declared model per stage');
        rmSync(join(tmp.path(), 'proj'), { recursive: true, force: true });
      }
    });

    // Review finding (REVIEW.md, P2): a block too deep to serialize used to
    // throw after the files were copied, leaving no config at all.
    it('finishes the install, with no models key, over a block too deep to copy', async () => {
      const depth = 100_000;
      const proj = await installWith(
        `{"models":{"stages":{"default":{"model":"opus","effort":"high"}},"deep":${'['.repeat(depth)}${']'.repeat(depth)}}}`,
      );
      expect(existsSync(join(proj, 'pharn.config.json'))).toBe(true);
      expect('models' in rawConfig(proj)).toBe(false);
      expect(recordKeys(proj)).not.toContain(MODELS_RECORD_KEY);
    });

    it("writes none, and says why, when pharn-oss's block fails its rules", async () => {
      const RLO = String.fromCharCode(0x202e);
      vi.mocked(prompts.log.warn).mockClear();
      const proj = await installWith(
        JSON.stringify({
          models: {
            stages: {
              default: { model: 'sonnet', effort: 'high' },
              triage: { model: 'opus', effort: 'high' },
              plan: { model: `${RLO}opus`, effort: 'high' },
            },
          },
        }),
      );
      expect('models' in rawConfig(proj)).toBe(false);
      expect(recordKeys(proj)).not.toContain(MODELS_RECORD_KEY);
      const warning = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .find((m) => m.includes('models block'));
      expect(warning).toContain(
        "pharn-oss's models block was not written; this pharn rejects it:",
      );
      expect(warning).toContain('stage "triage" is not a product stage');
      expect(warning).toContain('stage "plan" model "opus" is not an alias');
      expect(warning).toContain('upgrade pharn');
      expect(warning).not.toContain(RLO);
    });
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
        {
          name: 'path-traversal',
          role: 'lens' as const,
          matched: 'manual' as const,
        },
      ],
    };

    await runInstallArchetype(repo, proj, archetypes, withManual, 'sha123', {
      manualKeys: new Set(['lens:path-traversal']),
      kept: [],
      previousStamp: null,
    });

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

  // update's merge row 3 (sticky manual): an entry the user asked for by name
  // stays manual while the archetypes ALSO select it, so a later archetype
  // change cannot quietly drop it.
  it('keeps a manual capability `manual` when the archetypes also select it', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    const { archetypes, selection } = await firstInstall(repo, proj);

    await runInstallArchetype(repo, proj, archetypes, selection, 'sha123', {
      manualKeys: new Set(['griller:a11y']),
      kept: [],
      previousStamp: null,
    });

    const caps = readPharnConfig(proj)!.capabilities!;
    expect(caps.filter((c) => c.name === 'a11y')).toEqual([
      { name: 'a11y', role: 'griller', source: 'manual' },
    ]);
    expect(caps.filter((c) => c.source === 'manual')).toHaveLength(1);
  });

  describe('a kept capability — upstream ships it, this CLI cannot parse it', () => {
    const PERF_FILE = 'pharn-review/perf/perf.md';
    const kept = [
      { name: 'perf', role: 'lens' as const, source: 'manual' as const },
      // No `source` at all: kept VERBATIM, never re-tagged.
      { name: 'legacy', role: 'griller' as const },
    ];

    // A first install, plus perf's file on disk and in the store — as if added
    // by `pharn add` at the same install state.
    async function withPerfInstalled(repo: string, proj: string) {
      const first = await firstInstall(repo, proj);
      write(join(proj, PERF_FILE), 'perf as installed');
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('fixture: records unreadable');
      await writeRecords(proj, {
        ...read.store,
        files: {
          ...read.store.files,
          [PERF_FILE]: sha256File(join(proj, PERF_FILE)),
        },
      });
      return first;
    }

    it('writes the entries back verbatim, lists them in frozenCapabilities, and carries their records', async () => {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      const { archetypes, selection } = await withPerfInstalled(repo, proj);
      const perfHash = sha256File(join(proj, PERF_FILE));

      await runInstallArchetype(repo, proj, archetypes, selection, 'sha456', {
        manualKeys: new Set(),
        kept,
        previousStamp: { skillsVersion: '1.0.0', commit: 'sha123' },
      });

      const config = readPharnConfig(proj)!;
      expect(config.capabilities).toContainEqual(kept[0]);
      expect(config.capabilities).toContainEqual(kept[1]);
      expect(
        config.capabilities!.find((c) => c.name === 'legacy'),
      ).not.toHaveProperty('source');
      expect(config.frozenCapabilities).toEqual([
        'griller:legacy',
        'lens:perf',
      ]);
      // Nothing under it was touched, so its record is still true — and kept.
      expect(readFileSync(join(proj, PERF_FILE), 'utf8')).toBe(
        'perf as installed',
      );
      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('records unreadable');
      expect(read.store.commit).toBe('sha456');
      expect(read.store.files[PERF_FILE]).toBe(perfHash);
    });

    it('carries NO record from a store stamped for a different install state', async () => {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      const { archetypes, selection } = await withPerfInstalled(repo, proj);

      await runInstallArchetype(repo, proj, archetypes, selection, 'sha456', {
        manualKeys: new Set(),
        kept,
        previousStamp: { skillsVersion: '0.9.0', commit: 'older' },
      });

      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('records unreadable');
      expect(read.store.files).not.toHaveProperty([PERF_FILE]);
      // The entry itself is still kept — only the unverifiable record is not.
      expect(readPharnConfig(proj)!.frozenCapabilities).toEqual([
        'griller:legacy',
        'lens:perf',
      ]);
    });

    it('never mints a record for it when there was no store', async () => {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      const { archetypes, selection } = await withPerfInstalled(repo, proj);
      rmSync(join(proj, 'pharn.records.json'));

      await runInstallArchetype(repo, proj, archetypes, selection, 'sha456', {
        manualKeys: new Set(),
        kept,
        previousStamp: { skillsVersion: '1.0.0', commit: 'sha123' },
      });

      const read = readRecords(proj);
      if (read.kind !== 'ok') throw new Error('records unreadable');
      expect(read.store.files).not.toHaveProperty([PERF_FILE]);
    });

    it('writes no frozenCapabilities when nothing is kept', async () => {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      await firstInstall(repo, proj);

      expect(readPharnConfig(proj)!).not.toHaveProperty('frozenCapabilities');
    });

    // The two carry-overs meet in one config write: pharn-owned kept entries
    // (this block) and the keys pharn does not own (the block below).
    it('keeps the entries AND the keys pharn does not own through one re-run', async () => {
      const repo = join(tmp.path(), 'repo');
      const proj = join(tmp.path(), 'proj');
      const { archetypes, selection } = await withPerfInstalled(repo, proj);
      const configFile = join(proj, 'pharn.config.json');
      const raw = JSON.parse(readFileSync(configFile, 'utf8')) as object;
      const testResults = { test: 'vitest-json' };
      writeFileSync(configFile, JSON.stringify({ ...raw, testResults }));

      await runInstallArchetype(repo, proj, archetypes, selection, 'sha456', {
        manualKeys: new Set(),
        kept,
        previousStamp: { skillsVersion: '1.0.0', commit: 'sha123' },
      });

      const written = readPharnConfig(proj)! as unknown as Record<
        string,
        unknown
      >;
      expect(written.frozenCapabilities).toEqual([
        'griller:legacy',
        'lens:perf',
      ]);
      expect(written.capabilities).toContainEqual(kept[0]);
      expect(written.testResults).toEqual(testResults);
    });
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

// Every file under the ONE backup directory a run created, relative to it —
// what the user can get back.
function backedUp(proj: string): string[] {
  const root = join(proj, '.pharn-backup');
  if (!existsSync(root)) return [];
  const dirs = readdirSync(root);
  expect(dirs).toHaveLength(1);
  const dir = join(root, dirs[0]!);
  return (
    readdirSync(dir, { recursive: true, withFileTypes: true }) as {
      isFile(): boolean;
      name: string;
      parentPath: string;
    }[]
  )
    .filter((e) => e.isFile())
    .map((e) =>
      join(e.parentPath, e.name)
        .slice(dir.length + 1)
        .split('\\')
        .join('/'),
    )
    .sort();
}

// A pharn-layout clone (pharn-oss >= 5): capabilities, contracts and the
// constitution under pharn/, the LICENSE still at the root.
function scaffoldPharnRepo(repo: string): void {
  write(
    join(repo, 'pharn/pharn-pipeline/grillers/a11y/a11y.md'),
    cap('griller', '["ssr"]'),
  );
  write(join(repo, 'pharn/pharn-contracts/finding-shape.md'), 'fs');
  write(join(repo, 'pharn/CONSTITUTION.md'), 'C');
  write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'LICENSE'), 'Apache-2.0');
  write(join(repo, 'SKILLS_VERSION'), '1.0.0\n');
}

// A re-run `init` overwrites every file it installs. What it backs up first is
// what `update` would have SKIPPED — its own table, through the records the
// previous install wrote — so an upstream bump alone is not "your edits".
describe('re-running init after an upstream bump — the records decide what is yours', () => {
  const tmp = useTmpDir();
  // The stamp of the config a re-run replaces: the first install's.
  const STAMP = { skillsVersion: '1.0.0', commit: 'sha123' };
  const carry = (
    previousStamp: { skillsVersion: string; commit: string | null } | null,
  ) => ({ manualKeys: new Set<string>(), kept: [], previousStamp });

  async function installed() {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    write(join(repo, 'LICENSE'), 'Apache-2.0');
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
    vi.mocked(prompts.log.info).mockClear();
    return { repo, proj, archetypes, selection };
  }

  // Upstream moves on: two installed files change, and the version with them.
  function bumpUpstream(repo: string): void {
    write(join(repo, '.claude/commands/pharn-plan.md'), 'plan v2');
    write(join(repo, 'CONSTITUTION.md'), 'C v2');
    write(join(repo, 'SKILLS_VERSION'), '1.1.0\n');
  }

  const informed = (): string =>
    vi
      .mocked(prompts.log.info)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');

  it("backs up NOTHING after an upstream bump alone — pharn's own bytes are a clean upgrade", async () => {
    const { repo, proj, archetypes, selection } = await installed();
    bumpUpstream(repo);

    await runInstallArchetype(
      repo,
      proj,
      archetypes,
      selection,
      'sha456',
      carry(STAMP),
    );

    expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
    expect(informed()).not.toContain('Backed up');
    expect(
      readFileSync(join(proj, '.claude/commands/pharn-plan.md'), 'utf8'),
    ).toBe('plan v2');
  });

  it('backs up exactly the ONE file the user changed', async () => {
    const { repo, proj, archetypes, selection } = await installed();
    bumpUpstream(repo);
    write(join(proj, 'CONSTITUTION.md'), 'MY CONSTITUTION');

    await runInstallArchetype(
      repo,
      proj,
      archetypes,
      selection,
      'sha456',
      carry(STAMP),
    );

    expect(backedUp(proj)).toEqual(['CONSTITUTION.md']);
    const [dir] = readdirSync(join(proj, '.pharn-backup'));
    expect(
      readFileSync(
        join(proj, '.pharn-backup', dir!, 'CONSTITUTION.md'),
        'utf8',
      ),
    ).toBe('MY CONSTITUTION');
    expect(readFileSync(join(proj, 'CONSTITUTION.md'), 'utf8')).toBe('C v2');
  });

  it.each<[string, { skillsVersion: string; commit: string | null } | null]>([
    ['there is no previous config', null],
    [
      'the store was stamped for another install state',
      {
        skillsVersion: '0.9.0',
        commit: 'other',
      },
    ],
  ])(
    'backs up EVERY differing file when %s — conservative, never a guess',
    async (_label, stamp) => {
      const { repo, proj, archetypes, selection } = await installed();
      bumpUpstream(repo);

      await runInstallArchetype(
        repo,
        proj,
        archetypes,
        selection,
        'sha456',
        carry(stamp),
      );

      expect(backedUp(proj)).toEqual([
        '.claude/commands/pharn-plan.md',
        'CONSTITUTION.md',
      ]);
    },
  );

  it("backs up an edited PHARN-LICENSE, compared with upstream's LICENSE (flat layout)", async () => {
    const { repo, proj, archetypes, selection } = await installed();
    write(join(proj, 'PHARN-LICENSE'), 'MY LICENSE NOTES');

    await runInstallArchetype(
      repo,
      proj,
      archetypes,
      selection,
      'sha123',
      carry(STAMP),
    );

    expect(backedUp(proj)).toEqual(['PHARN-LICENSE']);
    expect(readFileSync(join(proj, 'PHARN-LICENSE'), 'utf8')).toBe(
      'Apache-2.0',
    );
  });

  it('backs up an edited pharn/LICENSE (pharn layout)', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldPharnRepo(repo);
    mkdirSync(proj, { recursive: true });
    const selection = {
      selected: [
        { name: 'a11y', role: 'griller' as const, matched: ['ssr' as const] },
      ],
      skipped: [],
    };
    await runInstallArchetype(repo, proj, ['ssr'], selection, 'sha123');
    expect(readFileSync(join(proj, 'pharn/LICENSE'), 'utf8')).toBe(
      'Apache-2.0',
    );
    write(join(proj, 'pharn/LICENSE'), 'MY LICENSE NOTES');

    await runInstallArchetype(
      repo,
      proj,
      ['ssr'],
      selection,
      'sha123',
      carry(STAMP),
    );

    expect(backedUp(proj)).toEqual(['pharn/LICENSE']);
  });

  // The records are keyed by PATH. A layout change (flat → pharn/) writes to
  // new paths, which a flat project does not have yet, and leaves the old files
  // where they are (init never deletes) — so it backs up nothing extra. Only a
  // file of the user's own already sitting at one of the new paths has no
  // record there, and that one IS backed up.
  it('a layout change (flat → pharn/) backs up only a file of yours at a new path', async () => {
    const flat = join(tmp.path(), 'flat');
    const relocated = join(tmp.path(), 'relocated');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(flat);
    write(join(flat, 'LICENSE'), 'Apache-2.0');
    scaffoldPharnRepo(relocated);
    mkdirSync(proj, { recursive: true });
    const selection = {
      selected: [
        { name: 'a11y', role: 'griller' as const, matched: ['ssr' as const] },
      ],
      skipped: [],
    };
    await runInstallArchetype(flat, proj, ['ssr'], selection, 'sha123');
    write(join(proj, 'pharn/LICENSE'), 'MY OWN NOTES');

    await runInstallArchetype(
      relocated,
      proj,
      ['ssr'],
      selection,
      'sha456',
      carry(STAMP),
    );

    expect(backedUp(proj)).toEqual(['pharn/LICENSE']);
    expect(readFileSync(join(proj, 'pharn/CONSTITUTION.md'), 'utf8')).toBe('C');
    // The flat copies are left in place — init never deletes.
    expect(existsSync(join(proj, 'CONSTITUTION.md'))).toBe(true);
    expect(existsSync(join(proj, 'PHARN-LICENSE'))).toBe(true);
  });

  it('refuses a project it cannot install into BEFORE backing anything up', async () => {
    // An edit (which would be backed up) AND a type collision (which the
    // install refuses). The refusal used to come after the backup: the user
    // read "Backed up…", nothing was installed, and every retry added another
    // .pharn-backup/ directory.
    const { proj, repo, archetypes, selection } = await installed();
    write(join(proj, '.claude/commands/pharn-plan.md'), 'MY EDIT');
    rmSync(join(proj, 'pharn-contracts'), { recursive: true, force: true });
    write(join(proj, 'pharn-contracts'), 'a FILE where a directory goes');

    await expect(
      runInstallArchetype(
        repo,
        proj,
        archetypes,
        selection,
        'sha123',
        carry(STAMP),
      ),
    ).rejects.toThrow(/Refusing to install: pharn-contracts is in the way/);

    expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
    expect(informed()).not.toContain('Backed up');
    expect(
      readFileSync(join(proj, '.claude/commands/pharn-plan.md'), 'utf8'),
    ).toBe('MY EDIT');
  });

  it('refuses a directory at pharn.records.json before copying anything — no half-install', async () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    write(join(proj, 'package.json'), '{}');
    mkdirSync(join(proj, 'pharn.records.json'));
    const { archetypes } = detectArchetypesFromProject(proj);
    const selection = resolveCapabilities(
      archetypes,
      parseCapabilityIndex(repo),
    );

    await expect(
      runInstallArchetype(repo, proj, archetypes, selection, 'sha123'),
    ).rejects.toThrow(
      /Refusing to install: pharn\.records\.json is in the way/,
    );

    expect(existsSync(join(proj, '.claude'))).toBe(false);
    expect(existsSync(join(proj, 'pharn.config.json'))).toBe(false);
  });
});

// The same guarantees through `runInit` itself — detect, fetch (a fixture
// clone), both prompts, the lock and the install — so the prompt and the
// backup are seen to agree, and the manifest builder can be counted across the
// whole run rather than inside one step.
describe('`pharn init` run twice, through the real steps', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  beforeEach(() => setTTY(true, true));
  afterEach(() => restoreTTY());

  function fixture(): { repo: string; proj: string } {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    scaffoldRepo(repo);
    write(join(repo, 'LICENSE'), 'Apache-2.0');
    write(
      join(proj, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } }),
    );
    mkdirSync(join(proj, '.git'));
    return { repo, proj };
  }

  async function init(repo: string, proj: string, sha: string): Promise<void> {
    fetchRepo.mockResolvedValue({ dir: repo, sha, cleanup: vi.fn() });
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(proj);
    try {
      await runInit();
    } finally {
      cwd.mockRestore();
    }
  }

  function bumpUpstream(repo: string): void {
    write(join(repo, '.claude/commands/pharn-plan.md'), 'plan v2');
    write(join(repo, 'CONSTITUTION.md'), 'C v2');
    write(join(repo, 'SKILLS_VERSION'), '1.1.0\n');
  }

  // The overwrite prompt's warning (the only one that lists paths).
  function overwriteWarning(): string {
    return (
      vi
        .mocked(prompts.log.warn)
        .mock.calls.map((c) => String(c[0]))
        .find((w) => w.includes('already exist and may be overwritten')) ?? ''
    );
  }

  it('computes the install manifest ONCE per run, and marks and backs up nothing after an upstream bump alone', async () => {
    const { repo, proj } = fixture();
    await init(repo, proj, 'sha123');
    bumpUpstream(repo);
    vi.mocked(collectExpectedInstallPaths).mockClear();
    vi.mocked(prompts.log.warn).mockClear();

    await init(repo, proj, 'sha456');

    // Pre-flight (three times), prompt, backup scan, copy and records all
    // share it.
    expect(collectExpectedInstallPaths).toHaveBeenCalledTimes(1);
    const warning = overwriteWarning();
    expect(warning).toContain('.claude/commands/pharn-plan.md');
    expect(warning).not.toContain('(edited)');
    expect(warning).not.toContain('(differs from upstream)');
    expect(warning).not.toContain('.pharn-backup/');
    expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
    const config = readPharnConfig(proj)!;
    expect(config.skillsVersion).toBe('1.1.0');
    expect(config.commit).toBe('sha456');
  });

  it('marks exactly the file the user changed, and backs up exactly that file', async () => {
    const { repo, proj } = fixture();
    await init(repo, proj, 'sha123');
    bumpUpstream(repo);
    write(join(proj, 'CONSTITUTION.md'), 'MY CONSTITUTION');
    vi.mocked(prompts.log.warn).mockClear();

    await init(repo, proj, 'sha456');

    const warning = overwriteWarning();
    const bullets = warning
      .split('\n')
      .filter((l) => l.trimStart().startsWith('•'));
    expect(bullets[0]).toContain('CONSTITUTION.md (edited)');
    expect(bullets.filter((b) => b.includes('('))).toHaveLength(1);
    expect(warning).toContain(
      '1 of them changed since pharn wrote it (your edits).',
    );
    expect(backedUp(proj)).toEqual(['CONSTITUTION.md']);
  });

  it('refuses a project it cannot install into BEFORE asking to overwrite anything', async () => {
    // A re-install (so the overwrite prompt has files to list), an edit, and a
    // type collision the install refuses. The refusal used to come only after
    // the user had answered yes to "Continue and overwrite?".
    const { repo, proj } = fixture();
    await init(repo, proj, 'sha123');
    write(join(proj, '.claude/commands/pharn-plan.md'), 'MY EDIT');
    rmSync(join(proj, 'pharn-contracts'), { recursive: true, force: true });
    write(join(proj, 'pharn-contracts'), 'a FILE where a directory goes');
    vi.mocked(prompts.confirm).mockClear();
    vi.mocked(prompts.log.warn).mockClear();
    vi.mocked(prompts.log.error).mockClear();

    await expect(init(repo, proj, 'sha456')).rejects.toMatchObject(
      new ProcessExit(1),
    );

    // Never asked: neither the overwrite warning nor its confirm was shown.
    expect(overwriteWarning()).toBe('');
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(String(vi.mocked(prompts.log.error).mock.calls.at(-1)?.[0])).toMatch(
      /Refusing to install: pharn-contracts is in the way/,
    );
    // And nothing written: no backup, the edit and the config as they were.
    expect(existsSync(join(proj, '.pharn-backup'))).toBe(false);
    expect(
      readFileSync(join(proj, '.claude/commands/pharn-plan.md'), 'utf8'),
    ).toBe('MY EDIT');
    expect(readPharnConfig(proj)!.commit).toBe('sha123');
  });
});
