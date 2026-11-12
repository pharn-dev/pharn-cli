import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// The dev loop keeps its runtime state under `.pharn/`: the active writes-scope
// (`set-writes-scope.cjs`, rewritten by every stage) and the stage captures
// (`/pharn-dev-verify`, `/pharn-dev-regress`, `/pharn-dev-memory-promote`).
// While those files were tracked, every fresh checkout started with whatever
// scope the last committed run left behind, and every ship run had to
// `git restore` them before committing (P7: the triggering need). The one
// tracked file under `.pharn/` is `ci.yml`, the pharn-ci config.
//
// `.gitignore` alone is advisory (`git add -f` gets past it), so this pins both
// halves: the index holds nothing under `.pharn/` but `ci.yml`, and the
// runtime paths are ignored. `git check-ignore` reports a TRACKED path as not
// ignored, so a re-added runtime file fails the second half too.
//
// git runs in the process cwd, which is the repo root under vitest (the other
// tests that read repo files use cwd-relative paths the same way). There is
// no skip: every place this suite runs (local, the CI `Test` job, the publish
// build job) is a git checkout, so a run without git fails instead of passing
// silently.

const RUNTIME_PATHS = [
  '.pharn/writes-scope.json',
  '.pharn/pharn-dev-verify/results.json',
  '.pharn/pharn-dev-verify/results-capture1.json',
  '.pharn/pharn-dev-verify/verdict.json',
  '.pharn/pharn-dev-regress/base-results.json',
  '.pharn/pharn-dev-regress/head-results.json',
  '.pharn/pharn-dev-regress/verdict.json',
  '.pharn/pharn-dev-memory-promote/body.md',
  // Not written yet in this repo, but `/pharn-dev-memory-promote` writes it:
  // the pattern must cover a runtime file nobody has committed.
  '.pharn/pharn-dev-memory-promote/candidate.json',
];

function runGit(...args: string[]): { status: number | null; stdout: string } {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '' };
}

describe('.pharn/ runtime state stays out of git', () => {
  it('tracks nothing under .pharn/ but the pharn-ci config', () => {
    const r = runGit('ls-files', '--', '.pharn');
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n').filter(Boolean)).toEqual(['.pharn/ci.yml']);
  });

  it.each(RUNTIME_PATHS)('ignores %s', (path) => {
    expect(runGit('check-ignore', '-q', '--', path).status).toBe(0);
  });

  it('never ignores .pharn/ci.yml', () => {
    expect(runGit('check-ignore', '-q', '--', '.pharn/ci.yml').status).toBe(1);
  });
});
