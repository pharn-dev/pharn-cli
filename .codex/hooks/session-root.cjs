// .claude/hooks/session-root.cjs — which work tree a PreToolUse write-guard judges a write against.
//
// Deterministic, non-LLM, stdlib-only (no `git` spawn). Shared by enforce-writes-scope.cjs (fix #7) and
// protect-trusted-paths.cjs (fix #2).
//
// WHY: .claude/settings.json runs the hooks as `node .claude/hooks/<hook>.cjs`, and Claude Code runs a hook
// process in the directory the session STARTED in. A session that then works in a git worktree
// (`.claude/worktrees/<name>/`) therefore had every write judged against the MAIN checkout — its
// `.pharn/writes-scope.json`, and globs relative to it — so every worktree write was denied. Claude Code's
// hook contract carries the session's directory separately: the payload's `cwd` field "is the worktree root
// after Claude enters a worktree, and the new directory after Claude runs `cd`" (code.claude.com/docs/en/hooks,
// "Reference scripts by path").
//
// RULE: the session root is the git work tree holding the payload `cwd`, accepted ONLY when it is the anchor
// (the hook process's cwd) itself or another work tree of the SAME repository:
//   (a) a work tree whose `.git` DIRECTORY is the anchor's common git dir (the main work tree), or
//   (b) a linked worktree: its `.git` FILE says `gitdir: <common>/worktrees/<n>`, and `<n>/gitdir` points back
//       at that same `.git` file — the two-way link git itself writes.
// Every other case — no/relative/unresolvable `cwd`, a nested or foreign repository, a forged `.git` file whose
// admin dir does not point back, a symlinked `.git`, any read error — returns the anchor root, which is the
// hooks' previous behaviour (fail-closed: it denies worktree writes). The payload `cwd` only ever SELECTS among
// the repository's own verified work trees by equality tests; it is never used as a glob or a written path.

"use strict";

const fs = require("fs");
const path = require("path");

// A `.git` link file or an admin `gitdir`/`commondir` file is one short line; anything larger is not one.
const MAX_LINK_BYTES = 4096;

function realOr(p, fallback) {
  try {
    return fs.realpathSync(p);
  } catch {
    return fallback;
  }
}

// Read a small REGULAR file through one descriptor: never follows a symlinked leaf, never blocks on a FIFO,
// never reads more than MAX_LINK_BYTES. null on anything else.
function readSmallFile(p) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
  let fd;
  try {
    fd = fs.openSync(p, flags);
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size > MAX_LINK_BYTES) return null;
    const buf = Buffer.alloc(st.size);
    const n = fs.readSync(fd, buf, 0, st.size, 0);
    return buf.subarray(0, n).toString("utf8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // closing a read-only descriptor cannot lose data
      }
    }
  }
}

// What `<dir>/.git` is: "dir", "file", "none" (absent — keep walking up), or "other" (a symlink, a FIFO, an
// unreadable entry — not a work tree marker we accept; ends the walk).
function gitEntry(dir) {
  try {
    const st = fs.lstatSync(path.join(dir, ".git"));
    if (st.isDirectory()) return "dir";
    if (st.isFile()) return "file";
    return "other";
  } catch (err) {
    return err && err.code === "ENOENT" ? "none" : "other";
  }
}

// The nearest work tree at or above `start` (already realpath'd): { top, kind } or null.
function findWorkTree(start) {
  let dir = start;
  for (;;) {
    const kind = gitEntry(dir);
    if (kind === "dir" || kind === "file") return { top: dir, kind };
    if (kind === "other") return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// The admin dir a `.git` FILE names (`gitdir: <path>`, resolved against the work tree), realpath'd, or null.
function linkedGitDir(top) {
  const text = readSmallFile(path.join(top, ".git"));
  if (text === null) return null;
  const m = /^gitdir: (.+)$/.exec(text.split(/\r?\n/)[0]);
  if (!m || m[1].includes("\0")) return null;
  return realOr(path.resolve(top, m[1].trim()), null);
}

// The repository's common git dir for a work tree, or null.
function commonGitDir(top, kind) {
  if (kind === "dir") return realOr(path.join(top, ".git"), null);
  const gitDir = linkedGitDir(top);
  if (gitDir === null) return null;
  const common = readSmallFile(path.join(gitDir, "commondir"));
  if (common === null) return gitDir; // a `.git` file with no commondir (e.g. a submodule): its own repo
  return realOr(path.resolve(gitDir, common.trim()), null);
}

// Is `top` a work tree of the repository whose common git dir is `common`? (Rules (a) and (b) above.)
function isWorkTreeOf(top, kind, common) {
  if (kind === "dir") return realOr(path.join(top, ".git"), null) === common;
  const gitDir = linkedGitDir(top);
  if (gitDir === null || path.dirname(gitDir) !== path.join(common, "worktrees")) return false;
  const back = readSmallFile(path.join(gitDir, "gitdir"));
  if (back === null || back.includes("\0")) return false;
  const backReal = realOr(path.resolve(gitDir, back.trim()), null);
  return backReal !== null && backReal === realOr(path.join(top, ".git"), null);
}

// The root a write-guard judges against. `anchor` is the hook process's cwd (today's root); the result is
// always realpath'd when it can be, so a canonicalized write target shares its prefix.
function sessionRoot(payloadCwd, anchor = process.cwd()) {
  const anchorReal = realOr(anchor, anchor);
  if (typeof payloadCwd !== "string" || payloadCwd.includes("\0") || !path.isAbsolute(payloadCwd)) {
    return anchorReal;
  }
  const start = realOr(payloadCwd, null);
  if (start === null) return anchorReal;
  const session = findWorkTree(start);
  if (session === null || session.top === anchorReal) return anchorReal;
  // The anchor must itself be a work tree top, so a session root can never widen a narrower anchor.
  const anchorKind = gitEntry(anchorReal);
  if (anchorKind !== "dir" && anchorKind !== "file") return anchorReal;
  const common = commonGitDir(anchorReal, anchorKind);
  if (common === null) return anchorReal;
  return isWorkTreeOf(session.top, session.kind, common) ? session.top : anchorReal;
}

module.exports = { sessionRoot };
