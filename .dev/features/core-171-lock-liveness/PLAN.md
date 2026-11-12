# PLAN — core-171-lock-liveness (Linear CORE-171, C3.3)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: the project lock never deletes another run's lock (`release()` unlinks only a payload that is provably ours), and a live holder on the same host is never broken by age (liveness + a boot-time check decide; `STALE_MS` covers only locks from other hosts).
- base: origin/main @ 99cc1c1 (0.18.5); branch `pharndev/core-171-c33-the-project-lock-never-deletes-another`
- layer(s): CLI source (`src/lib/project-lock.ts`, one comment in `src/commands/init.ts`), tests, docs (`docs/troubleshooting.md`, `CLAUDE.md`, `CHANGELOG.md`)
- constitution_refs: [P0, P1, P2, P5, P7]

## Defect (verified at 99cc1c1)

- `release()` (`src/lib/project-lock.ts:557-566`) runs `rmSync` whenever `readPayload` returns `null`. Our own lock always parses once `tryCreate` returned, so that branch only deletes ANOTHER process's lock (one between its `O_EXCL` create and its payload write, after ours was broken).
- `isStale()` (`:299-314`) checks `-startedIn > STALE_MS` BEFORE `isDead`, so a live same-host holder older than 6 h is broken. The `add` picker holds the lock across a prompt today; C5.2 will hold it across every prompt.

Owner decision (ticket, 2026-11-11) is settled and not reopened: same host → liveness + boot check; other host → `STALE_MS`; null / far-future → unchanged grace rule. The "age rule + re-check after each prompt" alternative is NOT taken. CORE-187 (C6.2) has not landed, so this is not a duplicate; `checkLegacyLock` keeps calling `isStale` and inherits the new rule (intended).

## Files

- `src/lib/project-lock.ts` —
  - `import { hostname, uptime } from 'node:os'`.
  - `release()`: unlink only when the payload parses AND `pid === process.pid` AND `host === hostname()`; a null payload (unparseable/unreadable/absent) leaves the file. Idempotent, never throws. Docstring rewritten (consequence named: a garbage file left behind is broken by the next run once past `MALFORMED_GRACE_MS`).
  - `isStale()` in order: (a) `held === null` or `startedAt > now + FUTURE_SKEW_MS` → `ageMs === null || ageMs >= MALFORMED_GRACE_MS` (unchanged; the "why here, not in `parsePayload`" comment rewritten: `release()` no longer deletes a null payload, so the reason is now that a future check at parse time would make `release()` fail to recognise — and strand — our own lock after a backward clock step, and `refusal()` could no longer name the holder); (b) `held.host !== hostname()` → `now - startedAt > STALE_MS`; (c) same host: `bootMs()` → when finite, stale iff `Date.parse(startedAt) < bootMs - FUTURE_SKEW_MS`; (d) else `isDead(held)` whatever the age.
  - new private `bootMs(): number | null` — `uptime()` in a try; returns `Date.now() - up * 1000` only when `Number.isFinite(up) && up > 0`, else `null` (a 0, NaN, ±Infinity or throw must never make a lock stale; `bootTime === now` would read every lock as before-boot).
  - Comments rewritten: module header "Stealing" bullet (malformed/future; other host older than `STALE_MS`; same host: pid provably dead, or started before the last boot) and the PID RECYCLING paragraph (residual now lasts until a reboot or a manual delete, not ≤ 6 h; NEW named residual (P0): a host with no battery-backed clock, or a large NTP step after boot, can make a live lock look like it started before boot → broken; the `FUTURE_SKEW_MS` margin absorbs small steps and only ever errs toward refusing); `STALE_MS` docstring (only locks from another host); `isDead` docstring (age retires only foreign locks); `withProjectLock` docstring ("why STALE_MS is a generous six hours" → the picker's hold is safe because age never breaks a live same-host holder; `STALE_MS` stays generous for another host's picker); `onExit` PREMISE comment (state that a prompt held under the lock is never age-broken on the same host, so the premise is about exit codes only — the 0→130 mapping). The corpse sweep's use of `STALE_MS` is left alone (it ages corpse files, not live holders).
- `src/commands/init.ts` — comment only (`:415`): "for up to STALE_MS (6h)" → "for as long as the prompt stayed open (a live holder on the same host is never broken by age)". _Beyond the brief's file list; comment-only, it states the old rule. Approve or strike at GATE 1._
- `tests/project-lock.test.ts` —
  - partial `vi.mock('node:os')` (real module spread, `default: real`), `uptime` a `vi.hoisted` `vi.fn` defaulting to 30 days; `afterEach` resets it to the default.
  - re-point 'breaks a lock whose startedAt is older than the stale window' → host `${hostname()}-elsewhere` (intent kept: AGE alone retires it; a dead pid would not isolate age) and rename the title to say "from another host".
  - re-point 'a STALE root lock (a crashed old run) is broken…' → dead pid `2147483646` (intent: a crashed old run).
  - NEW `describe('withProjectLock — same-host liveness decides, not age (CORE-171)')`: live pid + `startedAt` 7 h ago + uptime 30 d → refused, file untouched; dead pid + 7 h → broken; other host + `STALE_MS + 1 h` → broken; uptime 1 h + `startedAt` 2 h ago (live pid) → broken; `startedAt` = computed boot − 2 min (inside margin, live pid) → refused; uptime `0` and `NaN` (and a throwing `uptime`) with live pid + 7 h → refused.
  - NEW release test: `withProjectLock` callback overwrites `pharn/.lock` with garbage → after return the bytes are unchanged; a second `withProjectLock` (inside the grace window, mtime fresh) → `ProjectLockedError`.
  - comment fix at `:703-705` ("and `release` deletes an unparseable lock" is no longer true; the test still pins that the signal cleanup is deregistered).
  - F-39 'breaks a far-future lock with a live pid once the file is past the grace window' — unchanged, must pass.
- `tests/project-lock-break.test.ts` — same partial `node:os` mock (it already does `await import('node:os')` after mocking `node:fs`); one race-free case: a same-host live-pid lock 7 h old is refused, not broken, and no `renameSync` reaches it (seam `before` throws if called). Existing cases plant `startedAt: now` with a dead pid and keep passing.
- `tests/project-lock-commands.test.ts` — same partial `node:os` mock; re-point 'breaks a stale lock rather than wedging the project forever' → dead pid `2147483646` (intent: the holder was SIGKILLed a week ago).
- `docs/troubleshooting.md` — "If the lock outlives its owner": replace "it is more than six hours old" with three rules (another host and more than six hours old; a pid not running on this host; started before this host last booted); rewrite "A recycled pid keeps a dead run's lock alive" (until a reboot; `ps -p <pid>` → delete `pharn/.lock` stays); one sentence on the clock-correction case; "A lock from another host is only retired by age" kept.
- `CLAUDE.md` — `lib/pharn-config.ts` paragraph: "a recycled pid keeps a dead run's lock live until `STALE_MS`" → the new rule (same host: liveness + boot check, never age; another host: `STALE_MS`; recycled pid lasts until a reboot); and "because `release` unlinks on a null payload" → `release` unlinks only a payload that is provably ours (otherwise this sentence would state a removed behaviour). If a hook refuses the edit: a patch script for the user, never a bypass.
- `CHANGELOG.md` — `## [Unreleased]` gains `### Fixed` AFTER the existing `### Security` (the file's most recent multi-section release, 0.13.0, orders Added → Changed → Security → Fixed): bold one-sentence claim, then a live same-host holder is never broken by age, a lock from before the last boot is broken, `release` never deletes a lock it cannot prove is its own, and the recycled-pid residual now lasts until a reboot. No version bump (0.19.0 batch).

## Contracts satisfied

- `CLAUDE.md` "`lib/pharn-config.ts`" lock paragraph and the project-lock module's own contract: FAIL FAST, no retry loop, a refusal never deletes the lock it refused on — cited, not restated.
- "When changing behavior, update the matching test before touching code" (`CLAUDE.md` § Testing) — tests land first and are run RED.

## Evals to write (P1) — tests first, each must FAIL before the code change

- same host, live pid, 7 h, uptime 30 d → refused (FAILS today: age breaks it).
- same host, dead pid → broken (passes today; pins the row).
- other host, `STALE_MS + 1 h` → broken (passes today; pins the row).
- same host, live pid, `startedAt` before boot (uptime 1 h, started 2 h ago) → broken (FAILS today: 2 h < 6 h and pid alive).
- same host, live pid, boot − 2 min → refused (passes today; pins the margin).
- uptime 0 / NaN / throws, live pid, 7 h → refused (FAILS today via the age rule).
- release leaves garbage bytes in place; second acquire refused (FAILS today: release deletes it).
- break-suite: 7 h live same-host lock → refused, no rename (FAILS today).
- re-pointed tests (other host / dead pid) → still broken (pass both before and after; they no longer pass via age-on-a-live-pid or the boot rule).

## Guarantee audit (P0)

- "`release()` never deletes a lock it cannot prove is its own" → floor-ish: a deterministic membership test on parsed `pid`/`host` before `rmSync`; pinned by test. Residual named: the read and the unlink are two syscalls — a lock broken and re-taken by another run in between is still deleted (unchanged from today; narrows to the case the payload changes in that gap).
- "a live same-host holder is never broken by age" → deterministic branch order in `isStale`, pinned by tests with a mocked `uptime`. Advisory boundary: liveness is `kill(pid, 0)`, so a recycled pid reads live (residual, now until reboot — named in the module header + troubleshooting).
- "a lock from before the last boot is broken" → depends on `os.uptime()` and the wall clock: ADVISORY w.r.t. clock correctness. Named residual: no battery-backed clock / large NTP step after boot → a live lock can look pre-boot and be broken; the 5-min margin absorbs small steps only.
- "a 0/NaN/throwing uptime never makes a lock stale" → deterministic guard (`Number.isFinite(up) && up > 0`), pinned by tests.
- No claim that the lock is a mutex across hosts beyond what `STALE_MS` already says.

## Trust audit (P2)

- `pharn/.lock` and the legacy root lock are local, user-editable, untrusted: `parsePayload` still shape-checks `pid` before any `process.kill`; the new branch reads only `host` (string compare) and `startedAt` (already `Date.parse`-validated). A hand-edited `startedAt` far in the past on this host with a live pid now reads stale via the boot rule — the effect is a break, the existing "errs toward not wedging" outcome, never a signal to an arbitrary pid. `release()` gains a stricter guard; no new taint path.

## Determinism audit (P5)

- Every branch is a membership/comparison test: null-or-future → grace; host equality → age rule; `bootMs() !== null && started < bootMs - FUTURE_SKEW_MS` → stale; else `isDead`. No fallback guesses: an unusable `uptime` falls through to liveness (the refusing side).

## Resolved questions (none open)

- Order of `### Fixed` vs `### Security` under Unreleased → after Security (0.13.0 precedent).
- Which tests need time control → the three named files; `uninstall.test.ts`/`update.test.ts` plant `startedAt: now` and need nothing.
- Out-of-list comment edits (`src/commands/init.ts:415`, `tests/project-lock.test.ts:703-705`, the CLAUDE.md `release`-unlinks clause) → included because each would otherwise state the removed rule; flagged at GATE 1.
