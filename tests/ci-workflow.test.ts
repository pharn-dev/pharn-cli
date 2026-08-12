import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// GitHub reports an Actions job under its `name:`, and that exact string is what
// the `main` branch ruleset lists in `required_status_checks`. When the two
// disagree the required check is never reported, so every PR hangs on a context
// no workflow produces — merge-blocked with nothing red to fix. That happened
// once (a ruleset listing 30 OS/node matrix contexts against a workflow that
// defined one job), which is the real need this test exists to serve (P7).
//
// The invariant is two-sided and this test pins only the side that lives in the
// repo. Nothing here reads the live ruleset, so a ruleset edited on github.com
// still drifts silently — an advisory limit, stated rather than papered over
// (P0). Cite `.dev/features/ci-matrix-required-checks/PLAN.md` for the full
// guarantee audit.
const WORKFLOW = '.github/workflows/ci.yml';

/** Required status check (the job's `name:`) → the npm script that gate runs. */
const EXPECTED_GATES: ReadonlyMap<string, string> = new Map([
  ['Format check', 'npm run format:check'],
  ['Lint', 'npm run lint'],
  ['Markdown lint', 'npm run lint:md'],
  ['Typecheck', 'npm run typecheck'],
  ['Test', 'npm run test:coverage'],
  ['Build', 'npm run build'],
]);

const RUNNER = 'ubuntu-latest';
const NODE_VERSION = '24';

const source = readFileSync(WORKFLOW, 'utf8');

/**
 * Split the `jobs:` mapping into one text block per job, keyed by job id.
 *
 * Indentation IS the parse here — a job id sits at exactly two spaces and its
 * keys at four — because no YAML parser is a direct devDependency and pulling
 * one in for a shape this small is not worth the supply-chain surface. The
 * discrimination that matters is that `name:` occurs at three levels of a
 * workflow file (column 0 for the workflow, four spaces for a job, and after a
 * `- ` for a step); anchoring on the four-space form is what separates them, and
 * the tests below assert both directions so a formatting change cannot quietly
 * turn this into a partial match.
 */
function jobBlocks(yaml: string): Map<string, string> {
  const lines = yaml.split('\n');
  const start = lines.indexOf('jobs:');
  expect(start, `${WORKFLOW} has no top-level \`jobs:\` key`).toBeGreaterThan(
    -1,
  );

  const blocks = new Map<string, string>();
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (current !== null) blocks.set(current, buffer.join('\n'));
  };

  for (const line of lines.slice(start + 1)) {
    const jobId = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobId) {
      flush();
      current = jobId[1]!;
      buffer = [];
      continue;
    }
    if (current !== null) buffer.push(line);
  }
  flush();

  return blocks;
}

/** Every match of `re`'s single capture group, in file order. */
function captureAll(block: string, re: RegExp): string[] {
  return [...block.matchAll(re)].map((m) => m[1]!);
}

const blocks = jobBlocks(source);
const jobNames = [...blocks.values()].flatMap((b) =>
  captureAll(b, /^ {4}name: (.+)$/gm),
);

describe('ci.yml required status checks', () => {
  it('defines exactly one job per required gate, and no others', () => {
    // Set equality in both directions: a rename, an addition, or a deletion all
    // fail. A one-directional `toContain` sweep would miss a stray seventh job.
    expect([...jobNames].sort()).toEqual([...EXPECTED_GATES.keys()].sort());
    expect(blocks.size).toBe(EXPECTED_GATES.size);
  });

  it('reads job names only, never the workflow name or a step name', () => {
    // The extractor's discrimination is the thing most likely to rot, so assert
    // the two decoys are really present in the file and really excluded.
    expect(source.startsWith('name: ci\n')).toBe(true);
    expect(jobNames).not.toContain('ci');

    expect(source).toContain('      - name: Install');
    expect(jobNames).not.toContain('Install');
  });

  it('runs each gate through its own npm script', () => {
    for (const [gate, script] of EXPECTED_GATES) {
      const block = [...blocks.values()].find((b) =>
        new RegExp(`^ {4}name: ${gate}$`, 'm').test(b),
      );
      expect(block, `no job named ${gate}`).toBeDefined();
      // Install first, then exactly the one gate command — so a gate cannot
      // quietly grow a second responsibility (P3).
      expect(captureAll(block!, /^\s+run: (.+)$/gm)).toEqual([
        'npm ci',
        script,
      ]);
    }
  });

  it('pins every gate to the same runner and node version', () => {
    for (const [jobId, block] of blocks) {
      expect(captureAll(block, /^ {4}runs-on: (.+)$/gm), jobId).toEqual([
        RUNNER,
      ]);
      expect(captureAll(block, /^\s+node-version: (.+)$/gm), jobId).toEqual([
        NODE_VERSION,
      ]);
    }
  });
});
