import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// GitHub reports an Actions job under its `name:` when the job has one, and
// under its bare JOB ID when it does not. Whichever string that is, it is what
// the `main` branch ruleset lists in `required_status_checks`. When the two
// disagree the required check is never reported, so every PR hangs on a context
// no workflow produces — merge-blocked with nothing red to fix. That happened
// once (a ruleset listing 30 OS/node matrix contexts against a workflow that
// defined one job), which is the real need this test exists to serve (P7).
//
// FOUR workflows produce the nine required contexts, and all four are pinned
// below: `ci.yml` (six named jobs), `floor.yml` and `gitleaks.yml` (one job
// each with NO `name:`, so each reports under its id), and `codeql.yml` (one
// job whose name is a matrix template). `publish.yml` is deliberately absent —
// it runs on a published Release and reports no required context, so listing it
// would make REQUIRED_CONTEXTS claim something false.
//
// The invariant is two-sided and this test pins only the side that lives in the
// repo. Nothing here reads the live ruleset, so a ruleset edited on github.com
// still drifts silently. In particular the ORIGINAL incident — a ruleset
// requiring contexts that no workflow produces — stays invisible from in-repo,
// because those contexts exist only in the ruleset. What is pinned is the
// mirror image: a workflow drifting away from a context this repo has DECLARED
// required. Half the contract, said plainly rather than papered over (P0). Cite
// `.dev/features/ci-matrix-required-checks/PLAN.md` for the full guarantee
// audit.
const CI_WORKFLOW = '.github/workflows/ci.yml';
const CODEQL_WORKFLOW = '.github/workflows/codeql.yml';

/** Required status check (the job's `name:`) → the npm script that gate runs. */
const EXPECTED_GATES: ReadonlyMap<string, string> = new Map([
  ['Format check', 'npm run format:check'],
  ['Lint', 'npm run lint'],
  ['Markdown lint', 'npm run lint:md'],
  ['Typecheck', 'npm run typecheck'],
  ['Test', 'npm run test:coverage'],
  ['Build', 'npm run build'],
]);

/**
 * Workflows whose required context is the bare JOB ID, because the job carries
 * no `name:` key at all — the map runs workflow path to the id it reports.
 * Their runner setup deliberately differs from ci.yml's (the floor job tracks
 * a floating LTS, the secret scan sets up no node at all), so the runner and
 * node pins below stay ci.yml-only.
 */
const BARE_ID_WORKFLOWS: ReadonlyMap<string, string> = new Map([
  ['.github/workflows/floor.yml', 'floor'],
  ['.github/workflows/gitleaks.yml', 'gitleaks'],
]);

const CODEQL_JOB = 'analyze';
/** CodeQL's job name is a template; the matrix fans it out into one context. */
const CODEQL_CONTEXT = 'Analyze (javascript-typescript)';

/**
 * The in-repo MIRROR of the `main` ruleset's `required_status_checks`.
 *
 * A DECLARED BELIEF, not a verified fact — see the header. Nothing in this
 * suite reads the ruleset, so these nine strings are what the repo asserts the
 * ruleset asks for, hand-checked whenever they change. What they DO buy is that
 * every one of them is derived from a workflow below, so a workflow can no
 * longer drift away from the list without a test going red.
 */
const REQUIRED_CONTEXTS: readonly string[] = [
  'Format check',
  'Lint',
  'Markdown lint',
  'Typecheck',
  'Test',
  'Build',
  'floor',
  'gitleaks',
  CODEQL_CONTEXT,
];

const RUNNER = 'ubuntu-latest';
const NODE_VERSION = '24';

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
function jobBlocks(path: string, yaml: string): Map<string, string> {
  const lines = yaml.split('\n');
  const start = lines.indexOf('jobs:');
  expect(start, `${path} has no top-level \`jobs:\` key`).toBeGreaterThan(-1);

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

interface Workflow {
  /** The whole file, for the decoy assertions. */
  readonly source: string;
  /** Job id maps to the job's text block. */
  readonly blocks: Map<string, string>;
  /** Every four-space `name:` value, i.e. every JOB name — never a step's. */
  readonly jobNames: string[];
}

/**
 * Read and split ONE workflow. Per-file on purpose: four workflows produce the
 * nine required contexts, and each is parsed the same way rather than one of
 * them being privileged at module scope.
 */
function parse(path: string): Workflow {
  const source = readFileSync(path, 'utf8');
  const blocks = jobBlocks(path, source);
  const jobNames = [...blocks.values()].flatMap((b) =>
    captureAll(b, /^ {4}name: (.+)$/gm),
  );
  return { source, blocks, jobNames };
}

describe('the required status checks this repo declares', () => {
  it('lists exactly the contexts the pinned workflows produce', () => {
    // Set equality, stronger than the subset it subsumes: the subset direction
    // stops EXPECTED_GATES and REQUIRED_CONTEXTS drifting apart inside this
    // file, and the superset direction stops the list quietly growing a context
    // that no workflow pinned here reports.
    const produced = [
      ...EXPECTED_GATES.keys(),
      ...BARE_ID_WORKFLOWS.values(),
      CODEQL_CONTEXT,
    ];
    expect([...REQUIRED_CONTEXTS].sort()).toEqual([...produced].sort());
  });
});

describe('ci.yml required status checks', () => {
  const ci = parse(CI_WORKFLOW);

  it('defines exactly one job per required gate, and no others', () => {
    // Set equality in both directions: a rename, an addition, or a deletion all
    // fail. A one-directional `toContain` sweep would miss a stray seventh job.
    expect([...ci.jobNames].sort()).toEqual([...EXPECTED_GATES.keys()].sort());
    expect(ci.blocks.size).toBe(EXPECTED_GATES.size);
  });

  it('reads job names only, never the workflow name or a step name', () => {
    // The extractor's discrimination is the thing most likely to rot, so assert
    // the two decoys are really present in the file and really excluded.
    expect(ci.source.startsWith('name: ci\n')).toBe(true);
    expect(ci.jobNames).not.toContain('ci');

    expect(ci.source).toContain('      - name: Install');
    expect(ci.jobNames).not.toContain('Install');
  });

  it('runs each gate through its own npm script', () => {
    for (const [gate, script] of EXPECTED_GATES) {
      const block = [...ci.blocks.values()].find((b) =>
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
    for (const [jobId, block] of ci.blocks) {
      expect(captureAll(block, /^ {4}runs-on: (.+)$/gm), jobId).toEqual([
        RUNNER,
      ]);
      expect(captureAll(block, /^\s+node-version: (.+)$/gm), jobId).toEqual([
        NODE_VERSION,
      ]);
    }
  });
});

for (const [workflow, context] of BARE_ID_WORKFLOWS) {
  describe(`${workflow} required status check`, () => {
    it('defines exactly one job, whose id is the required context', () => {
      expect([...parse(workflow).blocks.keys()]).toEqual([context]);
    });

    it('gives that job no `name:`, which is what makes the id the context', () => {
      // The load-bearing NEGATIVE, and the reason this file pins an ABSENCE.
      // GitHub reports a job under its `name:` when one is present and under
      // its id otherwise, so adding `name: Floor` here for a nicer Checks-tab
      // label would rename the reported context from `floor` to `Floor`. The
      // ruleset would keep waiting on `floor`, and every PR would be
      // merge-blocked with nothing red to fix — the incident in the header,
      // for a third of the required contexts. Better it fails here.
      const wf = parse(workflow);

      // Guard first, or the emptiness below would also be satisfied by a parse
      // that found no jobs at all.
      expect(wf.blocks.size).toBe(1);
      expect(wf.jobNames).toEqual([]);

      // The decoys, which are what make that emptiness a discrimination rather
      // than "this file contains no `name:` anywhere". Note the workflow-level
      // one is character-identical to the required context, so a parser reading
      // column 0 would look right while proving nothing.
      expect(wf.source.startsWith(`name: ${context}\n`)).toBe(true);
      expect(wf.source).toContain('      - name: ');
    });
  });
}

describe('codeql.yml required status check', () => {
  it('defines exactly one job, named with the matrix template', () => {
    const codeql = parse(CODEQL_WORKFLOW);
    expect([...codeql.blocks.keys()]).toEqual([CODEQL_JOB]);
    // Three step-level `- name:` keys sit inside this job; none may be read.
    expect(codeql.jobNames).toEqual(['Analyze (${{ matrix.language }})']);
  });

  it('fans that template out into exactly the one required context', () => {
    // Both halves are read from the file, so renaming the template OR adding a
    // second language reddens this: a second language would fan out into two
    // contexts, leaving the required one reported alongside an unrequired
    // sibling that nothing waits on.
    const codeql = parse(CODEQL_WORKFLOW);

    const template = codeql.jobNames[0];
    expect(
      template,
      `${CODEQL_WORKFLOW} job has no four-space \`name:\``,
    ).toBeDefined();

    const matrix = captureAll(
      codeql.blocks.get(CODEQL_JOB) ?? '',
      /^ {8}language: \[(.+)\]$/gm,
    );
    expect(
      matrix,
      `${CODEQL_WORKFLOW} has no matrix \`language:\` line`,
    ).toHaveLength(1);
    const languages = matrix[0]!.split(',').map((l) => l.trim());
    expect(languages).toHaveLength(1);

    expect(template!.replace('${{ matrix.language }}', languages[0]!)).toBe(
      CODEQL_CONTEXT,
    );
  });
});
