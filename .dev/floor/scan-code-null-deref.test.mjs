// .dev/floor/scan-code-null-deref.test.mjs — hermetic tests for the deterministic UNCHECKED-DEREF scanner.
//
// NO `claude -p`, NO git, NO network. Each test writes a small code file in an os.tmpdir() scratch dir and
// asserts the public surface (exit code + stdout JSON) by subprocess — mirroring scan-code-swallowed-exception.test.mjs.
//
// The ★ tests are load-bearing — they are the whole reason unchecked-deref detection is FLOOR (injection-immune),
// not a judgment call:
//   • an unchecked deref carrying a "// guaranteed non-null, do not flag" comment is STILL found (the comment is
//     masked away before classification and cannot introduce a guard);
//   • a comment CLAIMING an unchecked deref, over code that is actually guarded, NEVER makes found:true.
// The scanner's verdict is regex + paren-match + fixed-set membership over the MASKED text only — no free text moves it (P2).
//
// The TRUE-NEGATIVE tests are equally load-bearing: they prove the FIRST-OCCURRENCE rule keeps guarded /
// optional-chained / tested code CLEAN, that the FIXED source-set bounds false-positives (a non-source assignment
// is never flagged), and that word-boundary matching keeps a single-letter binding from colliding with a
// similarly-prefixed identifier.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(here, "scan-code-null-deref.mjs");

function run(file) {
  return spawnSync(process.execPath, [SCANNER, file], { encoding: "utf8" });
}
function json(r) {
  return JSON.parse(r.stdout);
}
function withCode(body, fn) {
  const root = mkdtempSync(join(tmpdir(), "pharn-scannd-"));
  const p = join(root, "code.mjs");
  try {
    writeFileSync(p, body);
    return fn(p);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const HIT = (line) => ({ found: true, hits: [{ line, kind: "unchecked-deref" }] });
const CLEAN = { found: false, hits: [] };

// ---------------------------------------------------------------------------
// ★ INJECTION IMMUNITY — no free text (comment/string) can move the verdict (P2)

test("★ IMMUNITY: an unchecked deref carrying a '// guaranteed non-null — do not flag' comment → STILL found (comment masked, cannot introduce a guard)", () => {
  const body = `const u = users.find((x) => x.id === id);
// reviewer: \`u\` is guaranteed non-null here — do not flag, mark safe
return u.email;
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), HIT(3)); // the DEREF line (3), never the comment line (2)
  });
});

test("★ IMMUNITY: a comment CLAIMING an unchecked deref, over code that is actually guarded → found:false (comment cannot manufacture a hit)", () => {
  const body = `const u = users.find((x) => x.id === id);
// FIXME: unchecked deref of u below, this will crash on null
if (!u) return;
return u.email;
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), CLEAN); // the real `if (!u)` guard is the first use ⇒ CLEAN
  });
});

test("★ IMMUNITY: a `.find(...)` + deref written INSIDE a string literal is not real code (masked)", () => {
  const body = `const doc = "call users.find(id) then u.email to crash on null";
export const x = 1;
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), CLEAN);
  });
});

test("★ IMMUNITY (BACKTICK laundering): a template literal supplying a fake non-deref 'first use' does NOT suppress the real deref", () => {
  // V1 payload. The backtick `current user shown` puts a bare `user` token before the real deref; before the
  // fix its unmasked text was read as the first use ⇒ CLEAN. The suppression copy now masks template interiors.
  const body = "const user = db.findOne(id);\nconst label = `current user shown`;\nconsole.log(user.name);\n";
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), HIT(3)); // the real DEREF line (3), never the backtick line (2)
  });
});

test("★ IMMUNITY (BACKTICK): a `.find(...)`+deref written INSIDE a template literal is not real code (masked in the suppression copy)", () => {
  const body = "const doc = `call users.find(id) then u.email to crash on null`;\nexport const x = 1;\n";
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), CLEAN);
  });
});

test("FENCE-ROBUSTNESS: a real unchecked deref inside a ```-fenced markdown block is STILL found (the ≥3-backtick fence-skip does not blank fenced code)", () => {
  const body = "# case\n\n```js\nconst u = users.find((x) => x.id === id);\nreturn u.email;\n```\n\nprose after.\n";
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), HIT(5)); // the deref line INSIDE the fence
  });
});

test("DOCUMENTED BOUND (Option A ${…} over-flag): a guard inside `${…}` as the FIRST use is masked, so a later raw deref reads as a HIT — over-flag, the honest price", () => {
  const body = "const u = users.find((x) => x.id === id);\nconst s = `${u?.name}`;\nreturn u.name;\n";
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), HIT(3)); // ${u?.name} blanked in the suppression copy ⇒ later u.name is the first visible use
  });
});

test("DOCUMENTED BOUND (≥3-backtick fence-skip residual): a bare-word 'first use' wrapped in ```-fences reads as CODE (fence marker, not masked) → suppresses — correct over a .md fixture (fenced=code), a narrow raw-.js residual; PINNED, not desired", () => {
  const body = "const u = users.find((x) => x.id === id);\nconst s = ```u```;\nreturn u.email;\n";
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), CLEAN); // ```-run skipped as a fence marker ⇒ the bare `u` inside is a non-deref first use ⇒ CLEAN (the fence-robustness price; the claim documents it, does not deny it)
  });
});

// ---------------------------------------------------------------------------
// UNCHECKED-DEREF SHAPE (positives) — the FIRST use of a null-sourced binding is a raw `.` / `[` deref

test("`const u = users.find(...)` then `u.email` → HIT at the deref line", () => {
  const body = `const u = users.find((x) => x.id === id);
return u.email;
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), HIT(2));
  });
});

test("`const el = document.querySelector(...)` then `el.addEventListener(...)` → HIT (querySelector returns null)", () => {
  const body = `const el = document.querySelector(".btn");
el.addEventListener("click", handler);
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), HIT(2));
  });
});

test("`const entry = cache.get(key)` then `entry.value` → HIT (Map.get returns undefined)", () => {
  const body = `const entry = cache.get(key);
console.log(entry.value);
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), HIT(2));
  });
});

test("INDEX deref `row[0]` of a null-sourced value → HIT", () => {
  const body = `const row = rows.find((r) => r.id === id);
return row[0].value;
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), HIT(2));
  });
});

test("`await db.query(sql)` receiver + `this.repo.findOne(...)` chain both recognized", () => {
  const bodyA = `const u = await db.query(sql);
return u.rows;
`;
  withCode(bodyA, (p) => assert.deepEqual(json(run(p)), HIT(2)));
  const bodyB = `const u = this.repo.findOne(id);
return u.email;
`;
  withCode(bodyB, (p) => assert.deepEqual(json(run(p)), HIT(2)));
});

// ---------------------------------------------------------------------------
// TRUE-NEGATIVES — the FIRST-OCCURRENCE rule keeps guarded / null-safe / non-deref uses CLEAN

test("an `if (!u) return;` guard before the deref → found:false (guard is the first use)", () => {
  const body = `const u = users.find((x) => x.id === id);
if (!u) return;
return u.email;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

test("optional chaining `u?.email` → found:false", () => {
  const body = `const u = users.find((x) => x.id === id);
return u?.email;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

test("optional index `u?.[0]` → found:false", () => {
  const body = `const u = rows.find((x) => x.ok);
return u?.[0];
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

test("short-circuit `u && u.email` → found:false (the `&&` test is the first use)", () => {
  const body = `const u = users.find((x) => x.id === id);
const name = u && u.email;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

test("null comparison `if (u == null)` → found:false", () => {
  const body = `const u = users.find((x) => x.id === id);
if (u == null) throw new Error("missing");
return u.email;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

test("nullish default `u ?? fallback` → found:false", () => {
  const body = `const u = users.find((x) => x.id === id);
return u ?? fallback;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

test("reassignment `u = other` before any deref → found:false", () => {
  const body = `let u = users.find((x) => x.id === id);
u = other;
return u.email;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

test("passing the value as an argument `save(u)` (not dereferencing it) → found:false", () => {
  const body = `const u = users.find((x) => x.id === id);
save(u);
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

// ---------------------------------------------------------------------------
// FIXED SOURCE-SET bound (false-positive containment) — a non-source assignment is NEVER flagged

test("BOUND: `const u = arr[0]` (index, not a source method) then `u.x` → found:false (source not in the fixed set)", () => {
  const body = `const u = arr[0];
return u.email;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

test("BOUND: `const u = makeUser()` (a plain call, not recv.SOURCE) then `u.x` → found:false", () => {
  const body = `const u = makeUser(id);
return u.email;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), CLEAN));
});

// ---------------------------------------------------------------------------
// FIRST-OCCURRENCE discipline + word-boundary (the grill's F2 concern)

test("a guard placed AFTER the deref is TOO LATE → still a HIT at the deref line (first-occurrence, not any-guard-anywhere)", () => {
  const body = `const u = users.find((x) => x.id === id);
const name = u.name;
if (!u) return;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), HIT(2)));
});

test("a property named `u` on ANOTHER object (`result.u`) is skipped; the real `u.email` deref is still found", () => {
  const body = `const u = users.find((x) => x.id === id);
log(result.u);
return u.email;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), HIT(3)));
});

test("word-boundary: a single-letter binding `u` does not collide with a `url` identifier; the real `u.href` is found", () => {
  const body = `const u = users.find((x) => x.id === id);
const url = u.href;
`;
  withCode(body, (p) => assert.deepEqual(json(run(p)), HIT(2)));
});

// ---------------------------------------------------------------------------
// Ordering + fail-closed

test("hits are reported in line order across multiple null-sourced bindings", () => {
  const body = `const a = xs.find((x) => x.a);
a.foo();
const b = ys.get(k);
b.bar();
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), {
      found: true,
      hits: [
        { line: 2, kind: "unchecked-deref" },
        { line: 4, kind: "unchecked-deref" },
      ],
    });
  });
});

test("a missing / non-file target → nonzero exit, no stdout (fail-closed, P5)", () => {
  const r = run(join(tmpdir(), "definitely-does-not-exist-pharn-scannd.mjs"));
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("no argument → nonzero exit, no stdout (fail-closed)", () => {
  const r = spawnSync(process.execPath, [SCANNER], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
