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
// below: `ci.yml` (six named gate jobs, plus one non-required comment job
// pinned on its own further down), `floor.yml` and `gitleaks.yml` (one job
// each with NO `name:`, so each reports under its id), and `codeql.yml` (one
// job whose name is a matrix template). `publish.yml` is deliberately absent —
// it runs only on push to `main` (and `workflow_dispatch`), never on a pull
// request, and reports no required context, so listing it would make
// REQUIRED_CONTEXTS claim something false.
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
 * The `Build` job's one EXTRA `run:` — it executes the artifact the same job
 * just produced.
 *
 * The suite imports `src/`; `tests/dist-smoke.test.ts` runs a bundle it builds
 * into a temp dir with the same `scripts/build.mjs`, but never the `dist/`
 * this job produces. This step covers that artifact's two load-time
 * assumptions — `src/version.ts`'s
 * `require('../package.json')`, correct only at the bundle's depth below the
 * package root, and the three names `scripts/build.mjs` leaves `external` as
 * bare imports. Both resolve while the module graph loads, before a flag is
 * parsed, so either drift exits non-zero and reddens `Build`.
 *
 * What that buys is narrower than it looks, and the narrow version is the one to
 * keep: it catches an EXTERNALIZED package that no longer resolves or loads
 * (moved to devDependencies, dropped, broken CJS/ESM interop). A package MISSING
 * from `external` is not this step's to catch — esbuild bundles it instead, and
 * an unresolvable one fails `npm run build` one step earlier.
 */
const SMOKE_RUN = 'node dist/index.js --version && node dist/index.js --help';

/**
 * Run commands a gate executes AFTER its npm script, by gate name.
 *
 * This table is what keeps the per-gate assertion below two-directional: the
 * smoke step going missing fails it, and a run step appearing in ANY gate —
 * `Build` included — that is not listed here fails it too. The P3 property the
 * original exact-array assertion bought (a gate cannot quietly grow a second
 * responsibility) therefore survives; it is not loosened into a `toContain`.
 */
/**
 * The `Test` job's one EXTRA `run:` — it writes the PR number into the artifact
 * that feeds `pharn-ci-comment.yml` (the fork-PR sticky comment, posted from the
 * default branch since a fork's token on `pull_request` cannot comment). The
 * gate step itself (`uses: pharn-dev/pharn-ci@...`) is not a `run:` command, so
 * only this line shows up.
 */
const PR_NUMBER_RUN = 'echo "$PR_NUMBER" > pr-number';

const EXTRA_RUNS: ReadonlyMap<string, readonly string[]> = new Map([
  ['Test', [PR_NUMBER_RUN]],
  ['Build', [SMOKE_RUN]],
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

const PHARN_CI_COMMENT_WORKFLOW = '.github/workflows/pharn-ci-comment.yml';

/**
 * The ONE job in ci.yml that is not a gate: pharn-ci's sticky PR comment for a
 * pull request from this repository. It exists because pharn-ci's PR-number
 * mode (`pharn-ci-comment.yml`, `workflow_run`) never reads the PR's file text,
 * so its comment reported TI02/TI05, the agent-config secret scan and
 * dependency safety as not checked and disagreed with the gating report
 * (#354, #355, #356). It is NOT required — its name must never join
 * `REQUIRED_CONTEXTS` — and it holds the workflow's only write grant, which is
 * safe only while it executes no repository code. Both are pinned below.
 */
const COMMENT_JOB_ID = 'pharn-ci-comment';
const COMMENT_JOB_NAME = 'pharn-ci comment';
/** Same-repo pull requests only; a fork's `pull_request` token is read-only. */
const COMMENT_JOB_IF =
  "${{ !cancelled() && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository }}";
/** The complement: `pharn-ci-comment.yml` comments on fork pull requests only. */
const FORK_ONLY_IF =
  "github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.head_repository.full_name != github.repository";
/**
 * The only `with:` keys in which the comment job's pharn-ci step may differ
 * from the gate's: whether it comments, and whether it gates.
 */
const COMMENT_ONLY_INPUTS: ReadonlyMap<string, readonly [string, string]> =
  new Map([
    // key → [value in Test, value in the comment job]
    ['comment', ['false', 'true']],
    ['fail-on-verdict', ['(unset)', 'false']],
  ]);

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

/**
 * Split a job block into its steps (each starts with a six-space `- `).
 * Same indentation-is-the-parse rule as `jobBlocks`.
 */
function steps(block: string): string[] {
  const out: string[] = [];
  for (const line of block.split('\n')) {
    if (/^ {6}- /.test(line)) out.push(line);
    else if (out.length > 0 && /^ {7,}\S/.test(line))
      out[out.length - 1] += `\n${line}`;
  }
  return out;
}

interface ActionStep {
  /** The `uses:` value, comment stripped (`owner/repo@<sha>`). */
  readonly uses: string;
  /** The step's `with:` inputs, YAML comments stripped. */
  readonly inputs: Map<string, string>;
}

/** The ONE step in `block` whose `uses:` starts with `prefix`. */
function actionStep(block: string, prefix: string): ActionStep {
  const found = steps(block).filter((s) =>
    new RegExp(`^ {6,8}(?:- )?uses: ${prefix}`, 'm').test(s),
  );
  expect(found, `expected exactly one ${prefix} step`).toHaveLength(1);
  const step = found[0]!;
  const uses = /^ {6,8}(?:- )?uses: (\S+)/m.exec(step)![1]!;
  const inputs = new Map<string, string>();
  for (const m of step.matchAll(/^ {10}([a-z-]+): (.*?)(?:\s+#.*)?$/gm)) {
    inputs.set(m[1]!, m[2]!);
  }
  return { uses, inputs };
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
    // fail. A one-directional `toContain` sweep would miss a stray extra job.
    // The ONE non-gate job (the comment job) is set aside by name and pinned in
    // the next test, so it cannot hide a second extra.
    const gateNames = ci.jobNames.filter((n) => n !== COMMENT_JOB_NAME);
    expect([...gateNames].sort()).toEqual([...EXPECTED_GATES.keys()].sort());
    expect(ci.blocks.size).toBe(EXPECTED_GATES.size + 1);
  });

  it('declares exactly one non-gate job, the pharn-ci comment job', () => {
    expect(ci.jobNames.filter((n) => n === COMMENT_JOB_NAME)).toHaveLength(1);
    expect(
      new RegExp(`^ {4}name: ${COMMENT_JOB_NAME}$`, 'm').test(
        ci.blocks.get(COMMENT_JOB_ID) ?? '',
      ),
    ).toBe(true);
  });

  it('never declares the comment job a required context', () => {
    // It never gates (fail-on-verdict: false) and the ruleset does not list it;
    // a mirror that claimed otherwise would be false (see the header).
    expect(REQUIRED_CONTEXTS).not.toContain(COMMENT_JOB_NAME);
    expect([...EXPECTED_GATES.keys()]).not.toContain(COMMENT_JOB_NAME);
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
      // Install first, then exactly the one gate command, then only whatever
      // EXTRA_RUNS declares for this gate — so a gate cannot quietly grow a
      // second responsibility (P3), and the one gate that legitimately has a
      // second run step has to declare it above.
      expect(captureAll(block!, /^\s+run: (.+)$/gm)).toEqual([
        'npm ci',
        script,
        ...(EXTRA_RUNS.get(gate) ?? []),
      ]);
    }
  });

  it('smokes the PUBLISHED artifact, not just some path that happens to exist', () => {
    // Without this, SMOKE_RUN is an arbitrary literal that the assertion above
    // only proves is present in the file. With it, renaming `bin.pharn` without
    // updating CI goes red here rather than shipping a bin nothing ever
    // executed.
    //
    // What it does NOT cover: a `scripts/build.mjs` `outfile` that stops
    // agreeing with `bin.pharn`. This assertion never reads the build script,
    // so it cannot see that drift; the workflow step catches it at runtime, one
    // layer out, when node is handed a published path that was never written.
    //
    // Ordering is deliberately NOT asserted here: `dist/` does not exist until
    // the build step has run, but the exact-array equality above already pins
    // the whole run list IN ORDER, so a separate index compare could never fail
    // on its own. An assertion that cannot independently fail is decoration, not
    // coverage (P0) — verified by deleting the step and watching which
    // assertions actually fire.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      bin?: Record<string, string>;
    };
    const bin = pkg.bin?.pharn;
    expect(bin, 'package.json declares no bin.pharn').toBeDefined();
    expect(SMOKE_RUN).toContain(`node ${bin!} `);
  });

  it('pins every gate to the same runner and node version', () => {
    for (const [jobId, block] of ci.blocks) {
      if (jobId === COMMENT_JOB_ID) continue; // sets up no node; pinned below
      expect(captureAll(block, /^ {4}runs-on: (.+)$/gm), jobId).toEqual([
        RUNNER,
      ]);
      expect(captureAll(block, /^\s+node-version: (.+)$/gm), jobId).toEqual([
        NODE_VERSION,
      ]);
    }
  });
});

describe('ci.yml pharn-ci comment job', () => {
  const ci = parse(CI_WORKFLOW);
  const comment = ci.blocks.get(COMMENT_JOB_ID) ?? '';
  const test = [...ci.blocks.values()].find((b) => /^ {4}name: Test$/m.test(b));

  it('exists, runs after Test, and only for same-repo pull requests', () => {
    expect(comment, `ci.yml has no ${COMMENT_JOB_ID} job`).not.toBe('');
    expect(captureAll(comment, /^ {4}needs: (.+)$/gm)).toEqual(['test']);
    expect(captureAll(comment, /^ {4}if: (.+)$/gm)).toEqual([COMMENT_JOB_IF]);
    expect(captureAll(comment, /^ {4}runs-on: (.+)$/gm)).toEqual([RUNNER]);
  });

  it('runs no repository code (it holds a write token)', () => {
    // No `run:` step, no toolchain, no install: nothing from the PR or its
    // dependencies executes in the job that can write to pull requests.
    expect(captureAll(comment, /^\s+run: (.+)$/gm)).toEqual([]);
    expect(comment).not.toMatch(/^\s+run:/m);
    expect(comment).not.toMatch(/setup-node|node-version|\bnpm\b|\bnpx\b/);
    expect(
      steps(comment).map((s) => /uses: ([^@\s]+)@/.exec(s)?.[1] ?? '(none)'),
    ).toEqual([
      'actions/checkout',
      'actions/download-artifact',
      'pharn-dev/pharn-ci',
    ]);
  });

  it('holds the only write grant in ci.yml', () => {
    // Test runs `npm ci` and the suite; it must never get a write grant.
    // A trailing YAML comment must not hide a grant (`contents: write # …`).
    expect(
      captureAll(ci.source, /^\s+([a-z-]+:\s*write)\b/gm).map((g) =>
        g.replace(/:\s*/, ': '),
      ),
    ).toEqual(['pull-requests: write']);
    expect(comment).toMatch(/^ {6}pull-requests: write$/m);
  });

  it("measures the gate's inputs: same action, checkout, coverage and with: keys", () => {
    expect(test, 'no Test job').toBeDefined();
    const gate = actionStep(test!, 'pharn-dev/pharn-ci@');
    const mirror = actionStep(comment, 'pharn-dev/pharn-ci@');
    expect(mirror.uses).toBe(gate.uses);

    // Every input but the two COMMENT_ONLY_INPUTS is identical, key for key,
    // so an input added to one step alone (a threshold, a coverage-file, an
    // exclude) fails here instead of making the verdicts drift.
    const strip = (m: Map<string, string>): [string, string][] =>
      [...m].filter(([k]) => !COMMENT_ONLY_INPUTS.has(k)).sort();
    expect(strip(mirror.inputs)).toEqual(strip(gate.inputs));
    expect(strip(gate.inputs).length).toBeGreaterThan(0); // anti-vacuity
    for (const [key, [inTest, inComment]] of COMMENT_ONLY_INPUTS) {
      expect(gate.inputs.get(key) ?? '(unset)', `Test ${key}`).toBe(inTest);
      expect(mirror.inputs.get(key) ?? '(unset)', `comment ${key}`).toBe(
        inComment,
      );
    }

    // The same full-history checkout: a shallow one sends pharn-ci to the
    // compare API, the PR-number-mode gap this job exists to close.
    for (const block of [test!, comment]) {
      const checkout = actionStep(block, 'actions/checkout@');
      expect(checkout.inputs.get('fetch-depth')).toBe('0');
      expect(checkout.inputs.get('persist-credentials')).toBe('false');
    }

    // The coverage file comes from the artifact Test uploads in this run,
    // restored into the workspace where .pharn/ci.yml expects it.
    const upload = steps(test!).find((s) => /name: pharn-ci-input$/m.test(s));
    expect(upload, 'Test uploads no pharn-ci-input artifact').toMatch(
      /^ {12}coverage\/lcov\.info$/m,
    );
    const download = actionStep(comment, 'actions/download-artifact@');
    expect([...download.inputs]).toEqual([['name', 'pharn-ci-input']]);
    expect(readFileSync('.pharn/ci.yml', 'utf8')).toMatch(
      /^ {2}file: coverage\/lcov\.info$/m,
    );
  });
});

describe('pharn-ci-comment.yml', () => {
  it('comments on fork pull requests only, the complement of the comment job', () => {
    const wf = parse(PHARN_CI_COMMENT_WORKFLOW);
    expect(wf.blocks.size).toBe(1);
    expect(captureAll(wf.source, /^ {4}if: (.+)$/gm)).toEqual([FORK_ONLY_IF]);
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
