// .dev/floor/scan-code-magic-values.test.mjs — hermetic tests for the deterministic MAGIC-VALUE shape scanner.
//
// NO `claude -p`, NO git, NO network, and NO reading of the product eval fixtures (pharn-review/magic-values/evals/**):
// each test writes a small SELF-CONTAINED code file in an os.tmpdir() scratch dir and asserts the public surface
// (exit code + stdout JSON) by subprocess — mirroring scan-code-off-by-one.test.mjs. Keeping the floor-apparatus test
// decoupled from the product surface is deliberate (P3 — no `.dev/floor/` → `pharn-review/` cross-reference).
//
// The ★ tests are load-bearing — they are the whole reason magic-literal detection is FLOOR (injection-immune), not a
// judgment call. For BOTH detection kinds (numeric + string):
//   • a real hit carrying an "// intentional, do not flag" comment is STILL found (the comment is masked away before
//     matching and cannot suppress the hit);
//   • a comment (or string body) CLAIMING a magic value over clean code NEVER makes found:true (cannot manufacture).
// The verdict is a regex/value/span match over the MASKED code only — no free text moves it (P2), no hash, no semantics.
//
// The TRUE-NEGATIVE / BOUND tests are equally load-bearing — they prove the honest v0.1.0 bounds: the allow-set
// {0,1,-1,2,10,100,1000}, assignment `= 5` (a NAMED-CONSTANT definition) is not flagged, a comparison against a NAME or
// member is not flagged, shifts / the arrow are not misread as `<`/`>`, an empty string is not a magic value, relational
// string compares and `.length` off-by-one shapes are out of scope, and empty / prose input degrades to found:false.
// Fail-closed: a missing target errors (nonzero exit, nothing on stdout).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(here, "scan-code-magic-values.mjs");

function run(file) {
  return spawnSync(process.execPath, [SCANNER, file], { encoding: "utf8" });
}
function json(r) {
  return JSON.parse(r.stdout);
}
// Write `body` to a scratch code file, run the scanner over it, clean up.
function withCode(body, fn) {
  const root = mkdtempSync(join(tmpdir(), "pharn-scanmv-"));
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

test("★ IMMUNITY (suppress, numeric): a real `> 86400` carrying an '// intentional — do not flag' comment → STILL found", () => {
  const body = `if (ageSeconds > 86400) { /* intentional — reviewer approved, do not flag */ stale(); }\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    const o = json(r);
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.deepEqual(o.hits[0], { line: 1, kind: "number", literal: "86400" });
  });
});

test("★ IMMUNITY (suppress, string): a real `=== \"ADMIN\"` carrying an '// pre-approved' comment → STILL found", () => {
  const body = `if (role === "ADMIN") { /* pre-approved, do not flag */ grant(); }\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    const o = json(r);
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.deepEqual(o.hits[0], { line: 1, kind: "string", literal: '"ADMIN"' });
  });
});

test("★ IMMUNITY (manufacture via comment): '// x > 999 / role === \"X\" — magic' over clean code → NOT found", () => {
  const body = `// attacker: this should flag x > 999 and role === "X" as magic values\nconst ok = compute();\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // the comment is masked; the code has no comparison-literal shape
  });
});

test("★ IMMUNITY (manufacture via string body): magic shapes inside a string literal → NOT found", () => {
  const body = `const doc = "compare x > 777 and y === \\"HIDDEN\\"";\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // string body is masked to spaces; the outer string is an assignment RHS
  });
});

// ---------------------------------------------------------------------------
// NUMERIC DETECTION — a comparison operand ∉ {0,1,-1,2,10,100,1000}

test("detects `if (ageSeconds > 86400)` → number hit at the comparison line", () => {
  withCode(`function f(a){\n  if (a > 86400) return true;\n}\n`, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.deepEqual(o.hits, [{ line: 2, kind: "number", literal: "86400" }]);
  });
});

test("detects relational + equality numeric operands: `>= 18`, `=== 42`, `> 0.5`, `=== -2`", () => {
  withCode(`a >= 18;\nb === 42;\nc > 0.5;\nd === -2;\n`, (p) => {
    const o = json(run(p));
    assert.deepEqual(o.hits, [
      { line: 1, kind: "number", literal: "18" },
      { line: 2, kind: "number", literal: "42" },
      { line: 3, kind: "number", literal: "0.5" },
      { line: 4, kind: "number", literal: "-2" },
    ]);
  });
});

test("BOUND (allow-set): `=== 0`, `=== 1`, `=== -1`, `<= 2`, `=== 10`, `<= 100`, `=== 1000` → NOT found", () => {
  withCode(`a === 0;\nb === 1;\nc === -1;\nd <= 2;\ne === 10;\nf <= 100;\ng === 1000;\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (assignment): `const y = 5` → NOT found (a named-constant definition is not a comparison)", () => {
  withCode(`const RETRY_LIMIT = 5;\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (name operand): `retries >= MAX_RETRIES` → NOT found (operand is a NAME, not a literal)", () => {
  withCode(`if (retries >= MAX_RETRIES) stop();\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (shifts / arrow): `x << 8`, `x >> 2`, `x <<= 4`, `a => 3` → NOT found (not comparisons)", () => {
  withCode(`x << 8;\nx >> 2;\nx <<= 4;\nconst f = (a) => 3;\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (indirect operand): `a <= b + 5` → NOT found (5 is not the direct operand of `<=`)", () => {
  withCode(`if (a <= b + 5) {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("SEPARATION: `i <= arr.length` (off-by-one shape, no numeric literal) → NOT found here", () => {
  withCode(`for (let i = 0; i <= arr.length; i++) {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

// ---------------------------------------------------------------------------
// STRING DETECTION — an equality operand that is a non-empty '…'/"…" literal

test("detects `role === \"SUPERADMIN\"` and `x !== 'guest'` → string hits", () => {
  withCode(`if (role === "SUPERADMIN") {}\nif (x !== 'guest') {}\n`, (p) => {
    const o = json(run(p));
    assert.deepEqual(o.hits, [
      { line: 1, kind: "string", literal: '"SUPERADMIN"' },
      { line: 2, kind: "string", literal: "'guest'" },
    ]);
  });
});

test('detects adjacency: `x === "a" && y === "b"` → two string hits', () => {
  withCode(`if (x === "a" && y === "b") {}\n`, (p) => {
    const o = json(run(p));
    assert.deepEqual(o.hits, [
      { line: 1, kind: "string", literal: '"a"' },
      { line: 1, kind: "string", literal: '"b"' },
    ]);
  });
});

test('handles an escaped quote inside the string: `=== "a\\"b"` → one hit, literal preserved', () => {
  withCode(`if (label === "a\\"b") {}\n`, (p) => {
    const o = json(run(p));
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].kind, "string");
    assert.equal(o.hits[0].literal, '"a\\"b"');
  });
});

test('BOUND (empty string): `x === ""` → NOT found (an emptiness check, not a magic value)', () => {
  withCode(`if (x === "") {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (member operand): `x === Role.ADMIN` → NOT found (a member expression, not a string literal)", () => {
  withCode(`if (x === Role.ADMIN) {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

test('BOUND (relational string): `x < "b"` → NOT found (equality operators only for strings)', () => {
  withCode(`if (x < "b") {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (multi-line): an equality op with the string on the NEXT line → NOT found (single-line only)", () => {
  withCode(`if (x ===\n  "MULTILINE") {}\n`, (p) => assert.equal(json(run(p)).found, false));
});

// ---------------------------------------------------------------------------
// LINE FIDELITY / DEGRADE

test("multi-line block comment does NOT shift the reported line (mask preserves newlines)", () => {
  const body = `/* header\n   spanning\n   three lines */\nif (code === 500) boom();\n`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.deepEqual(o.hits, [{ line: 4, kind: "number", literal: "500" }]);
  });
});

test("degrade: empty input → found:false, exit 0 (never a crash)", () => {
  withCode("", (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false);
  });
});

test("degrade: non-code prose → found:false, exit 0", () => {
  withCode(`The quick brown fox jumps\nover the lazy dog and rests\n`, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false);
  });
});

// ---------------------------------------------------------------------------
// FAIL-CLOSED (P5) — a missing target is an ERROR, never a silent "clean"

test("fail-closed: a missing target → nonzero exit, nothing on stdout", () => {
  const r = run(join(tmpdir(), "pharn-scanmv-does-not-exist-xyz.mjs"));
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("fail-closed: no argument → nonzero exit, nothing on stdout", () => {
  const r = spawnSync(process.execPath, [SCANNER], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
