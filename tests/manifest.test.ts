import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  parseManifest,
  parseModuleManifest,
  resolveModules,
  categorizeModules,
  isStackPack,
  ResolutionError,
  fetchRemoteManifest,
  readManifest,
  readModuleManifest,
} from '../src/lib/manifest.js';
import { ManifestValidationError } from '../src/lib/validate.js';
import type { Manifest } from '../src/types.js';

function manifest(): Manifest {
  return parseManifest({
    schemaVersion: 1,
    skillsVersion: '0.68.0',
    modules: [
      {
        name: 'pharn-core',
        version: '0.2.0',
        required: true,
        dependsOn: [],
        description: 'core',
      },
      {
        name: 'pharn-pipeline',
        version: '0.5.0',
        required: false,
        dependsOn: ['pharn-core'],
        description: 'pipeline',
      },
      {
        name: 'pharn-review',
        version: '0.4.0',
        required: false,
        dependsOn: ['pharn-core'],
        description: 'review',
      },
      {
        name: 'pharn-stack-react',
        version: '0.1.1',
        required: false,
        dependsOn: ['pharn-core'],
        description: 'react base',
      },
      {
        name: 'pharn-stack-nextjs',
        version: '0.30.0',
        required: false,
        dependsOn: ['pharn-core', 'pharn-stack-react'],
        exclusiveWith: ['pharn-stack-*'],
        description: 'nextjs',
      },
      {
        name: 'pharn-stack-remix',
        version: '0.1.0',
        required: false,
        dependsOn: ['pharn-core', 'pharn-stack-react'],
        exclusiveWith: ['pharn-stack-*'],
        description: 'remix',
      },
    ],
  });
}

describe('parseManifest', () => {
  it('rejects an unsupported schemaVersion', () => {
    expect(() =>
      parseManifest({ schemaVersion: 2, skillsVersion: '1.0.0', modules: [] }),
    ).toThrow(ManifestValidationError);
  });

  it('rejects a malformed skillsVersion', () => {
    expect(() =>
      parseManifest({
        schemaVersion: 1,
        skillsVersion: 'latest',
        modules: [
          {
            name: 'pharn-core',
            version: '0.1.0',
            required: true,
            dependsOn: [],
            description: 'x',
          },
        ],
      }),
    ).toThrow(ManifestValidationError);
  });

  it('rejects an empty modules array', () => {
    expect(() =>
      parseManifest({ schemaVersion: 1, skillsVersion: '0.1.0', modules: [] }),
    ).toThrow(ManifestValidationError);
  });

  it('rejects a non-string entry in a string array (dependsOn)', () => {
    expect(() =>
      parseManifest({
        schemaVersion: 1,
        skillsVersion: '0.1.0',
        modules: [
          {
            name: 'pharn-core',
            version: '0.1.0',
            required: true,
            dependsOn: [42],
            description: 'x',
          },
        ],
      }),
    ).toThrow(ManifestValidationError);
  });
});

describe('parseModuleManifest', () => {
  it('parses a valid installs map', () => {
    const m = parseModuleManifest({
      name: 'pharn-core',
      version: '0.2.0',
      required: true,
      dependsOn: [],
      description: 'core',
      installs: { commands: 'commands/', skills: 'skills/' },
    });
    expect(m.installs).toEqual({ commands: 'commands/', skills: 'skills/' });
  });

  it('rejects path traversal in installs', () => {
    expect(() =>
      parseModuleManifest({
        name: 'pharn-core',
        version: '0.2.0',
        required: true,
        dependsOn: [],
        description: 'core',
        installs: { '../evil': 'skills/' },
      }),
    ).toThrow(ManifestValidationError);
  });

  it('rejects an empty installs map', () => {
    expect(() =>
      parseModuleManifest({
        name: 'pharn-core',
        version: '0.2.0',
        required: true,
        dependsOn: [],
        description: 'core',
        installs: {},
      }),
    ).toThrow(ManifestValidationError);
  });
});

describe('resolveModules', () => {
  it('always includes pharn-core even with no selection', () => {
    const r = resolveModules(manifest(), []);
    expect(r.map((m) => m.name)).toEqual(['pharn-core']);
  });

  it('pulls in transitive dependencies before dependents', () => {
    const r = resolveModules(manifest(), ['pharn-stack-nextjs']);
    const names = r.map((m) => m.name);
    expect(names).toContain('pharn-stack-react');
    expect(names.indexOf('pharn-core')).toBeLessThan(
      names.indexOf('pharn-stack-react'),
    );
    expect(names.indexOf('pharn-stack-react')).toBeLessThan(
      names.indexOf('pharn-stack-nextjs'),
    );
  });

  it('throws on an unknown module', () => {
    expect(() => resolveModules(manifest(), ['pharn-nope'])).toThrow(
      ResolutionError,
    );
  });

  it('enforces stack-pack exclusivity', () => {
    expect(() =>
      resolveModules(manifest(), ['pharn-stack-nextjs', 'pharn-stack-remix']),
    ).toThrow(ResolutionError);
  });

  it('does NOT treat a stack pack and its own base as a conflict', () => {
    // pharn-stack-nextjs has exclusiveWith ['pharn-stack-*'] and depends on
    // pharn-stack-react, which matches that glob. They must not false-conflict.
    expect(() =>
      resolveModules(manifest(), ['pharn-stack-nextjs']),
    ).not.toThrow();
  });

  it('throws on a dependency cycle', () => {
    const cyclic = parseManifest({
      schemaVersion: 1,
      skillsVersion: '0.1.0',
      modules: [
        {
          name: 'pharn-core',
          version: '0.1.0',
          required: true,
          dependsOn: [],
          description: 'core',
        },
        {
          name: 'pharn-a',
          version: '0.1.0',
          required: false,
          dependsOn: ['pharn-b'],
          description: 'a',
        },
        {
          name: 'pharn-b',
          version: '0.1.0',
          required: false,
          dependsOn: ['pharn-a'],
          description: 'b',
        },
      ],
    });
    expect(() => resolveModules(cyclic, ['pharn-a'])).toThrow(/cycle/i);
  });

  it('does not duplicate shared dependencies', () => {
    const r = resolveModules(manifest(), ['pharn-pipeline', 'pharn-review']);
    const cores = r.filter((m) => m.name === 'pharn-core');
    expect(cores).toHaveLength(1);
  });
});

describe('categorizeModules', () => {
  it('splits core, optional, and stack packs', () => {
    const { core, optional, stackPacks } = categorizeModules(manifest());
    expect(core.map((m) => m.name)).toEqual(['pharn-core']);
    expect(optional.map((m) => m.name).sort()).toEqual([
      'pharn-pipeline',
      'pharn-review',
    ]);
    expect(stackPacks.map((m) => m.name).sort()).toEqual([
      'pharn-stack-nextjs',
      'pharn-stack-remix',
    ]);
  });

  it('keeps a stack base out of the optional list', () => {
    const { optional } = categorizeModules(manifest());
    expect(optional.map((m) => m.name)).not.toContain('pharn-stack-react');
  });
});

describe('isStackPack', () => {
  it('detects a glob exclusivity rule', () => {
    const m = manifest().modules.find((x) => x.name === 'pharn-stack-nextjs')!;
    expect(isStackPack(m)).toBe(true);
  });

  it('treats a plain module as not a stack pack', () => {
    const m = manifest().modules.find((x) => x.name === 'pharn-pipeline')!;
    expect(isStackPack(m)).toBe(false);
  });
});

describe('readManifest / readModuleManifest', () => {
  const tmp = useTmpDir();

  const coreManifest = {
    name: 'pharn-core',
    version: '0.2.0',
    required: true,
    dependsOn: [],
    description: 'core',
    installs: { commands: 'commands/' },
  };

  it('reads a manifest.json from a repo dir', () => {
    writeFileSync(
      join(tmp.path(), 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        skillsVersion: '0.68.1',
        modules: [coreManifest],
      }),
    );
    expect(readManifest(tmp.path()).skillsVersion).toBe('0.68.1');
  });

  it('throws when manifest.json is absent', () => {
    expect(() => readManifest(tmp.path())).toThrow(ManifestValidationError);
  });

  it('reads a module.json from a repo dir', () => {
    mkdirSync(join(tmp.path(), 'pharn-core'), { recursive: true });
    writeFileSync(
      join(tmp.path(), 'pharn-core', 'module.json'),
      JSON.stringify(coreManifest),
    );
    expect(readModuleManifest(tmp.path(), 'pharn-core').installs).toEqual({
      commands: 'commands/',
    });
  });

  it('throws when a module.json is absent', () => {
    expect(() => readModuleManifest(tmp.path(), 'pharn-core')).toThrow(
      ManifestValidationError,
    );
  });
});

describe('fetchRemoteManifest', () => {
  afterEach(() => vi.unstubAllGlobals());

  const body = JSON.stringify({
    schemaVersion: 1,
    skillsVersion: '0.68.1',
    modules: [
      {
        name: 'pharn-core',
        version: '0.2.0',
        required: true,
        dependsOn: [],
        description: 'core',
      },
    ],
  });

  function stubFetch(
    res: Partial<Response> & { text?: () => Promise<string> },
  ) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => res),
    );
  }

  it('parses a valid remote manifest', async () => {
    stubFetch({
      ok: true,
      headers: new Headers(),
      text: async () => body,
    });
    const m = await fetchRemoteManifest();
    expect(m.skillsVersion).toBe('0.68.1');
  });

  it('throws on a non-ok response', async () => {
    stubFetch({ ok: false, status: 503, headers: new Headers() });
    await expect(fetchRemoteManifest()).rejects.toThrow(/fetch failed/);
  });

  it('rejects an oversized body advertised via content-length', async () => {
    stubFetch({
      ok: true,
      headers: new Headers({ 'content-length': String(1024 * 1024) }),
      text: async () => body,
    });
    await expect(fetchRemoteManifest()).rejects.toThrow(/too large/);
  });
});
