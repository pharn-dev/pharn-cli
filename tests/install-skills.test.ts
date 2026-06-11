import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  assertSkillSourcesExist,
  installSkills,
} from '../src/lib/install-modules.js';
import { ManifestValidationError } from '../src/lib/validate.js';
import type { InstalledSkill } from '../src/types.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// Build a category module on disk with two sibling skills.
function scaffoldOrm(repoDir: string): void {
  write(
    join(repoDir, 'pharn-skills-orm', 'skills', 'drizzle', 'SKILL.md'),
    'd',
  );
  write(join(repoDir, 'pharn-skills-orm', 'skills', 'prisma', 'SKILL.md'), 'p');
  write(join(repoDir, 'pharn-skills-orm', 'module.json'), '{}');
}

const drizzle: InstalledSkill = {
  skill: 'drizzle',
  from: 'pharn-skills-orm/skills/drizzle',
};

describe('installSkills', () => {
  const tmp = useTmpDir();

  it('copies only the selected skill, not its siblings or module.json', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldOrm(repoDir);

    installSkills(repoDir, claudeDir, [drizzle]);

    expect(existsSync(join(claudeDir, 'skills', 'drizzle', 'SKILL.md'))).toBe(
      true,
    );
    expect(existsSync(join(claudeDir, 'skills', 'prisma'))).toBe(false);
    expect(existsSync(join(claudeDir, 'skills', 'module.json'))).toBe(false);
  });

  it('refuses a source path that escapes the repo dir', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldOrm(repoDir);
    expect(() =>
      installSkills(repoDir, claudeDir, [{ skill: 'evil', from: '/evil/' }]),
    ).toThrow(/path escape/);
  });
});

describe('assertSkillSourcesExist', () => {
  const tmp = useTmpDir();

  it('passes when every source exists', () => {
    const repoDir = join(tmp.path(), 'repo');
    scaffoldOrm(repoDir);
    expect(() => assertSkillSourcesExist(repoDir, [drizzle])).not.toThrow();
  });

  it('throws (before any copy) when a source is missing', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    scaffoldOrm(repoDir);
    const missing: InstalledSkill = {
      skill: 'ghost',
      from: 'pharn-skills-orm/skills/ghost',
    };
    expect(() => assertSkillSourcesExist(repoDir, [drizzle, missing])).toThrow(
      ManifestValidationError,
    );
    // Nothing was written.
    expect(existsSync(join(claudeDir, 'skills'))).toBe(false);
  });

  it('throws when two skills resolve to the same basename', () => {
    const repoDir = join(tmp.path(), 'repo');
    scaffoldOrm(repoDir);
    // A second category ships a skill whose basename collides with drizzle —
    // both would land in .claude/skills/drizzle/ and overwrite each other.
    write(
      join(repoDir, 'pharn-skills-db', 'skills', 'drizzle', 'SKILL.md'),
      'x',
    );
    const collision: InstalledSkill = {
      skill: 'drizzle',
      from: 'pharn-skills-db/skills/drizzle',
    };
    expect(() =>
      assertSkillSourcesExist(repoDir, [drizzle, collision]),
    ).toThrow(/duplicate skill/i);
  });
});
