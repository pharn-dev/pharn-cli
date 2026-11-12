// .claude/hooks/protect-trusted-paths.test.cjs — black-box tests for the pre-write floor hook.
//
// The hook reads a PreToolUse payload from stdin and exits 2 (deny) on a trusted path,
// 0 (allow) otherwise. We drive it as a subprocess and assert on exit code + stderr.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const { join } = require("node:path");

const HOOK = join(__dirname, "protect-trusted-paths.cjs");

function run(payload, cwd) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    ...(cwd ? { cwd } : {}),
  });
}

function tmp() {
  return fs.mkdtempSync(join(os.tmpdir(), "pharn-fix2-"));
}

test("blocks writes to a trusted spec doc", () => {
  const r = run({ tool_name: "Write", tool_input: { file_path: "CONSTITUTION.md" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED by PHARN floor/);
});

test("blocks writes to .github/CODEOWNERS (the GitHub-layer write-guard)", () => {
  const r = run({ tool_name: "Edit", tool_input: { file_path: ".github/CODEOWNERS" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED by PHARN floor/);
});

test("allows writes to an ordinary file", () => {
  const r = run({ tool_name: "Write", tool_input: { file_path: "src/foo.js" } });
  assert.equal(r.status, 0);
});

// --- Symlink escape (fix): a write to an innocent path that RESOLVES to a trusted doc is denied ---

test("blocks a Write to a committed symlink that resolves to a trusted doc (leaf symlink)", () => {
  const cwd = tmp();
  fs.writeFileSync(join(cwd, "CONSTITUTION.md"), "trusted\n");
  fs.mkdirSync(join(cwd, "features"));
  fs.symlinkSync(join("..", "CONSTITUTION.md"), join(cwd, "features", "notes.md"));
  const r = run({ tool_name: "Write", tool_input: { file_path: "features/notes.md" } }, cwd);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED by PHARN floor/);
});

test("blocks a Write through a symlinked PARENT dir onto a trusted doc (ancestor resolves)", () => {
  const cwd = tmp();
  fs.writeFileSync(join(cwd, "CONSTITUTION.md"), "trusted\n");
  fs.mkdirSync(join(cwd, "features"));
  fs.symlinkSync("..", join(cwd, "features", "evil")); // features/evil -> repo root
  const r = run({ tool_name: "Write", tool_input: { file_path: "features/evil/CONSTITUTION.md" } }, cwd);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED by PHARN floor/);
});

test("allows a real (non-symlink) file in a nested allowed dir (no false positive from realpath)", () => {
  const cwd = tmp();
  fs.mkdirSync(join(cwd, "features"));
  fs.writeFileSync(join(cwd, "features", "notes.md"), "ordinary\n");
  const r = run({ tool_name: "Write", tool_input: { file_path: "features/notes.md" } }, cwd);
  assert.equal(r.status, 0);
});

// --- Session root: hook process cwd = the main checkout, payload `cwd` = the session's worktree ---

const fixture = require("./git-worktree-fixture.cjs");

test("session in a worktree: the worktree's trusted docs stay BLOCKED (absolute and relative)", () => {
  const { main, wt } = fixture.repoWithWorktree();
  const abs = fixture.runHook(HOOK, main, fixture.writePayload(join(wt, "CONSTITUTION.md"), wt));
  assert.equal(abs.status, 2);
  const rel = fixture.runHook(HOOK, main, fixture.writePayload("CONSTITUTION.md", wt));
  assert.equal(rel.status, 2);
  assert.equal(fixture.runHook(HOOK, main, fixture.writePayload("src/foo.js", wt)).status, 0);
});

test("session in a worktree: a relative target resolves in the WORKTREE, so its symlink onto a trusted doc is BLOCKED", () => {
  const { main, wt } = fixture.repoWithWorktree();
  fs.writeFileSync(join(wt, "CONSTITUTION.md"), "trusted\n");
  fs.mkdirSync(join(wt, "features"));
  fs.symlinkSync(join("..", "CONSTITUTION.md"), join(wt, "features", "notes.md"));
  const r = fixture.runHook(HOOK, main, fixture.writePayload("features/notes.md", wt));
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes(`-> ${join(wt, "CONSTITUTION.md")}`));
  // Without the payload cwd it resolves against the main checkout, where no such link exists.
  assert.equal(fixture.runHook(HOOK, main, fixture.writePayload("features/notes.md")).status, 0);
});

test("a missing or throwing session-root.cjs fails CLOSED: a trusted doc is still BLOCKED with exit 2", () => {
  for (const source of [null, 'throw new Error("broken");\n']) {
    const copy = fixture.hookBesideResolver(HOOK, source);
    const cwd = tmp();
    const r = fixture.runHook(copy, cwd, fixture.writePayload("CONSTITUTION.md", cwd));
    assert.equal(r.status, 2, String(source));
    assert.match(r.stderr, /BLOCKED by PHARN floor/);
  }
});
