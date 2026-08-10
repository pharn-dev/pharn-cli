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
// The ✱ tests are REGRESSIONS FOR HOLES THAT SHIPPED in the first version of this gate (PR #79).
// Each was reproduced against that version before being fixed, so each one asserts a specific way
// the gate previously reported "clean" while unpinned third-party code would execute:
//   ✱ a YAML flow mapping   `- {uses: x@main}`      → was checked:0, exit 0 (never classified)
//   ✱ a quoted key          `- "uses": x@v1`        → was checked:0, exit 0 (never classified)
//   ✱ an uppercase filename `CI.YML`                → was files:[],  exit 0 (never opened)
//   ✱ a mutable image       `docker://alpine:latest`→ was skipped:1, exit 0 (blanket scheme exemption)
//   ✱ an expression behind a prefix `./${{ … }}`    → was skipped:1, exit 0 (exemption ran first)
//   ✱ a local composite action's own floating ref   → was never walked at all
//   ✱ a dangling symlink                            → crashed with uncaught ENOENT, emitting NO JSON
//   ✱ 4000 violations through a pipe                → truncated at exactly 65536 bytes
//
// The live repo asserts `violations: []` AND `skipped` EXACTLY AND `checked >= 10` AND a
// case-insensitive independent recount of the workflow files — never bare exit 0, because exit 0 is
// ALSO what a checker returns when it finds nothing to inspect.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url)); // .dev/floor
const REPO = join(here, "..", ".."); // repo root
const CAP = join(here, "check-action-pins.mjs");

const DIGEST = "3d3c42e5aac5ba805825da76410c181273ba90b1"; // a real 40-hex digest (actions/checkout v7.0.1)
const OCI = "sha256:" + "a".repeat(64); // a well-formed OCI image digest

function run(targetDir) {
  return spawnSync(process.execPath, [CAP, targetDir], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function json(r) {
  return JSON.parse(r.stdout);
}
function scratch() {
  return mkdtempSync(join(tmpdir(), "pharn-pins-"));
}
// Build a scratch repo whose .github/workflows/<name> contains the given `uses:` step body.
function repoWith(body, name = "wf.yml") {
  const root = scratch();
  const dir = join(root, ".github", "workflows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `name: t\non: [push]\njobs:\n  j:\n    steps:\n${body}\n`);
  return root;
}
function reasons(r) {
  return json(r).violations.map((v) => v.reason);
}

// --- conforming ------------------------------------------------------------------------------

test("conforming ref (digest + full semver) → exit 0, no violations", () => {
  const root = repoWith(`      - uses: actions/checkout@${DIGEST} # v7.0.1`);
  const r = run(root);
  assert.equal(r.status, 0);
  assert.deepEqual(json(r).violations, []);
  assert.equal(json(r).checked, 1);
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
  const r = run(repoWith("      - uses: actions/setup-node@v7"));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["floating-ref"]);
});

test("floating PATCH tag (@v7.0.1) → exit 1, floating-ref — the pin-floor-actions start state", () => {
  const root = repoWith("      - uses: actions/checkout@v7.0.1");
  const r = run(root);
  assert.equal(r.status, 1);
  const v = json(r).violations[0];
  assert.equal(v.reason, "floating-ref");
  assert.equal(v.line, 6); // resolves to a real line, not a vague reference
  rmSync(root, { recursive: true, force: true });
});

test("no @ref at all → exit 1, reason floating-ref", () => {
  assert.deepEqual(reasons(run(repoWith("      - uses: actions/checkout"))), ["floating-ref"]);
});

test("digest with NO comment → exit 1, reason missing-comment", () => {
  assert.deepEqual(reasons(run(repoWith(`      - uses: actions/checkout@${DIGEST}`))), ["missing-comment"]);
});

test("★ digest with a MAJOR-ONLY comment (# v6) → malformed-comment (the ff48077 defect)", () => {
  assert.deepEqual(reasons(run(repoWith(`      - uses: actions/setup-node@${DIGEST} # v6`))), [
    "malformed-comment",
  ]);
});

test("a ${{ }} expression ref → unpinnable-ref (NOT mislabeled floating-ref)", () => {
  assert.deepEqual(reasons(run(repoWith("      - uses: ${{ matrix.action }}"))), ["unpinnable-ref"]);
});

test("a QUOTED ref is unwrapped before the digest test", () => {
  const ok = repoWith(`      - uses: "actions/checkout@${DIGEST}" # v7.0.1`);
  assert.equal(run(ok).status, 0);
  rmSync(ok, { recursive: true, force: true });
  assert.deepEqual(reasons(run(repoWith(`      - uses: 'actions/checkout@v7'`))), ["floating-ref"]);
});

test("`uses:` with nothing after it fails closed as a violation, not a skip", () => {
  const r = run(repoWith("      - uses:"));
  assert.equal(r.status, 1);
  assert.equal(json(r).checked, 1);
  assert.deepEqual(reasons(r), ["floating-ref"]);
});

test("39-hex, 41-hex and UPPERCASE refs are all floating-ref (boundary)", () => {
  for (const bad of [DIGEST.slice(0, 39), DIGEST + "a", DIGEST.toUpperCase()]) {
    const r = run(repoWith(`      - uses: actions/checkout@${bad} # v7.0.1`));
    assert.equal(r.status, 1, `expected violation for ${bad}`);
    assert.deepEqual(reasons(r), ["floating-ref"]);
  }
});

// --- ✱ REGRESSIONS: refs the shipped gate never classified ---------------------------------------

test("✱ YAML FLOW MAPPING `- {uses: x@main}` is classified (shipped gate reported checked:0, exit 0)", () => {
  const r = run(repoWith("      - {uses: actions/checkout@main}"));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["floating-ref"]);
  assert.equal(json(r).checked, 1, "the ref must be COUNTED, not merely unmatched");
});

test("✱ a conforming flow-mapping ref passes (the fix must not blanket-fail the form)", () => {
  const root = repoWith(`      - {uses: actions/checkout@${DIGEST}, with: {fetch-depth: 0}}`);
  const r = run(root);
  assert.equal(r.status, 1, "no comment on a flow mapping → missing-comment, not a crash");
  assert.deepEqual(reasons(r), ["missing-comment"]);
  rmSync(root, { recursive: true, force: true });
});

test('✱ QUOTED KEY `- "uses": x@v1` is classified (shipped gate reported checked:0, exit 0)', () => {
  const r = run(repoWith(`      - "uses": actions/checkout@v1`));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["floating-ref"]);
  assert.equal(json(r).checked, 1);
});

test("✱ UPPERCASE extension CI.YML is opened (shipped gate reported files:[], exit 0)", () => {
  const root = repoWith("      - uses: actions/checkout@v1", "CI.YML");
  const r = run(root);
  assert.equal(r.status, 1);
  assert.deepEqual(json(r).files, [".github/workflows/CI.YML"]);
  assert.deepEqual(reasons(r), ["floating-ref"]);
  rmSync(root, { recursive: true, force: true });
});

// --- ✱ REGRESSIONS: exemptions that were silent ---------------------------------------------------

test("✱ docker://alpine:latest → unpinned-container (shipped gate reported skipped:1, exit 0)", () => {
  const r = run(repoWith("      - uses: docker://alpine:latest"));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["unpinned-container"]);
});

test("✱ a DIGEST-pinned image still passes, and is counted as skipped (audit trail)", () => {
  const root = repoWith(`      - uses: docker://alpine@${OCI}`);
  const r = run(root);
  assert.equal(r.status, 0);
  assert.equal(json(r).skipped, 1);
  assert.equal(json(r).checked, 0);
  rmSync(root, { recursive: true, force: true });
});

test("✱ `./${{ }}` is unpinnable-ref, not skipped (exemption used to run before classify)", () => {
  const r = run(repoWith("      - uses: ./${{ github.event.inputs.dir }}"));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["unpinnable-ref"]);
});

test("✱ `docker://${{ }}` is unpinnable-ref, not skipped", () => {
  const r = run(repoWith("      - uses: docker://${{ env.IMG }}"));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["unpinnable-ref"]);
});

test("✱ a ./ ref that climbs out with .. is escaping-local-ref, not exempt", () => {
  const r = run(repoWith("      - uses: ./../../vendor/thirdparty"));
  assert.equal(r.status, 1);
  assert.deepEqual(reasons(r), ["escaping-local-ref"]);
});

test("a plain local ./ action is still exempt, and counted as skipped", () => {
  const root = repoWith("      - uses: ./.github/actions/setup");
  const r = run(root);
  assert.equal(r.status, 0);
  assert.equal(json(r).skipped, 1);
  assert.equal(json(r).checked, 0);
  rmSync(root, { recursive: true, force: true });
});

// --- ✱ REGRESSION: local composite actions were never walked -------------------------------------

test("✱ a local composite action's OWN floating ref is caught (shipped gate never opened action.yml)", () => {
  const root = repoWith("      - uses: ./.github/actions/wrap");
  const act = join(root, ".github", "actions", "wrap");
  mkdirSync(act, { recursive: true });
  writeFileSync(
    join(act, "action.yml"),
    "name: wrap\nruns:\n  using: composite\n  steps:\n    - uses: attacker/evil@main\n",
  );
  const r = run(root);
  assert.equal(r.status, 1, "the laundered ref must be caught");
  assert.deepEqual(reasons(r), ["floating-ref"]);
  assert.ok(
    json(r).files.includes(".github/actions/wrap/action.yml"),
    `action.yml must be enumerated, got ${JSON.stringify(json(r).files)}`,
  );
  rmSync(root, { recursive: true, force: true });
});

test("a local composite action with a conforming ref passes", () => {
  const root = repoWith("      - uses: ./.github/actions/wrap");
  const act = join(root, ".github", "actions", "wrap");
  mkdirSync(act, { recursive: true });
  writeFileSync(
    join(act, "action.yml"),
    `name: wrap\nruns:\n  using: composite\n  steps:\n    - uses: actions/checkout@${DIGEST} # v7.0.1\n`,
  );
  const r = run(root);
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 1); // the inner ref
  assert.equal(json(r).skipped, 1); // the ./ call site
  rmSync(root, { recursive: true, force: true });
});

// --- ✱ REGRESSION: unreadable input --------------------------------------------------------------

test("✱ a dangling symlink is a violation with JSON on stdout (shipped gate crashed with ENOENT)", () => {
  const root = scratch();
  const dir = join(root, ".github", "workflows");
  mkdirSync(dir, { recursive: true });
  symlinkSync(join(root, "nope-does-not-exist"), join(dir, "dangling.yml"));
  const r = run(root);
  assert.equal(r.status, 1);
  assert.ok(r.stdout.length > 0, "must still emit JSON, not die with a stack trace");
  assert.deepEqual(reasons(r), ["unreadable-file"]);
  rmSync(root, { recursive: true, force: true });
});

// --- ✱ REGRESSION: output truncation -------------------------------------------------------------

test("✱ a large report survives a PIPE intact (shipped gate truncated at exactly 65536 bytes)", () => {
  const root = scratch();
  const dir = join(root, ".github", "workflows");
  mkdirSync(dir, { recursive: true });
  const N = 4000;
  const steps = Array.from({ length: N }, (_, i) => `      - uses: some/action-${i}@v1`).join("\n");
  writeFileSync(join(dir, "big.yml"), `name: t\non: [push]\njobs:\n  j:\n    steps:\n${steps}\n`);
  const r = run(root); // spawnSync captures stdout through a PIPE — the truncation-prone path
  assert.equal(r.status, 1);
  assert.ok(r.stdout.length > 65536, `expected >64KB of JSON, got ${r.stdout.length} bytes`);
  const j = json(r); // would throw "Unexpected end of JSON input" if truncated
  assert.equal(j.violations.length, N);
  rmSync(root, { recursive: true, force: true });
});

// --- skips, comments, vacuity ---------------------------------------------------------------------

test("a commented-out example (# - uses: foo@v1) is not a ref", () => {
  const root = repoWith("      # - uses: actions/checkout@v1");
  const r = run(root);
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 0);
  rmSync(root, { recursive: true, force: true });
});

test("a repo with no .github/ is vacuously clean — exit 0, checked 0, no crash", () => {
  const root = scratch();
  const r = run(root);
  assert.equal(r.status, 0);
  assert.equal(json(r).checked, 0);
  assert.deepEqual(json(r).files, []);
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
  assert.deepEqual(json(r).files, [".github/workflows/a.yml", ".github/workflows/b.yml"]);
  assert.equal(json(r).checked, 2);
  assert.equal(json(r).violations[0].file, ".github/workflows/b.yml");
  rmSync(root, { recursive: true, force: true });
});

// --- ★ LIVE REPO-CONSISTENCY -----------------------------------------------------------------
// This is the gate. It is what turns a future floating ref into a RED floor.yml run.

test("★ THIS repo: every workflow action ref is digest-pinned with a full-semver comment", () => {
  const r = run(REPO);
  const j = json(r);

  // Assert the CONTENT, not just the exit code — exit 0 is also what "found nothing" returns.
  assert.deepEqual(j.violations, [], `unpinned action ref(s): ${JSON.stringify(j.violations, null, 2)}`);

  // Anti-vacuity 1: it must actually have inspected refs. A LOWER BOUND, so adding workflows never
  // breaks it, while a walker that silently stops finding files does.
  assert.ok(j.checked >= 10, `expected >=10 refs inspected, got ${j.checked}`);

  // Anti-vacuity 2: EXACT skipped count. This repo uses no local or container actions, so any
  // exemption appearing here is a change that must be looked at, not absorbed. Without this, a ref
  // could migrate from `checked` into the exempt bucket and leave no trace.
  assert.equal(j.skipped, 0, `an exemption is now in use (skipped=${j.skipped}) — review it deliberately`);

  // Anti-vacuity 3: the visited workflow set must match the tree, recounted independently — and
  // case-INSENSITIVELY, because a case-sensitive recount would replicate the very filter bug that
  // let `CI.YML` disappear from both sides at once.
  const onDisk = readdirSync(join(REPO, ".github", "workflows"))
    .filter((f) => /\.ya?ml$/i.test(f))
    .sort()
    .map((f) => `.github/workflows/${f}`);
  assert.deepEqual(
    j.files.filter((f) => f.startsWith(".github/workflows/")),
    onDisk,
  );

  assert.equal(r.status, 0);
});
