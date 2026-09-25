import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  diffHookWiring,
  displayHook,
  hookEntries,
  hookWiringFails,
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

  function setup(
    upstream: unknown,
    project: unknown | undefined,
    local?: unknown,
  ) {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    mkdirSync(join(proj, '.claude'), { recursive: true });
    const put = (file: string, v: unknown) =>
      writeFileSync(file, typeof v === 'string' ? v : JSON.stringify(v));
    if (upstream !== undefined)
      put(join(repo, '.claude/settings.json'), upstream);
    if (project !== undefined)
      put(join(proj, '.claude/settings.json'), project);
    if (local !== undefined)
      put(join(proj, '.claude/settings.local.json'), local);
    return { repo, proj };
  }

  it('reports every re-wired and new upstream hook for a 6.0.0-era wiring', () => {
    const { repo, proj } = setup(NEW, OLD);
    const diff = diffHookWiring(repo, proj);
    expect(diff.status).toBe('missing');
    // Each line is the JSON of the hook as upstream wires it, so the SHELL
    // form (command only) and the EXEC form (command + args) read differently.
    expect(diff.missing.map(displayHook)).toEqual([
      'PreToolUse [Write|Edit|MultiEdit|NotebookEdit]: {"type":"command","command":"node \\"${CLAUDE_PROJECT_DIR}\\"/.claude/hooks/protect-trusted-paths.cjs"}',
      'PreToolUse [Write|Edit|MultiEdit|NotebookEdit]: {"type":"command","command":"node \\"${CLAUDE_PROJECT_DIR}\\"/.claude/hooks/enforce-writes-scope.cjs"}',
      'Stop: {"type":"command","command":"node","args":["${CLAUDE_PROJECT_DIR}/.claude/hooks/require-loop-record.cjs"]}',
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

  it('neither project file present → project-absent, listing all upstream hooks', () => {
    const { repo, proj } = setup(NEW, undefined);
    const diff = diffHookWiring(repo, proj);
    expect(diff.status).toBe('project-absent');
    expect(diff.missing).toHaveLength(3);
    // No claim about scopes pharn does not read (user-level settings).
    const lines = hookWiringLines(diff)!.join('\n');
    expect(lines).not.toContain('no PHARN hook is wired');
    expect(lines).toContain('settings.local.json');
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

  it('a project whose .claude is a regular file → unreadable, not a throw', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(join(repo, '.claude/settings.json'), JSON.stringify(NEW));
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, '.claude'), 'not a directory');
    expect(diffHookWiring(repo, proj)).toMatchObject({
      status: 'unreadable',
      reason: 'a path component is not a directory',
    });
  });

  it('a project settings.json that is a directory → unreadable', () => {
    const { repo, proj } = setup(NEW, undefined);
    mkdirSync(join(proj, '.claude/settings.json'));
    expect(diffHookWiring(repo, proj)).toMatchObject({
      status: 'unreadable',
      reason: 'it is not a regular file',
    });
  });

  // A dotfiles-managed settings.json is a symlinked FILE: Claude Code reads
  // through it, so the check must too. It is read as data and never printed —
  // only upstream entries reach the terminal.
  it('follows a symlinked project settings.json (the file), as Claude Code does', () => {
    const { repo, proj } = setup(NEW, undefined);
    const outside = join(tmp.path(), 'outside.json');
    writeFileSync(outside, JSON.stringify(NEW));
    symlinkSync(outside, join(proj, '.claude/settings.json'));
    expect(diffHookWiring(repo, proj)).toEqual({
      status: 'match',
      missing: [],
    });
  });

  it('still refuses a symlinked project .claude directory', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    const elsewhere = join(tmp.path(), 'elsewhere');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    mkdirSync(elsewhere, { recursive: true });
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(repo, '.claude/settings.json'), JSON.stringify(NEW));
    writeFileSync(join(elsewhere, 'settings.json'), JSON.stringify(NEW));
    symlinkSync(elsewhere, join(proj, '.claude'));
    expect(diffHookWiring(repo, proj)).toMatchObject({
      status: 'unreadable',
      reason: '.claude is a symbolic link',
    });
  });

  it('still refuses a symlinked UPSTREAM settings.json', () => {
    const { repo, proj } = setup(undefined, NEW);
    const outside = join(tmp.path(), 'outside-upstream.json');
    writeFileSync(outside, JSON.stringify(NEW));
    symlinkSync(outside, join(repo, '.claude/settings.json'));
    expect(diffHookWiring(repo, proj).status).toBe('no-upstream');
  });

  // A FIFO used to block `pharn status` / `update` forever in open(2) — and
  // with fetchRepo's signal handlers installed, only SIGKILL ended it. The
  // open is SYNCHRONOUS, so a regression would hang this test worker past any
  // vitest timeout; the read therefore runs in a child with a hard timeout,
  // and a hang fails here as a timeout instead of stalling CI.
  it('a FIFO at the project settings.json is unreadable, not a hang', async () => {
    const { repo, proj } = setup(NEW, undefined);
    execFileSync('mkfifo', [join(proj, '.claude/settings.json')]);
    const { spawnSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const mod = fileURLToPath(
      new URL('../src/lib/hook-wiring.ts', import.meta.url),
    );
    const script = `
      const { diffHookWiring } = await import(${JSON.stringify(mod)});
      console.log(JSON.stringify(diffHookWiring(process.argv[1], process.argv[2])));
    `;
    const r = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script, repo, proj],
      { encoding: 'utf8', timeout: 15_000 },
    );
    expect(r.signal, 'the read hung and was killed').toBeNull();
    expect(JSON.parse(r.stdout)).toMatchObject({
      status: 'unreadable',
      reason: 'it is not a regular file',
    });
  }, 30_000);

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

// Claude Code merges hooks from `.claude/settings.json` and the per-user,
// gitignored `.claude/settings.local.json`. The check read only the first, so
// hooks wired locally were reported missing — and with settings.json absent the
// note claimed "no PHARN hook is wired". (User-level ~/.claude settings are
// deliberately NOT read: status is about the project.)
describe('diffHookWiring — settings.local.json', () => {
  const tmp = useTmpDir();

  function setup(project: unknown | undefined, local: unknown | undefined) {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    mkdirSync(join(proj, '.claude'), { recursive: true });
    writeFileSync(join(repo, '.claude/settings.json'), JSON.stringify(NEW));
    const put = (file: string, v: unknown) =>
      writeFileSync(file, typeof v === 'string' ? v : JSON.stringify(v));
    if (project !== undefined)
      put(join(proj, '.claude/settings.json'), project);
    if (local !== undefined)
      put(join(proj, '.claude/settings.local.json'), local);
    return { repo, proj };
  }

  it('hooks wired only in settings.local.json count as wired, and are named', () => {
    const { repo, proj } = setup({ permissions: { allow: [] } }, NEW);
    const diff = diffHookWiring(repo, proj);
    expect(diff.status).toBe('local-only');
    expect(diff.missing).toEqual([]);
    expect(diff.localOnly).toHaveLength(3);
    expect(hookWiringFails(diff)).toBe(false);
    const lines = hookWiringLines(diff)!.join('\n');
    expect(lines).toContain('settings.local.json');
    expect(lines).toContain('not for teammates or CI');
  });

  it('with no settings.json at all, a complete settings.local.json still matches', () => {
    const { repo, proj } = setup(undefined, NEW);
    expect(diffHookWiring(repo, proj).status).toBe('local-only');
  });

  it('the union covers a split: some hooks in each file', () => {
    const { repo, proj } = setup(OLD, {
      hooks: { Stop: NEW.hooks.Stop },
    });
    const diff = diffHookWiring(repo, proj);
    // OLD's two relative-path PreToolUse hooks are not upstream's anchored
    // ones, so those two are still missing; the Stop hook is found locally.
    expect(diff.status).toBe('missing');
    expect(diff.missing.map((e) => e.event)).toEqual([
      'PreToolUse',
      'PreToolUse',
    ]);
    expect(hookWiringFails(diff)).toBe(true);
  });

  it('an unreadable settings.local.json makes the result unreadable, naming that file', () => {
    const { repo, proj } = setup(NEW, '{ not json');
    const diff = diffHookWiring(repo, proj);
    expect(diff).toMatchObject({
      status: 'unreadable',
      file: '.claude/settings.local.json',
      reason: 'it is not valid JSON',
    });
    expect(hookWiringFails(diff)).toBe(true);
    expect(hookWiringLines(diff)!.join('\n')).toContain(
      '.claude/settings.local.json could not be read',
    );
  });

  it('everything in settings.json → match, with no note', () => {
    const { repo, proj } = setup(NEW, { permissions: {} });
    const diff = diffHookWiring(repo, proj);
    expect(diff).toEqual({ status: 'match', missing: [] });
    expect(hookWiringLines(diff)).toBeNull();
    expect(hookWiringFails(diff)).toBe(false);
  });
});

describe('displayHook — what the HOOKS note prints', () => {
  const entry = (command: string, args: string[] = [], matcher = '') => ({
    event: 'Stop',
    matcher,
    command,
    args,
  });

  // PHARN-17's one display sanitizer covers format characters too: a bidi
  // override from upstream settings.json made a path in this note render
  // reversed, in a note that asks the user to copy it by hand.
  it('escapes format and line-separator characters instead of printing them', () => {
    const line = displayHook(
      entry('node \u202eevil\u2066.cjs\u200b', ['a\u2028b'], 'Write\u2029'),
    );
    expect(line).not.toMatch(/[\p{Cf}\u2028\u2029]/u);
    expect(line).toContain('\\u202e');
    expect(line).toContain('\\u200b');
    expect(line).toContain('\\u2028');
  });

  it('keeps C0/C1 control characters out too, escaped', () => {
    const line = displayHook(entry('node x\u001b]0;pwned\u0007\u009b'));
    // eslint-disable-next-line no-control-regex
    expect(line).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
  });

  it('caps a huge command', () => {
    const line = displayHook(entry('x'.repeat(200_000)));
    expect(line.length).toBeLessThanOrEqual(301);
    expect(line.endsWith('…')).toBe(true);
  });

  // The escapes are JSON escapes inside a JSON string, so the printed object
  // still parses back to the EXACT upstream strings.
  it('prints JSON that parses back to the exact upstream strings', () => {
    const command = 'node \u202e.cjs';
    const line = displayHook(entry(command, ['\u200b']));
    const json = JSON.parse(line.slice(line.indexOf('{'))) as {
      command: string;
      args: string[];
    };
    expect(json.command).toBe(command);
    expect(json.args).toEqual(['\u200b']);
  });
});

// F17: the note printed `Stop: node ${CLAUDE_PROJECT_DIR}/…` for an EXEC-form
// hook, and pasting that into `command` produced a SHELL-form hook — a different
// entry, still reported missing, with --strict still red. The printed line is
// now the hook itself.
describe('HOOKS note — the printed hook satisfies the check when pasted', () => {
  const tmp = useTmpDir();

  it('round-trips every upstream hook through the note into a project that then matches', () => {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    mkdirSync(join(proj, '.claude'), { recursive: true });
    writeFileSync(join(repo, '.claude/settings.json'), JSON.stringify(NEW));

    const missing = diffHookWiring(repo, proj).missing;
    expect(missing).toHaveLength(3);

    // What a user does with the note: one group per printed line, the printed
    // JSON as the hook, under the printed event and matcher.
    const hooks: Record<string, unknown[]> = {};
    for (const line of missing.map(displayHook)) {
      const head = line.slice(0, line.indexOf(': {'));
      const m = /^(\w+)(?: \[(.*)\])?$/.exec(head)!;
      const hook: unknown = JSON.parse(line.slice(line.indexOf(': {') + 2));
      (hooks[m[1]!] ??= []).push(
        m[2] ? { matcher: m[2], hooks: [hook] } : { hooks: [hook] },
      );
    }
    writeFileSync(
      join(proj, '.claude/settings.json'),
      JSON.stringify({ hooks }),
    );

    expect(diffHookWiring(repo, proj)).toEqual({
      status: 'match',
      missing: [],
    });
  });
});
