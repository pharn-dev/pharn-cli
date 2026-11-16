import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';

// publish.yml runs only after a merge to main (release-on-merge); no PR check
// executes it. Two things are pinned before merge. (1) The one write grant:
// `contents: write` exists exactly once, inside the `release` job. (`id-token`
// is pinned by .dev/floor/check-run-pins.test.mjs, in the required `floor`
// check.) (2) The `Decide` step, EXECUTED from the committed text against a stub
// `git`: a broken Decide ends the run green with nothing published, which is
// release-on-merge's only silent failure.
const WORKFLOW = readFileSync('.github/workflows/publish.yml', 'utf8');

/** Full-line YAML comments dropped: a comment grants nothing. */
const code = WORKFLOW.split('\n')
  .filter((l) => !l.trimStart().startsWith('#'))
  .join('\n');

/** The dedented `run: |` body of the step named `name`. */
function runBlock(name: string): string {
  const lines = WORKFLOW.split('\n');
  const step = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  const run = lines.findIndex((l, i) => i > step && /^\s*run: \|\s*$/.test(l));
  expect(step, `step "${name}"`).toBeGreaterThanOrEqual(0);
  const keyIndent = lines[run]!.search(/\S/);
  const body: string[] = [];
  for (const l of lines.slice(run + 1)) {
    if (l.trim() !== '' && l.search(/\S/) <= keyIndent) break;
    body.push(l);
  }
  const indent = Math.min(
    ...body.filter((l) => l.trim() !== '').map((l) => l.search(/\S/)),
  );
  return body.map((l) => l.slice(indent)).join('\n');
}

describe('publish.yml', () => {
  const tmp = useTmpDir();

  it('grants contents: write exactly once, inside the release job', () => {
    expect(code.match(/^\s*contents:\s*write\b/gm)).toHaveLength(1);
    const release = code.slice(code.search(/^ {2}release:\s*$/m));
    expect(release).toMatch(/^\s*contents:\s*write\b/m);
  });

  it('Decide: a tagged version releases nothing, an untagged one releases', () => {
    const script = runBlock('Decide');
    const decide = (gitExit: number): string => {
      const dir = join(tmp.path(), `git-exit-${gitExit}`);
      const bin = join(dir, 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(dir, 'package.json'), '{"version":"1.2.3"}');
      writeFileSync(join(bin, 'git'), `#!/bin/sh\nexit ${gitExit}\n`);
      chmodSync(join(bin, 'git'), 0o755);
      const out = join(dir, 'out');
      writeFileSync(out, '');
      const r = spawnSync('bash', ['-c', script], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          GITHUB_REF: 'refs/heads/main',
          GITHUB_OUTPUT: out,
        },
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      return readFileSync(out, 'utf8');
    };
    // `git ls-remote --exit-code` exits 0 when the tag exists, 2 when it does not.
    expect(decide(0)).toBe('version=1.2.3\nrelease=false\n');
    expect(decide(2)).toBe('version=1.2.3\nrelease=true\n');
  });
});
