import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  lstatSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  installModule,
  installSkills,
  assertSkillSourcesExist,
  materializeCore,
} from '../src/lib/install-modules.js';
import { ManifestValidationError } from '../src/lib/validate.js';
import type { ManifestModule } from '../src/types.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// True if ANYTHING exists at `path` (file, dir, OR symlink) — lstat does not
// follow the link, so a skipped-but-somehow-present symlink is still detected
// (existsSync would follow a dangling link and report it missing).
function lexists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
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

  it('strips Principle 2 when the project is not multi-tenant', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldCore(repoDir);
    // Overwrite the standard variant with realistic structure so the strip has
    // numbered headings + a principles_included list to operate on.
    write(
      join(
        repoDir,
        'pharn-core',
        'templates',
        'constitution',
        'CONSTITUTION.standard.md',
      ),
      [
        '---',
        'principles_included: [1, 2, 3, 4]',
        '---',
        '',
        '## Principle 1: Privacy by Default',
        '',
        '- p1',
        '',
        '## Principle 2: Multi-Tenant Isolation',
        '',
        '- p2',
        '',
        '## Principle 3: Layer Integrity',
        '',
        '- p3',
        '',
        '## How this file is enforced',
        '',
        'x',
        '',
      ].join('\n'),
    );

    materializeCore(repoDir, claudeDir, 'standard', false);

    const out = readFileSync(join(claudeDir, 'CONSTITUTION.md'), 'utf8');
    expect(out).toContain('principles_included: [1, 3, 4]');
    expect(out).not.toMatch(/## Principle 2:/);
    expect(out).toContain('## Principle 1: Privacy by Default');
    expect(out).toContain('## Principle 3: Layer Integrity');
  });

  it('keeps the constitution verbatim when multi-tenant (the default)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldCore(repoDir);

    materializeCore(repoDir, claudeDir, 'standard', true);

    expect(readFileSync(join(claudeDir, 'CONSTITUTION.md'), 'utf8')).toBe(
      'STANDARD',
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

  it('rejects a symlinked memory-bank source (untrusted repo, P2)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldCore(repoDir);
    const outside = join(tmp.path(), 'outside-mb');
    write(join(outside, 'x.md'), 'x');
    // Swap the real memory-bank template dir for a symlink onto an out-of-tree
    // dir — a malicious clone plants it; materializeCore must refuse.
    rmSync(join(repoDir, 'pharn-core', 'templates', 'memory-bank'), {
      recursive: true,
    });
    symlinkSync(
      outside,
      join(repoDir, 'pharn-core', 'templates', 'memory-bank'),
    );
    expect(() => materializeCore(repoDir, claudeDir, 'standard')).toThrow(
      ManifestValidationError,
    );
  });
});

// --- FIX 2: symlink-escape defense (P2), mirroring install-capabilities.ts ----
describe('installModule — untrusted-copy guards (P2)', () => {
  const tmp = useTmpDir();

  function writeModuleJson(repoDir: string, installs: Record<string, string>) {
    write(
      join(repoDir, 'pharn-core', 'module.json'),
      JSON.stringify({
        name: 'pharn-core',
        version: '0.2.0',
        required: true,
        dependsOn: [],
        description: 'core',
        installs,
      }),
    );
  }

  it('rejects an installs source that is a symlink (Layer 1 root)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    const outside = join(tmp.path(), 'outside');
    write(join(outside, 'x.md'), 'x');
    writeModuleJson(repoDir, { commands: 'commands/' });
    // `commands` is a symlink onto a real dir outside the module.
    symlinkSync(outside, join(repoDir, 'pharn-core', 'commands'));
    expect(() => installModule(repoDir, claudeDir, coreModule)).toThrow(
      ManifestValidationError,
    );
  });

  it('skips a nested symlink inside an installs dir (never materialized)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    const outside = join(tmp.path(), 'outside');
    write(join(outside, 'secret.md'), 'secret');
    writeModuleJson(repoDir, { commands: 'commands/' });
    write(join(repoDir, 'pharn-core', 'commands', 'real.md'), 'real');
    symlinkSync(
      join(outside, 'secret.md'),
      join(repoDir, 'pharn-core', 'commands', 'link.md'),
    );
    installModule(repoDir, claudeDir, coreModule);
    // real sibling copied; the nested symlink skipped by the copy filter.
    expect(existsSync(join(claudeDir, 'commands', 'real.md'))).toBe(true);
    expect(lexists(join(claudeDir, 'commands', 'link.md'))).toBe(false);
  });

  it('refuses to write through a pre-planted symlink that escapes .claude/ (Layer 2)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    const outside = join(tmp.path(), 'outside');
    mkdirSync(outside, { recursive: true });
    // Pre-plant .claude/escape as a symlink onto an out-of-tree dir (a prior run
    // / out-of-band). A single-entry write through it has no ".." and passes the
    // lexical safeJoin — the realpath backstop must still refuse it.
    mkdirSync(claudeDir, { recursive: true });
    symlinkSync(outside, join(claudeDir, 'escape'));
    writeModuleJson(repoDir, { real: 'escape/pwned' });
    write(join(repoDir, 'pharn-core', 'real'), 'pwn');
    expect(() => installModule(repoDir, claudeDir, coreModule)).toThrow(
      ManifestValidationError,
    );
    // Nothing was written outside .claude/.
    expect(existsSync(join(outside, 'pwned'))).toBe(false);
  });
});

describe('assertSkillSourcesExist / installSkills — symlink guard (P2)', () => {
  const tmp = useTmpDir();

  it('rejects a skill source that is a symlink (pre-flight, nothing written)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const outside = join(tmp.path(), 'outside');
    write(join(outside, 'SKILL.md'), 'x');
    mkdirSync(join(repoDir, 'pharn-skills-orm', 'skills'), { recursive: true });
    symlinkSync(
      outside,
      join(repoDir, 'pharn-skills-orm', 'skills', 'drizzle'),
    );
    expect(() =>
      assertSkillSourcesExist(repoDir, [
        { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
      ]),
    ).toThrow(ManifestValidationError);
  });

  it('skips a nested symlink when installing a real skill dir', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    const outside = join(tmp.path(), 'outside');
    write(join(outside, 'secret.md'), 'secret');
    write(
      join(repoDir, 'pharn-skills-orm', 'skills', 'drizzle', 'SKILL.md'),
      'skill',
    );
    symlinkSync(
      join(outside, 'secret.md'),
      join(repoDir, 'pharn-skills-orm', 'skills', 'drizzle', 'link.md'),
    );
    installSkills(repoDir, claudeDir, [
      { skill: 'drizzle', from: 'pharn-skills-orm/skills/drizzle' },
    ]);
    expect(existsSync(join(claudeDir, 'skills', 'drizzle', 'SKILL.md'))).toBe(
      true,
    );
    expect(lexists(join(claudeDir, 'skills', 'drizzle', 'link.md'))).toBe(
      false,
    );
  });
});

// --- FIX 3: dev/product allowlist on the legacy path (Surface A) --------------
describe('installModule — dev/product allowlist (Surface A)', () => {
  const tmp = useTmpDir();

  it('excludes pharn-dev-* commands and *.test.* files from a legacy install', () => {
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
    write(join(repoDir, 'pharn-core', 'commands', 'pharn-plan.md'), 'product');
    write(
      join(repoDir, 'pharn-core', 'commands', 'pharn-dev-build.md'),
      'devloop',
    );
    write(
      join(repoDir, 'pharn-core', 'commands', 'set-writes-scope.test.cjs'),
      'test',
    );
    installModule(repoDir, claudeDir, coreModule);
    // product command copied; dev-loop command + test file structurally skipped.
    expect(existsSync(join(claudeDir, 'commands', 'pharn-plan.md'))).toBe(true);
    expect(existsSync(join(claudeDir, 'commands', 'pharn-dev-build.md'))).toBe(
      false,
    );
    expect(
      existsSync(join(claudeDir, 'commands', 'set-writes-scope.test.cjs')),
    ).toBe(false);
  });
});
