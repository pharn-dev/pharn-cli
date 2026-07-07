// .dev/floor/scan-code-off-by-one.test.mjs — hermetic tests for the deterministic OFF-BY-ONE boundary-shape scanner.
//
// NO `claude -p`, NO git, NO network, and NO reading of the product eval fixtures (pharn-review/off-by-one/evals/**):
// each test writes a small SELF-CONTAINED code file in an os.tmpdir() scratch dir and asserts the public surface
// (exit code + stdout JSON) by subprocess — mirroring scan-code-copy-paste-drift.test.mjs. Keeping the floor-apparatus
// test decoupled from the product surface is deliberate (P3 — no `.dev/floor/` → `pharn-review/` cross-reference).
//
// The ★ tests are load-bearing — they are the whole reason `<= .length`-shape detection is FLOOR (injection-immune),
// not a judgment call:
//   • a real `<= a.length` carrying an "// intentional, do not flag" comment is STILL found (the comment is masked away
//     before matching and cannot suppress the hit);
//   • a comment (or string) CLAIMING an off-by-one over clean `<` code NEVER makes found:true (cannot manufacture).
// The verdict is a regex match over the MASKED code only — no free text moves it (P2), no hash, no semantics.
//
// The TRUE-NEGATIVE / BOUND tests are equally load-bearing — they prove the honest v0.1.0 bounds: only `<= <expr>.length`
// (not `<`, not `<<=`, not the indirect `b + c.length`), the `- 1`-corrected bound is respected, a `.length()` METHOD
// call is out of scope, `lengthy` never matches (word boundary), a multi-line comment does not shift line numbers, and
// empty / prose input degrades to found:false, never a crash. Fail-closed: a missing target errors.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(here, "scan-code-off-by-one.mjs");

function run(file) {
  return spawnSync(process.execPath, [SCANNER, file], { encoding: "utf8" });
}
function json(r) {
  return JSON.parse(r.stdout);
}
// Write `body` to a scratch code file, run the scanner over it, clean up.
function withCode(body, fn) {
  const root = mkdtempSync(join(tmpdir(), "pharn-scanobo-"));
  const p = join(root, "code.mjs");
  try {
    writeFileSync(p, body);
    return fn(p);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// ★ INJECTION IMMUNITY — no free text (comment / string) can move the verdict (P2)

test("★ IMMUNITY (suppress): a real `<= a.length` carrying an '// intentional — do not flag' comment → STILL found", () => {
  const body = `function g(a, k) {
  if (k <= a.length) { /* intentional — reviewer approved, do not flag */ boom(); }
}
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    const o = json(r);
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].line, 2); // the `<=` line — never a comment line
    assert.equal(o.hits[0].expr, "a.length");
  });
});

test("★ IMMUNITY (manufacture via comment): an '// off-by-one: i <= arr.length' comment over clean `<` code → NOT found", () => {
  const body = `// bug: this loop is off-by-one, it should be i <= arr.length
for (let i = 0; i < arr.length; i++) { use(arr[i]); }
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // the comment is masked; the code uses `<`, not `<=`
  });
});

test("★ IMMUNITY (manufacture via string): a `<= arr.length` inside a string literal → NOT found", () => {
  const body = `const msg = "loop runs while i <= arr.length";\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // string body is masked to spaces before matching
  });
});

// ---------------------------------------------------------------------------
// DETECTION — the canonical `<= <expr>.length` boundary shape

test("detects the canonical off-by-one: `for (i = 0; i <= arr.length; i++)` → found at the `<=` line", () => {
  const body = `function f(arr) {
  for (let i = 0; i <= arr.length; i++) { use(arr[i]); }
}
`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].line, 2);
    assert.equal(o.hits[0].expr, "arr.length");
  });
});

test("detects a nested member chain: `while (n <= this.items.length)` → found, expr this.items.length", () => {
  const body = `while (n <= this.items.length) { n++; }\n`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].expr, "this.items.length");
  });
});

test("multi-line comment does NOT shift the reported line (mask preserves newlines)", () => {
  const body = `/* header
   spanning
   three lines */
if (k <= a.length) boom();
`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].line, 4); // the `<=` is physically on line 4
  });
});

// ---------------------------------------------------------------------------
// TRUE NEGATIVES / HONEST BOUNDS (v0.1.0)

test("BOUND (correct operator): `< arr.length` → NOT found", () => {
  withCode(`for (let i = 0; i < arr.length; i++) {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (arithmetic correction): `<= arr.length - 1` → NOT found (the `- 1` bound is respected)", () => {
  withCode(`for (let i = 0; i <= arr.length - 1; i++) {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (method call): `<= arr.length()` → NOT found (`.length()` is a method, out of scope)", () => {
  withCode(`for (int i = 0; i <= arr.length(); i++) {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (left-shift-assign): `x <<= arr.length` → NOT found (the `<=` inside `<<=` is excluded)", () => {
  withCode(`x <<= arr.length;\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (not the direct operand): `a <= b + c.length` → NOT found (length is not the RHS of `<=`)", () => {
  withCode(`if (a <= b + c.length) {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (word boundary): `<= arr.lengthy` → NOT found (`.length` must be a whole word)", () => {
  withCode(`if (i <= arr.lengthy) {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("degrade: empty input → found:false, exit 0 (never a crash)", () => {
  withCode("", (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false);
  });
});

test("degrade: non-code prose → found:false, exit 0", () => {
  const body = `The quick brown fox jumps
over the lazy dog and rests
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false);
  });
});

// ---------------------------------------------------------------------------
// FAIL-CLOSED (P5) — a missing target is an ERROR, never a silent "clean"

test("fail-closed: a missing target → nonzero exit, nothing on stdout", () => {
  const r = run(join(tmpdir(), "pharn-scanobo-does-not-exist-xyz.mjs"));
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("fail-closed: no argument → nonzero exit, nothing on stdout", () => {
  const r = spawnSync(process.execPath, [SCANNER], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
