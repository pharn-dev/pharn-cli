import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  readPharnConfig,
  writePharnConfig,
  toInstalledModules,
} from '../src/lib/pharn-config.js';
import type { PharnConfig } from '../src/types.js';

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
      vendorSkills: ['supabase'],
    };
    await writePharnConfig(tmp.path(), v2);
    const read = readPharnConfig(tmp.path());
    expect(read).toEqual(v2);
    expect(read?.stackAnswers?.payments).toBe('skip');
  });
});
