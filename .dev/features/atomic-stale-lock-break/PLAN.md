# PLAN — atomic stale-lock break

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e
- increment: Make the stale-lock break in `src/lib/project-lock.ts` a single-winner
  operation — `renameSync` to a unique corpse, re-verify the moved bytes are the
  payload that was judged stale, then `tryCreate` — so the break path can no longer
  leave two processes both believing they hold the lock; and correct the two
  doc-comments that still describe the pre-#162 acquisition order.
- layer(s): pharn-core (`src/lib/` — the shared lock primitive; `ARCHITECTURE.md §4`)
- constitution_refs: [P0, P1, P3, P5, P6, P7]

## The defect (audit finding P-10, LOW, Dim C)

`withProjectLock` reads the lock payload at `:214`, judges it stale, and then at
`:220` deletes it with `rmSync(path, { force: true })` — a delete that **never
re-checks that the bytes it removes are the bytes it judged**. The interleave:

| # | process B                       | process C                       |
| - | ------------------------------- | ------------------------------- |
| 1 | `tryCreate` → EEXIST            |                                 |
| 2 | reads payload `S`, judges stale |                                 |
| 3 |                                 | `tryCreate` → EEXIST            |
| 4 |                                 | reads payload `S`, judges stale |
| 5 | `rmSync` → `S` gone             |                                 |
| 6 | `tryCreate` → **B holds**       |                                 |
| 7 |                                 | `rmSync` → **B's LIVE lock gone** |
| 8 |                                 | `tryCreate` → **C holds too**   |

Two holders. That violates this file's own stated invariant (`:32-34` — "a lock
is only broken on evidence") and the guarantee `CHANGELOG.md:30-31` sells to
users. Everything else in the file is already race-free: `acquire` is `O_CREAT |
O_EXCL` (`:161`) and `release` re-reads before unlinking (`:185`). The break path
is the one place the file does not check what it is destroying.

Bounded severity, stated honestly: it needs a **pre-existing stale lock** plus
**two writers inside the window between one process's `rmSync` and its
`tryCreate`** — two syscalls. Real, not reachable by accident.

## The fix

Replace the unchecked delete with three ordered steps:

1. `renameSync(.pharn.lock → .pharn.lock.<pid>.<8 hex>)`. `rename(2)` unlinks the
   source and links the destination in one step, so of two processes renaming the
   same source **exactly one succeeds**; the other gets `ENOENT` (verified on this
   machine, node v24.13.1). This is the **linearization point of the break** — who
   gets to take this particular file out of the canonical name.
2. **Re-verify.** `rename` hands the file to one process but does **not** promise
   it is the file that was judged: a breaker that won step 1 a moment earlier may
   already have created its own **live** lock, and that is what this rename moved.
   So compare the corpse's raw bytes with the raw bytes read before the staleness
   judgement. Byte-identity, not a re-parse — a fresh payload can never equal a
   corpse's (different pid, different `startedAt`).
3. `tryCreate` — unchanged, and still the **linearization point of ownership**
   (`O_EXCL`). The rename does not confer the lock; only the exclusive create does.

Losers refuse, never loop (the file's existing contract, `:23-25`):

- **`rename` failed** (`ENOENT`, or anything else) → we do not hold it → throw
  `ProjectLockedError(refusal(readPayload(cwd)))`, which names the winner if it has
  already created its lock and falls back to the existing generic wording if not.
- **bytes changed under us** → we moved a lock we had no right to move. Put it back
  with `linkSync(corpse, lock)` — `link(2)` is create-or-fail (`EEXIST` when the
  destination exists, verified on this machine), so the restore **cannot clobber** a
  lock a third process took in the gap — then refuse, naming the payload we just
  restored.
- **`tryCreate` still EEXIST** after a verified break → a third process created one
  in the gap → refuse.

**Corpse disposal.** The `rmSync(corpse)` sits in a `finally` covering all three
steps, so every in-process path (success, refusal, throw) drops it. On the restore
path `linkSync` has already given the inode a second name, so unlinking the corpse
leaves the file at `.pharn.lock`. The only way to strand one is `SIGKILL` between
the rename and the tidy — so a successful break also **sweeps** aged corpses:
`readdirSync(cwd)`, names matching `/^\.pharn\.lock\.\d+\.[0-9a-f]{8}$/` only,
and only those older than `STALE_MS`, so a corpse belonging to a breaker racing us
right now is never touched. The sweep runs on the break path only — never on the
uncontended acquire, which stays two syscalls.

**A wedge this incidentally un-wedges.** Today a `.pharn.lock` that is a
**directory** (a hand-made mistake) makes `rmSync(…, {force:true})` throw
`ERR_FS_EISDIR` on every run → permanent refusal, the exact "wedged project"
hazard `:29-31` exists to prevent. Under the fix `readFileSync` fails (`EISDIR` →
`null` → stale), the rename moves it aside, the corpse `rmSync` fails and is
swallowed, and the acquire succeeds. The directory is left under its corpse name —
moved, never recursively deleted.

## Files

- `src/lib/project-lock.ts` — atomic break (`breakStaleLock` + `sweepCorpses` +
  `readRawAt`); the two corrected doc-comments — layer pharn-core
- `tests/project-lock.test.ts` — real-filesystem cases: no corpse survives a break;
  an aged corpse is swept and a fresh one is not; a `.pharn.lock` directory no
  longer wedges — layer test
- `tests/project-lock-break.test.ts` — the interleave, driven by a `renameSync`
  seam (`vi.mock('node:fs')` wrapping the real call), which is the only way to
  place another process's write at the exact instruction the race needs — layer test
- `CHANGELOG.md` — ONE additive entry at the top of the existing
  `## [Unreleased]` → `### Fixed`; nothing else in the file is touched

Explicitly **not** touched (sibling PRs own them): `src/commands/**`,
`docs/roadmap.md`, `src/lib/{constants,validate,dest-drift,symlink-guard,install-manifest,install-records,pharn-config,tar-extract}.ts`.

## The second task — two doc-comments that are now false

PR #162 (finding P-9) moved the lock acquisition **before** the tarball download for
`add` (named), `add` (picker) and `update`, and deliberately left `init` where it
was. Two comments in this file still describe the old order, and both were already
wrong for `add`'s picker even before #162:

- `:203-206` — "Call sites acquire AFTER their last prompt and after the network
  fetch". False for three of the four commands, and false in both halves for the
  `add` picker, which holds the lock **across** `groupMultiselect`.
- `:50-51` — "the held window is short by design (every call site acquires AFTER
  its last prompt and after the network fetch)". Same false premise, used to
  justify `STALE_MS`.

Both are corrected to describe the real call sites, read from
`src/commands/{init,add,update,remove}.ts` this run (P6). Comment text only — no
command file is edited.

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — the audit finding this closes is consumed as
  untrusted free text; it drives no branch. Cited, not restated (P4).

## Evals to write (P1)

Every branch the fix adds gets a test:

- break succeeds → **no** `.pharn.lock.*` entry remains in the project dir
- rename loser (`renameSync` seam removes the lock first) → `ProjectLockedError`,
  `fn` never ran, no corpse left
- re-verify rejects a payload that changed under it (seam overwrites the lock with a
  **live** foreign payload before the real rename) → `ProjectLockedError` naming the
  foreign pid, `.pharn.lock` **restored** with the foreign bytes, no corpse left
- `tryCreate` loses after a verified break (seam creates a fresh lock after the real
  rename) → `ProjectLockedError`, the third lock is untouched, no corpse left
- aged corpse (backdated mtime) is swept by a break; a fresh corpse and a
  non-matching neighbour (`.pharn.lock.keepme`) are left alone
- `.pharn.lock` as a directory → acquire succeeds (no wedge)
- the existing 13 tests in `tests/project-lock.test.ts` keep passing unchanged —
  they are the regression surface for "the break still breaks what it should"

## Guarantee audit (P0)

- **"the break path can no longer leave two holders"** → **floor.** Two deterministic
  filesystem primitives, not judgment: `rename(2)`'s single-winner semantics (the
  loser gets `ENOENT`) plus the unchanged `O_EXCL` create, with a byte-equality
  re-verify (an exact-match test, `ARCHITECTURE.md §2` primitive #3) closing the gap
  between them. Verified empirically on node v24.13.1 this run (P6), not assumed.
- **"the restore never clobbers a third process's lock"** → **floor.** `link(2)` is
  create-or-fail; `EEXIST` verified this run.
- **"no `.pharn.lock.<pid>` files accumulate"** → **advisory (bounded).** The
  `finally` covers every in-process path — that part is structural — but a `SIGKILL`
  between the rename and the tidy strands one, and the sweep that reaps it is
  best-effort (it runs only on a later break, only on names matching the regex, only
  past `STALE_MS`). Labeled, not sold as a guarantee.
- **"a directory at `.pharn.lock` no longer wedges"** → **floor**, but narrow: it
  follows from the rename replacing the delete. The directory is moved aside, not
  removed — stated as what it is.
- **Windows (`win32`) — a named, untested platform (`docs/contributing.md`; CI is
  ubuntu-only).** `renameSync` → `MoveFileExW`: the single-winner property holds on
  NTFS, but a rename of a file another process currently has **open** fails with a
  sharing violation (a scanner or indexer can do this), where POSIX would succeed.
  That path **refuses** — fail-closed, never two holders — so on Windows a stale lock
  may occasionally need a second run or the documented manual delete. `linkSync` →
  `CreateHardLinkW`: NTFS only; on FAT32/exFAT the restore fails and the corpse is
  dropped, which is exactly today's behaviour for that same interleave — never worse.
  **Not exercised by any gate**; stated here rather than assumed away (P0/P7).
- **What is NOT claimed:** the full B→C interleave is never executed by two real OS
  processes in the suite. The tests drive it through a `renameSync` seam that
  performs the real syscall and inserts the other process's write at the instruction
  the race needs. That pins each branch's **behaviour**; it does not prove the
  kernel's atomicity, which is `rename(2)`'s to provide and which the empirical probe
  above checks separately. Named in the plan and in the test file's header comment.

## Trust audit (P2)

The lock file is local but **user-editable — untrusted input**, and the fix widens
what is read from it by exactly zero fields: `parsePayload`'s strict shape check is
unchanged and still runs before any value reaches `process.kill`. The re-verify adds
a **byte comparison** of two reads of content that was already being read; nothing
from the file reaches a filesystem path. The corpse path is built from
`process.pid` + `randomBytes`, never from file content, and is `safeJoin`-contained
like every other path in this file. The sweep matches a **regex allowlist** against
directory entry names and unlinks nothing outside it.

## Determinism audit (P5)

Every new branch is a membership/equality test, and every fallback is a hard refusal
— never a guess, never a retry loop:

- `renameSync` threw → refuse (no classification of the errno; any failure means we
  do not hold it)
- `readRawAt(corpse) !== observedRaw` → exact string equality
- `linkSync` threw → refuse anyway (the outcome is the same either way)
- `tryCreate` returned false → refuse
- sweep: `CORPSE_RE.test(name)` (regex allowlist) ∧ `age > STALE_MS` (integer compare)

## Open questions (HALT)

None. The scope was fixed by the human up front and every ambiguity that would have
needed asking — the rename/link semantics, whether `vi.mock('node:fs')` can supply
the interleave, whether `docs/troubleshooting.md`'s lock section needs a matching
edit (it does not: the break *policy* — malformed, older than six hours, dead pid on
this host — is unchanged) — was resolved by reading or probing live state this run.
