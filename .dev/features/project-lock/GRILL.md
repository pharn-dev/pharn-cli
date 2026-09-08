# GRILL — project-lock (advisory; gates nothing)

## F1 — a lock that refuses forever is worse than no lock (the central trade-off)

**Problem.** The obvious implementation refuses whenever the file exists. A holder that is
`SIGKILL`ed or loses power then wedges the project **permanently**, and the only recovery is a manual
delete the user has to be told about. That converts a rare interleave into a common outage.

**Reduction.** Three independent break rules, each on evidence rather than optimism: malformed
payload, older than `STALE_MS`, or a dead pid **on this host**. The malformed rule is the one that
matters most — a corrupt lock must never be able to wedge anything.

## F2 — breaking on a pid is wrong across hosts, and that is easy to miss (correctness)

**Problem.** `process.kill(pid, 0)` answers "is this pid running **here**". A shared checkout (NFS, a
mounted volume) can hold a lock written by another machine, where that pid number is meaningless — and
very likely maps to some unrelated live process, or to nothing. Consulting liveness there steals a
live lock.

**Reduction.** `isDead` returns `false` immediately unless `host === hostname()`. A foreign-host lock
is retired **only** by age. There is a dedicated test for it, because this is the branch a reasonable
implementation gets wrong.

## F3 — a hand-edited lock must not become a signal-sending primitive (P2)

**Problem.** The payload is user-editable and its `pid` is fed to `process.kill`. A file containing
`{"pid": 1}` — or a crafted value — would have `pharn` signal an arbitrary process. Even with signal
`0` this is a capability the CLI should not hand out.

**Reduction.** `parsePayload` rejects anything that is not a positive **integer** before the value can
reach `kill`, and the whole parse is ordered so shape validation precedes every use. A test plants a
**string** `"1"` and asserts it is treated as stale — which can only happen if validation ran first.

## F4 — EPERM is not death (correctness, easy to invert)

**Problem.** `kill(pid, 0)` throws `EPERM` when the process exists but belongs to another user. A
naive `catch → dead` treats a running root-owned pharn as a corpse and steals its lock.

**Reduction.** Only `ESRCH` counts as dead; every other error means "cannot prove it is gone", which
fails toward keeping the lock.

## F5 — the refusal must not clear the lock it refused on (worse-than-nothing failure)

**Problem.** A tidy-looking `finally { release() }` around the whole entry point would delete the
*other* process's lock on the refusal path, leaving the real holder running unprotected — strictly
worse than never having locked.

**Reduction.** `withProjectLock` throws **before** entering the `try`, so release never runs on the
refusal path. And `release` itself re-reads and confirms our own pid+host before unlinking, so even a
mis-sequenced caller cannot delete a foreign lock. Both are tested.

## F6 — a held lock is a policy refusal, not a crash (P0 / reporting)

**Problem.** Letting `ProjectLockedError` fall into each command's generic `catch` would report it
through the boxed-exception path, which attaches the `PHARN_DEBUG` affordance — offering a stack trace
for someone else's running process. `4.06` established that split deliberately; ignoring it here would
erode it.

**Reduction.** All four commands branch on `instanceof` and route the lock refusal to their existing
**refusal** channel. `tests/add.test.ts` keeps the real error class in its mock precisely so that
branch is exercised rather than silently taking the crash path.

## F7 — acquiring too early strands a lock on the most common failure (call-site placement)

**Problem.** "Lock the command" suggests wrapping the whole run. `update`'s fetch-failure path ends in
`process.exit(1)` with **no `finally`**, so a lock taken before the fetch is stranded in the project
root on every offline / rate-limited / DNS failure — the most frequent failure this command has, and
the user would then hit a spurious refusal on their next attempt.

**Reduction.** Acquire after the fetch and after the last prompt at every call site. This also keeps
the held window short, which is what makes a 6-hour `STALE_MS` defensible.

## F8 — the mocked-cwd command tests do real fs now (test-harness reality)

**Problem.** `tests/add.test.ts` runs against the fake cwd `/proj`; a real `openSync` there is `ENOENT`
and 14 tests broke. The tempting fix is to make the lock tolerate a missing directory — which would
silently disable it wherever a project root is wrong.

**Reduction.** The lock is mocked in that file (as `repo.js` already is) **with the real error class
kept**, plus an explicit wiring pin. `tests/remove.test.ts`'s single failure was a genuine fixture gap
— a real cwd always exists — so it now creates its project root. The refusal itself is tested against
real directories in a dedicated file.

## Verdict

**Advisory: proceed.** F2, F4 and F5 are correctness branches a plausible implementation gets wrong;
F7 decides where the calls go; F1 is the trade-off the whole design rests on.
