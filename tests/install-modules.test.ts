import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { installModule, materializeCore } from '../src/lib/install-modules.js';
import { ManifestValidationError } from '../src/lib/validate.js';
import type { ManifestModule } from '../src/types.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// Build a fake fetched-repo on disk with a pharn-core module.
function scaffoldCore(repoDir: string): void {
  write(
    join(repoDir, 'pharn-core', 'module.json'),
    JSON.stringify({
      name: 'pharn-core',
      version: '0.2.0',
      required: true,
      dependsOn: [],
      description: 'core',
      installs: {
        commands: 'commands/',
        skills: 'skills/',
        templates: 'templates/',
      },
    }),
  );
  write(join(repoDir, 'pharn-core', 'commands', 'pharn-init.md'), 'init');
  write(join(repoDir, 'pharn-core', 'skills', 'a', 'SKILL.md'), 'skill');
  write(
    join(
      repoDir,
      'pharn-core',
      'templates',
      'memory-bank',
      'architecture-context.md',
    ),
    'mb',
  );
  write(
    join(repoDir, 'pharn-core', 'templates', 'memory-bank', '.gitkeep'),
    '',
  );
  write(
    join(
      repoDir,
      'pharn-core',
      'templates',
      'constitution',
      'CONSTITUTION.standard.md',
    ),
    'STANDARD',
  );
  write(
    join(
      repoDir,
      'pharn-core',
      'templates',
      'constitution',
      'CONSTITUTION.minimal.md',
    ),
    'MINIMAL',
  );
}

const coreModule: ManifestModule = {
  name: 'pharn-core',
  version: '0.2.0',
  required: true,
  dependsOn: [],
  description: 'core',
};

describe('installModule', () => {
  const tmp = useTmpDir();

  it('copies each installs entry into .claude/', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldCore(repoDir);

    installModule(repoDir, claudeDir, coreModule);

    expect(existsSync(join(claudeDir, 'commands', 'pharn-init.md'))).toBe(true);
    expect(existsSync(join(claudeDir, 'skills', 'a', 'SKILL.md'))).toBe(true);
    expect(
      existsSync(
        join(
          claudeDir,
          'templates',
          'constitution',
          'CONSTITUTION.standard.md',
        ),
      ),
    ).toBe(true);
  });

  it('refuses an installs destination that escapes the .claude dir', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    // '/evil/' passes INSTALL_PATH_RE (no dots) but resolves to an absolute
    // path outside claudeDir — safeJoin must reject it.
    write(
      join(repoDir, 'pharn-core', 'module.json'),
      JSON.stringify({
        name: 'pharn-core',
        version: '0.2.0',
        required: true,
        dependsOn: [],
        description: 'core',
        installs: { commands: '/evil/' },
      }),
    );
    write(join(repoDir, 'pharn-core', 'commands', 'x.md'), 'x');
    expect(() => installModule(repoDir, claudeDir, coreModule)).toThrow(
      /path escape/,
    );
  });

  it('throws when a declared installs path is missing in the repo', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    write(
      join(repoDir, 'pharn-core', 'module.json'),
      JSON.stringify({
        name: 'pharn-core',
        version: '0.2.0',
        required: true,
        dependsOn: [],
        description: 'core',
        installs: { commands: 'commands/' },
      }),
    );
    expect(() => installModule(repoDir, claudeDir, coreModule)).toThrow(
      ManifestValidationError,
    );
  });
});

describe('materializeCore', () => {
  const tmp = useTmpDir();

  it('writes memory-bank and the chosen constitution variant', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldCore(repoDir);

    materializeCore(repoDir, claudeDir, 'standard');

    expect(readFileSync(join(claudeDir, 'CONSTITUTION.md'), 'utf8')).toBe(
      'STANDARD',
    );
    expect(
      existsSync(join(claudeDir, 'memory-bank', 'architecture-context.md')),
    ).toBe(true);
    // .gitkeep is filtered out of the materialized memory bank.
    expect(existsSync(join(claudeDir, 'memory-bank', '.gitkeep'))).toBe(false);
  });

  it('throws on an unknown constitution variant', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldCore(repoDir);
    // @ts-expect-error testing an invalid variant at runtime
    expect(() => materializeCore(repoDir, claudeDir, 'hipaa')).toThrow(
      ManifestValidationError,
    );
  });
});
