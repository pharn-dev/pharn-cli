import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { agentSurfaceMissing } from '../src/lib/agent-surface.js';
import { AGENTS_FROM_SKILLS_VERSION } from '../src/lib/constants.js';

// The local check that re-opens `pharn update`'s same-version early return for
// an install an older CLI made without `.claude/agents/` (CORE-272). Like
// findMissingInstalled, it may only answer "provably missing": anything the
// opened run could not write (a symlink, a non-directory, a non-file at the
// agent's path) is NOT missing, or the re-open would never close.

const AGENTS = '.claude/agents';

describe('agentSurfaceMissing', () => {
  const tmp = useTmpDir();
  const root = (): string => tmp.path();
  const write = (rel: string, body = 'x\n'): void => {
    mkdirSync(join(root(), rel, '..'), { recursive: true });
    writeFileSync(join(root(), rel), body);
  };

  it('pins the first pharn-oss version that ships an agent', () => {
    expect(AGENTS_FROM_SKILLS_VERSION).toBe('6.64.0');
  });

  it.each(['6.64.0', '6.64.1', '7.16.0', '10.0.0'])(
    'at %s with no .claude/ at all → missing',
    (version) => {
      expect(agentSurfaceMissing(root(), version)).toBe(true);
    },
  );

  it.each(['1.0.0', '6.63.9', '6.9.99', 'not-a-version', ''])(
    'at %s (older or unorderable) → never missing',
    (version) => {
      expect(agentSurfaceMissing(root(), version)).toBe(false);
    },
  );

  it('an empty .claude/agents/ is missing', () => {
    mkdirSync(join(root(), AGENTS), { recursive: true });
    expect(agentSurfaceMissing(root(), '7.0.0')).toBe(true);
  });

  it('a dir holding only non-product files (a pharn-dev-* agent, the user’s own) is missing', () => {
    write(`${AGENTS}/pharn-dev-reviewer.md`);
    write(`${AGENTS}/my-agent.md`);
    expect(agentSurfaceMissing(root(), '7.0.0')).toBe(true);
  });

  it('any pharn-*.md agent present — the upstream one or an edited copy — is not missing', () => {
    write(`${AGENTS}/pharn-review-lens.md`, 'my own edit\n');
    expect(agentSurfaceMissing(root(), '7.0.0')).toBe(false);
  });

  it('a non-file at an agent path is not missing (the run could not write there)', () => {
    mkdirSync(join(root(), AGENTS, 'pharn-review-lens.md'), {
      recursive: true,
    });
    expect(agentSurfaceMissing(root(), '7.0.0')).toBe(false);
  });

  it('a .claude/agents that is a regular file is not missing', () => {
    write(AGENTS);
    expect(agentSurfaceMissing(root(), '7.0.0')).toBe(false);
  });

  it('a .claude that is a regular file is not missing (ENOTDIR is fail-safe)', () => {
    write('.claude');
    expect(agentSurfaceMissing(root(), '7.0.0')).toBe(false);
  });

  it('a symlinked .claude/agents is never followed and is not missing', () => {
    const outside = join(root(), 'outside');
    mkdirSync(outside);
    mkdirSync(join(root(), '.claude'));
    symlinkSync(outside, join(root(), AGENTS));
    expect(agentSurfaceMissing(root(), '7.0.0')).toBe(false);
  });

  it('a symlinked .claude is not missing', () => {
    const outside = join(root(), 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(root(), '.claude'));
    expect(agentSurfaceMissing(root(), '7.0.0')).toBe(false);
  });
});
