import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessExit,
  restoreNodeVersion,
  setNodeVersion,
  stubProcessExit,
} from './helpers.js';
import type { HookWiringDiff } from '../src/lib/hook-wiring.js';
import type { CapabilityIndex, PharnConfig } from '../src/types.js';

// `status --json` must put NOTHING on stdout but the one report: every clack
// call that would write there is a spy asserted never to fire.
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const fetchRepo = vi.fn();
vi.mock('../src/lib/repo.js', () => ({
  fetchRepo: async (source: unknown) => ({
    source,
    ...(await fetchRepo(source)),
  }),
}));
const resolveSource = vi.fn(async (ref: string) => {
  if (ref === 'main') return { kind: 'main' as const };
  return {
    kind: 'release' as const,
    tag: 'v1.0.0',
    version: '1.0.0',
    sha: 'b'.repeat(40),
  };
});
vi.mock('../src/lib/release.js', async () => ({
  ...(await vi.importActual<typeof import('../src/lib/release.js')>(
    '../src/lib/release.js',
  )),
  resolveSource,
}));

const diffInstalledCapabilities = vi.fn();
vi.mock('../src/lib/diff.js', () => ({ diffInstalledCapabilities }));

const parseCapabilityIndex = vi.fn((): CapabilityIndex => ({
  capabilities: [],
  unknown: [],
}));
vi.mock('../src/lib/capability-index.js', () => ({ parseCapabilityIndex }));

const diffHookWiring = vi.fn();
vi.mock('../src/lib/hook-wiring.js', async () => ({
  ...(await vi.importActual<typeof import('../src/lib/hook-wiring.js')>(
    '../src/lib/hook-wiring.js',
  )),
  diffHookWiring,
}));

const loadArchetypeConfigOrExit = vi.fn();
vi.mock('../src/lib/pharn-config.js', () => ({ loadArchetypeConfigOrExit }));

const fetchRemoteSkillsVersion = vi.fn();
const readSkillsVersion = vi.fn();
vi.mock('../src/lib/skills-version.js', () => ({
  fetchRemoteSkillsVersion,
  readSkillsVersion,
}));

const { runStatus } = await import('../src/commands/status.js');
const prompts = await import('@clack/prompts');

function config(extra: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.9.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'c',
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller' }],
    ...extra,
  };
}

const CLEAN = {
  modified: [] as string[],
  missing: [] as string[],
  unreadable: [] as { rel: string; reason: string }[],
  okCount: 5,
};
const LRO = String.fromCodePoint(0x202e);
const LS = String.fromCodePoint(0x2028);
const HOOKS_OK: HookWiringDiff = { status: 'match', missing: [] };

describe('runStatus --json', () => {
  stubProcessExit();
  let out: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;
  const stdout = () =>
    out.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  const stderr = () =>
    err.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  const report = () => JSON.parse(stdout());
  const cleanup = vi.fn();

  beforeEach(() => {
    out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    process.exitCode = undefined;
    loadArchetypeConfigOrExit.mockReturnValue(config());
    fetchRepo.mockResolvedValue({ dir: '/repo', cleanup });
    readSkillsVersion.mockReturnValue('1.0.0');
    fetchRemoteSkillsVersion.mockResolvedValue('1.0.0');
    diffInstalledCapabilities.mockReturnValue(CLEAN);
    diffHookWiring.mockReturnValue(HOOKS_OK);
  });
  afterEach(() => {
    process.exitCode = undefined;
    vi.clearAllMocks();
    vi.restoreAllMocks();
    restoreNodeVersion();
  });

  const noClack = () => {
    expect(prompts.intro).not.toHaveBeenCalled();
    expect(prompts.outro).not.toHaveBeenCalled();
    expect(prompts.note).not.toHaveBeenCalled();
    expect(prompts.spinner).not.toHaveBeenCalled();
    expect(prompts.log.warn).not.toHaveBeenCalled();
    expect(prompts.log.info).not.toHaveBeenCalled();
  };

  it('loads the config json-aware', async () => {
    await runStatus({ json: true });
    expect(loadArchetypeConfigOrExit).toHaveBeenCalledWith('/proj', {
      json: true,
    });
  });

  it('prints exactly one report on the drift path, with no clack chrome', async () => {
    setNodeVersion('24.13.1');
    await runStatus({ json: true });

    expect(out).toHaveBeenCalledTimes(1);
    const r = report();
    expect(r).toMatchObject({
      schemaVersion: 1,
      node: { floor: '24.2.0', running: '24.13.1', status: 'ok' },
      version: { installed: '1.0.0', latest: '1.0.0', outdated: false },
      drift: { okCount: 5, modified: [] },
      hooks: { status: 'match' },
      unknownCapabilities: [],
      strict: { enabled: false, failed: false },
    });
    noClack();
    expect(cleanup).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(stderr()).toBe('');
  });

  it('--no-drift: nulls drift/hooks/unknown, never clones, reads the remote version', async () => {
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    await runStatus({ json: true, drift: false });

    expect(fetchRepo).not.toHaveBeenCalled();
    expect(parseCapabilityIndex).not.toHaveBeenCalled();
    expect(report()).toMatchObject({
      drift: null,
      hooks: null,
      unknownCapabilities: null,
      version: { latest: '1.1.0', outdated: true },
    });
    noClack();
  });

  it('--no-drift on the release channel takes the version from the tag', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(config({ ref: 'latest' }));
    await runStatus({ json: true, drift: false });
    expect(fetchRemoteSkillsVersion).not.toHaveBeenCalled();
    expect(report().version).toMatchObject({
      channel: 'latest',
      source: { kind: 'release', tag: 'v1.0.0' },
    });
  });

  it('reports an install AHEAD of the release as ahead, not outdated, and --strict passes', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({ skillsVersion: '1.2.0', ref: 'latest' }),
    );
    await runStatus({ json: true, drift: false, strict: true });
    expect(report().version).toMatchObject({ ahead: true, outdated: false });
    expect(process.exitCode).toBeUndefined();
  });

  it('reports an install AHEAD of main as ahead, not outdated, and --strict passes', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({ skillsVersion: '1.2.0' }),
    );
    fetchRemoteSkillsVersion.mockResolvedValue('1.1.0');
    await runStatus({ json: true, drift: false, strict: true });
    expect(report().version).toMatchObject({
      channel: 'main',
      source: { kind: 'main', tag: null },
      installed: '1.2.0',
      latest: '1.1.0',
      ahead: true,
      outdated: false,
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('excludes a frozen capability from the diff and lists it as unknown', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        capabilities: [
          { name: 'a11y', role: 'griller' },
          { name: 'odd', role: 'lens' },
        ],
      }),
    );
    parseCapabilityIndex.mockReturnValueOnce({
      capabilities: [],
      unknown: [
        { name: 'odd', role: 'lens', subtree: 'lenses', reason: 'bad applies' },
      ],
    });
    await runStatus({ json: true, strict: true });
    expect(diffInstalledCapabilities.mock.calls[0]![0].capabilities).toEqual([
      { name: 'a11y', role: 'griller' },
    ]);
    expect(report().unknownCapabilities).toEqual([
      { role: 'lens', name: 'odd', subtree: 'lenses', reason: 'bad applies' },
    ]);
    // A frozen capability alone never fails --strict.
    expect(process.exitCode).toBeUndefined();
  });

  describe('--strict composes with the exit code, report still printed', () => {
    it.each([
      ['modified', { ...CLEAN, modified: ['a'] }, HOOKS_OK],
      ['missing', { ...CLEAN, missing: ['a'] }, HOOKS_OK],
      [
        'unreadable',
        { ...CLEAN, unreadable: [{ rel: 'a', reason: 'dir' }] },
        HOOKS_OK,
      ],
      ['hook missing', CLEAN, { status: 'missing', missing: [] }],
    ] as const)('exit code 1 on %s', async (_l, diff, hooks) => {
      diffInstalledCapabilities.mockReturnValue(diff);
      diffHookWiring.mockReturnValue(hooks);
      await runStatus({ json: true, strict: true });
      expect(process.exitCode).toBe(1);
      expect(out).toHaveBeenCalledTimes(1);
      expect(report().strict).toEqual({ enabled: true, failed: true });
    });

    it('exit code 1 when outdated', async () => {
      readSkillsVersion.mockReturnValue('2.0.0');
      await runStatus({ json: true, strict: true });
      expect(process.exitCode).toBe(1);
    });

    it('--no-drift --strict exit code 1 when outdated', async () => {
      fetchRemoteSkillsVersion.mockResolvedValue('2.0.0');
      await runStatus({ json: true, drift: false, strict: true });
      expect(process.exitCode).toBe(1);
      expect(report().strict.failed).toBe(true);
    });

    it('does not fail on local-only hooks, and findings without --strict leave the code 0', async () => {
      diffHookWiring.mockReturnValue({
        status: 'local-only',
        missing: [],
        localOnly: [],
      });
      await runStatus({ json: true, strict: true });
      expect(process.exitCode).toBeUndefined();

      diffInstalledCapabilities.mockReturnValue({ ...CLEAN, modified: ['a'] });
      await runStatus({ json: true });
      expect(process.exitCode).toBeUndefined();
    });

    it('never calls process.exit for a finding', async () => {
      diffInstalledCapabilities.mockReturnValue({ ...CLEAN, modified: ['a'] });
      const exit = vi.mocked(process.exit);
      await runStatus({ json: true, strict: true });
      expect(exit).not.toHaveBeenCalled();
    });
  });

  describe('failures: stdout stays EMPTY, stderr carries the message, exit 1', () => {
    it('release cannot be resolved (--no-drift)', async () => {
      fetchRemoteSkillsVersion.mockRejectedValue(new Error('HTTP 404'));
      await expect(
        runStatus({ json: true, drift: false }),
      ).rejects.toMatchObject(new ProcessExit(1));
      expect(out).not.toHaveBeenCalled();
      expect(stderr()).toContain('HTTP 404');
      noClack();
    });

    it('release cannot be resolved (drift)', async () => {
      resolveSource.mockRejectedValueOnce(new Error('rate limited'));
      await expect(runStatus({ json: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );
      expect(out).not.toHaveBeenCalled();
      expect(stderr()).toContain('rate limited');
      expect(stderr()).toContain('PHARN_DEBUG');
    });

    it('clone fails', async () => {
      fetchRepo.mockRejectedValueOnce(new Error('network down'));
      await expect(runStatus({ json: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );
      expect(out).not.toHaveBeenCalled();
      expect(stderr()).toContain('network down');
      noClack();
    });

    it('the diff throws: clone cleaned up first, nothing on stdout', async () => {
      diffInstalledCapabilities.mockImplementation(() => {
        throw new Error('refused name');
      });
      await expect(runStatus({ json: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );
      expect(cleanup).toHaveBeenCalled();
      expect(out).not.toHaveBeenCalled();
      expect(stderr()).toContain('refused name');
    });

    it('prints the debug dump instead of the hint under PHARN_DEBUG', async () => {
      vi.stubEnv('PHARN_DEBUG', '1');
      fetchRepo.mockRejectedValueOnce(new Error('boom'));
      await expect(runStatus({ json: true })).rejects.toMatchObject(
        new ProcessExit(1),
      );
      expect(stderr()).not.toContain('Re-run with PHARN_DEBUG');
      vi.unstubAllEnvs();
    });
  });

  it('puts the proxy notice on stderr, before the fetch, never on stdout', async () => {
    vi.stubEnv('https_proxy', 'http://proxy.internal:3128');
    let warnedFirst = false;
    fetchRepo.mockImplementationOnce(async () => {
      warnedFirst = err.mock.calls.length > 0;
      return { dir: '/repo', cleanup };
    });
    await runStatus({ json: true });
    expect(warnedFirst).toBe(true);
    expect(stderr()).toContain('will not use it');
    expect(stdout()).not.toContain('proxy');
    noClack();
    vi.unstubAllEnvs();
  });

  it('carries orphans: null with no usable records, null under --no-drift', async () => {
    await runStatus({ json: true });
    expect(report().orphans).toBeNull();
    out.mockClear();
    await runStatus({ json: true, drift: false });
    expect(report().orphans).toBeNull();
  });

  it('lists orphans from a usable store, and they never fail --strict', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
      await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { contentHash } = await import('../src/lib/hash.js');
    const root = mkdtempSync(join(tmpdir(), 'pharn-orphans-'));
    try {
      const proj = join(root, 'proj');
      const rel = '.claude/hooks/gone.cjs';
      mkdirSync(join(proj, '.claude/hooks'), { recursive: true });
      writeFileSync(join(proj, rel), 'x');
      writeFileSync(
        join(proj, 'pharn.records.json'),
        JSON.stringify({
          schemaVersion: 1,
          skillsVersion: '1.0.0',
          commit: 'c',
          files: { [rel]: contentHash(join(proj, rel)) },
        }),
      );
      writeFileSync(join(proj, rel), 'MY EDIT');
      vi.spyOn(process, 'cwd').mockReturnValue(proj);
      fetchRepo.mockResolvedValue({ dir: join(root, 'repo'), cleanup });
      await runStatus({ json: true, strict: true });
      expect(report().orphans).toEqual([{ path: rel, state: 'edited' }]);
      expect(report().strict).toEqual({ enabled: true, failed: false });
      expect(process.exitCode).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a Node below the floor without failing, even under --strict', async () => {
    setNodeVersion('22.18.0');
    await runStatus({ json: true, strict: true });
    expect(report().node).toMatchObject({
      running: '22.18.0',
      status: 'below',
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('carries the models verdict', async () => {
    loadArchetypeConfigOrExit.mockReturnValue(
      config({
        models: { stages: { default: { model: 'sonnet', effort: 'high' } } },
      }),
    );
    await runStatus({ json: true });
    expect(report().models).toMatchObject({
      verdict: 'valid',
      conversionNeeded: false,
    });
  });

  it('escapes a hostile upstream string on stdout, and it parses back exactly', async () => {
    const hostile = `x\u001b[2J${LRO}${LS}y`;
    diffInstalledCapabilities.mockReturnValue({
      ...CLEAN,
      modified: [hostile],
    });
    await runStatus({ json: true });
    expect(stdout()).not.toContain('\u001b');
    expect(stdout()).not.toContain(LRO);
    expect(stdout()).not.toContain(LS);
    expect(report().drift.modified).toEqual([hostile]);
  });
});
