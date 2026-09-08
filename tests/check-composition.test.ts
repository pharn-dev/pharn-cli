import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `npm run check` is the one command CONTRIBUTING.md tells a contributor to run
// before pushing. CI runs six gates as six separate jobs, and two of them —
// Markdown lint and Build — are required status checks on the `main` ruleset.
// While `check` omitted `lint:md`, a docs-only PR could pass every gate the
// contributor docs named and still land a red required X, with no documented
// local command that reproduced it.
//
// This pins what `check` actually composes, INCLUDING the two places it still
// deliberately differs from CI. Those differences are the reason the docs must
// not say "this is exactly what CI runs" — the precise claim is "everything CI
// runs except `build`, and without coverage thresholds".

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function checkScript(): string {
  const pkg = JSON.parse(
    readFileSync(join(repoRoot, 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string> };
  return pkg.scripts.check!;
}

/** The npm scripts the six required CI gates run, in workflow order. */
const CI_GATE_SCRIPTS = [
  'format:check',
  'lint',
  'lint:md',
  'typecheck',
  'test:coverage',
  'build',
] as const;

/** The sub-scripts `npm run check` chains, in order. */
function checkedScripts(): string[] {
  return checkScript()
    .split('&&')
    .map((s) => s.trim().replace(/^npm run /, ''))
    .map((s) => (s === 'npm test' ? 'test' : s));
}

describe('npm run check composition', () => {
  it('covers every static gate CI runs', () => {
    const chained = checkedScripts();
    for (const gate of ['format:check', 'lint', 'lint:md', 'typecheck']) {
      expect(chained).toContain(gate);
    }
  });

  it('runs the test suite', () => {
    // Either spelling satisfies "the suite ran"; which one is pinned below.
    expect(checkedScripts().some((s) => s.startsWith('test'))).toBe(true);
  });

  it('runs `test`, not `test:coverage` — a deliberate divergence from CI', () => {
    // CI's Test job runs `test:coverage`, which enforces the vitest coverage
    // thresholds. `check` runs the plain suite: the same tests, without the
    // threshold gate, because a contributor iterating locally should not have a
    // coverage floor fail a red-green cycle. The consequence is that `check`
    // green does NOT prove the Test job will be green, and every doc that
    // describes `check` has to say so.
    const chained = checkedScripts();
    expect(chained).toContain('test');
    expect(chained).not.toContain('test:coverage');
  });

  it('does not run `build` — the other deliberate divergence', () => {
    // `build` is a required CI gate but a slow local one, and `prepack` already
    // runs it before any publish, so a broken build cannot ship. Excluded on
    // purpose; pinned so the exclusion stays a decision rather than becoming an
    // oversight nobody can date.
    expect(checkedScripts()).not.toContain('build');
  });

  it('differs from the CI gate set in exactly the two documented ways', () => {
    // The set relation, stated once: everything CI runs, minus `build`, with
    // `test` standing in for `test:coverage`.
    //
    // HONEST SCOPE. CI_GATE_SCRIPTS above is a local literal, NOT read from
    // ci.yml — so adding a seventh job to the workflow does NOT redden this. An
    // earlier version of this comment claimed it did, which was exactly the kind
    // of "written down, therefore guaranteed" the repo exists to prevent.
    //
    // What actually holds: the workflow side is pinned by
    // tests/ci-workflow.test.ts (job-set equality), and this pins that `check`'s
    // composition matches the list HERE. A seventh CI gate reddens that file and
    // leaves this one green, so the two must be updated together — which is the
    // duplication worth removing, not this assertion.
    const chained = new Set(checkedScripts());
    const missing = CI_GATE_SCRIPTS.filter((g) => !chained.has(g));
    expect(missing).toEqual(['test:coverage', 'build']);
  });
});
