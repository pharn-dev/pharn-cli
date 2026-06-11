import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
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
  write(
    join(
      repoDir,
      'pharn-core',
      'templates',
      'constitution',
      'CONSTITUTION.gdpr-strict.md',
    ),
    'GDPR',
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

  it('rejects an absolute installs destination at parse time', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    // '/evil/' has a leading slash, so INSTALL_PATH_RE rejects it before any
    // copy is attempted (safeJoin remains the defense-in-depth backstop, but the
    // path allowlist now refuses absolute paths up front).
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
      ManifestValidationError,
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

  it('writes the gdpr-strict constitution variant', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldCore(repoDir);

    materializeCore(repoDir, claudeDir, 'gdpr-strict');

    expect(readFileSync(join(claudeDir, 'CONSTITUTION.md'), 'utf8')).toBe(
      'GDPR',
    );
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

  it('throws when the memory-bank template is missing', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldCore(repoDir);
    // A missing declared source is an upstream packaging bug — surface it
    // rather than silently producing an install with no memory bank.
    rmSync(join(repoDir, 'pharn-core', 'templates', 'memory-bank'), {
      recursive: true,
    });
    expect(() => materializeCore(repoDir, claudeDir, 'standard')).toThrow(
      ManifestValidationError,
    );
  });
});
