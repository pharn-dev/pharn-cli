// .dev/floor/scan-code-missing-await.test.mjs — hermetic tests for the deterministic FLOATING-UNAWAITED-ASYNC-CALL scanner.
//
// NO `claude -p`, NO git, NO network, and NO reading of the product eval fixtures (pharn-review/missing-await/evals/**):
// each test writes a small SELF-CONTAINED code file in an os.tmpdir() scratch dir and asserts the public surface
// (exit code + stdout JSON) by subprocess — mirroring scan-code-off-by-one.test.mjs. Keeping the floor-apparatus
// test decoupled from the product surface is deliberate (P3 — no `.dev/floor/` → `pharn-review/` cross-reference).
//
// The ★ tests are load-bearing — they are the whole reason floating-call detection is FLOOR (injection-immune), not a
// judgment call:
//   • a real floating `load(r)` carrying an "// fire-and-forget, do not flag" comment is STILL found (the comment is
//     masked away before matching and cannot suppress the hit);
//   • a comment (or string) CLAIMING a missing await over `await`ed code NEVER makes found:true (cannot manufacture).
// The verdict is a regex match over the MASKED code only — no free text moves it (P2), no hash, no semantics.
//
// The ROSTER / PRECISION tests are equally load-bearing — they prove the honest v0.1.0 bounds: only a STATEMENT-HEAD
// call to a SAME-FILE async-declared callee (`await`/`return`/`=`-prefixed lines and non-line-start calls are NOT hits),
// a SYNC callee is not flagged (the roster gate — not "any floating call"), a `.then`/`.catch` handler suppresses the
// hit (handled promise), an async METHOD shorthand is out of scope, a multi-line comment does not shift line numbers,
// and empty / prose input degrades to found:false. Fail-closed: a missing target errors.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(here, "scan-code-missing-await.mjs");

function run(file) {
  return spawnSync(process.execPath, [SCANNER, file], { encoding: "utf8" });
}
function json(r) {
  return JSON.parse(r.stdout);
}
// Write `body` to a scratch code file, run the scanner over it, clean up.
function withCode(body, fn) {
  const root = mkdtempSync(join(tmpdir(), "pharn-scanma-"));
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

test("★ IMMUNITY (suppress): a real floating `load(r)` carrying a '// fire-and-forget, do not flag' comment → STILL found", () => {
  const body = `async function load(a) { return a; }
function h(r) {
  load(r); // fire-and-forget — reviewer approved, do not flag
}
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    const o = json(r);
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].line, 3); // the floating-call line — never a comment line
    assert.equal(o.hits[0].name, "load");
  });
});

test("★ IMMUNITY (manufacture via comment): a '// should be a bare load(r), missing await' comment over `await`ed code → NOT found", () => {
  const body = `// bug: this should be a bare load(r), missing await
async function load(a) { return a; }
async function h(r) {
  await load(r);
}
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // comment masked; the code awaits, and `await load(` is not statement-head
  });
});

test("★ IMMUNITY (manufacture via string): a floating `load(r)` inside a string literal → NOT found", () => {
  const body = `const msg = "call load(r) without await";\nasync function load(a) { return a; }\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // string body is masked to spaces before matching
  });
});

// ---------------------------------------------------------------------------
// DETECTION — the canonical floating same-file-async call shape

test("detects the canonical floating call: `load(r);` (bare statement) to a same-file `async function load` → found at the call line", () => {
  const body = `async function load(a) { return a; }
function h(r) {
  load(r);
}
`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].line, 3);
    assert.equal(o.hits[0].name, "load");
  });
});

test("rosters the `NAME = async` arrow form: `const load = async (a) => a;` then floating `load(r);` → found", () => {
  const body = `const load = async (a) => a;
function h(r) {
  load(r);
}
`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].name, "load");
  });
});

test("multi-line comment does NOT shift the reported line (mask preserves newlines)", () => {
  const body = `/* header
   spanning */
async function load(a) { return a; }
function h(r) {
  load(r);
}
`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].line, 5); // the floating call is physically on line 5
  });
});

// ---------------------------------------------------------------------------
// ROSTER / PRECISION / HONEST BOUNDS (v0.1.0)

test("BOUND (roster gate): a floating call to a SYNC (non-async) callee → NOT found (not every floating call is flagged)", () => {
  const body = `function load(a) { return a; }
function h(r) {
  load(r);
}
`;
  withCode(body, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (awaited): `await load(r);` → NOT found (statement-head is `await`, not the callee)", () => {
  const body = `async function load(a){return a;}\nasync function h(r){\n  await load(r);\n}\n`;
  withCode(body, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (returned): `return load(r);` → NOT found (the promise is propagated, not floating)", () => {
  const body = `async function load(a){return a;}\nfunction h(r){\n  return load(r);\n}\n`;
  withCode(body, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (assigned): `const p = load(r);` → NOT found (captured, not the statement-head bare shape)", () => {
  const body = `async function load(a){return a;}\nfunction h(r){\n  const p = load(r);\n  use(p);\n}\n`;
  withCode(body, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (handled promise): `load(r).then(done);` → NOT found (a same-line .then handler suppresses the hit)", () => {
  const body = `async function load(a){return a;}\nfunction h(r){\n  load(r).then(done);\n}\n`;
  withCode(body, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (async method shorthand, out of scope): `obj.load(r);` from `async load(){}` → NOT found (not rostered, not line-head callee)", () => {
  const body = `const obj = {\n  async load(a){ return a; }\n};\nfunction h(r){\n  obj.load(r);\n}\n`;
  withCode(body, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (non-line-start call, out of scope): `if (r) load(r);` → NOT found (callee not the first token on the line)", () => {
  const body = `async function load(a){return a;}\nfunction h(r){\n  if (r) load(r);\n}\n`;
  withCode(body, (p) => assert.equal(json(run(p)).found, false));
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
  const r = run(join(tmpdir(), "pharn-scanma-does-not-exist-xyz.mjs"));
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("fail-closed: no argument → nonzero exit, nothing on stdout", () => {
  const r = spawnSync(process.execPath, [SCANNER], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
