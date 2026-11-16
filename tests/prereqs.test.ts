import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { exitCodeOf } from './support/exit-code.js';
import { stubProcessExit, useTmpDir } from './helpers.js';

// `runGitPrereq` reports through the shared reporter (lib/report-error.ts),
// which calls `log.error`. Mocking `log` is what lets the STREAM be asserted
// below rather than printed into the test runner.
vi.mock('@clack/prompts', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { log } = await import('@clack/prompts');
const { findAncestorGitRoot, runGitPrereq } =
  await import('../src/steps/prereqs.js');

describe('runGitPrereq', () => {
  const tmp = useTmpDir();
  stubProcessExit();

  it('fails if .git is missing', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(exitCodeOf(() => runGitPrereq())).toBe(1);
    cwd.mockRestore();
  });

  // The prerequisite failure used to render through clack's `cancel()`, which
  // writes to process.stdout — so the ONE fatal a first-time user is most likely
  // to hit exited 1 with an EMPTY stderr, while every other fatal in the CLI went
  // through the reporter. An operator capturing the two streams separately found
  // no cause at all. The exit code was always right; this is the stream contract
  // (docs/troubleshooting.md, Streams).
  it('reports the failure on STDERR, not stdout', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(exitCodeOf(() => runGitPrereq())).toBe(1);
    cwd.mockRestore();

    expect(log.error).toHaveBeenCalledWith(expect.any(String), {
      output: process.stderr,
    });
  });

  // clack's log.error supplies its own error glyph, so the message must not carry
  // a second one — a literal cross rendered as two glyphs in a row.
  it('does not carry its own glyph, and still names the fix', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(exitCodeOf(() => runGitPrereq())).toBe(1);
    cwd.mockRestore();

    const message = vi.mocked(log.error).mock.calls.at(-1)![0];
    expect(message.startsWith('✗')).toBe(false);
    expect(message).toContain('git not found');
    expect(message).toContain('git init');
  });

  it('passes when .git is present (no package.json required)', () => {
    mkdirSync(join(tmp.path(), '.git'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(() => runGitPrereq()).not.toThrow();
    cwd.mockRestore();
  });

  // `init --dry-run --json`: no clack chrome anywhere, one plain stderr line.
  it('reports plainly on stderr under { json: true }, with no clack call', () => {
    const errSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    vi.mocked(log.error).mockClear();
    expect(exitCodeOf(() => runGitPrereq({ json: true }))).toBe(1);
    cwd.mockRestore();
    expect(log.error).not.toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0]![0])).toContain('git init');
    errSpy.mockRestore();
  });

  // CORE-168: in a monorepo's `apps/web`, "Run: git init" creates a NESTED
  // repository. When an ancestor holds `.git`, the message names the root.
  describe('inside a git repository, below its root', () => {
    it('names the repository root and never suggests git init', () => {
      const root = join(tmp.path(), 'repo');
      const sub = join(root, 'apps', 'web');
      mkdirSync(join(root, '.git'), { recursive: true });
      mkdirSync(sub, { recursive: true });
      vi.mocked(log.error).mockClear();
      const cwd = vi.spyOn(process, 'cwd').mockReturnValue(sub);
      expect(exitCodeOf(() => runGitPrereq())).toBe(1);
      cwd.mockRestore();

      const message = vi.mocked(log.error).mock.calls.at(-1)![0];
      expect(message).toContain(`repository root (${root})`);
      expect(message).toContain('pharn init');
      expect(message).toContain(sub);
      expect(message).not.toContain('git init');
      expect(message).not.toContain('git not found');
      expect(log.error).toHaveBeenCalledWith(expect.any(String), {
        output: process.stderr,
      });
    });

    it('says the same plainly on stderr under { json: true }', () => {
      const root = join(tmp.path(), 'repo');
      const sub = join(root, 'packages', 'a');
      mkdirSync(join(root, '.git'), { recursive: true });
      mkdirSync(sub, { recursive: true });
      const errSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const cwd = vi.spyOn(process, 'cwd').mockReturnValue(sub);
      vi.mocked(log.error).mockClear();
      expect(exitCodeOf(() => runGitPrereq({ json: true }))).toBe(1);
      cwd.mockRestore();
      expect(log.error).not.toHaveBeenCalled();
      const text = String(errSpy.mock.calls[0]![0]);
      expect(text).toContain(`repository root (${root})`);
      expect(text).not.toContain('git init');
      errSpy.mockRestore();
    });
  });

  describe('findAncestorGitRoot', () => {
    it('returns the NEAREST ancestor holding .git', () => {
      const outer = join(tmp.path(), 'outer');
      const inner = join(outer, 'inner');
      const deep = join(inner, 'a', 'b');
      mkdirSync(join(outer, '.git'), { recursive: true });
      mkdirSync(join(inner, '.git'), { recursive: true });
      mkdirSync(deep, { recursive: true });
      expect(findAncestorGitRoot(deep)).toBe(inner);
    });

    it('counts a .git FILE (a worktree or submodule), like the cwd check', () => {
      const root = join(tmp.path(), 'wt');
      mkdirSync(join(root, 'sub'), { recursive: true });
      writeFileSync(join(root, '.git'), 'gitdir: /elsewhere\n');
      expect(findAncestorGitRoot(join(root, 'sub'))).toBe(root);
    });

    it('never answers with the start directory itself', () => {
      const root = join(tmp.path(), 'self');
      mkdirSync(join(root, '.git'), { recursive: true });
      expect(findAncestorGitRoot(root)).toBeNull();
    });

    it('returns null when no ancestor holds .git', () => {
      const dir = join(tmp.path(), 'plain', 'x');
      mkdirSync(dir, { recursive: true });
      expect(findAncestorGitRoot(dir)).toBeNull();
    });
  });
});
