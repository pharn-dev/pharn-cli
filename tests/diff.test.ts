import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { diffInstalled } from '../src/lib/diff.js';
import { ManifestValidationError } from '../src/lib/validate.js';

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// Write repoDir/<name>/module.json with the given installs map. Names + install
// paths must satisfy MODULE_NAME_RE / INSTALL_PATH_RE (readModuleManifest
// validates them), so: `pharn-*` names, lowercase dot-free install paths.
function writeModule(
  repoDir: string,
  name: string,
  installs: Record<string, string>,
): void {
  write(
    join(repoDir, name, 'module.json'),
    JSON.stringify({
      name,
      version: '0.1.0',
      required: false,
      dependsOn: [],
      description: 'test module',
      installs,
    }),
  );
}

// relpath -> content for every file under dir (used to prove zero writes).
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, prefix: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), rel);
      else out[rel] = readFileSync(join(d, e.name), 'utf8');
    }
  };
  walk(dir, '');
  return out;
}

describe('diffInstalled', () => {
  const tmp = useTmpDir();

  it('reports ok / modified / missing across directory and single-file installs', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    // Directory install (commands/) + single-file install (notes, no extension).
    writeModule(repoDir, 'pharn-core', {
      commands: 'commands/',
      notes: 'notes',
    });
    write(join(repoDir, 'pharn-core', 'commands', 'a.md'), 'A');
    write(join(repoDir, 'pharn-core', 'commands', 'sub', 'b.md'), 'B');
    write(join(repoDir, 'pharn-core', 'notes'), 'N');

    write(join(claudeDir, 'commands', 'a.md'), 'A'); // identical
    write(join(claudeDir, 'commands', 'sub', 'b.md'), 'CHANGED'); // modified
    // .claude/notes is absent → missing (file branch).

    const diff = diffInstalled({
      repoDir,
      claudeDir,
      moduleNames: ['pharn-core'],
      skills: [],
    });

    expect(diff.okCount).toBe(1);
    expect(diff.modified).toEqual(['commands/sub/b.md']);
    expect(diff.missing).toEqual(['notes']);
  });

  it('diffs selectively-installed skills under skills/<basename>/', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    write(
      join(repoDir, 'pharn-skills-orm', 'skills', 'prisma', 'SKILL.md'),
      'S',
    );
    write(join(claudeDir, 'skills', 'prisma', 'SKILL.md'), 'EDITED');

    const diff = diffInstalled({
      repoDir,
      claudeDir,
      moduleNames: [],
      skills: [{ skill: 'prisma', from: 'pharn-skills-orm/skills/prisma' }],
    });

    expect(diff.modified).toEqual(['skills/prisma/SKILL.md']);
    expect(diff.missing).toEqual([]);
    expect(diff.okCount).toBe(0);
  });

  it('diffs a single-file skill source (file branch)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    write(join(repoDir, 'pharn-skills-orm', 'loose'), 'L');
    write(join(claudeDir, 'skills', 'loose'), 'L');

    const diff = diffInstalled({
      repoDir,
      claudeDir,
      moduleNames: [],
      skills: [{ skill: 'loose', from: 'pharn-skills-orm/loose' }],
    });

    expect(diff.okCount).toBe(1);
    expect(diff.modified).toEqual([]);
    expect(diff.missing).toEqual([]);
  });

  it('never reports CONSTITUTION.md or memory-bank/ even when present and differing', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    // A module mapping into the user-owned memory bank — both a directory and a
    // bare-file form (the file form exercises the `=== 'memory-bank'` branch).
    writeModule(repoDir, 'pharn-core', {
      mbdir: 'memory-bank/',
      mbfile: 'memory-bank',
    });
    write(join(repoDir, 'pharn-core', 'mbdir', 'progress.md'), 'UPSTREAM');
    write(join(repoDir, 'pharn-core', 'mbfile'), 'UPSTREAM');

    // Hand-edited working copies on disk — and a CONSTITUTION.md that no install
    // maps. None of these may surface as drift.
    write(join(claudeDir, 'memory-bank', 'progress.md'), 'MY NOTES');
    write(join(claudeDir, 'CONSTITUTION.md'), 'MY CONSTITUTION');

    const diff = diffInstalled({
      repoDir,
      claudeDir,
      moduleNames: ['pharn-core'],
      skills: [],
    });

    expect(diff.okCount).toBe(0);
    expect(diff.modified).toEqual([]);
    expect(diff.missing).toEqual([]);
    expect([...diff.modified, ...diff.missing]).not.toContainEqual(
      expect.stringContaining('memory-bank'),
    );
    expect([...diff.modified, ...diff.missing]).not.toContain(
      'CONSTITUTION.md',
    );
  });

  it('reports template sources under templates/ (exclusion is anchored at the .claude/ root)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    // templates/memory-bank/ is a PHARN-owned source copy — it must NOT be
    // swallowed by the memory-bank/ exclusion (which only anchors at root).
    writeModule(repoDir, 'pharn-core', { templates: 'templates/' });
    write(join(repoDir, 'pharn-core', 'templates', 'memory-bank', 't.md'), 'R');
    write(join(claudeDir, 'templates', 'memory-bank', 't.md'), 'DIFFERENT');

    const diff = diffInstalled({
      repoDir,
      claudeDir,
      moduleNames: ['pharn-core'],
      skills: [],
    });

    expect(diff.modified).toEqual(['templates/memory-bank/t.md']);
  });

  it('skips installs sources that are absent upstream (never reports them missing)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    writeModule(repoDir, 'pharn-core', { ghost: 'ghost/' }); // no ghost/ in repo

    const diff = diffInstalled({
      repoDir,
      claudeDir,
      moduleNames: ['pharn-core'],
      skills: [],
    });

    expect(diff).toEqual({ modified: [], missing: [], okCount: 0 });
  });

  it('guards path-escape inputs (a crafted skill.from cannot read outside repoDir)', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    write(join(repoDir, 'pharn-core', 'module.json'), '{}'); // unused

    expect(() =>
      diffInstalled({
        repoDir,
        claudeDir,
        moduleNames: [],
        skills: [{ skill: 'x', from: '../escape' }],
      }),
    ).toThrow(ManifestValidationError);
  });

  it('performs zero writes or deletes', () => {
    const repoDir = join(tmp.path(), 'repo');
    const claudeDir = join(tmp.path(), '.claude');
    writeModule(repoDir, 'pharn-core', {
      commands: 'commands/',
      notes: 'notes',
    });
    write(join(repoDir, 'pharn-core', 'commands', 'a.md'), 'A');
    write(join(repoDir, 'pharn-core', 'notes'), 'N');
    write(join(claudeDir, 'commands', 'a.md'), 'CHANGED');
    write(join(claudeDir, 'extra.md'), 'untouched');

    const repoBefore = snapshot(repoDir);
    const claudeBefore = snapshot(claudeDir);

    diffInstalled({
      repoDir,
      claudeDir,
      moduleNames: ['pharn-core'],
      skills: [],
    });

    expect(snapshot(repoDir)).toEqual(repoBefore);
    expect(snapshot(claudeDir)).toEqual(claudeBefore);
  });
});
