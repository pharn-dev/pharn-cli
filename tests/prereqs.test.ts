import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
}));

const { runGitPrereq } = await import('../src/steps/prereqs.js');

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
