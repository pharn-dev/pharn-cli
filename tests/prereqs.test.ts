import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit, useTmpDir } from './helpers.js';

// `runGitPrereq` reports through the shared reporter (lib/report-error.ts),
// which calls `log.error`. Mocking `log` is what lets the STREAM be asserted
// below rather than printed into the test runner.
vi.mock('@clack/prompts', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { log } = await import('@clack/prompts');
const { runGitPrereq } = await import('../src/steps/prereqs.js');

describe('runGitPrereq', () => {
  const tmp = useTmpDir();
  stubProcessExit();

  it('fails if .git is missing', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(() => runGitPrereq()).toThrow(ProcessExit);
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
    expect(() => runGitPrereq()).toThrow(ProcessExit);
    cwd.mockRestore();

    expect(log.error).toHaveBeenCalledWith(expect.any(String), {
      output: process.stderr,
    });
  });

  // clack's log.error supplies its own error glyph, so the message must not carry
  // a second one — a literal cross rendered as two glyphs in a row.
  it('does not carry its own glyph, and still names the fix', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp.path());
    expect(() => runGitPrereq()).toThrow(ProcessExit);
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
});
