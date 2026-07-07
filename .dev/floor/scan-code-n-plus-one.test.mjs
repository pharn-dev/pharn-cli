// .dev/floor/scan-code-n-plus-one.test.mjs — hermetic tests for the deterministic N+1 query-in-loop shape scanner.
//
// NO `claude -p`, NO git, NO network, and NO reading of the product eval fixtures (pharn-review/n-plus-one/evals/**):
// each test writes a small SELF-CONTAINED code file in an os.tmpdir() scratch dir and asserts the public surface
// (exit code + stdout JSON) by subprocess — mirroring scan-code-off-by-one.test.mjs. Keeping the floor-apparatus
// test decoupled from the product surface is deliberate (P3 — no `.dev/floor/` → `pharn-review/` cross-reference).
//
// The ★ tests are load-bearing — they are the whole reason query-in-loop detection is FLOOR (injection-immune), not a
// judgment call:
//   • a real query-in-loop carrying a "/* batched — approved, do not flag */" comment is STILL found (the comment is
//     masked away before matching and cannot suppress the hit);
//   • a comment (or string) CLAIMING "N+1: db.findMany in loop" over code with NO query-in-loop NEVER makes found:true
//     (cannot manufacture).
// The verdict is a pattern/structure match over the MASKED code only — no free text moves it (P2), no hash, no semantics.
//
// The BRACELESS-ARROW tests are load-bearing for the human-approved v0.1.0 scope: `users.map/forEach(u => db.query(u))`
// with NO braces is detected via the `.forEach`/`.map` call-argument PAREN interval (for/while→brace, forEach/map→paren).
//
// The TRUE-NEGATIVE / BOUND tests are equally load-bearing — they prove the honest v0.1.0 bounds: a query AFTER the loop
// is not in it; the query that is the RECEIVER of a `.map` (`db.findMany().map(...)`) is outside the map parens; an
// ambiguous `.find`/`.findOneAndUpdate` verb and a bare receiver-less `query(` are out of the verb set; a braceless
// STATEMENT loop body is out of scope; a plain function is not a loop; a multi-line comment does not shift line numbers;
// and empty / prose input degrades to found:false, never a crash. Fail-closed: a missing target errors.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(here, "scan-code-n-plus-one.mjs");

function run(file) {
  return spawnSync(process.execPath, [SCANNER, file], { encoding: "utf8" });
}
function json(r) {
  return JSON.parse(r.stdout);
}
// Write `body` to a scratch code file, run the scanner over it, clean up.
function withCode(body, fn) {
  const root = mkdtempSync(join(tmpdir(), "pharn-scannp1-"));
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

test("★ IMMUNITY (suppress): a real query-in-loop carrying a '/* do not flag */' comment → STILL found", () => {
  const body = `function loadAll(users, db) {
  for (const u of users) {
    db.findMany({ where: { authorId: u.id } }); /* batched — reviewer approved, do not flag */
  }
}
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    const o = json(r);
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].line, 3); // the query line — never a comment line
    assert.equal(o.hits[0].expr, "db.findMany");
  });
});

test("★ IMMUNITY (manufacture via comment): a '// N+1: db.findMany in loop' comment over a single top-level query → NOT found", () => {
  const body = `// bug: this is an N+1, db.findMany runs per user in the loop above
return db.findMany({ where: { id: { in: ids } } });
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // the comment is masked; the query is not inside any loop
  });
});

test("★ IMMUNITY (manufacture via string): a query-in-loop inside a string literal → NOT found", () => {
  const body = `const msg = "for (const u of users) db.findMany(u)";\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.equal(json(r).found, false); // string body is masked to spaces before matching
  });
});

// ---------------------------------------------------------------------------
// DETECTION — a query-verb member call lexically inside a loop body

test("detects the canonical braced `for..of { db.findMany() }` → found at the query line", () => {
  const body = `function f(users, db) {
  for (const u of users) {
    const posts = await db.findMany({ where: { authorId: u.id } });
  }
}
`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].line, 3);
    assert.equal(o.hits[0].expr, "db.findMany");
  });
});

test("detects a C-style `for (;;)` body (the inner `;`s do not break loop detection)", () => {
  const body = `for (let i = 0; i < rows.length; i++) {
  db.query(rows[i]);
}
`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].line, 2);
    assert.equal(o.hits[0].expr, "db.query");
  });
});

test("detects a `while` body → found, expr db.execute", () => {
  const body = `while (cursor.hasNext()) {\n  db.execute(cursor.next());\n}\n`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].expr, "db.execute");
  });
});

test("BRACELESS-ARROW (folded-in scope): `users.map(u => db.findMany(u))` → found via the `.map` paren interval", () => {
  const body = `const posts = users.map(u => db.findMany({ where: { authorId: u.id } }));\n`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits.length, 1);
    assert.equal(o.hits[0].line, 1);
    assert.equal(o.hits[0].expr, "db.findMany");
  });
});

test("BRACELESS-ARROW: `users.forEach(u => db.query(u.id))` → found", () => {
  withCode(`users.forEach(u => db.query(u.id));\n`, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].expr, "db.query");
  });
});

test("detects a braced function callback `.forEach(function (u) { db.findOne() })` → found", () => {
  const body = `users.forEach(function (u) {\n  db.findOne({ id: u.id });\n});\n`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].expr, "db.findOne");
  });
});

test("detects a nested `outer.map(o => inner.map(i => db.query(i)))` → found (inside both map parens)", () => {
  withCode(`outer.map(o => inner.map(i => db.query(i)));\n`, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].expr, "db.query");
  });
});

test("detects a prisma-style nested receiver chain `prisma.post.findMany` in a loop → expr prisma.post.findMany", () => {
  const body = `for (const u of users) {\n  await prisma.post.findMany({ where: { authorId: u.id } });\n}\n`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].expr, "prisma.post.findMany");
  });
});

test("object-literal `{}` inside a braceless `.map(u => ({...}))` callback does not confuse the matcher → found", () => {
  withCode(`users.map(u => ({ posts: db.findMany({ where: { a: u.id } }) }));\n`, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].expr, "db.findMany");
  });
});

test("multi-line comment does NOT shift the reported line (mask preserves newlines)", () => {
  const body = `/* header
   spanning
   three lines */
for (const u of users) { db.findMany(u.id); }
`;
  withCode(body, (p) => {
    const o = json(run(p));
    assert.equal(o.found, true);
    assert.equal(o.hits[0].line, 4); // the query is physically on line 4
  });
});

// ---------------------------------------------------------------------------
// TRUE NEGATIVES / HONEST BOUNDS (v0.1.0)

test("BOUND (query after loop): `for {..}` then a top-level `db.findMany()` → NOT found (the batched fix)", () => {
  const body = `for (const u of users) { ids.push(u.id); }
return db.findMany({ where: { id: { in: ids } } });
`;
  withCode(body, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (query is the map receiver): `db.findMany().map(x => x.id)` → NOT found (query outside the `.map` parens)", () => {
  withCode(`const ids = db.findMany().map(x => x.id);\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (ambiguous verb): `cache.find(c => ...)` inside a loop → NOT found (`.find` is out of the query-verb set)", () => {
  const body = `for (const u of users) {\n  const h = cache.find(c => c.id === u.id);\n}\n`;
  withCode(body, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (verb whole-word): `db.findOneAndUpdate(...)` in a loop → NOT found (not `findOne`, out of set)", () => {
  withCode(`for (const u of users) { db.findOneAndUpdate({ id: u.id }); }\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (member-call only): a bare receiver-less `query(sql)` in a loop → NOT found", () => {
  withCode(`for (const u of users) { query(u.id); }\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (braceless statement loop): `for (const u of users) db.query(u);` → NOT found (no braces, not an arrow)", () => {
  withCode(`for (const u of users) db.query(u.id);\n`, (p) => assert.equal(json(run(p)).found, false));
});

test("BOUND (not a loop): a plain function body with a query → NOT found", () => {
  withCode(`function load(db) {\n  return db.findMany({});\n}\n`, (p) => assert.equal(json(run(p)).found, false));
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
  const r = run(join(tmpdir(), "pharn-scannp1-does-not-exist-xyz.mjs"));
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("fail-closed: no argument → nonzero exit, nothing on stdout", () => {
  const r = spawnSync(process.execPath, [SCANNER], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
