import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessExit,
  restoreNodeVersion,
  restoreTTY,
  setNodeVersion,
  setTTY,
  snapshotTree,
  stubProcessExit,
  useTmpDir,
} from './helpers.js';

// `pharn init --dry-run --json`: ONE object on stdout, nothing else, ever —
// and on failure stdout stays EMPTY, stderr carries one plain line, exit 1.
// Every clack function is a spy: none may be reached under --json, because each
// of them writes to stdout.

const spinnerFactory = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  note: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  select: vi.fn(async () => 'install'),
  confirm: vi.fn(async () => true),
  isCancel: () => false,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), message: vi.fn() },
  spinner: spinnerFactory,
}));
const showBanner = vi.fn();
vi.mock('../src/lib/banner.js', () => ({ showBanner }));

const fetchRepo = vi.fn();
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
  resolveSource: vi.fn(async (ref: string) =>
    ref === 'main'
      ? { kind: 'main' as const }
      : {
          kind: 'release' as const,
          tag: 'v1.0.0',
          version: '1.0.0',
          sha: 'b'.repeat(40),
        },
  ),
}));

const { runInit } = await import('../src/commands/init.js');
const prompts = await import('@clack/prompts');

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function cap(role: string, applies: string): string {
  return `---\nname: c\nrole: ${role}\napplies: ${applies}\n---\n# c\n`;
}

function scaffold(repo: string, proj: string): void {
  write(
    join(repo, 'pharn-pipeline/grillers/a11y/a11y.md'),
    cap('griller', '["ssr", "spa"]'),
  );
  write(
    join(repo, 'pharn-review/path-traversal/path-traversal.md'),
    cap('lens', '["backend"]'),
  );
  // A capability this CLI cannot read: no markdown file of its own name.
  write(join(repo, 'pharn-review/broken/notes.md'), 'x');
  write(join(repo, '.claude/commands/pharn-plan.md'), 'plan');
  write(join(repo, '.claude/settings.json'), '{"hooks":{}}');
  write(join(repo, 'CONSTITUTION.md'), 'C');
  write(join(repo, 'SKILLS_VERSION'), '1.0.0\n');
  write(
    join(repo, 'pharn.config.json'),
    JSON.stringify({
      models: { stages: { default: { model: 'sonnet', effort: 'high' } } },
    }),
  );
  write(
    join(proj, 'package.json'),
    JSON.stringify({ dependencies: { next: '14.0.0' } }),
  );
  mkdirSync(join(proj, '.git'));
}

describe('runInit --dry-run --json', () => {
  stubProcessExit();
  const tmp = useTmpDir();
  let proj = '';
  let repo = '';
  let cleanup = vi.fn();
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    repo = join(tmp.path(), 'repo');
    proj = join(tmp.path(), 'proj');
    scaffold(repo, proj);
    cleanup = vi.fn();
    fetchRepo.mockResolvedValue({ dir: repo, sha: 'a'.repeat(40), cleanup });
    vi.spyOn(process, 'cwd').mockReturnValue(proj);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    setTTY(false, false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    restoreTTY();
    restoreNodeVersion();
    delete process.env.HTTPS_PROXY;
  });

  const stderr = (): string =>
    errSpy.mock.calls.map((c: unknown[]) => String(c[0] ?? '')).join('\n');

  async function run(
    opts: {
      ref?: 'main' | 'latest';
      archetypes?: ('ssr' | 'backend' | 'spa' | 'lib')[];
    } = {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    await runInit({ ...opts, dryRun: true, json: true });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expectNoClack();
    return JSON.parse(String(logSpy.mock.calls[0]![0]));
  }

  function expectNoClack(): void {
    expect(showBanner).not.toHaveBeenCalled();
    expect(prompts.intro).not.toHaveBeenCalled();
    expect(prompts.outro).not.toHaveBeenCalled();
    expect(prompts.note).not.toHaveBeenCalled();
    expect(prompts.select).not.toHaveBeenCalled();
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(prompts.log.info).not.toHaveBeenCalled();
    expect(prompts.log.warn).not.toHaveBeenCalled();
    expect(prompts.log.error).not.toHaveBeenCalled();
    expect(spinnerFactory).not.toHaveBeenCalled();
  }

  async function expectFailure(
    opts: { dryRun?: boolean } = { dryRun: true },
  ): Promise<string> {
    await expect(runInit({ ...opts, json: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
    expectNoClack();
    const err = stderr();
    expect(err).not.toBe('');
    expect(err).not.toMatch(/[│┌└◇●▲■]/);
    return err;
  }

  // F-17: where the archetypes came from, additive within schemaVersion 1.
  it('reports detection as the archetype source, with its evidence', async () => {
    const r = await run();
    expect(r.archetypes).toEqual(['ssr']);
    expect(r.archetypeSource).toBe('detected');
    expect(r.detectedArchetypes).toBeNull();
    expect(r.archetypeEvidence).toEqual([
      { archetype: 'ssr', source: 'dependency', value: 'next' },
    ]);
  });

  // F-25, end to end: detection's own flag reaches the report — absent for a
  // complete walk, `true` when a cap stopped it (here the depth cap).
  it('detectionTruncated: absent for a complete walk', async () => {
    expect('detectionTruncated' in (await run())).toBe(false);
  });

  it('detectionTruncated: true when detection stopped early', async () => {
    write(join(proj, ...Array.from({ length: 25 }, () => 'a'), 'Page.tsx'));
    const r = await run();
    expect(r.detectionTruncated).toBe(true);
    expect(r.schemaVersion).toBe(1);
  });

  it('`--archetype backend --dry-run --json`: plans for the flag, reports the unused detection', async () => {
    const before = [snapshotTree(proj), snapshotTree(repo)];
    const r = await run({ archetypes: ['backend'] });
    expect([snapshotTree(proj), snapshotTree(repo)]).toEqual(before);

    expect(r.archetypes).toEqual(['backend']);
    expect(r.archetypeSource).toBe('flag');
    expect(r.detectedArchetypes).toEqual(['ssr']);
    expect(r.archetypeEvidence).toEqual([
      { archetype: 'ssr', source: 'dependency', value: 'next' },
    ]);
    // Resolved against the FLAG: the backend lens is selected, a11y (ssr/spa)
    // is skipped.
    expect(r.capabilities.selected).toEqual([
      { role: 'lens', name: 'path-traversal', matched: ['backend'] },
    ]);
    expect(r.capabilities.skipped).toEqual([
      expect.objectContaining({ role: 'griller', name: 'a11y' }),
    ]);
  });

  it('prints one schemaVersion 1 object for a fresh project, writing nothing', async () => {
    const before = [snapshotTree(proj), snapshotTree(repo)];
    const r = await run();
    expect([snapshotTree(proj), snapshotTree(repo)]).toEqual(before);
    expect(cleanup).toHaveBeenCalledTimes(1);

    expect(r.schemaVersion).toBe(1);
    expect(r.command).toBe('init');
    expect(r.dryRun).toBe(true);
    expect(r.status).toBe('planned');
    // The default channel for a new install: the newest verified release.
    expect(r.channel).toBe('latest');
    expect(r.source).toEqual({ kind: 'release', tag: 'v1.0.0' });
    expect(r.commit).toBe('a'.repeat(40));
    expect(r.skillsVersion).toBe('1.0.0');
    expect(r.archetypes).toEqual(['ssr']);
    expect(r.capabilities.selected).toEqual([
      { role: 'griller', name: 'a11y', matched: ['ssr'] },
    ]);
    expect(r.capabilities.skipped).toEqual([
      expect.objectContaining({ role: 'lens', name: 'path-traversal' }),
    ]);
    expect(r.unknownCapabilities).toEqual([
      expect.objectContaining({ role: 'lens', name: 'broken' }),
    ]);
    expect(r.counts.overwrite).toBe(0);
    expect(r.counts.backup).toBe(0);
    expect(r.counts.create).toBe(r.targets.length);
    expect(r.yesWouldProceed).toBe(true);
    expect(r.targets).toContainEqual({
      rel: 'pharn.config.json',
      action: 'create',
      label: null,
    });
    expect(r.settings).toEqual({ preserved: false });
    expect(r.hooks).toBeNull();
    expect(r.models).toEqual({ outcome: 'copy', reasons: [] });
    // F-10: the scaffold ships no hooks and no contracts — named as data.
    expect(r.absentUpstream).toContainEqual({
      surface: 'hooks',
      path: '.claude/hooks',
    });
    expect(r.absentUpstream).toContainEqual({
      surface: 'contracts',
      path: 'pharn-contracts',
    });
    // The unknown-capabilities prose went to stderr, plain.
    expect(stderr()).toContain('could not be read');
  });

  it('lists every overwrite with its mark, and says --yes would refuse', async () => {
    write(join(proj, '.claude/commands/pharn-plan.md'), 'mine');
    write(join(proj, 'pharn.config.json'), '{"testResults":{}}');
    write(join(proj, '.claude/settings.json'), '{}');
    const r = await run();
    expect(r.targets).toContainEqual({
      rel: '.claude/commands/pharn-plan.md',
      action: 'overwrite',
      label: 'unverifiable',
    });
    // The replaced config is rewritten and backed up first (F-08).
    expect(r.targets).toContainEqual({
      rel: 'pharn.config.json',
      action: 'overwrite',
      label: 'rewritten',
    });
    expect(r.backups).toEqual([
      '.claude/commands/pharn-plan.md',
      'pharn.config.json',
    ]);
    expect(r.counts).toMatchObject({ overwrite: 2, backup: 2 });
    expect(r.yesWouldProceed).toBe(false);
    expect(r.config).toEqual({ carriedKeys: ['testResults'] });
    expect(r.settings).toEqual({ preserved: true });
    expect(r.hooks).toMatchObject({ status: 'no-upstream' });
  });

  // F-04: the directory a re-install would delete — absent when none.
  it('lists the capability directory a re-install would delete, with its backups, and omits the key otherwise', async () => {
    const fresh = await run();
    expect(fresh.capabilities).not.toHaveProperty('removals');
    vi.clearAllMocks();
    logSpy.mockClear();

    write(
      join(proj, 'pharn.config.json'),
      JSON.stringify({
        pharnVersion: '0.12.0',
        skillsVersion: '1.0.0',
        repo: 'pharn-dev/pharn-oss',
        commit: null,
        modules: [],
        installedAt: '2026-10-01T00:00:00.000Z',
        archetypes: ['ssr'],
        capabilities: [{ name: 'stale', role: 'lens', source: 'auto' }],
        layout: 'flat',
      }),
    );
    write(join(proj, 'pharn-review/stale/NOTES.md'), 'mine');
    const r = await run();
    expect(r.capabilities.removals).toEqual([
      {
        role: 'lens',
        name: 'stale',
        reason: 'dropped-unselected',
        dir: 'pharn-review/stale',
        present: true,
        backups: ['pharn-review/stale/NOTES.md'],
      },
    ]);
    expect(r.backups).toContain('pharn-review/stale/NOTES.md');
    expect(r.yesWouldProceed).toBe(false);
    // Planned, not done.
    expect(existsSync(join(proj, 'pharn-review/stale/NOTES.md'))).toBe(true);
  });

  it('--ref main reports the main channel and no tag', async () => {
    const r = await run({ ref: 'main' });
    expect(r.channel).toBe('main');
    expect(r.source).toEqual({ kind: 'main', tag: null });
  });

  it('records the release channel and its tag', async () => {
    const r = await run({ ref: 'latest' });
    expect(r.channel).toBe('latest');
    expect(r.source).toEqual({ kind: 'release', tag: 'v1.0.0' });
  });

  it('sends the proxy notice to stderr, not stdout', async () => {
    process.env.HTTPS_PROXY = 'http://proxy.invalid:8080';
    await run();
    expect(stderr()).toMatch(/prox/i);
  });

  describe('failures: stdout empty, stderr plain, exit 1', () => {
    it('fails closed for --json without --dry-run', async () => {
      const err = await expectFailure({});
      expect(err).toContain('--dry-run');
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('below the Node floor', async () => {
      setNodeVersion('20.0.0');
      await expectFailure();
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('without a .git directory', async () => {
      rmSync(join(proj, '.git'), { recursive: true });
      const err = await expectFailure();
      expect(err).toContain('git init');
      expect(fetchRepo).not.toHaveBeenCalled();
    });

    it('when the fetch fails', async () => {
      fetchRepo.mockRejectedValue(new Error('offline'));
      const err = await expectFailure();
      expect(err).toContain('offline');
    });

    it('on a MIN_CLI refusal, after cleaning up the clone', async () => {
      write(join(repo, 'MIN_CLI'), '999.0.0\n');
      await expectFailure();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('on a destination the pre-flight refuses', async () => {
      const outside = join(tmp.path(), 'outside');
      mkdirSync(outside);
      mkdirSync(join(proj, '.claude'));
      symlinkSync(outside, join(proj, '.claude/commands'));
      await expectFailure();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });
  });
});
