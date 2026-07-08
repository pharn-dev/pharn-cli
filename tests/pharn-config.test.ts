import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  readPharnConfig,
  writePharnConfig,
  toInstalledModules,
  isArchetypeConfig,
} from '../src/lib/pharn-config.js';
import type { PharnConfig } from '../src/types.js';
import { DEFAULT_MODEL_ROUTING } from '../src/lib/model-routing.js';

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

  it('returns null when the models block is invalid (hand-edited)', () => {
    writeFileSync(
      join(tmp.path(), 'pharn.config.json'),
      JSON.stringify({
        skillsVersion: '0.1.0',
        modules: [],
        models: { default: { model: 'gpt-4', effort: 'high' } },
      }),
    );
    expect(readPharnConfig(tmp.path())).toBeNull();
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
