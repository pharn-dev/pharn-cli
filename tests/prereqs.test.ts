import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cancel } from '@clack/prompts';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';
import type { ManifestModule, ModulePrerequisite } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
}));

const { readProjectPackages, runGitPrereq, assertPrerequisites } =
  await import('../src/steps/prereqs.js');

function mod(
  name: string,
  prerequisites?: ModulePrerequisite[],
): ManifestModule {
  return {
    name,
    version: '1.0.0',
    required: false,
    dependsOn: [],
    description: name,
    ...(prerequisites ? { prerequisites } : {}),
  };
}

const nextPre: ModulePrerequisite = {
  package: 'next',
  reason: 'pharn-stack-nextjs targets Next.js. Run: npx create-next-app@latest',
};

describe('readProjectPackages', () => {
  const tmp = useTmpDir();

  it('returns an empty set when package.json is missing', () => {
    expect(readProjectPackages(tmp.path()).size).toBe(0);
  });

  it('unions dependencies and devDependencies', () => {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      JSON.stringify({
        dependencies: { next: '16' },
        devDependencies: { typescript: '5' },
      }),
    );
    const pkgs = readProjectPackages(tmp.path());
    expect(pkgs.has('next')).toBe(true);
    expect(pkgs.has('typescript')).toBe(true);
  });

  it('returns an empty set when package.json is malformed', () => {
    writeFileSync(join(tmp.path(), 'package.json'), '{ not json');
    expect(readProjectPackages(tmp.path()).size).toBe(0);
  });
});

describe('runGitPrereq', () => {
  const tmp = useTmpDir();
  stubProcessExit();

  it('fails if .git is missing', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(() => runGitPrereq()).toThrow(ProcessExit);
    cwd.mockRestore();
  });

  it('passes when .git is present (no package.json required)', () => {
    mkdirSync(join(tmp.path(), '.git'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(() => runGitPrereq()).not.toThrow();
    cwd.mockRestore();
  });
});

describe('assertPrerequisites', () => {
  const tmp = useTmpDir();
  stubProcessExit();

  function withPackages(deps: Record<string, string>): void {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      JSON.stringify({ dependencies: deps }),
    );
  }

  it('passes for an empty module set (the no-pack / ungate case)', () => {
    expect(() => assertPrerequisites([], tmp.path())).not.toThrow();
  });

  it('passes for modules that declare no prerequisites', () => {
    expect(() =>
      assertPrerequisites(
        [mod('pharn-core'), mod('pharn-pipeline')],
        tmp.path(),
      ),
    ).not.toThrow();
  });

  it('passes when the declared package is in dependencies', () => {
    withPackages({ next: '16' });
    expect(() =>
      assertPrerequisites([mod('pharn-stack-nextjs', [nextPre])], tmp.path()),
    ).not.toThrow();
  });

  it('passes when the declared package is in devDependencies', () => {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      JSON.stringify({ devDependencies: { next: '16' } }),
    );
    expect(() =>
      assertPrerequisites([mod('pharn-stack-nextjs', [nextPre])], tmp.path()),
    ).not.toThrow();
  });

  it('fails when a declared package is absent', () => {
    withPackages({ react: '19' });
    expect(() =>
      assertPrerequisites([mod('pharn-stack-nextjs', [nextPre])], tmp.path()),
    ).toThrow(ProcessExit);
  });

  it('fails when package.json is missing entirely', () => {
    expect(() =>
      assertPrerequisites([mod('pharn-stack-nextjs', [nextPre])], tmp.path()),
    ).toThrow(ProcessExit);
  });

  it('surfaces the prerequisite reason to the user', () => {
    withPackages({ react: '19' });
    vi.mocked(cancel).mockClear();
    expect(() =>
      assertPrerequisites([mod('pharn-stack-nextjs', [nextPre])], tmp.path()),
    ).toThrow(ProcessExit);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cancel).mock.calls[0]![0] as string).toContain(
      nextPre.reason,
    );
  });

  it('reports every missing prerequisite across modules at once', () => {
    withPackages({}); // neither next nor prisma present
    vi.mocked(cancel).mockClear();
    const prismaPre: ModulePrerequisite = {
      package: 'prisma',
      reason: 'Prisma is required. Run: npm i -D prisma',
    };
    expect(() =>
      assertPrerequisites(
        [mod('pharn-stack-nextjs', [nextPre]), mod('pharn-orm', [prismaPre])],
        tmp.path(),
      ),
    ).toThrow(ProcessExit);
    const msg = vi.mocked(cancel).mock.calls[0]![0] as string;
    expect(msg).toContain(nextPre.reason);
    expect(msg).toContain(prismaPre.reason);
  });

  it('passes when one module is satisfied and a sibling declares nothing', () => {
    withPackages({ next: '16' });
    expect(() =>
      assertPrerequisites(
        [mod('pharn-stack-nextjs', [nextPre]), mod('pharn-core')],
        tmp.path(),
      ),
    ).not.toThrow();
  });
});
