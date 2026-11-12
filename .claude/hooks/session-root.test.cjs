// .claude/hooks/session-root.test.cjs — every accept/reject branch of sessionRoot (session-root.cjs).
//
// Each case builds a real repository + `git worktree add` (git-worktree-fixture.cjs) and calls
// sessionRoot(payloadCwd, anchor) directly, where `anchor` plays the hook process's cwd (the main checkout).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { join } = path;

const { sessionRoot } = require("./session-root.cjs");
const { adminDir, git, makeRepo, repoWithWorktree } = require("./git-worktree-fixture.cjs");

// --- Fallback: anything but a verified work tree of the anchor's repository -> the anchor ---

test("no payload cwd -> the anchor (today's root)", () => {
  const { main } = repoWithWorktree();
  assert.equal(sessionRoot(undefined, main), main);
});

test("a non-string, relative, NUL-carrying or nonexistent payload cwd -> the anchor", () => {
  const { main, wt } = repoWithWorktree();
  assert.equal(sessionRoot(42, main), main);
  assert.equal(sessionRoot({ cwd: wt }, main), main);
  assert.equal(sessionRoot(".claude/worktrees/wt", main), main);
  assert.equal(sessionRoot(`${wt}\0`, main), main);
  assert.equal(sessionRoot(join(wt, "does-not-exist"), main), main);
});

test("payload cwd = the anchor, or a subdirectory of it -> the anchor", () => {
  const { main } = repoWithWorktree();
  fs.mkdirSync(join(main, "src"));
  assert.equal(sessionRoot(main, main), main);
  assert.equal(sessionRoot(join(main, "src"), main), main);
});

// --- Accept: the repository's own work trees ---

test("payload cwd = a linked worktree of the anchor's repository -> that worktree", () => {
  const { main, wt } = repoWithWorktree();
  assert.equal(sessionRoot(wt, main), wt);
});

test("payload cwd = a subdirectory of the linked worktree -> the worktree root", () => {
  const { main, wt } = repoWithWorktree();
  fs.mkdirSync(join(wt, "src", "lib"), { recursive: true });
  assert.equal(sessionRoot(join(wt, "src", "lib"), main), wt);
});

test("anchor = a linked worktree, payload cwd = the main work tree -> the main work tree (rule a)", () => {
  const { main, wt } = repoWithWorktree();
  assert.equal(sessionRoot(main, wt), main);
});

test("anchor = one linked worktree, payload cwd = a second linked worktree -> the second", () => {
  const { main, wt } = repoWithWorktree();
  const wt2 = join(main, ".claude", "worktrees", "wt2");
  git(main, "worktree", "add", "-q", "--detach", wt2);
  assert.equal(sessionRoot(wt2, wt), wt2);
});

test("a relative-path worktree link (git's worktree.useRelativePaths form) is accepted", () => {
  const { main, wt } = repoWithWorktree();
  const admin = adminDir(wt);
  fs.writeFileSync(join(wt, ".git"), `gitdir: ${path.relative(wt, admin)}\n`);
  fs.writeFileSync(join(admin, "gitdir"), `${path.relative(admin, join(wt, ".git"))}\n`);
  assert.equal(sessionRoot(wt, main), wt);
});

// --- Reject: forged, foreign, nested, symlinked ---

test("a forged .git file naming the REAL worktree's admin dir (whose back-link names another tree) -> the anchor", () => {
  const { main, wt } = repoWithWorktree();
  const evil = join(main, ".dev", "evil");
  fs.mkdirSync(evil, { recursive: true });
  fs.writeFileSync(join(evil, ".git"), `gitdir: ${adminDir(wt)}\n`);
  assert.equal(sessionRoot(evil, main), main);
});

test("a forged .git file naming a fake admin dir under .git/worktrees with no gitdir back-link -> the anchor", () => {
  const { main } = repoWithWorktree();
  const fake = join(main, ".git", "worktrees", "fake");
  fs.mkdirSync(fake, { recursive: true });
  const evil = join(main, ".dev", "evil");
  fs.mkdirSync(evil, { recursive: true });
  fs.writeFileSync(join(evil, ".git"), `gitdir: ${fake}\n`);
  assert.equal(sessionRoot(evil, main), main);
});

test("a .git file whose admin dir is outside <common>/worktrees (even with a back-link) -> the anchor", () => {
  const { base, main } = repoWithWorktree();
  const admin = join(base, "admin", "worktrees", "x");
  fs.mkdirSync(admin, { recursive: true });
  const evil = join(main, ".dev", "evil");
  fs.mkdirSync(evil, { recursive: true });
  fs.writeFileSync(join(evil, ".git"), `gitdir: ${admin}\n`);
  fs.writeFileSync(join(admin, "gitdir"), `${join(evil, ".git")}\n`);
  assert.equal(sessionRoot(evil, main), main);
});

test("a nested repository inside the anchor -> the anchor", () => {
  const { main } = repoWithWorktree();
  const nested = makeRepo(join(main, ".dev", "nested"));
  assert.equal(sessionRoot(nested, main), main);
});

test("a foreign repository outside the anchor -> the anchor", () => {
  const { base, main } = repoWithWorktree();
  const other = makeRepo(join(base, "other"));
  assert.equal(sessionRoot(other, main), main);
});

test("a work tree whose .git is a symlink (even onto the real link file) -> the anchor", () => {
  const { main, wt } = repoWithWorktree();
  const linked = join(main, ".dev", "linked");
  fs.mkdirSync(linked, { recursive: true });
  fs.symlinkSync(join(wt, ".git"), join(linked, ".git"));
  assert.equal(sessionRoot(linked, main), main);
});

test("an anchor that is not a work tree top (a subdirectory) never widens to the repository root", () => {
  const { main, wt } = repoWithWorktree();
  const sub = join(main, "sub");
  fs.mkdirSync(sub);
  assert.equal(sessionRoot(wt, sub), sub);
});

test("an anchor that is not a git repository at all -> the anchor", () => {
  const { base, wt } = repoWithWorktree();
  const plain = join(base, "plain");
  fs.mkdirSync(plain);
  assert.equal(sessionRoot(wt, plain), plain);
});
