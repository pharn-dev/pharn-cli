// .dev/floor/check-soft-tier.test.mjs — tests for the no-soft-tier floor gate.
//
// Two kinds of test live here, and the split is deliberate:
//   1. HERMETIC — scratch repos on disk, exercising the contract without touching this repo.
//   2. LIVE REPO-CONSISTENCY (the ★ at the bottom) — validates the COMMITTED tree against REALITY.
//      This is the half that makes the gate LOAD-BEARING rather than decorative: nothing in
//      ci.yml or validate.mjs invokes check-soft-tier.mjs, so the gate's only execution against
//      the real repo is HERE, collected by floor.yml's `node --test` run. Delete the ★ block and
//      the scanner still passes its own fixtures while enforcing nothing. Do not delete it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url)); // .dev/floor
const REPO = join(here, "..", ".."); // repo root
const CAP = join(here, "check-soft-tier.mjs");
const SIBLING = join(here, "check-action-pins.mjs");

function run(targetDir, capPath = CAP) {
  return spawnSync(process.execPath, [capPath, targetDir], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function json(r) {
  return JSON.parse(r.stdout);
}
function scratch() {
  return mkdtempSync(join(tmpdir(), "pharn-softtier-"));
}
function reasons(r) {
  return json(r).violations.map((v) => v.reason);
}

// A scratch repo whose single workflow contains `body` verbatim under a steps: list.
function repoWith(body, { name = "ci.yml" } = {}) {
  const root = scratch();
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", name), `name: t\njobs:\n  j:\n    steps:\n${body}\n`);
  return root;
}
// The same, but writing the file bytes exactly as given (for line-ending fixtures).
function repoWithRaw(bytes, { name = "ci.yml" } = {}) {
  const root = scratch();
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", name), bytes);
  return root;
}

// --- the clean case ---------------------------------------------------------------------------

test("a workflow with no continue-on-error is clean", () => {
  const root = repoWith(`      - name: Test\n        run: npm test\n`);
  const r = run(root);
  assert.equal(r.status, 0);
  assert.deepEqual(json(r).violations, []);
  // Anti-vacuity: it must have READ the file, not merely stat-ed the directory.
  assert.equal(json(r).checked, 1);
  assert.ok(json(r).lines > 3, `expected lines read, got ${json(r).lines}`);
  rmSync(root, { recursive: true, force: true });
});

test("an empty repo is clean but reports having checked nothing", () => {
  const root = scratch();
  const r = run(root);
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 0);
  assert.equal(json(r).lines, 0);
  rmSync(root, { recursive: true, force: true });
});

// --- the violation, and its VALUE-BLINDNESS ----------------------------------------------------

test("continue-on-error: true on a step is a violation carrying file and line", () => {
  const root = repoWith(`      - name: Flaky\n        continue-on-error: true\n        run: npm test\n`);
  const r = run(root);
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["soft-tier-declared"]);
  assert.equal(json(r).violations[0].file, ".github/workflows/ci.yml");
  assert.equal(json(r).violations[0].line, 6); // name,jobs,  j:,    steps:,  - name:,  continue-on-error
  assert.equal(json(r).violations[0].value, "true");
  rmSync(root, { recursive: true, force: true });
});

// This is the test that PINS the design decision. `false` is a no-op that restates a default, so a
// future contributor will reasonably want to allow it — at which point the verdict starts depending
// on an untrusted file's VALUE instead of on an integer count. If that relaxation is ever wanted, it
// must be an argued change that breaks this test, never a quiet one.
test("continue-on-error: false is ALSO a violation — the scanner is value-blind by design", () => {
  const root = repoWith(`      - name: Honest\n        continue-on-error: false\n        run: npm test\n`);
  const r = run(root);
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["soft-tier-declared"]);
  assert.equal(json(r).violations[0].value, "false");
  rmSync(root, { recursive: true, force: true });
});

test("the experimental-cell laundering shape is caught without interpreting the expression", () => {
  const root = repoWith(`      - name: Maybe\n        continue-on-error: \${{ matrix.experimental }}\n        run: npm test\n`);
  const r = run(root);
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["soft-tier-declared"]);
  rmSync(root, { recursive: true, force: true });
});

test("a job-level and a flow-mapping declaration are both seen", () => {
  const root = repoWithRaw(
    `name: t\njobs:\n  a:\n    continue-on-error: true\n  b: { continue-on-error: true }\n`,
  );
  const r = run(root);
  assert.equal(r.status, 1);
  assert.equal(json(r).violations.length, 2);
  assert.deepEqual(
    json(r).violations.map((v) => v.line),
    [4, 5],
  );
  rmSync(root, { recursive: true, force: true });
});

test("a quoted key does not smuggle a soft tier past the scanner", () => {
  const root = repoWith(`      - name: Q\n        "continue-on-error": true\n        run: npm test\n`);
  assert.equal(run(root).status, 1);
  rmSync(root, { recursive: true, force: true });
});

test("a CRLF file is scanned line-by-line, not collapsed", () => {
  const root = repoWithRaw(`name: t\r\njobs:\r\n  j:\r\n    continue-on-error: true\r\n`);
  const r = run(root);
  assert.equal(r.status, 1);
  assert.equal(json(r).violations[0].line, 4);
  rmSync(root, { recursive: true, force: true });
});

// --- what must NOT be flagged ------------------------------------------------------------------

test("a commented-out example is not a declaration", () => {
  const root = repoWith(`      # continue-on-error: true\n      - run: npm test\n`);
  assert.equal(run(root).status, 0);
  rmSync(root, { recursive: true, force: true });
});

test("a longer key merely ENDING in the same text does not match", () => {
  const root = repoWith(`      - name: N\n        my-continue-on-error: true\n        run: npm test\n`);
  assert.equal(run(root).status, 0);
  rmSync(root, { recursive: true, force: true });
});

// --- enumeration boundaries --------------------------------------------------------------------

test("a non-YAML file in the workflows dir is not scanned", () => {
  const root = scratch();
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", "notes.md"), "continue-on-error: true\n");
  const r = run(root);
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 0);
  rmSync(root, { recursive: true, force: true });
});

test("a file in a SUBDIRECTORY of workflows/ is not a workflow (mirrors GitHub)", () => {
  const root = scratch();
  mkdirSync(join(root, ".github", "workflows", "nested"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", "nested", "x.yml"), "continue-on-error: true\n");
  const r = run(root);
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 0);
  rmSync(root, { recursive: true, force: true });
});

// The laundering path: exempting composite actions would let a soft tier live one `uses:` away.
test("a composite action definition IS walked", () => {
  const root = scratch();
  mkdirSync(join(root, ".github", "actions", "setup"), { recursive: true });
  writeFileSync(
    join(root, ".github", "actions", "setup", "action.yml"),
    `name: s\nruns:\n  using: composite\n  steps:\n    - continue-on-error: true\n      run: x\n      shell: bash\n`,
  );
  const r = run(root);
  assert.equal(r.status, 1);
  assert.equal(json(r).violations[0].file, ".github/actions/setup/action.yml");
  rmSync(root, { recursive: true, force: true });
});

test("an uppercase .YML extension is scanned", () => {
  const root = repoWith(`      - continue-on-error: true\n`, { name: "CI.YML" });
  assert.equal(run(root).status, 1);
  rmSync(root, { recursive: true, force: true });
});

// --- ★ LIVE REPO-CONSISTENCY — the committed tree, not a fixture -------------------------------

test("★ this repo declares no soft tier", () => {
  const r = run(REPO);
  assert.equal(r.status, 0, `soft tier declared in this repo:\n${r.stdout}`);
  assert.deepEqual(json(r).violations, []);
});

test("★ the live scan is not vacuous — it read every workflow on disk", () => {
  const j = json(run(REPO));
  // A LOWER BOUND, so adding a workflow later never silently shrinks coverage.
  assert.ok(j.checked >= 5, `expected >=5 workflow files scanned, got ${j.checked}`);
  assert.ok(j.lines > 100, `expected real content read, got ${j.lines} lines`);

  const onDisk = readdirSync(join(REPO, ".github", "workflows"))
    .filter((f) => /\.ya?ml$/i.test(f))
    .sort()
    .map((f) => `.github/workflows/${f}`);
  assert.deepEqual(
    j.files.filter((f) => f.startsWith(".github/workflows/")),
    onDisk,
  );
});

// R3 anti-drift: the enumerator is duplicated from check-action-pins.mjs on purpose (no floor script
// imports another). This is what stops the two copies from diverging in silence.
test("★ this scanner and check-action-pins.mjs enumerate the SAME files", () => {
  assert.deepEqual(json(run(REPO)).files, json(run(REPO, SIBLING)).files);
});

// DELIBERATELY ABSENT: a test asserting ci.yml contains "windows-latest" / "macos-latest" /
// "fail-fast: false". The plan (`## Evals to write`) rules that out as a tautology wearing a test's
// clothes — it asserts the file says what the file says, which is the "written in the config"
// mistaken for "guaranteed" disease (P0). The matrix's execution proof is the five green cells on
// the PR, an observed artifact, not a string match. Recorded here so its absence reads as a
// decision rather than an oversight.
