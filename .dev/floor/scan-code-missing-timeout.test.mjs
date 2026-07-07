// .dev/floor/scan-code-missing-timeout.test.mjs — hermetic tests for the deterministic NO-TIMEOUT network/db-call scanner.
//
// NO `claude -p`, NO git, NO network, and NO reading of the product eval fixtures (pharn-review/missing-timeout/evals/**):
// each test writes a small SELF-CONTAINED code file in an os.tmpdir() scratch dir and asserts the public surface
// (exit code + stdout JSON) by subprocess — mirroring scan-code-off-by-one.test.mjs / scan-code-resource-leak.test.mjs.
// Keeping the floor-apparatus test decoupled from the product surface is deliberate (P3 — no `.dev/floor/` →
// `pharn-review/` cross-reference).
//
// The ★ tests are load-bearing — they are the whole reason no-timeout-call detection is FLOOR (injection-immune), not
// a judgment call:
//   • a real no-timeout `fetch(url)` carrying a "// timeout enforced upstream, do not flag" comment is STILL found (the
//     comment is masked away before matching and cannot suppress the hit);
//   • a comment (or string) CLAIMING a missing timeout over a call that DOES pass `{ timeout }` NEVER makes found:true
//     (cannot manufacture).
// The verdict is regex + paren-match + fixed-token membership over the MASKED code only — no free text moves it (P2),
// no hash, no semantics.
//
// The PRECISION-BOUND tests are equally load-bearing — they prove the honest v0.1.0 shape: the timeout/signal/
// statement_timeout indicators read CLEAN; a bare Express route `app.get(...)` and `axios.create({timeout})` are NOT
// matched (no verb/create over-match); empty / prose input degrades to found:false. Fail-closed: a missing target errors.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(here, "scan-code-missing-timeout.mjs");

function run(file) {
  return spawnSync(process.execPath, [SCANNER, file], { encoding: "utf8" });
}
function json(r) {
  return JSON.parse(r.stdout);
}
// Write `body` to a scratch code file, run the scanner over it, clean up.
function withCode(body, fn) {
  const root = mkdtempSync(join(tmpdir(), "pharn-scanmt-"));
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

test("★ IMMUNITY (suppress): a no-timeout `fetch(url)` carrying a '// timeout enforced upstream, do not flag' comment → STILL found", () => {
  const body = `async function load(url) {
  // timeout enforced upstream at the gateway — pre-approved, do not flag
  const res = await fetch(url);
  return res.json();
}
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    const o = json(r);
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].line, 3); // the `fetch(` line — never the comment line (2)
    assert.equal(o.hits[0].kind, "missing-timeout");
  });
});

test("★ IMMUNITY (manufacture via comment): a '// this fetch has no timeout' comment over a call that PASSES { timeout } → NOT found", () => {
  const body = `// BUG: this call is missing a timeout, it should abort
const res = await axios.get(url, { timeout: 5000 });
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // the comment is masked; the call's args carry `timeout`
  });
});

test("★ IMMUNITY (manufacture via string): a `fetch(x)` inside a string literal → NOT found", () => {
  const body = `const doc = "call fetch(x) without a timeout to reproduce";\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // string body is masked to spaces before matching
  });
});

// ---------------------------------------------------------------------------
// DETECTION — the canonical no-timeout call shapes (HTTP + db)

test("detects a bare `fetch(url)` (no options) → found at the fetch line", () => {
  withCode(`const r = await fetch(url);\n`, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].line, 1);
    assert.equal(o.hits[0].kind, "missing-timeout");
  });
});

test("detects `axios.get(url)` with no timeout → found", () => {
  withCode(`const r = await axios.get(url);\n`, (p) => assert.equal(json(run(p)).found, true));
});

test("detects `http.get(u, cb)` with no timeout → found", () => {
  withCode(`http.get("http://x", cb);\n`, (p) => assert.equal(json(run(p)).found, true));
});

test("detects a receiver-qualified `db.query(sql)` with no timeout → found (db branch)", () => {
  withCode(`const rows = await db.query('SELECT * FROM t WHERE id = $1', [id]);\n`, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].kind, "missing-timeout");
  });
});

test("multi-line comment does NOT shift the reported line (mask preserves newlines)", () => {
  const body = `/* header
   spanning
   three lines */
await fetch(url);
`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].line, 4); // the `fetch(` is physically on line 4
  });
});

// ---------------------------------------------------------------------------
// PRECISION BOUNDS / TRUE NEGATIVES (v0.1.0)

test("BOUND (timeout option): `axios.get(url, { timeout: 5000 })` → NOT found (indicator present)", () => {
  withCode(`await axios.get(url, { timeout: 5000 });\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (abort signal): `fetch(url, { signal: AbortSignal.timeout(5000) })` → NOT found (signal recognized)", () => {
  withCode(`await fetch(url, { signal: AbortSignal.timeout(5000) });\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (db statement_timeout): `db.query({ text, statement_timeout: 5000 })` → NOT found", () => {
  withCode(`await db.query({ text: q, statement_timeout: 5000 });\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (Express route, not a client call): `app.get('/users', handler)` → NOT found (receiver `app`, not http/https)", () => {
  withCode(`app.get('/users', handler);\nrouter.post('/x', h);\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (axios instance creation): `axios.create({ timeout: 5000 })` → NOT found (`create` not a request method)", () => {
  withCode(`const api = axios.create({ timeout: 5000 });\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (non-allowlisted db receiver): `mydb.query(sql)` → NOT found (`mydb` not in the receiver allowlist)", () => {
  withCode(`await mydb.query(sql);\n`, (p) => assert.equal(json(run(p)).found, false));
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
  const r = run(join(tmpdir(), "pharn-scanmt-does-not-exist-xyz.mjs"));
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("fail-closed: no argument → nonzero exit, nothing on stdout", () => {
  const r = spawnSync(process.execPath, [SCANNER], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
