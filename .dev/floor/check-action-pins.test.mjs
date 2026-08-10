// .dev/floor/check-action-pins.test.mjs — tests for the deterministic action-pin floor check.
//
// NO `claude -p`, NO git, NO network. Two kinds of test, deliberately mixed (the same split
// lens-scanner-map.test.mjs makes):
//
//   1. HERMETIC — each builds a small repo in an os.tmpdir() scratch dir and asserts the public
//      surface (exit code + stdout JSON) by subprocess, mirroring count-verifiers.test.mjs.
//   2. LIVE REPO-CONSISTENCY (the ★ at the bottom) — validates the COMMITTED tree against REALITY,
//      like lens-scanner-map.test.mjs. This is what makes pin drift a BUILD FAILURE rather than a
//      property someone has to remember to re-grep: floor.yml's `node --test ".dev/**/*.test.mjs"`
//      collects this file on every pull_request and every push to main.
//
// The ★ tests are load-bearing:
//   • a digest with a MAJOR-ONLY comment (`# v6`) is a violation — the exact ff48077 defect, PROVEN
//     CAUGHT (a digest bumped across a major while the comment stayed at `# v6`);
//   • the live repo asserts `violations: []` AND `checked >= 10` AND that every workflow file on
//     disk was visited — never bare exit 0, because exit 0 is ALSO what a checker returns when it
//     finds nothing to inspect. A gate that cannot tell "all clean" from "looked nowhere" is not a
//     gate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url)); // .dev/floor
const REPO = join(here, "..", ".."); // repo root
const CAP = join(here, "check-action-pins.mjs");

const DIGEST = "3d3c42e5aac5ba805825da76410c181273ba90b1"; // a real 40-hex digest (actions/checkout v7.0.1)

function run(targetDir) {
  return spawnSync(process.execPath, [CAP, targetDir], { encoding: "utf8" });
}
function json(r) {
  return JSON.parse(r.stdout);
}

// Build a scratch repo whose .github/workflows/wf.yml contains the given `uses:` step body.
function repoWith(body, name = "wf.yml") {
  const root = mkdtempSync(join(tmpdir(), "pharn-pins-"));
  const dir = join(root, ".github", "workflows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `name: t\non: [push]\njobs:\n  j:\n    steps:\n${body}\n`);
  return root;
}

// --- conforming ------------------------------------------------------------------------------

test("conforming ref (digest + full semver) → exit 0, no violations", () => {
  const root = repoWith(`      - uses: actions/checkout@${DIGEST} # v7.0.1`);
  const r = run(root);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.deepEqual(j.violations, []);
  assert.equal(j.checked, 1);
  rmSync(root, { recursive: true, force: true });
});

test("a trailing note after the version is still conforming", () => {
  const root = repoWith(`      - uses: actions/checkout@${DIGEST} # v7.0.1 (pinned by dependabot)`);
  const r = run(root);
  assert.equal(r.status, 0);
  assert.deepEqual(json(r).violations, []);
  rmSync(root, { recursive: true, force: true });
});

test("a ref without the YAML sequence dash (codeql style) is still checked", () => {
  const root = repoWith(`        uses: github/codeql-action/init@${DIGEST} # v4.37.4`);
  const r = run(root);
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 1);
  rmSync(root, { recursive: true, force: true });
});

// --- violations ------------------------------------------------------------------------------

test("floating MAJOR tag (@v7) → exit 1, reason floating-ref", () => {
  const root = repoWith("      - uses: actions/setup-node@v7");
  const r = run(root);
  assert.equal(r.status, 1);
  assert.equal(json(r).violations[0].reason, "floating-ref");
  rmSync(root, { recursive: true, force: true });
});

test("floating PATCH tag (@v7.0.1) → exit 1, reason floating-ref — the pin-floor-actions start state", () => {
  const root = repoWith("      - uses: actions/checkout@v7.0.1");
  const r = run(root);
  assert.equal(r.status, 1);
  const v = json(r).violations[0];
  assert.equal(v.reason, "floating-ref");
  assert.equal(v.line, 6); // resolves to a real line, not a vague reference
  rmSync(root, { recursive: true, force: true });
});

test("no @ref at all → exit 1, reason floating-ref", () => {
  const root = repoWith("      - uses: actions/checkout");
  const r = run(root);
  assert.equal(r.status, 1);
  assert.equal(json(r).violations[0].reason, "floating-ref");
  rmSync(root, { recursive: true, force: true });
});

test("digest with NO comment → exit 1, reason missing-comment", () => {
  const root = repoWith(`      - uses: actions/checkout@${DIGEST}`);
  const r = run(root);
  assert.equal(r.status, 1);
  assert.equal(json(r).violations[0].reason, "missing-comment");
  rmSync(root, { recursive: true, force: true });
});

// ★ the historical defect
test("★ digest with a MAJOR-ONLY comment (# v6) → exit 1, reason malformed-comment (the ff48077 defect)", () => {
  const root = repoWith(`      - uses: actions/setup-node@${DIGEST} # v6`);
  const r = run(root);
  assert.equal(r.status, 1);
  assert.equal(json(r).violations[0].reason, "malformed-comment");
  rmSync(root, { recursive: true, force: true });
});

test("a ${{ }} expression ref → exit 1, reason unpinnable-ref (NOT mislabeled floating-ref)", () => {
  const root = repoWith("      - uses: ${{ matrix.action }}");
  const r = run(root);
  assert.equal(r.status, 1);
  assert.equal(json(r).violations[0].reason, "unpinnable-ref");
  rmSync(root, { recursive: true, force: true });
});

test("a QUOTED ref is unwrapped before the digest test (quotes must not smuggle a floating tag past)", () => {
  const ok = repoWith(`      - uses: "actions/checkout@${DIGEST}" # v7.0.1`);
  assert.equal(run(ok).status, 0);
  rmSync(ok, { recursive: true, force: true });

  const bad = repoWith(`      - uses: 'actions/checkout@v7'`);
  const r = run(bad);
  assert.equal(r.status, 1);
  assert.equal(json(r).violations[0].reason, "floating-ref");
  rmSync(bad, { recursive: true, force: true });
});

test("`uses:` with nothing after it fails closed as a violation, not a skip", () => {
  const root = repoWith("      - uses:");
  const r = run(root);
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.checked, 1);
  assert.equal(j.violations[0].reason, "floating-ref");
  rmSync(root, { recursive: true, force: true });
});

// --- digest boundary cases -------------------------------------------------------------------

test("39-hex, 41-hex and UPPERCASE refs are all floating-ref (boundary)", () => {
  for (const bad of [DIGEST.slice(0, 39), DIGEST + "a", DIGEST.toUpperCase()]) {
    const root = repoWith(`      - uses: actions/checkout@${bad} # v7.0.1`);
    const r = run(root);
    assert.equal(r.status, 1, `expected violation for ${bad}`);
    assert.equal(json(r).violations[0].reason, "floating-ref");
    rmSync(root, { recursive: true, force: true });
  }
});

// --- skips and exemptions ----------------------------------------------------------------------

test("a commented-out example (# - uses: foo@v1) is not a ref", () => {
  const root = repoWith("      # - uses: actions/checkout@v1");
  const r = run(root);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.checked, 0);
  assert.deepEqual(j.violations, []);
  rmSync(root, { recursive: true, force: true });
});

test("a local ./ action is exempt (counted as skipped, not checked)", () => {
  const root = repoWith("      - uses: ./.github/actions/setup");
  const r = run(root);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.skipped, 1);
  assert.equal(j.checked, 0);
  rmSync(root, { recursive: true, force: true });
});

test("a docker:// image ref is exempt (named out-of-axis, not silently passed as checked)", () => {
  const root = repoWith("      - uses: docker://alpine:3.18");
  const r = run(root);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.skipped, 1);
  assert.equal(j.checked, 0);
  rmSync(root, { recursive: true, force: true });
});

// --- vacuous / structural ------------------------------------------------------------------------

test("a repo with no .github/workflows/ is vacuously clean — exit 0, checked 0, no crash", () => {
  const root = mkdtempSync(join(tmpdir(), "pharn-pins-empty-"));
  const r = run(root);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.checked, 0);
  assert.deepEqual(j.files, []);
  rmSync(root, { recursive: true, force: true });
});

test("multiple workflow files are all visited, and every violation resolves to file:line", () => {
  const root = repoWith(`      - uses: actions/checkout@${DIGEST} # v7.0.1`, "a.yml");
  const dir = join(root, ".github", "workflows");
  writeFileSync(
    join(dir, "b.yml"),
    "name: b\non: [push]\njobs:\n  j:\n    steps:\n      - uses: actions/setup-node@v7\n",
  );
  const r = run(root);
  assert.equal(r.status, 1);
  const j = json(r);
  assert.deepEqual(j.files, ["a.yml", "b.yml"]);
  assert.equal(j.checked, 2);
  assert.equal(j.violations.length, 1);
  assert.equal(j.violations[0].file, join(".github", "workflows", "b.yml"));
  rmSync(root, { recursive: true, force: true });
});

// --- ★ LIVE REPO-CONSISTENCY -----------------------------------------------------------------
// This is the gate. It is what turns a future floating ref into a RED floor.yml run.

test("★ THIS repo: every workflow action ref is digest-pinned with a full-semver comment", () => {
  const r = run(REPO);
  const j = json(r);

  // Assert the CONTENT, not just the exit code — exit 0 is also what "found nothing" returns.
  assert.deepEqual(j.violations, [], `unpinned action ref(s): ${JSON.stringify(j.violations, null, 2)}`);

  // Anti-vacuity 1: it must actually have inspected refs. 10 is the live count at the time this
  // gate landed; the assertion is a LOWER BOUND, so adding workflows never breaks it, while a
  // walker that silently stops finding files does.
  assert.ok(j.checked >= 10, `expected >=10 refs inspected, got ${j.checked}`);

  // Anti-vacuity 2: the visited file set must match the tree, counted INDEPENDENTLY of the
  // checker's own walk — so a bug in that walk cannot hide behind its own report.
  const onDisk = readdirSync(join(REPO, ".github", "workflows"))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort();
  assert.deepEqual(j.files, onDisk);

  assert.equal(r.status, 0);
});
