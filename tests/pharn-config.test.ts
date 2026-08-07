import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '@clack/prompts';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';
import {
  readPharnConfig,
  loadConfigOrExit,
  loadArchetypeConfigOrExit,
  isConfigValidationError,
  writePharnConfig,
  toInstalledModules,
  isArchetypeConfig,
  LEGACY_CONFIG_MESSAGE,
  CapabilitySourceError,
} from '../src/lib/pharn-config.js';
import type { PharnConfig } from '../src/types.js';
import {
  DEFAULT_MODEL_ROUTING,
  ModelRoutingError,
} from '../src/lib/model-routing.js';
import {
  DEFAULT_SEAM_CONFIG,
  SeamConfigError,
} from '../src/lib/seam-config.js';

// pharn-config.ts imports `log` from @clack/prompts for loadConfigOrExit; mock it
// so the loud-vs-"run init" message can be asserted (and no real terminal output).
vi.mock('@clack/prompts', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const sample: PharnConfig = {
  pharnVersion: '0.2.0',
  skillsVersion: '0.68.0',
  repo: 'pharn-dev/pharn-oss',
  commit: 'abc123',
  constitution: 'standard',
  modules: [{ name: 'pharn-core', version: '0.2.0' }],
  installedAt: '2026-06-11T00:00:00.000Z',
};

describe('pharn-config', () => {
  const tmp = useTmpDir();

  it('round-trips a config', async () => {
    await writePharnConfig(tmp.path(), sample);
    expect(readPharnConfig(tmp.path())).toEqual(sample);
  });

  it('round-trips the additive layout field (pharn)', async () => {
    const withLayout: PharnConfig = { ...sample, layout: 'pharn' };
    await writePharnConfig(tmp.path(), withLayout);
    expect(readPharnConfig(tmp.path())).toEqual(withLayout);
  });

  it('loads a legacy config with NO layout field (P7 additive)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify(sample),
    );
    const loaded = readPharnConfig(tmp.path());
    expect(loaded).toEqual(sample);
    expect(loaded && 'layout' in loaded).toBe(false);
  });

  it('drops a garbage layout value on read (→ flat downstream, P5)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({ ...sample, layout: 'sideways' }),
    );
    const loaded = readPharnConfig(tmp.path());
    expect(loaded && 'layout' in loaded).toBe(false);
  });

  it('returns null when no config exists', () => {
    expect(readPharnConfig(tmp.path())).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    writeFileSync(join(tmp.path(), 'pharn.config.json'), '{ not json');
    expect(readPharnConfig(tmp.path())).toBeNull();
  });

  it('returns null when the shape is wrong (hand-edited config)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({ skillsVersion: '0.1.0', modules: 'oops' }),
    );
    expect(readPharnConfig(tmp.path())).toBeNull();
  });

  it('round-trips a config with a valid models block', async () => {
    const withModels: PharnConfig = {
      ...sample,
      models: DEFAULT_MODEL_ROUTING,
    };
    await writePharnConfig(tmp.path(), withModels);
    expect(readPharnConfig(tmp.path())).toEqual(withModels);
  });

  it('THROWS (naming the offender), not null, when the models block is invalid (BUG 1)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '0.1.0',
        modules: [],
        models: { default: { model: 'gpt-4', effort: 'high' } },
      }),
    );
    expect(() => readPharnConfig(tmp.path())).toThrow(ModelRoutingError);
    expect(() => readPharnConfig(tmp.path())).toThrow(/gpt-4/);
  });

  it('round-trips a config with a valid seam block', async () => {
    const withSeam: PharnConfig = {
      ...sample,
      seam: DEFAULT_SEAM_CONFIG,
    };
    await writePharnConfig(tmp.path(), withSeam);
    expect(readPharnConfig(tmp.path())).toEqual(withSeam);
  });

  it('THROWS (naming the offender), not null, when the seam block is invalid (BUG 1)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '0.1.0',
        modules: [],
        seam: { resolutionOrder: ['official-skill', 'model', 'fetch'] },
      }),
    );
    expect(() => readPharnConfig(tmp.path())).toThrow(SeamConfigError);
    expect(() => readPharnConfig(tmp.path())).toThrow(/ask/);
  });

  it('THROWS naming an unknown key in the seam block — raw does NOT survive (BUG 2/BUG 3)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '0.1.0',
        modules: [],
        seam: { resolutionOrder: ['ask'], EXTRA: 'x' },
      }),
    );
    // The loader returns the validators' result, not `raw` — so an unknown key is
    // rejected (named), never carried verbatim into the runtime config.
    expect(() => readPharnConfig(tmp.path())).toThrow(/EXTRA/);
  });

  it('strips extra fields when normalizing modules', () => {
    const result = toInstalledModules([
      { name: 'pharn-core', version: '0.2.0', required: true } as never,
    ]);
    expect(result).toEqual([{ name: 'pharn-core', version: '0.2.0' }]);
  });

  it('round-trips the schemaVersion 2 additive fields (incl. skip answers)', async () => {
    const v2: PharnConfig = {
      ...sample,
      skillsVersion: '0.69.0',
      stackAnswers: {
        database: 'supabase',
        orm: 'drizzle',
        auth: 'better-auth',
        email: 'resend',
        payments: 'skip',
      },
      installedSkills: [
        { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
        { skill: 'better-auth', from: 'pharn-skills-auth/skills/better-auth' },
        { skill: 'resend', from: 'pharn-skills-email/skills/resend' },
      ],
    };
    await writePharnConfig(tmp.path(), v2);
    const read = readPharnConfig(tmp.path());
    expect(read).toEqual(v2);
    expect(read?.stackAnswers?.payments).toBe('skip');
  });

  it('still reads a legacy config that predates the archetype fields (P7)', async () => {
    // `sample` is a legacy module install (constitution + modules, no archetypes).
    await writePharnConfig(tmp.path(), sample);
    const read = readPharnConfig(tmp.path());
    expect(read?.constitution).toBe('standard');
    expect(read?.archetypes).toBeUndefined();
    expect(read?.capabilities).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // capabilities[].source — the FIRST capabilities-entry check this config has.
  // Validates `source` ONLY; name/role stay unvalidated (a separate axis, P7).
  // -------------------------------------------------------------------------
  describe('capabilities[].source ingest', () => {
    stubProcessExit();
    const withCaps = (caps: unknown[]) => ({
      pharnVersion: '0.4.0',
      skillsVersion: '1.0.0',
      repo: 'pharn-dev/pharn-oss',
      commit: null,
      modules: [],
      installedAt: '2026-08-07T00:00:00.000Z',
      archetypes: ['ssr'],
      capabilities: caps,
    });

    const writeRaw = (value: unknown): void => {
      writeFileSync(
        join(tmp.path(), 'pharn.config.json'),
        JSON.stringify(value, null, 2),
      );
    };

    it('round-trips a valid source through load/save unreconstructed', async () => {
      writeRaw(
        withCaps([
          { name: 'a11y', role: 'griller', source: 'auto' },
          { name: 'n-plus-one', role: 'lens', source: 'manual' },
        ]),
      );
      expect(readPharnConfig(tmp.path())?.capabilities).toEqual([
        { name: 'a11y', role: 'griller', source: 'auto' },
        { name: 'n-plus-one', role: 'lens', source: 'manual' },
      ]);
    });

    it('accepts an ABSENT source (legacy config, P7 additive)', () => {
      writeRaw(withCaps([{ name: 'a11y', role: 'griller' }]));
      expect(readPharnConfig(tmp.path())?.capabilities).toEqual([
        { name: 'a11y', role: 'griller' },
      ]);
    });

    it('THROWS a named error for a source outside the enum, naming the offender', () => {
      writeRaw(
        withCaps([
          { name: 'a11y', role: 'griller', source: 'auto' },
          { name: 'x', role: 'lens', source: 'automatic' },
        ]),
      );
      expect(() => readPharnConfig(tmp.path())).toThrow(CapabilitySourceError);
      expect(() => readPharnConfig(tmp.path())).toThrow(
        /capabilities\[1\]\.source/,
      );
    });

    it('THROWS for a wrong-typed source', () => {
      writeRaw(withCaps([{ name: 'a11y', role: 'griller', source: 7 }]));
      expect(() => readPharnConfig(tmp.path())).toThrow(CapabilitySourceError);
    });

    it('joins isConfigValidationError, so it reports loudly instead of the "run init" lie', () => {
      expect(isConfigValidationError(new CapabilitySourceError('x'))).toBe(
        true,
      );
      writeRaw(withCaps([{ name: 'a11y', role: 'griller', source: 'nope' }]));
      expect(() => loadConfigOrExit(tmp.path())).toThrow(ProcessExit);
      expect(vi.mocked(log.error).mock.calls.map(String).join()).toContain(
        'capabilities[0].source',
      );
    });
  });

  it('still loads a config carrying a removed vendorSkills key (P7 additive)', async () => {
    // A config written by an older CLI may carry the now-removed vendorSkills
    // field; the passthrough loader ignores unknown keys and still reads it.
    const withRemovedField = {
      ...sample,
      vendorSkills: ['supabase'],
    } as PharnConfig & { vendorSkills: string[] };
    await writePharnConfig(tmp.path(), withRemovedField);
    const read = readPharnConfig(tmp.path());
    expect(read?.skillsVersion).toBe(sample.skillsVersion);
    expect(read?.constitution).toBe('standard');
  });

  it('round-trips an archetype install config (no constitution, modules:[], capabilities)', async () => {
    const archetypeConfig: PharnConfig = {
      pharnVersion: '0.2.0',
      skillsVersion: '1.0.0',
      repo: 'pharn-dev/pharn-oss',
      commit: 'sha123',
      modules: [],
      installedAt: '2026-07-07T00:00:00.000Z',
      archetypes: ['ssr', 'backend'],
      capabilities: [
        { name: 'a11y', role: 'griller' },
        { name: 'n-plus-one', role: 'lens' },
      ],
    };
    await writePharnConfig(tmp.path(), archetypeConfig);
    const read = readPharnConfig(tmp.path());
    expect(read).toEqual(archetypeConfig);
    // No constitution variant is recorded for an archetype install.
    expect(read?.constitution).toBeUndefined();
  });
});

describe('isArchetypeConfig', () => {
  it('is true for a capabilities-bearing config', () => {
    expect(
      isArchetypeConfig({
        ...sample,
        modules: [],
        capabilities: [{ name: 'a11y', role: 'griller' }],
      }),
    ).toBe(true);
  });

  it('is false for a legacy module config', () => {
    expect(isArchetypeConfig(sample)).toBe(false);
  });

  it('is false when capabilities is absent, even with empty modules', () => {
    // Empty modules alone is NOT the marker — only a `capabilities` array is.
    expect(isArchetypeConfig({ ...sample, modules: [] })).toBe(false);
  });
});

describe('loadConfigOrExit', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  afterEach(() => vi.mocked(log.error).mockClear());

  it('exits(1) with the offender-naming message (NOT "run init") on invalid models (BUG 1)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '0.1.0',
        modules: [],
        models: { default: { model: 'gpt-4', effort: 'high' } },
      }),
    );
    expect(() => loadConfigOrExit(tmp.path())).toThrow(ProcessExit);
    const msg = vi
      .mocked(log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toMatch(/gpt-4/);
    expect(msg).not.toMatch(/pharn init/);
  });

  it('prints "run init" and exits(1) when the config is absent', () => {
    expect(() => loadConfigOrExit(tmp.path())).toThrow(ProcessExit);
    const msg = vi
      .mocked(log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toMatch(/pharn init/);
  });

  it('returns the config when valid', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify(sample),
    );
    expect(loadConfigOrExit(tmp.path())).toEqual(sample);
  });
});

describe('isConfigValidationError', () => {
  it('is true for the named validator errors, false for a plain Error (the config-vs-bug boundary)', () => {
    expect(isConfigValidationError(new ModelRoutingError('x'))).toBe(true);
    expect(isConfigValidationError(new SeamConfigError('x'))).toBe(true);
    expect(isConfigValidationError(new Error('x'))).toBe(false);
    expect(isConfigValidationError('nope')).toBe(false);
  });
});

describe('loadArchetypeConfigOrExit', () => {
  const tmp = useTmpDir();
  stubProcessExit();
  afterEach(() => vi.mocked(log.error).mockClear());

  it('returns an archetype (capability) config unchanged', () => {
    const archetype: PharnConfig = {
      ...sample,
      modules: [],
      archetypes: ['ssr'],
      capabilities: [{ name: 'a11y', role: 'griller' }],
    };
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify(archetype),
    );
    expect(loadArchetypeConfigOrExit(tmp.path())).toEqual(archetype);
  });

  it('rejects a legacy (module) config with the exact LEGACY_CONFIG_MESSAGE + exit(1)', () => {
    // `sample` is a legacy module install: modules present, no capabilities.
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify(sample),
    );
    expect(() => loadArchetypeConfigOrExit(tmp.path())).toThrow(ProcessExit);
    const msg = vi
      .mocked(log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toBe(LEGACY_CONFIG_MESSAGE);
    expect(msg).toMatch(/no longer supported/);
    expect(msg).toMatch(/pharn init/); // the remediation is to re-run init
  });

  it('exits(1) via loadConfigOrExit when the config is absent (unchanged)', () => {
    expect(() => loadArchetypeConfigOrExit(tmp.path())).toThrow(ProcessExit);
    const msg = vi
      .mocked(log.error)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(msg).toMatch(/pharn init/);
  });
});
