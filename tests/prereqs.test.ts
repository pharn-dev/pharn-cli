import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
}));

const { hasNextDependency, runPrereqs } =
  await import('../src/steps/prereqs.js');

describe('hasNextDependency', () => {
  const tmp = useTmpDir();

  it('returns false when package.json is missing', () => {
    expect(hasNextDependency(tmp.path())).toBe(false);
  });

  it('returns false when package.json has no next', () => {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      JSON.stringify({ dependencies: { react: '19' } }),
    );
    expect(hasNextDependency(tmp.path())).toBe(false);
  });

  it('returns true for next in dependencies', () => {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      JSON.stringify({ dependencies: { next: '16' } }),
    );
    expect(hasNextDependency(tmp.path())).toBe(true);
  });

  it('returns true for next in devDependencies', () => {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      JSON.stringify({ devDependencies: { next: '16' } }),
    );
    expect(hasNextDependency(tmp.path())).toBe(true);
  });

  it('returns false when package.json is malformed', () => {
    writeFileSync(join(tmp.path(), 'package.json'), '{ not json');
    expect(hasNextDependency(tmp.path())).toBe(false);
  });
});

describe('runPrereqs', () => {
  const tmp = useTmpDir();
  stubProcessExit();

  it('fails if next is missing', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(() => runPrereqs()).toThrow(ProcessExit);
    cwd.mockRestore();
  });

  it('fails if .git is missing', () => {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      JSON.stringify({ dependencies: { next: '16' } }),
    );
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(() => runPrereqs()).toThrow(ProcessExit);
    cwd.mockRestore();
  });

  it('passes when both next and .git are present', () => {
    writeFileSync(
      join(tmp.path(), 'package.json'),
      JSON.stringify({ dependencies: { next: '16' } }),
    );
    mkdirSync(join(tmp.path(), '.git'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(() => runPrereqs()).not.toThrow();
    cwd.mockRestore();
  });
});
