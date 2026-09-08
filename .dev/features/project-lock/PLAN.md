# PLAN — an advisory single-writer lock on the project

- spec_content_hash: 0c72c635f912bd0a14e78bad99bd9c46d86f22355d4e0f2185534dfcad10ee80 # fix #4
- increment: One new module, `src/lib/project-lock.ts`, held across the write phase of `init`/`add`/`remove`/`update`. A second pharn process fails fast with a named refusal instead of interleaving. Breaks a STALE lock rather than wedging; never deletes a lock it does not own; zero-cost for `list`/`status`.
- layer(s): `src/lib` (new), `src/commands` (4 call sites), `tests`, `docs`
- constitution_refs: [P0, P2, P3, P5, P7]

## Discovery (P6 — read live this run)

- `grep -rn "O_EXCL|flock|lockfile|\.lock" src/` → **nothing**. No lock anywhere.
- The four write commands all end in the same persist pair (records → config), each individually
  atomic since `5.1e` — but the PAIR is not a transaction and neither is the copy that precedes it.
- `src/lib/update-decision.ts` — skipped and unchanged files carry **plan-time** hashes straight
  through to persist with no re-read of disk. That is why the stamp cannot catch the interleave.
- `src/lib/backup.ts:25` — `export const BACKUP_DIR = '.pharn-backup';` is the shape to mirror for a
  root-relative sidecar constant.
- `src/lib/install-records.ts` — `readRecords` is the shape to mirror for parsing a user-editable
  local file: every failure mode named, none of them throwing.

## The failure being prevented

Not a torn file. A backs up and overwrites F; B — planned against the pre-A snapshot — overwrites F
again and persists records claiming its own hash; A persists ITS records + config **last**, recording
a hash for bytes B replaced. The store then disagrees with disk **under a matching stamp**, which is
exactly the state the stamp exists to detect. The stamp only catches an interleave that SPLITS one
process's records/config pair; when one pair lands last and intact, the result is a silently-wrong
drift baseline with no crash and no warning.

## Files

- `tests/project-lock.test.ts` — NEW, the module in isolation (17 cases) — layer `tests`
- `tests/project-lock-commands.test.ts` — NEW, the end-to-end refusal against real dirs — layer `tests`
- `src/lib/project-lock.ts` — NEW — layer `lib`
- `src/commands/{init,add,remove,update}.ts` — acquire + route the refusal — layer `commands`
- `tests/add.test.ts`, `tests/remove.test.ts` — fixture adjustments + a wiring pin — layer `tests`
- `docs/troubleshooting.md`, `docs/reference/pharn-records.md`, `CHANGELOG.md` — layer `docs`

## Where exactly the lock is taken

**After that command's last prompt, and after the fetch.** Holding across an unanswered `confirm`
would block an agent hook for as long as a human takes to answer, and a short held window is what
lets `STALE_MS` stay short. Not before the fetch either: `update`'s fetch-failure path ends in
`process.exit(1)` with **no** `finally`, so a lock taken before it would be stranded in the project
root on every offline / rate-limited / DNS failure — the most common failure that command has.

`add`'s picker takes **one** lock for the whole selection loop, not one per pick: the per-name path
persists config + records on every iteration, so a per-pick lock would leave gaps between picks.

## Evals to write (P1)

- Round-trip leaves no file; the payload carries pid/host/command/startedAt.
- A live lock → `ProjectLockedError` naming pid, host and the escape — and the refusal does **not**
  delete the lock it refused on.
- Stale by age → broken. Same-host dead pid → broken. **Foreign-host dead-looking pid → NOT broken
  on liveness grounds** (a pid means nothing across machines).
- Six malformed-payload shapes → all treated as stale.
- A string pid is rejected on SHAPE before anything reaches `process.kill` — a hand-edited lock must
  not turn `pharn` into a signal-sending primitive.
- Release never deletes a foreign lock; release is idempotent; release runs when `fn` throws.
- End-to-end: `remove` under a held lock exits 1, writes no config, leaves the capability on disk;
  a normal run leaves no lock; a week-old lock is broken.

## Guarantee audit (P0)

- "two processes cannot interleave their writes" → **FLOOR on one host, for cooperating processes.**
  `O_EXCL` is atomic on POSIX and Windows. It is **advisory**: nothing stops a non-pharn writer, and
  the spec explicitly excludes NFS/cross-machine safety.
- "a stale lock cannot wedge the project" → **FLOOR**: three independent break rules, each tested.
- "a lock is never stolen from a live holder" → **PARTIAL, and the gap is named.** Age alone can
  retire a genuinely live foreign-host lock after `STALE_MS`. That is a deliberate trade: wedging
  forever is the worse failure. Six hours is generous precisely because the held window is short.
- "`status`/`list` are unaffected" → **FLOOR by construction** — neither imports the module.
- "the lock never shows as drift" → **FLOOR**: it is in no manifest, conflict set, or record store.

## Trust audit (P2)

The lock file is **local but user-editable — untrusted**. Parsed like `readRecords`: every failure
collapses to "not a usable payload" and none throws. `pid` is shape-checked (positive integer)
**before** it can reach `process.kill`. Path via `safeJoin`. No network, no new dependency —
`node:fs` + `node:os` only.

## Determinism audit (P5)

Three membership/comparison rules for staleness; `kill(pid, 0)` is an existence test, not a signal,
and `EPERM` (exists, other user) is correctly NOT dead. Retry is exactly once — a second `EEXIST`
is a refusal, never a loop.

## Out of scope (P7)

- Torn-write atomicity (`5.1e`, already landed) — complementary, not folded in.
- Signal handlers (`5.2c`, landed) — the staleness break already makes a signal-leaked lock
  self-healing; no `process.on` here.
- Cross-machine / NFS-safe locking, any lock library, a lock on `list`/`status`, and any
  retry-with-backoff: the contract is fail fast with a named message, not wait.

## Open questions (HALT)

- None.
