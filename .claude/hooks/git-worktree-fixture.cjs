// .claude/hooks/git-worktree-fixture.cjs — test support for the session-root cases (not a hook, not a test).
//
// Builds a REAL git repository with a REAL `git worktree add` under `.claude/worktrees/wt` in a temp dir, so
// the two-way link session-root.cjs verifies is the one git itself writes. Every git call runs with the
// caller's GIT_* variables removed (a suite run from a git hook or a rebase `exec` inherits GIT_DIR /
// GIT_INDEX_FILE, which would aim git at the developer's repository) and with system/global config ignored.

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const { join } = require("node:path");

const GIT_ENV = (() => {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = os.devNull;
  return env;
})();

const GIT_IDENTITY = [
  "-c",
  "user.name=pharn-test",
  "-c",
  "user.email=pharn-test@example.invalid",
  "-c",
  "commit.gpgsign=false",
  "-c",
  "init.defaultBranch=main",
];

function git(cwd, ...args) {
  const r = spawnSync("git", [...GIT_IDENTITY, ...args], { cwd, env: GIT_ENV, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${r.stderr}`);
  return r.stdout;
}

// A fresh realpath'd temp dir (macOS /var -> /private/var), so expected roots compare by string.
function tmpBase() {
  return fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(), "pharn-session-")));
}

function makeRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "commit", "-q", "--allow-empty", "-m", "init");
  return dir;
}

// { base, main, wt }: `main` is a repository; `wt` is its linked worktree at main/.claude/worktrees/wt.
function repoWithWorktree() {
  const base = tmpBase();
  const main = makeRepo(join(base, "main"));
  const wt = join(main, ".claude", "worktrees", "wt");
  git(main, "worktree", "add", "-q", "--detach", wt);
  return { base, main, wt };
}

// The admin dir git created for the worktree (main/.git/worktrees/<name>), read from the worktree's link.
function adminDir(wt) {
  const line = fs.readFileSync(join(wt, ".git"), "utf8").split(/\r?\n/)[0];
  return fs.realpathSync(line.replace(/^gitdir: /, "").trim());
}

// A PreToolUse Write payload; `cwd` omitted when undefined (the hook must then use its process cwd).
function writePayload(filePath, cwd) {
  return { tool_name: "Write", tool_input: { file_path: filePath }, ...(cwd === undefined ? {} : { cwd }) };
}

// Run a hook script with the given PROCESS cwd and payload (the payload's `cwd` is the session's).
function runHook(script, processCwd, payload) {
  return spawnSync(process.execPath, [script], { input: JSON.stringify(payload), cwd: processCwd, encoding: "utf8" });
}

// A copy of hook `script` in a fresh dir beside a `session-root.cjs` holding `resolverSource` — or with no
// `session-root.cjs` at all when `resolverSource` is null — to prove a broken resolver fails CLOSED.
function hookBesideResolver(script, resolverSource) {
  const dir = tmpBase();
  const copy = join(dir, require("node:path").basename(script));
  fs.copyFileSync(script, copy);
  if (resolverSource !== null) fs.writeFileSync(join(dir, "session-root.cjs"), resolverSource);
  return copy;
}

module.exports = { adminDir, git, hookBesideResolver, makeRepo, repoWithWorktree, runHook, tmpBase, writePayload };
