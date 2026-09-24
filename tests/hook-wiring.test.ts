import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  diffHookWiring,
  displayHook,
  hookEntries,
  hookWiringLines,
} from '../src/lib/hook-wiring.js';

// PHARN-04: upstream re-wired its hooks twice (6.1.0 CLAUDE_PROJECT_DIR anchoring,
// 6.12.0 a new exec-form Stop hook) and existing installs never heard of it.

const OLD = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'Write|Edit|MultiEdit|NotebookEdit',
        hooks: [
          {
            type: 'command',
            command: 'node .claude/hooks/protect-trusted-paths.cjs',
          },
          {
            type: 'command',
            command: 'node .claude/hooks/enforce-writes-scope.cjs',
          },
        ],
      },
    ],
  },
};

const NEW = {
  _comment: 'upstream 6.17.1 shape',
  hooks: {
    PreToolUse: [
      {
        matcher: 'Write|Edit|MultiEdit|NotebookEdit',
        hooks: [
          {
            type: 'command',
            command:
              'node "${CLAUDE_PROJECT_DIR}"/.claude/hooks/protect-trusted-paths.cjs',
          },
          {
            type: 'command',
            command:
              'node "${CLAUDE_PROJECT_DIR}"/.claude/hooks/enforce-writes-scope.cjs',
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: 'command',
            command: 'node',
            args: [
              '${CLAUDE_PROJECT_DIR}/.claude/hooks/require-loop-record.cjs',
            ],
            timeout: 10,
          },
        ],
      },
    ],
  },
};

describe('diffHookWiring', () => {
  const tmp = useTmpDir();

  function setup(upstream: unknown, project: unknown | undefined) {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    mkdirSync(join(proj, '.claude'), { recursive: true });
    if (upstream !== undefined)
      writeFileSync(
        join(repo, '.claude/settings.json'),
        typeof upstream === 'string' ? upstream : JSON.stringify(upstream),
      );
    if (project !== undefined)
      writeFileSync(
        join(proj, '.claude/settings.json'),
        typeof project === 'string' ? project : JSON.stringify(project),
      );
    return { repo, proj };
  }

  it('reports every re-wired and new upstream hook for a 6.0.0-era wiring', () => {
    const { repo, proj } = setup(NEW, OLD);
    const diff = diffHookWiring(repo, proj);
    expect(diff.status).toBe('missing');
    expect(diff.missing.map(displayHook)).toEqual([
      'PreToolUse [Write|Edit|MultiEdit|NotebookEdit]: node "${CLAUDE_PROJECT_DIR}"/.claude/hooks/protect-trusted-paths.cjs',
      'PreToolUse [Write|Edit|MultiEdit|NotebookEdit]: node "${CLAUDE_PROJECT_DIR}"/.claude/hooks/enforce-writes-scope.cjs',
      'Stop: node ${CLAUDE_PROJECT_DIR}/.claude/hooks/require-loop-record.cjs',
    ]);
  });

  it('matches when the project wires everything upstream does, ignoring its own extra hooks and _comment', () => {
    const project = structuredClone(NEW) as typeof NEW & {
      hooks: Record<string, unknown>;
    };
    delete (project as { _comment?: string })._comment;
    project.hooks.PostToolUse = [
      { hooks: [{ type: 'command', command: 'echo mine' }] },
    ];
    const { repo, proj } = setup(NEW, project);
    expect(diffHookWiring(repo, proj)).toEqual({
      status: 'match',
      missing: [],
    });
  });

  it('distinguishes exec-form hooks by their args, not just the binary', () => {
    const project = structuredClone(NEW);
    project.hooks.Stop[0]!.hooks[0]!.args = ['something-else.cjs'];
    const { repo, proj } = setup(NEW, project);
    const diff = diffHookWiring(repo, proj);
    expect(diff.status).toBe('missing');
    expect(diff.missing).toHaveLength(1);
    expect(diff.missing[0]!.event).toBe('Stop');
  });

  it('project settings.json absent → project-absent, listing all upstream hooks', () => {
    const { repo, proj } = setup(NEW, undefined);
    const diff = diffHookWiring(repo, proj);
    expect(diff.status).toBe('project-absent');
    expect(diff.missing).toHaveLength(3);
  });

  it.each([
    ['{ not json', 'it is not valid JSON'],
    ['x'.repeat(256 * 1024 + 1), 'it is larger than 256 KB'],
  ])(
    'project settings.json unreadable (%#) → unreadable with a reason',
    (raw, reason) => {
      const { repo, proj } = setup(NEW, raw);
      expect(diffHookWiring(repo, proj)).toMatchObject({
        status: 'unreadable',
        reason,
      });
    },
  );

  it('refuses to follow a symlinked project settings.json', () => {
    const { repo, proj } = setup(NEW, undefined);
    const outside = join(tmp.path(), 'outside.json');
    writeFileSync(outside, JSON.stringify(NEW));
    symlinkSync(outside, join(proj, '.claude/settings.json'));
    expect(diffHookWiring(repo, proj)).toMatchObject({
      status: 'unreadable',
      reason: '.claude/settings.json is a symbolic link',
    });
  });

  it.each([[undefined], ['{ not json'], [{ hooks: 'nope' }], [{ hooks: {} }]])(
    'no usable upstream hooks (%#) → no-upstream, nothing to report',
    (upstream) => {
      const { repo, proj } = setup(upstream, OLD);
      expect(diffHookWiring(repo, proj)).toEqual({
        status: 'no-upstream',
        missing: [],
      });
      expect(
        hookWiringLines({ status: 'no-upstream', missing: [] }),
      ).toBeNull();
    },
  );

  it('replaces control characters from either file before display', () => {
    const evil = {
      hooks: {
        Stop: [
          {
            hooks: [{ type: 'command', command: 'node x\u001b]0;pwned\u0007' }],
          },
        ],
      },
    };
    const entries = hookEntries(evil)!;
    // eslint-disable-next-line no-control-regex
    expect(displayHook(entries[0]!)).not.toMatch(/[\x00-\x1f]/);
  });

  it('the note names the entries and that pharn never writes settings.json', () => {
    const { repo, proj } = setup(NEW, OLD);
    const lines = hookWiringLines(diffHookWiring(repo, proj))!.join('\n');
    expect(lines).toContain('Upstream wires 3 hook(s)');
    expect(lines).toContain('require-loop-record.cjs');
    expect(lines).toContain('pharn never writes .claude/settings.json');
  });
});
