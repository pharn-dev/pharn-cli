import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';

// publish.yml runs only after a merge to main (release-on-merge) — no PR check
// ever executes it, so the first run of a broken line is a release. These tests
// are the pre-merge coverage: static pins over the committed YAML, plus the two
// decision steps (`Decide`, `Registry check`) EXECUTED from the committed text
// against a stub `git` and a local HTTP server.
const PUBLISH_WORKFLOW = '.github/workflows/publish.yml';
const LIVE = readFileSync(PUBLISH_WORKFLOW, 'utf8');

// ---------------------------------------------------------------------------
// Text helpers (no YAML parser: the same line-level reading the floor uses)

/** Full-line comments dropped: a YAML comment is never executed. */
function codeOf(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
}

/** A top-level key's block: its line through the line before the next top-level key. */
function topLevelBlock(code: string, key: string): string | null {
  const lines = code.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^\S/.test(l));
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
}

/** Job ids under `jobs:`, in file order. */
function jobIds(code: string): string[] {
  const jobs = topLevelBlock(code, 'jobs') ?? '';
  return [...jobs.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]!);
}

/** One job's lines, from its header to the next job header. */
function jobBlock(code: string, id: string): string | null {
  const jobs = topLevelBlock(code, 'jobs');
  if (!jobs) return null;
  const lines = jobs.split('\n');
  const start = lines.indexOf(`  ${id}:`);
  if (start < 0) return null;
  const end = lines.findIndex(
    (l, i) => i > start && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l),
  );
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
}

/** The dedented `run: |` body of the step named `name`. */
function runBlock(text: string, name: string): string {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  if (at < 0) throw new Error(`step "${name}" not found`);
  const stepIndent = lines[at]!.indexOf('-');
  let runAt = -1;
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.trim() !== '' && l.search(/\S/) <= stepIndent) break;
    if (/^\s*run: \|\s*$/.test(l)) {
      runAt = i;
      break;
    }
  }
  if (runAt < 0) throw new Error(`step "${name}" has no run: | block`);
  const keyIndent = lines[runAt]!.search(/\S/);
  const body: string[] = [];
  for (const l of lines.slice(runAt + 1)) {
    if (l.trim() !== '' && l.search(/\S/) <= keyIndent) break;
    body.push(l);
  }
  const indent = Math.min(
    ...body.filter((l) => l.trim() !== '').map((l) => l.search(/\S/)),
  );
  return body.map((l) => l.slice(indent)).join('\n');
}

// ---------------------------------------------------------------------------
// Structural checks — each returns its problems, so a mutation control can
// prove it fires (an empty list is also what a check that reads nothing returns).

function triggerProblems(text: string): string[] {
  const on = topLevelBlock(codeOf(text), 'on');
  if (!on) return ['no on: block'];
  const problems: string[] = [];
  if (!/^ {2}push:\s*\n {4}branches: \[main\]\s*$/m.test(on))
    problems.push('push is not limited to branches: [main]');
  if (!/^ {2}workflow_dispatch:\s*$/m.test(on))
    problems.push('workflow_dispatch missing');
  const keys = [...on.matchAll(/^ {2}([A-Za-z_]+):/gm)].map((m) => m[1]);
  for (const k of keys)
    if (k !== 'push' && k !== 'workflow_dispatch')
      problems.push(`unexpected trigger ${k}`);
  return problems;
}

function permissionProblems(text: string): string[] {
  const code = codeOf(text);
  const problems: string[] = [];
  const top = topLevelBlock(code, 'permissions') ?? '';
  if (!/^ {2}contents: read\s*$/m.test(top))
    problems.push('top-level permissions are not contents: read');
  const writes = code.match(/^\s*contents:\s*write\b/gm) ?? [];
  if (writes.length !== 1)
    problems.push(`contents: write appears ${writes.length} times`);
  if (!/^\s*contents:\s*write\b/m.test(jobBlock(code, 'release') ?? ''))
    problems.push('contents: write is not inside the release job');
  const release = jobBlock(code, 'release') ?? '';
  if (/^\s*id-token:/m.test(release))
    problems.push('the release job holds id-token');
  if (/actions\/checkout@|npm (ci|install|i)\b|\bnode\b/.test(release))
    problems.push('the release job runs repository or dependency code');
  return problems;
}

function graphProblems(text: string): string[] {
  const code = codeOf(text);
  const problems: string[] = [];
  const ids = jobIds(code).join(',');
  if (ids !== 'gate,build,publish,release') problems.push(`jobs are ${ids}`);
  const expected: Record<string, RegExp> = {
    build: /^ {4}needs: gate\s*$/m,
    publish: /^ {4}needs: \[gate, build\]\s*$/m,
    release: /^ {4}needs: \[gate, publish\]\s*$/m,
  };
  for (const [job, re] of Object.entries(expected))
    if (!re.test(jobBlock(code, job) ?? ''))
      problems.push(`${job} needs is wrong`);
  if (
    !/^ {4}if: needs\.gate\.outputs\.release == 'true'\s*$/m.test(
      jobBlock(code, 'build') ?? '',
    )
  )
    problems.push('build is not conditioned on the gate');
  const conc = topLevelBlock(code, 'concurrency') ?? '';
  if (
    !/^ {2}group: publish\s*$/m.test(conc) ||
    !/^ {2}cancel-in-progress: false\s*$/m.test(conc)
  )
    problems.push('workflow-level concurrency missing');
  const publish = jobBlock(code, 'publish') ?? '';
  const publishStep = publish.slice(publish.indexOf('- name: Publish'));
  if (
    !/^\s*if: steps\.registry\.outputs\.published == 'false'\s*$/m.test(
      publishStep,
    )
  )
    problems.push('Publish is not conditioned on the registry check');
  return problems;
}

describe('publish.yml structure (release-on-merge)', () => {
  it('runs on push to main and workflow_dispatch only', () => {
    expect(triggerProblems(LIVE)).toEqual([]);
  });

  it('isolates contents: write in the release job, which runs no code', () => {
    expect(permissionProblems(LIVE)).toEqual([]);
  });

  it('chains gate → build → publish → release, serialized, publish conditioned', () => {
    expect(graphProblems(LIVE)).toEqual([]);
  });

  it('catches a re-added release trigger', () => {
    const mutated = LIVE.replace(
      '  workflow_dispatch:\n',
      '  workflow_dispatch:\n  release:\n    types: [published]\n',
    );
    expect(mutated).not.toBe(LIVE);
    expect(triggerProblems(mutated)).toEqual(['unexpected trigger release']);
  });

  it('catches contents: write moved to the top level or into build', () => {
    const top = LIVE.replace(
      'permissions:\n  contents: read\n',
      'permissions:\n  contents: write\n',
    );
    expect(top).not.toBe(LIVE);
    expect(permissionProblems(top)).toContain(
      'top-level permissions are not contents: read',
    );
    const build = LIVE.replace(
      '    needs: gate\n',
      '    needs: gate\n    permissions:\n      contents: write\n',
    );
    expect(build).not.toBe(LIVE);
    expect(permissionProblems(build)).toContain(
      'contents: write appears 2 times',
    );
  });

  it('catches id-token or a checkout in the release job', () => {
    const token = LIVE.replace(
      '      contents: write # the tag',
      '      id-token: write\n      contents: write # the tag',
    );
    expect(token).not.toBe(LIVE);
    expect(permissionProblems(token)).toContain(
      'the release job holds id-token',
    );
    const checkout = LIVE.replace(
      /^( {2}release:\n[\s\S]*?steps:\n)/m,
      '$1      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n',
    );
    expect(checkout).not.toBe(LIVE);
    expect(permissionProblems(checkout)).toContain(
      'the release job runs repository or dependency code',
    );
  });

  it('catches an unconditioned Publish step and a missing concurrency', () => {
    const publish = LIVE.replace(
      "        if: steps.registry.outputs.published == 'false'\n",
      '',
    );
    expect(publish).not.toBe(LIVE);
    expect(graphProblems(publish)).toEqual([
      'Publish is not conditioned on the registry check',
    ]);
    const conc = LIVE.replace('  cancel-in-progress: false\n', '');
    expect(conc).not.toBe(LIVE);
    expect(graphProblems(conc)).toEqual(['workflow-level concurrency missing']);
  });
});

// ---------------------------------------------------------------------------
// `Decide` (gate job) — executed from the committed text with a stub `git`.

describe('publish.yml gate: Decide step', () => {
  const tmp = useTmpDir();
  const script = runBlock(LIVE, 'Decide');

  function decide(opts: { version?: string; ref?: string; gitExit?: number }): {
    status: number | null;
    output: string;
    gitArgs: string;
  } {
    const dir = tmp.path();
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ version: opts.version ?? '1.2.3' }),
    );
    const git = join(bin, 'git');
    writeFileSync(
      git,
      `#!/bin/sh\necho "$@" > "${join(dir, 'git-args')}"\nexit ${opts.gitExit ?? 0}\n`,
    );
    chmodSync(git, 0o755);
    const out = join(dir, 'out');
    writeFileSync(out, '');
    writeFileSync(join(dir, 'git-args'), '');
    const r = spawnSync('bash', ['-c', script], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        GITHUB_REF: opts.ref ?? 'refs/heads/main',
        GITHUB_OUTPUT: out,
      },
    });
    return {
      status: r.status,
      output: readFileSync(out, 'utf8'),
      gitArgs: readFileSync(join(dir, 'git-args'), 'utf8').trim(),
    };
  }

  it('a tagged version releases nothing (ls-remote exit 0)', () => {
    const r = decide({ gitExit: 0 });
    expect(r.status).toBe(0);
    expect(r.output).toBe('version=1.2.3\nrelease=false\n');
    expect(r.gitArgs).toBe(
      'ls-remote --exit-code --tags origin refs/tags/v1.2.3',
    );
  });

  it('an untagged version releases (ls-remote exit 2, despite set -e)', () => {
    const r = decide({ gitExit: 2 });
    expect(r.status).toBe(0);
    expect(r.output).toBe('version=1.2.3\nrelease=true\n');
  });

  it('any other ls-remote exit fails the run and decides nothing', () => {
    for (const gitExit of [1, 128]) {
      const r = decide({ gitExit });
      expect(r.status).not.toBe(0);
      expect(r.output).toBe('');
    }
  });

  it('refuses a ref other than main before asking git', () => {
    const r = decide({ ref: 'refs/heads/feat/x', gitExit: 2 });
    expect(r.status).toBe(1);
    expect(r.output).toBe('');
    expect(r.gitArgs).toBe('');
  });

  it('refuses a version that is not plain X.Y.Z before asking git', () => {
    for (const version of [
      '1.2.3-rc.1',
      'v1.2.3',
      '01.2.3',
      '1.2',
      '1.2.3 ; echo',
    ]) {
      const r = decide({ version, gitExit: 2 });
      expect(r.status, version).toBe(1);
      expect(r.output).toBe('');
      expect(r.gitArgs).toBe('');
    }
  });
});

// ---------------------------------------------------------------------------
// `Registry check` (publish job) — executed against a local HTTP server.

describe('publish.yml publish: Registry check step', () => {
  const tmp = useTmpDir();
  const script = runBlock(LIVE, 'Registry check');
  let server: Server;
  let base = '';

  beforeAll(async () => {
    server = createServer((req, res) => {
      const status = Number((req.url ?? '').split('/').pop());
      if (status === 302) res.setHeader('location', 'http://127.0.0.1:1/');
      res.statusCode = status;
      res.end('{}');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // Async: the server lives on this event loop, so the child must not block it.
  function check(
    url: string,
  ): Promise<{ status: number | null; output: string }> {
    const out = join(tmp.path(), 'out');
    writeFileSync(out, '');
    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', script], {
        env: { ...process.env, VERSION_URL: url, GITHUB_OUTPUT: out },
        stdio: 'ignore',
      });
      child.on('close', (status) =>
        resolve({ status, output: readFileSync(out, 'utf8') }),
      );
    });
  }

  it('the step reads the URL from its env, which names the scoped package', () => {
    expect(LIVE).toContain(
      'VERSION_URL: https://registry.npmjs.org/@pharn-dev%2fpharn/${{ needs.gate.outputs.version }}',
    );
  });

  it('200 → published=true (the publish is skipped)', async () => {
    expect(await check(`${base}/200`)).toEqual({
      status: 0,
      output: 'published=true\n',
    });
  });

  it('404 → published=false (the publish runs)', async () => {
    expect(await check(`${base}/404`)).toEqual({
      status: 0,
      output: 'published=false\n',
    });
  });

  // Four bash + curl children in one case (about 1 s idle): an explicit budget,
  // so a loaded --coverage run does not fail it on vitest's 5 s default (F-35).
  it('any other status, a redirect, or no answer fails the run', async () => {
    for (const url of [
      `${base}/500`,
      `${base}/403`,
      `${base}/302`,
      'http://127.0.0.1:1/',
    ]) {
      const r = await check(url);
      expect(r.status, url).toBe(1);
      expect(r.output, url).toBe('');
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// npm reads a package argument as a LOCAL FILE only when it starts with `./`,
// `../`, `/` or `~/` (npm-package-arg's file-spec test). A bare relative path
// such as `pkg/pharn-dev-pharn-0.6.0.tgz` has the shape of the GitHub
// `owner/repo` shorthand, so npm resolves it as a git dependency and runs
// `git ls-remote ssh://git@github.com/pkg/pharn-dev-pharn-0.6.0.tgz.git`. That
// is exactly how the 0.6.0 release failed: the publish job died on
// `Permission denied (publickey)` and nothing reached the registry. The build
// job's smoke install never hit it only because its path began with `../`.

/** Every `.tgz` argument handed to `npm publish` / `npm install` in the workflow. */
function tarballArgs(source: string): { command: string; arg: string }[] {
  const found: { command: string; arg: string }[] = [];
  for (const line of source.split('\n')) {
    const m = /\bnpm (publish|install|i)\b(.*)$/.exec(line);
    if (!m) continue;
    for (const token of m[2]!.trim().split(/\s+/)) {
      const arg = token.replace(/^["']|["']$/g, '');
      if (arg.endsWith('.tgz')) found.push({ command: m[1]!, arg });
    }
  }
  return found;
}

describe('publish.yml tarball arguments', () => {
  const args = tarballArgs(LIVE);

  it('publishes a tarball (so the path check below is not vacuous)', () => {
    expect(args.some((a) => a.command === 'publish')).toBe(true);
  });

  it('passes every tarball as an explicit file path, never an owner/repo lookalike', () => {
    for (const { arg } of args) {
      expect(arg, `npm would resolve "${arg}" as a GitHub repo`).toMatch(
        /^(?:\.{1,2}|~)?\//,
      );
    }
  });

  it('never hands the release notes to npm', () => {
    for (const line of codeOf(LIVE).split('\n'))
      if (/\bnpm\b/.test(line)) expect(line).not.toContain('RELEASE_NOTES');
  });
});
