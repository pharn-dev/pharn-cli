import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';
import type { PharnConfig } from '../src/types.js';
import { ModelRoutingError } from '../src/lib/model-routing.js';
import { SeamConfigError } from '../src/lib/seam-config.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

// Sentinel for the shared legacy message; the real text is asserted in
// pharn-config.test.ts. list emits its imported LEGACY_CONFIG_MESSAGE verbatim.
const LEGACY = 'legacy layout no longer supported (test sentinel)';
const readPharnConfig = vi.fn();
// format.js is intentionally NOT mocked — list uses the real row().
vi.mock('../src/lib/pharn-config.js', () => ({
  readPharnConfig,
  // Real discriminators so list's branches are exercised faithfully.
  isArchetypeConfig: (c: PharnConfig) => Array.isArray(c.capabilities),
  isConfigValidationError: (e: unknown) =>
    e instanceof ModelRoutingError || e instanceof SeamConfigError,
  LEGACY_CONFIG_MESSAGE: LEGACY,
}));

const { runList } = await import('../src/commands/list.js');
const prompts = await import('@clack/prompts');

function archetypeConfig(extra: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.2.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller' }],
    ...extra,
  };
}

// A pre-archetype (module) config: has `modules` but NO `capabilities` array.
function legacyConfig(): PharnConfig {
  return {
    pharnVersion: '0.2.0',
    skillsVersion: '0.68.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'old',
    modules: [{ name: 'pharn-core', version: '0.1.0' }],
    installedAt: '2026-06-11T00:00:00.000Z',
  };
}

function noteBody(title: string): string {
  const call = vi.mocked(prompts.note).mock.calls.find((c) => c[1] === title);
  return (call?.[0] as string | undefined) ?? '';
}

describe('runList', () => {
  stubProcessExit();
  beforeEach(() => vi.spyOn(process, 'cwd').mockReturnValue('/proj'));
  afterEach(() => vi.clearAllMocks());

  it('exits(1) when there is no config', async () => {
    readPharnConfig.mockReturnValue(null);
    await expect(runList()).rejects.toMatchObject(new ProcessExit(1));
  });

  it('surfaces the loud validator error (NOT "run init") when the config is invalid (BUG 1)', async () => {
    readPharnConfig.mockImplementationOnce(() => {
      throw new SeamConfigError('seam.resolutionOrder must contain "ask"');
    });
    await expect(runList()).rejects.toMatchObject(new ProcessExit(1));
    const msg = vi
      .mocked(prompts.log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toMatch(/ask/);
    expect(msg).not.toMatch(/pharn init/);
  });

  it('rejects a legacy (non-archetype) config with the legacy message + exit(1)', async () => {
    readPharnConfig.mockReturnValue(legacyConfig());
    await expect(runList()).rejects.toMatchObject(new ProcessExit(1));
    expect(prompts.log.error).toHaveBeenCalledWith(LEGACY);
    // Never the crash/lie paths — no note rendered, no "run init".
    expect(prompts.note).not.toHaveBeenCalled();
  });

  it('renders an archetype install offline from the config', async () => {
    readPharnConfig.mockReturnValue(
      archetypeConfig({
        capabilities: [
          { name: 'a11y', role: 'griller' },
          { name: 'security', role: 'griller' },
          { name: 'n-plus-one', role: 'lens' },
        ],
      }),
    );

    await expect(runList()).resolves.toBeUndefined();

    const installed = noteBody('INSTALLED (archetype)');
    expect(installed).toContain('ssr');
    expect(installed).toContain('a11y');
    expect(installed).toContain('security');
    expect(installed).toContain('n-plus-one');
    expect(installed).toContain('v1.0.0');
  });
});

describe('runList --json', () => {
  stubProcessExit();
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('emits an archetype-mode JSON object on stdout', async () => {
    readPharnConfig.mockReturnValue(
      archetypeConfig({ capabilities: [{ name: 'a11y', role: 'griller' }] }),
    );

    await runList({ json: true });

    expect(prompts.intro).not.toHaveBeenCalled();
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

  it('rejects a legacy config to stderr (stdout clean) + exit(1)', async () => {
    readPharnConfig.mockReturnValue(legacyConfig());
    await expect(runList({ json: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(LEGACY);
  });

  it('emits the loud validator error to stderr (stdout clean) when config is invalid (BUG 1)', async () => {
    readPharnConfig.mockImplementationOnce(() => {
      throw new ModelRoutingError('models.default has invalid model "gpt-4"');
    });
    await expect(runList({ json: true })).rejects.toMatchObject(
      new ProcessExit(1),
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0]![0])).toMatch(/gpt-4/);
  });
});
