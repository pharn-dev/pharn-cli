import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import {
  diffHookWiring,
  displayHook,
  freshSettingsHookLines,
  hookEntries,
  hookWiringFails,
  hookWiringLines,
  preservedSettingsHookLines,
  hooksReferencing,
  upstreamSettingsSummary,
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

// init's note over a preserved settings.json — one composition for the real
// run and the dry run (steps/install-archetype.ts, commands/init.ts).
describe('preservedSettingsHookLines', () => {
  const entry = { event: 'Stop', matcher: '', command: 'node', args: ['x'] };

  it('is null when there is nothing to say', () => {
    expect(
      preservedSettingsHookLines({ status: 'match', missing: [] }),
    ).toBeNull();
    expect(
      preservedSettingsHookLines({ status: 'no-upstream', missing: [] }),
    ).toBeNull();
  });

  it('adds the --strict consequence exactly when the diff fails --strict', () => {
    const missing = preservedSettingsHookLines({
      status: 'missing',
      missing: [entry],
    })!;
    expect(missing.slice(0, -1)).toEqual(
      hookWiringLines({ status: 'missing', missing: [entry] }),
    );
    expect(missing.at(-1)).toBe(
      '  `pharn status --strict` fails until they are wired.',
    );

    const localOnly = {
      status: 'local-only' as const,
      missing: [],
      localOnly: [entry],
    };
    expect(preservedSettingsHookLines(localOnly)).toEqual(
      hookWiringLines(localOnly),
    );
  });
});

// `pharn uninstall` never edits the settings files; it LISTS the project's own
// hooks that still run a script it removed.
describe('hooksReferencing', () => {
  const tmp = useTmpDir();
  const GONE = [
    '.claude/hooks/protect-trusted-paths.cjs',
    '.claude/hooks/require-loop-record.cjs',
  ];

  function project(shared?: unknown, local?: unknown): string {
    const proj = join(tmp.path(), 'proj');
    mkdirSync(join(proj, '.claude'), { recursive: true });
    if (shared !== undefined)
      writeFileSync(
        join(proj, '.claude/settings.json'),
        typeof shared === 'string' ? shared : JSON.stringify(shared),
      );
    if (local !== undefined)
      writeFileSync(
        join(proj, '.claude/settings.local.json'),
        JSON.stringify(local),
      );
    return proj;
  }

  it('matches the plain, the CLAUDE_PROJECT_DIR and the exec (args) forms', () => {
    const fromOld = hooksReferencing(project(OLD), GONE);
    expect(fromOld).toEqual([
      {
        file: '.claude/settings.json',
        kind: 'ok',
        entries: [
          {
            event: 'PreToolUse',
            matcher: 'Write|Edit|MultiEdit|NotebookEdit',
            command: 'node .claude/hooks/protect-trusted-paths.cjs',
            args: [],
          },
        ],
      },
    ]);
    const fromNew = hooksReferencing(project(NEW), GONE);
    expect(fromNew).toHaveLength(1);
    const entries = fromNew[0]!.kind === 'ok' ? fromNew[0]!.entries : [];
    expect(entries.map((e) => e.event)).toEqual(['PreToolUse', 'Stop']);
    expect(entries[1]!.args).toEqual([
      '${CLAUDE_PROJECT_DIR}/.claude/hooks/require-loop-record.cjs',
    ]);
  });

  it('never lists a hook that runs a script still present (not in the list)', () => {
    const refs = hooksReferencing(project(OLD), [
      '.claude/hooks/something-else.cjs',
    ]);
    expect(refs).toEqual([]);
  });

  it('reads settings.local.json too, reporting each file separately', () => {
    const refs = hooksReferencing(project({ hooks: {} }, OLD), GONE);
    expect(refs.map((r) => r.file)).toEqual(['.claude/settings.local.json']);
  });

  it('returns nothing when no script is gone, without reading anything', () => {
    expect(hooksReferencing(project('not json'), [])).toEqual([]);
  });

  it('omits absent files', () => {
    expect(hooksReferencing(project(), GONE)).toEqual([]);
  });

  it('reports an unreadable file rather than guessing it wires nothing', () => {
    expect(hooksReferencing(project('not json'), GONE)).toEqual([
      {
        file: '.claude/settings.json',
        kind: 'unreadable',
        reason: 'it is not valid JSON',
      },
    ]);
  });

  it('refuses to read through a symlinked .claude/ directory', () => {
    const real = join(tmp.path(), 'elsewhere');
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, 'settings.json'), JSON.stringify(OLD));
    const proj = join(tmp.path(), 'linked');
    mkdirSync(proj, { recursive: true });
    symlinkSync(real, join(proj, '.claude'));
    const refs = hooksReferencing(proj, GONE);
    expect(refs).toHaveLength(2);
    expect(refs.every((r) => r.kind === 'unreadable')).toBe(true);
  });

  it('prints a project hook carrying control characters only escaped', () => {
    const hostile = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command:
                  'node .claude/hooks/protect-trusted-paths.cjs\u001b[2J',
              },
            ],
          },
        ],
      },
    };
    const refs = hooksReferencing(project(hostile), GONE);
    const entry = refs[0]!.kind === 'ok' ? refs[0]!.entries[0]! : undefined;
    const line = displayHook(entry!);
    expect(line.includes(String.fromCharCode(27))).toBe(false);
    expect(line).toContain('\\u001b');
  });
});

// A project wiring `node .claude/hooks/x.cjs` (relative) while upstream wires
// the CLAUDE_PROJECT_DIR-anchored form: the textual diff rightly lists
// upstream's line as missing, but "merge these by hand" led users to ADD it and
// run the script twice. Those entries are now REPLACE, showing the project's
// current line; everything else keeps the ADD advice. No status changes.
describe('diffHookWiring — REPLACE vs ADD', () => {
  const tmp = useTmpDir();

  function setup(project: unknown | undefined, local?: unknown) {
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    mkdirSync(join(proj, '.claude'), { recursive: true });
    writeFileSync(join(repo, '.claude/settings.json'), JSON.stringify(NEW));
    if (project !== undefined)
      writeFileSync(
        join(proj, '.claude/settings.json'),
        JSON.stringify(project),
      );
    if (local !== undefined)
      writeFileSync(
        join(proj, '.claude/settings.local.json'),
        JSON.stringify(local),
      );
    return { repo, proj };
  }

  const WRITE_MATCHER = 'Write|Edit|MultiEdit|NotebookEdit';
  const preToolUse = (...commands: string[]) => ({
    matcher: WRITE_MATCHER,
    hooks: commands.map((command) => ({ type: 'command', command })),
  });
  const REL_PROTECT = 'node .claude/hooks/protect-trusted-paths.cjs';
  const REL_SCOPE = 'node .claude/hooks/enforce-writes-scope.cjs';
  const STOP_LINE =
    'Stop: {"type":"command","command":"node","args":["${CLAUDE_PROJECT_DIR}/.claude/hooks/require-loop-record.cjs"]}';

  it('relative vs anchored spelling → REPLACE, showing the project line; the new Stop hook stays ADD', () => {
    const { repo, proj } = setup(OLD);
    const diff = diffHookWiring(repo, proj);
    expect(diff.status).toBe('missing');
    expect(diff.missing).toHaveLength(3);
    expect(hookWiringFails(diff)).toBe(true);
    expect(diff.replace).toEqual([
      {
        upstream: diff.missing[0],
        existing: [
          {
            file: '.claude/settings.json',
            entry: {
              event: 'PreToolUse',
              matcher: WRITE_MATCHER,
              command: REL_PROTECT,
              args: [],
            },
          },
        ],
      },
      {
        upstream: diff.missing[1],
        existing: [
          {
            file: '.claude/settings.json',
            entry: {
              event: 'PreToolUse',
              matcher: WRITE_MATCHER,
              command: REL_SCOPE,
              args: [],
            },
          },
        ],
      },
    ]);
    const lines = hookWiringLines(diff)!;
    const text = lines.join('\n');
    expect(text).toContain('REPLACE — 2 of them');
    expect(text).toContain('would run the script twice');
    expect(lines).toContain(
      `    yours (.claude/settings.json): PreToolUse [${WRITE_MATCHER}]: {"type":"command","command":"${REL_PROTECT}"}`,
    );
    expect(lines).toContain(`    upstream: ${displayHook(diff.missing[0]!)}`);
    // Only the Stop hook is under ADD.
    const add = lines.slice(lines.indexOf('  ADD — 1 wired in neither file:'));
    expect(add[1]).toBe(`  ${STOP_LINE}`);
    expect(add.join('\n')).not.toContain('protect-trusted-paths');
    expect(text).not.toContain('merge these by hand');
    expect(text).toContain('edit these by hand');
  });

  it('exec form (args) vs shell form → REPLACE, both ways round', () => {
    // Project: shell form of upstream's exec-form Stop hook.
    const project = structuredClone(NEW) as {
      hooks: { Stop: unknown[] };
    };
    project.hooks.Stop = [
      {
        hooks: [
          {
            type: 'command',
            command: 'node .claude/hooks/require-loop-record.cjs',
          },
        ],
      },
    ];
    const shell = setup(project);
    const diff = diffHookWiring(shell.repo, shell.proj);
    expect(diff.missing.map((e) => e.event)).toEqual(['Stop']);
    expect(diff.replace).toHaveLength(1);
    expect(diff.replace![0]!.existing[0]!.entry.command).toBe(
      'node .claude/hooks/require-loop-record.cjs',
    );
    expect(hookWiringLines(diff)!.join('\n')).not.toContain('ADD —');

    // Project: exec form of upstream's shell-form PreToolUse hook.
    const exec = structuredClone(NEW) as {
      hooks: { PreToolUse: { hooks: unknown[] }[] };
    };
    exec.hooks.PreToolUse[0]!.hooks[0] = {
      type: 'command',
      command: 'node',
      args: ['.claude/hooks/protect-trusted-paths.cjs'],
    };
    const ex = setup(exec);
    const d2 = diffHookWiring(ex.repo, ex.proj);
    expect(d2.missing).toHaveLength(1);
    expect(d2.replace![0]!.existing[0]!.entry.args).toEqual([
      '.claude/hooks/protect-trusted-paths.cjs',
    ]);
    expect(hookWiringLines(d2)!.join('\n')).toContain(
      '"args":[".claude/hooks/protect-trusted-paths.cjs"]',
    );
  });

  it('the same script under a different event, or a different matcher, stays ADD', () => {
    const project = {
      hooks: {
        PreToolUse: NEW.hooks.PreToolUse,
        PostToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node .claude/hooks/require-loop-record.cjs',
              },
            ],
          },
        ],
      },
    };
    const ev = setup(project);
    const diff = diffHookWiring(ev.repo, ev.proj);
    expect(diff.missing.map((e) => e.event)).toEqual(['Stop']);
    expect(diff).not.toHaveProperty('replace');

    const matcher = setup({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: REL_PROTECT }],
          },
        ],
      },
    });
    const d2 = diffHookWiring(matcher.repo, matcher.proj);
    expect(d2.missing).toHaveLength(3);
    expect(d2).not.toHaveProperty('replace');
  });

  it('with no counterpart the note is byte-identical to the ADD-only wording', () => {
    const { repo, proj } = setup({ hooks: {} });
    const diff = diffHookWiring(repo, proj);
    expect(diff).not.toHaveProperty('replace');
    expect(hookWiringLines(diff)).toEqual([
      '  Upstream wires 3 hook(s) that neither .claude/settings.json or .claude/settings.local.json does:',
      ...diff.missing.map((e) => `  ${displayHook(e)}`),
      '',
      '  pharn never writes .claude/settings.json after init — merge these by hand:',
      '  each line is one hook, as JSON, under its event [matcher]. Matching is',
      '  textual: an equivalent hook you wrote differently is listed too.',
    ]);
  });

  it('a counterpart in settings.local.json names that file', () => {
    const { repo, proj } = setup(
      { hooks: { Stop: NEW.hooks.Stop } },
      { hooks: { PreToolUse: [preToolUse(REL_PROTECT)] } },
    );
    const diff = diffHookWiring(repo, proj);
    expect(diff.missing).toHaveLength(2);
    expect(diff.replace).toHaveLength(1);
    expect(diff.replace![0]!.existing).toEqual([
      {
        file: '.claude/settings.local.json',
        entry: {
          event: 'PreToolUse',
          matcher: WRITE_MATCHER,
          command: REL_PROTECT,
          args: [],
        },
      },
    ]);
    const text = hookWiringLines(diff)!.join('\n');
    expect(text).toContain('yours (.claude/settings.local.json):');
    expect(text).toContain('ADD — 1 wired in neither file:');
  });

  it('lists every project line for the script, settings.json first', () => {
    const { repo, proj } = setup(
      { hooks: { PreToolUse: [preToolUse(REL_PROTECT)] } },
      {
        hooks: {
          PreToolUse: [
            preToolUse(
              'bash -c "node ./.claude/hooks/protect-trusted-paths.cjs"',
            ),
          ],
        },
      },
    );
    const diff = diffHookWiring(repo, proj);
    expect(diff.replace![0]!.existing.map((x) => x.file)).toEqual([
      '.claude/settings.json',
      '.claude/settings.local.json',
    ]);
  });

  it('never offers a line that IS an upstream entry as the one to replace', () => {
    // Upstream wires one script twice (shell + exec form, same event and
    // matcher); the project wires only the shell form, exactly. The exec form
    // is missing, but the shell line is correct and must not be replaced.
    const upstream = {
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: 'node .claude/hooks/s.cjs' },
              {
                type: 'command',
                command: 'node',
                args: ['.claude/hooks/s.cjs'],
              },
            ],
          },
        ],
      },
    };
    const repo = join(tmp.path(), 'repo');
    const proj = join(tmp.path(), 'proj');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    mkdirSync(join(proj, '.claude'), { recursive: true });
    writeFileSync(
      join(repo, '.claude/settings.json'),
      JSON.stringify(upstream),
    );
    writeFileSync(
      join(proj, '.claude/settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [{ type: 'command', command: 'node .claude/hooks/s.cjs' }],
            },
          ],
        },
      }),
    );
    const diff = diffHookWiring(repo, proj);
    expect(diff.missing).toHaveLength(1);
    expect(diff).not.toHaveProperty('replace');
  });

  it('escapes and caps the project line it prints', () => {
    const hostile = `node .claude/hooks/protect-trusted-paths.cjs \x1b[31m${'x'.repeat(400)}`;
    const { repo, proj } = setup({
      hooks: { PreToolUse: [preToolUse(hostile)] },
    });
    const lines = hookWiringLines(diffHookWiring(repo, proj))!;
    const mine = lines.find((l) => l.startsWith('    yours'))!;
    expect(mine).not.toContain('\x1b');
    expect(mine).toContain('\\u001b');
    expect(mine.endsWith('…')).toBe(true);
  });

  it('is not computed for an unreadable or absent project', () => {
    const unreadable = setup(OLD, 'x');
    writeFileSync(
      join(unreadable.proj, '.claude/settings.local.json'),
      '{ not json',
    );
    expect(diffHookWiring(unreadable.repo, unreadable.proj)).not.toHaveProperty(
      'replace',
    );
  });
});

// CORE-172: a fresh init writes upstream's settings.json — the hook commands
// Claude Code will run — and used to say nothing about them.
describe('upstreamSettingsSummary', () => {
  const tmp = useTmpDir();

  function repoWith(content: unknown): string {
    const repo = join(tmp.path(), 'repo');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(
      join(repo, '.claude/settings.json'),
      typeof content === 'string' ? content : JSON.stringify(content),
    );
    return repo;
  }

  it('lists every hook in file order, and the other top-level keys sorted', () => {
    const repo = repoWith({
      statusLine: { type: 'command', command: 'x' },
      ...NEW,
      permissions: { allow: [] },
    });
    const s = upstreamSettingsSummary(repo);
    expect(s).toEqual({
      status: 'ok',
      hooks: hookEntries(NEW),
      // `hooks` and `_comment` are never listed as settings.
      otherKeys: ['permissions', 'statusLine'],
      skipped: 0,
    });
  });

  it('counts each member hookEntries drops: a non-array event, a malformed group, a hook without a string command', () => {
    const repo = repoWith({
      hooks: {
        Notification: 'not-an-array',
        PreToolUse: [
          'not-a-group',
          { matcher: 'Bash' },
          {
            matcher: 'Write',
            hooks: [
              { type: 'command', command: 'node a.cjs' },
              { type: 'prompt', prompt: 'is this ok?' },
              { type: 'command', command: 42 },
              'not-a-hook',
            ],
          },
        ],
      },
    });
    const s = upstreamSettingsSummary(repo);
    expect(s.status).toBe('ok');
    if (s.status !== 'ok') return;
    expect(s.hooks.map((e) => e.command)).toEqual(['node a.cjs']);
    // 1 event + 2 groups + 3 hooks.
    expect(s.skipped).toBe(6);
  });

  it('counts a hooks value that is not an object as one skipped entry', () => {
    expect(upstreamSettingsSummary(repoWith({ hooks: ['x'] }))).toEqual({
      status: 'ok',
      hooks: [],
      otherKeys: [],
      skipped: 1,
    });
  });

  it('reads a file that wires no hooks', () => {
    expect(upstreamSettingsSummary(repoWith({ model: 'opus' }))).toEqual({
      status: 'ok',
      hooks: [],
      otherKeys: ['model'],
      skipped: 0,
    });
  });

  it('lists nothing for JSON that is not an object', () => {
    for (const value of ['[1,2]', '"text"', 'null', '7'])
      expect(upstreamSettingsSummary(repoWith(value))).toEqual({
        status: 'ok',
        hooks: [],
        otherKeys: [],
        skipped: 0,
      });
  });

  it('is unreadable for invalid JSON and for a file over 256 KiB', () => {
    expect(upstreamSettingsSummary(repoWith('{ not json'))).toEqual({
      status: 'unreadable',
      reason: 'it is not valid JSON',
    });
    const big = JSON.stringify({ pad: 'x'.repeat(256 * 1024) });
    expect(upstreamSettingsSummary(repoWith(big))).toEqual({
      status: 'unreadable',
      reason: 'it is larger than 256 KB',
    });
  });

  it('refuses a symlinked upstream settings.json (the upstream reader)', () => {
    const repo = join(tmp.path(), 'repo');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    const outside = join(tmp.path(), 'outside.json');
    writeFileSync(outside, JSON.stringify(NEW));
    symlinkSync(outside, join(repo, '.claude/settings.json'));
    expect(upstreamSettingsSummary(repo)).toEqual({
      status: 'unreadable',
      reason: '.claude/settings.json is a symbolic link',
    });
  });

  it('never throws on an absent file', () => {
    const repo = join(tmp.path(), 'empty');
    mkdirSync(repo);
    expect(upstreamSettingsSummary(repo)).toEqual({
      status: 'unreadable',
      reason: 'it does not exist',
    });
  });
});

describe('freshSettingsHookLines', () => {
  const REVIEW =
    '  Claude Code runs these commands; review `.claude/settings.json`.';
  const entries = hookEntries(NEW) ?? [];

  it('lists each hook through displayHook, then the review line', () => {
    expect(
      freshSettingsHookLines({
        status: 'ok',
        hooks: entries,
        otherKeys: [],
        skipped: 0,
      }),
    ).toEqual([
      '  Wrote .claude/settings.json from upstream. It wires 3 hook(s):',
      ...entries.map((e) => `  ${displayHook(e)}`),
      REVIEW,
    ]);
  });

  it('says so when the file wires no hooks — still with the review line', () => {
    expect(
      freshSettingsHookLines({
        status: 'ok',
        hooks: [],
        otherKeys: [],
        skipped: 0,
      }),
    ).toEqual([
      '  Wrote .claude/settings.json from upstream. It wires no hooks.',
      REVIEW,
    ]);
  });

  it('names the entries it could not show', () => {
    const one = freshSettingsHookLines({
      status: 'ok',
      hooks: [],
      otherKeys: [],
      skipped: 1,
    });
    expect(one).toContain('  1 other hook entry not shown — review the file.');
    const two = freshSettingsHookLines({
      status: 'ok',
      hooks: [],
      otherKeys: [],
      skipped: 2,
    });
    expect(two).toContain(
      '  2 other hook entries not shown — review the file.',
    );
    expect(two.at(-1)).toBe(REVIEW);
  });

  it('names the other top-level keys, escaping and capping each', () => {
    const lines = freshSettingsHookLines({
      status: 'ok',
      hooks: [],
      otherKeys: [
        'permissions',
        'bad\u001b[31mkey',
        'rtl\u202eevil',
        'line\u2028sep',
        'k'.repeat(500),
      ],
      skipped: 0,
    });
    const also = lines.find((l) => l.startsWith('  It also sets: '));
    expect(also).toBeDefined();
    expect(also).toContain('permissions, bad\\u001b[31mkey, rtl\\u202eevil');
    expect(also).toContain('line\\u2028sep');
    for (const raw of ['\u001b', '\u202e', '\u2028'])
      expect(also).not.toContain(raw);
    expect(also).toContain(`${'k'.repeat(100)}…`);
    expect(also).not.toContain('k'.repeat(101));
    expect(lines.at(-1)).toBe(REVIEW);
  });

  it('lists at most 20 keys and counts the rest', () => {
    const keys = Array.from(
      { length: 25 },
      (_, i) => `k${String(i).padStart(2, '0')}`,
    );
    const lines = freshSettingsHookLines({
      status: 'ok',
      hooks: [],
      otherKeys: keys,
      skipped: 0,
    });
    const also = lines.find((l) => l.startsWith('  It also sets: '));
    expect(also).toBe(
      `  It also sets: ${keys.slice(0, 20).join(', ')} and 5 more`,
    );
  });

  it('never prints nothing for an unreadable file — it was still written', () => {
    expect(
      freshSettingsHookLines({
        status: 'unreadable',
        reason: 'it is larger than 256 KB',
      }),
    ).toEqual([
      '  Wrote .claude/settings.json from upstream, but could not list its hooks (it is larger than 256 KB).',
      REVIEW,
    ]);
  });

  it('escapes an unreadable reason (it can quote a clone path)', () => {
    const [head] = freshSettingsHookLines({
      status: 'unreadable',
      reason: 'a\u001bb is a symbolic link',
    });
    expect(head).toContain('a\\u001bb is a symbolic link');
  });
});
