import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { note } from '@clack/prompts';
import { describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers.js';
import { wizardSpec } from './wizard-fixture.js';
import type { ManifestModule } from '../src/types.js';

vi.mock('@clack/prompts', () => ({ note: vi.fn() }));

const { runDetect } = await import('../src/steps/detect.js');

const stackPacks: ManifestModule[] = [
  {
    name: 'pharn-stack-nextjs',
    version: '0.1.0',
    required: false,
    dependsOn: [],
    exclusiveWith: ['pharn-stack-*'],
    description: 'nextjs',
    prerequisites: [{ package: 'next', reason: 'needs next' }],
  },
];

describe('runDetect', () => {
  const tmp = useTmpDir();

  function withPackages(deps: Record<string, string>): void {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      JSON.stringify({ dependencies: deps }),
    );
  }

  it('pre-fills the stack pack and tech answers from package.json', () => {
    withPackages({
      next: '16',
      'drizzle-orm': '1',
      '@supabase/supabase-js': '2',
    });
    const { detectedAnswers, detectedStackPack } = runDetect(
      wizardSpec(),
      stackPacks,
      tmp.path(),
    );
    expect(detectedStackPack).toBe('pharn-stack-nextjs');
    expect(detectedAnswers).toEqual({ database: 'supabase', orm: 'drizzle' });
    // the note lists the pack by name and the answers by their friendly labels.
    expect(vi.mocked(note)).toHaveBeenCalledWith(
      'pharn-stack-nextjs, Supabase, Drizzle',
      'Detected from package.json',
    );
  });

  it('detects nothing for an unknown stack', () => {
    withPackages({ express: '4' });
    const { detectedAnswers, detectedStackPack } = runDetect(
      wizardSpec(),
      stackPacks,
      tmp.path(),
    );
    expect(detectedStackPack).toBeNull();
    expect(detectedAnswers).toEqual({});
  });

  it('detects nothing when package.json is missing', () => {
    const { detectedAnswers, detectedStackPack } = runDetect(
      wizardSpec(),
      stackPacks,
      tmp.path(),
    );
    expect(detectedStackPack).toBeNull();
    expect(detectedAnswers).toEqual({});
  });
});
