import { hostname } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import {
  config,
  installFresh,
  jsonOut,
  logs,
  notes,
  read,
  run,
  stderr,
  stdout,
  useHarness,
  write,
} from '../support/harness.js';
import type { PharnConfig } from '../../src/types.js';
import { LEGACY_CONFIG_MESSAGE as LEGACY } from '../../src/lib/pharn-config.js';
import { LOCK_FILE } from '../../src/lib/project-lock.js';
import { runList } from '../../src/commands/list.js';

vi.mock('@clack/prompts', async () =>
  (await import('../support/clack-stub.js')).clackStub(),
);

useHarness();

// `list` is offline: it reads pharn.config.json and nothing else, so these
// cases write a REAL config into the project rather than going through init
// (one case does, to pin that the inventory is what init recorded).

function writeConfig(cfg: unknown): void {
  write(
    'pharn.config.json',
    typeof cfg === 'string' ? cfg : JSON.stringify(cfg),
  );
}

function archetypeConfig(extra: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.2.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: null,
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller' }],
    ...extra,
  };
}

// A pre-archetype (module) config: has `modules` but NO `capabilities` array.
const LEGACY_CONFIG = {
  pharnVersion: '0.2.0',
  skillsVersion: '0.68.0',
  repo: 'pharn-dev/pharn-oss',
  commit: 'old',
  modules: [{ name: 'pharn-core', version: '0.1.0' }],
  installedAt: '2026-06-11T00:00:00.000Z',
};

const INVALID_SOURCE = archetypeConfig({
  capabilities: [{ name: 'a11y', role: 'griller', source: 'guess' }],
} as unknown as Partial<PharnConfig>);

describe('pharn list', () => {
  // A reader never takes the lock: every writer now holds it across its
  // prompts (C5.2), and `list` must stay usable meanwhile.
  it('reads under a held lock, leaving it in place', async () => {
    await installFresh();
    const lock = JSON.stringify({
      pid: process.pid,
      host: hostname(),
      command: 'update',
      startedAt: new Date().toISOString(),
    });
    write(LOCK_FILE, lock);
    stdout().length = 0;
    expect(await run(() => runList({ json: true }))).toBeNull();
    expect(jsonOut()).toMatchObject({ skillsVersion: '1.0.0' });
    expect(read(LOCK_FILE)).toBe(lock);
  });

  it('lists what init recorded, as text and as --json', async () => {
    await installFresh();
    expect(await run(() => runList())).toBeNull();
    const installed = notes('INSTALLED (archetype)').join('\n');
    expect(installed).toContain('lib');
    expect(installed).toContain('v1.0.0');
    expect(installed).toContain('— security');

    stdout().length = 0;
    expect(await run(() => runList({ json: true }))).toBeNull();
    expect(jsonOut()).toEqual({
      mode: 'archetype',
      skillsVersion: '1.0.0',
      archetypes: ['lib'],
      capabilities: config().capabilities,
    });
  });

  it('renders an archetype install grouped by role, one capability per line', async () => {
    writeConfig(
      archetypeConfig({
        capabilities: [
          { name: 'a11y', role: 'griller' },
          { name: 'security', role: 'griller' },
          { name: 'n-plus-one', role: 'lens' },
        ],
      }),
    );

    expect(await run(() => runList())).toBeNull();

    const installed = notes('INSTALLED (archetype)').join('\n');
    expect(installed).toContain('ssr');
    expect(installed).toContain('v1.0.0');
    expect(installed).toContain('grillers (2)');
    expect(installed).toContain('lenses (1)');
    for (const name of ['a11y', 'security', 'n-plus-one'])
      expect(installed).toContain(`— ${name}`);
    // Never the old comma-joined string.
    expect(
      installed.split('\n').every((l) => !/a11y.*,.*security/.test(l)),
    ).toBe(true);
  });

  it('emits `source` in --json when recorded, and OMITS it when absent', async () => {
    const capabilities = [
      { name: 'a11y', role: 'griller', source: 'auto' },
      { name: 'n-plus-one', role: 'lens', source: 'manual' },
      { name: 'legacy', role: 'lens' },
    ] as PharnConfig['capabilities'];
    writeConfig(archetypeConfig({ capabilities }));

    expect(await run(() => runList({ json: true }))).toBeNull();

    // Additive: present when recorded, ABSENT (not null) when the config has
    // no `source` — publishing a default here would publish a guess.
    expect(jsonOut<{ capabilities: unknown }>().capabilities).toEqual(
      capabilities,
    );
    expect(clack.intro).not.toHaveBeenCalled();
    expect(clack.note).not.toHaveBeenCalled();
  });

  // CORE-165: `seam` is pharn-oss's — a block its checker accepts (an extra
  // key, a repeated step), or one this CLI cannot judge, never stops `list`.
  it('lists a config whose seam block this CLI used to refuse', async () => {
    writeConfig(
      archetypeConfig({
        seam: { resolutionOrder: ['model', 'ask', 'ask', 'guess'], note: 'x' },
      }),
    );
    expect(await run(() => runList())).toBeNull();
    expect(logs('error')).toEqual([]);
  });

  describe('refusals: exit 1, never "run init" for a config that exists', () => {
    it.each([
      ['no config', null, /No pharn\.config\.json found/],
      ['a legacy (module) config', LEGACY_CONFIG, LEGACY],
      ['an invalid capabilities[].source', INVALID_SOURCE, /guess/],
    ] as const)('%s (text)', async (_label, cfg, message) => {
      if (cfg) writeConfig(cfg);
      expect(await run(() => runList())).toBe(1);
      const errors = logs('error').join('\n');
      if (typeof message === 'string')
        expect(vi.mocked(clack.log.error).mock.calls[0]![0]).toBe(message);
      else expect(errors).toMatch(message);
      // The validator's own error, never the config-overwriting "run init".
      if (cfg === INVALID_SOURCE) expect(errors).not.toMatch(/pharn init/);
      // Errors go to stderr: the `output` option reaches clack.
      expect(vi.mocked(clack.log.error).mock.calls[0]![1]).toEqual({
        output: process.stderr,
      });
      expect(clack.note).not.toHaveBeenCalled();
    });

    it.each([
      [
        'no config',
        null,
        'No pharn.config.json found. Run `pharn init` first.',
      ],
      ['a legacy (module) config', LEGACY_CONFIG, LEGACY],
      ['an invalid capabilities[].source', INVALID_SOURCE, /guess/],
    ] as const)(
      '%s (--json): stdout clean, a plain stderr line',
      async (_label, cfg, message) => {
        if (cfg) writeConfig(cfg);
        expect(await run(() => runList({ json: true }))).toBe(1);
        expect(stdout()).toEqual([]);
        expect(stderr().length).toBeGreaterThan(0);
        if (typeof message === 'string') expect(stderr()[0]).toBe(message);
        else expect(stderr()[0]).toMatch(message);
      },
    );
  });
});
