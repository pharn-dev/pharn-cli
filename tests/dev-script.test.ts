import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `npm run dev` is the invocation README.md and docs/contributing.md tell a
// contributor to use for running the CLI from source. It has to exist, and it
// has to stay a bare `tsx src/index.ts` so that `npm run dev -- init` forwards
// argv to minimist the way the built binary does.
//
// This pins the script's SPELLING, in the shape tests/lint-gate.test.ts already
// uses for `lint`. It deliberately does NOT spawn the CLI: proving the argv
// forwarding would mean running an interactive command in a test, which this
// repo does nowhere. So a green run here means "the documented script exists
// and names the right entrypoint" — never "the dev script was executed".
//
// The negative half matters as much as the positive one. The six CI job names
// are a contract with the `main` branch ruleset, and tests/ci-workflow.test.ts
// pins that side (exactly six jobs, `npm ci` plus one script each). Nothing
// pinned the package.json side, so a later edit could wire `dev` into a job's
// `run:` list with only the workflow test to catch it. `dev` is developer
// ergonomics; it is not a gate.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The npm scripts each of the six required CI gates runs. */
const CI_GATE_SCRIPTS = [
  'format:check',
  'lint',
  'lint:md',
  'typecheck',
  'test:coverage',
  'build',
] as const;

/** The docs that tell a contributor to run `npm run dev`. */
const DOCS_NAMING_DEV = ['README.md', join('docs', 'contributing.md')];

function pkg(): { scripts: Record<string, string> } {
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
}

describe('the `dev` script', () => {
  it('exists and runs the TypeScript entrypoint under tsx', () => {
    const dev = pkg().scripts.dev;

    expect(dev).toBeDefined();
    const tokens = dev!.split(/\s+/);
    expect(tokens).toContain('tsx');
    expect(tokens).toContain('src/index.ts');
  });

  it('is a bare invocation, so `-- init` forwards like the built binary', () => {
    // No watch flag, no env prefix, no shell chaining: anything that consumed
    // or reordered argv would make `npm run dev -- init` diverge from
    // `pharn init`, which is the whole point of documenting it.
    expect(pkg().scripts.dev).toBe('tsx src/index.ts');
  });

  it('is not a CI gate', () => {
    // The gate set is fixed at six (tests/ci-workflow.test.ts asserts the
    // workflow has exactly those jobs). Adding a local convenience script must
    // not add a seventh required status check.
    expect(CI_GATE_SCRIPTS).not.toContain('dev');
  });

  it('is still the invocation the contributor docs name', () => {
    // If someone deletes the script without touching the docs, the documented
    // command breaks again — which is the bug this test exists to close.
    for (const rel of DOCS_NAMING_DEV) {
      expect(readFileSync(join(repoRoot, rel), 'utf8')).toContain(
        'npm run dev',
      );
    }
  });
});
