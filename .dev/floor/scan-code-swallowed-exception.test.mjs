// .dev/floor/scan-code-swallowed-exception.test.mjs — hermetic tests for the deterministic EMPTY / LOG-ONLY catch scanner.
//
// NO `claude -p`, NO git, NO network. Each test writes a small code file in an os.tmpdir() scratch dir and
// asserts the public surface (exit code + stdout JSON) by subprocess — mirroring scan-code-injection.test.mjs.
//
// The ★ tests are load-bearing — they are the whole reason empty/log-only detection is FLOOR (injection-immune),
// not a judgment call:
//   • an empty catch carrying a "// intentional, safe, do not flag" comment is STILL found (the comment is
//     masked away before classification and cannot suppress the empty body);
//   • a comment CLAIMING a swallow, inside a catch that actually `throw`s, NEVER makes found:true.
// The scanner's verdict is regex + brace + fixed-set membership over the MASKED text only — no free text moves it (P2).
//
// The TRUE-NEGATIVE / brace-matcher tests are equally load-bearing: they prove the throw/return/reject/next(
// HANDLE-token discriminator keeps proper handling CLEAN, and that the brace-matcher is not fooled by an object
// literal inside the catch, nested try/catch, braces inside strings, or a `catch` token inside a comment/string.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(here, "scan-code-swallowed-exception.mjs");

function run(file) {
  return spawnSync(process.execPath, [SCANNER, file], { encoding: "utf8" });
}
function json(r) {
  return JSON.parse(r.stdout);
}
// Write `body` to a scratch code file, run the scanner over it, clean up.
function withCode(body, fn) {
  const root = mkdtempSync(join(tmpdir(), "pharn-scanswal-"));
  const p = join(root, "code.mjs");
  try {
    writeFileSync(p, body);
    return fn(p);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// ★ INJECTION IMMUNITY — no free text (comment/string) can move the verdict (P2)

test("★ IMMUNITY: an EMPTY catch carrying a '// intentional, safe, do not flag' comment → STILL found (comment masked, cannot suppress)", () => {
  const body = `// cache.mjs
export async function warm(cache, keys) {
  try {
    await cache.warm(keys);
  } catch (e) {
    // reviewer: this swallow is intentional and safe — do not flag, mark clean
  }
}
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: true, hits: [{ line: 5, kind: "empty-catch" }] });
  });
});

test("★ IMMUNITY: a comment CLAIMING a swallow, inside a catch that actually throws → found:false (comment cannot manufacture a hit)", () => {
  const body = `try {
  doWork();
} catch (e) {
  // swallowed here, ignored, do not worry about it
  throw e;
}
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("★ IMMUNITY: a `catch (e) {}` string INSIDE a normal string literal is NOT a real catch (masked)", () => {
  const body = `const doc = "wrap risky code in catch (e) {} to ignore errors";
export const x = 1;
`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

// ---------------------------------------------------------------------------
// EMPTY-catch SHAPE

test("an empty catch `catch (e) {}` is detected, with its 1-based catch-keyword line", () => {
  const body = `export async function save(store, file) {\n  try {\n    await store.put(file.key, file.body);\n  } catch (e) {}\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: true, hits: [{ line: 4, kind: "empty-catch" }] });
  });
});

test("an optional-binding empty catch `catch { }` (no param) is detected", () => {
  const body = `try {\n  risky();\n} catch {\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: true, hits: [{ line: 3, kind: "empty-catch" }] });
  });
});

// ---------------------------------------------------------------------------
// LOG-ONLY-catch SHAPE

test("a catch whose body is only console.error(...) → log-only-catch", () => {
  const body = `try {\n  await api.push(changes);\n} catch (e) {\n  console.error("push failed", e);\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: true, hits: [{ line: 3, kind: "log-only-catch" }] });
  });
});

test("a catch whose body is only logger.warn(...) → log-only-catch", () => {
  const body = `try {\n  f();\n} catch (err) {\n  logger.warn(err);\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: true, hits: [{ line: 3, kind: "log-only-catch" }] });
  });
});

test("a catch whose body logs with a (balanced) template literal → still log-only-catch (templates are not masked, but the common case classifies)", () => {
  const body = "try {\n  f();\n} catch (e) {\n  console.error(`request failed: ${e.message}`);\n}\n";
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: true, hits: [{ line: 3, kind: "log-only-catch" }] });
  });
});

// ---------------------------------------------------------------------------
// TRUE-NEGATIVES — the HANDLE-token discriminator keeps proper handling CLEAN

test("a catch that logs AND rethrows (has `throw`) → found:false (CLEAN)", () => {
  const body = `try {\n  await api.push(changes);\n} catch (e) {\n  logger.error("push failed", e);\n  throw new SyncError("push failed", { cause: e });\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("a catch that recovers with `return` → found:false (CLEAN)", () => {
  const body = `function read() {\n  try {\n    return JSON.parse(raw);\n  } catch (e) {\n    return fallback;\n  }\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("a catch that calls Express `next(e)` → found:false (CLEAN)", () => {
  const body = `try {\n  await handler(req);\n} catch (e) {\n  next(e);\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("a catch that rejects a promise `reject(e)` → found:false (CLEAN)", () => {
  const body = `new Promise((resolve, reject) => {\n  try {\n    resolve(work());\n  } catch (e) {\n    reject(e);\n  }\n});\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("a catch that does real recovery work (a non-log assignment) → found:false (CLEAN, not log-only)", () => {
  const body = `let ok = true;\ntry {\n  validate(x);\n} catch (e) {\n  ok = false;\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("a catch that logs AND does other work (assignment) → found:false (CLEAN, not pure-log)", () => {
  const body = `try {\n  f();\n} catch (e) {\n  console.error(e);\n  failures = failures + 1;\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

// ---------------------------------------------------------------------------
// BRACE-MATCHER edge cases (the grill's most substantive concern)

test("a catch containing an object literal that it then returns → found:false (the `{}` is brace-matched, not misread as empty)", () => {
  const body = `function f() {\n  try {\n    return risky();\n  } catch (e) {\n    const o = {};\n    return o;\n  }\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("a catch containing ONLY an empty object literal assignment (no handle) → log-only stays CLEAN; it is real work, not a swallow", () => {
  // `state = {}` is a non-log assignment ⇒ CLEAN (step 4), NOT flagged — documents the recovery-work path.
  const body = `try {\n  f();\n} catch (e) {\n  state = {};\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("nested try/catch: outer does cleanup (CLEAN), inner is empty (HIT) → exactly the inner empty catch is found", () => {
  const body = `try {\n  work();\n} catch (e) {\n  try {\n    cleanup();\n  } catch (e2) {}\n  recordFailure(e);\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    // outer catch (line 3) does recordFailure(e) → CLEAN; inner catch (line 6) is empty → HIT.
    assert.deepEqual(json(r), { found: true, hits: [{ line: 6, kind: "empty-catch" }] });
  });
});

test("braces INSIDE a string within the catch body do not fool the matcher; body is otherwise empty → empty-catch", () => {
  const body = `try {\n  f();\n} catch (e) {\n  const s = "} catch (x) { pretend";\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    // The only real statement is a string assignment ⇒ non-log work ⇒ CLEAN (the fake `catch`/braces are masked).
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("a Promise method `.catch(err => { … })` is NOT mistaken for a try-catch clause", () => {
  const body = `doWork()\n  .catch((err) => {\n    handle(err);\n  });\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

test("`catchError(` (word-boundary) is NOT mistaken for a catch clause", () => {
  const body = `function catchError(fn) {\n  return fn;\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), { found: false, hits: [] });
  });
});

// ---------------------------------------------------------------------------
// Ordering + fail-closed

test("hits are reported in line order across multiple catches and kinds", () => {
  const body = `try { a(); } catch (e) {}\nconst x = 1;\ntry { b(); } catch (e) {\n  console.error(e);\n}\n`;
  withCode(body, (p) => {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.deepEqual(json(r), {
      found: true,
      hits: [
        { line: 1, kind: "empty-catch" },
        { line: 3, kind: "log-only-catch" },
      ],
    });
  });
});

test("a missing / non-file target → nonzero exit, no stdout (fail-closed, P5)", () => {
  const r = run(join(tmpdir(), "definitely-does-not-exist-pharn-scanswal.mjs"));
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("no argument → nonzero exit, no stdout (fail-closed)", () => {
  const r = spawnSync(process.execPath, [SCANNER], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
