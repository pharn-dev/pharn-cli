# GRILL — signal-cleanup (advisory; gates nothing)

## F1 — the defect is the EXIT CODE, so an in-process test cannot see it (gap)

**Problem.** The natural test is "call the handler, assert the dir is gone". That covers half the
finding. The half that actually bites a user is that an interrupted `pharn init` **exited 0** and
looked successful to whatever script invoked it. A test that never observes exit status cannot fail on
that regression.

**Reduction.** A real child process under `tsx`, sent a SIGINT after `fetchRepo` returns, asserting
three things at once: the dir is gone, a print-only clack-like listener did **not** swallow the signal,
and the process ended by signal / 130. Verified RED with the handlers disabled.

## F2 — a once-only latch makes the test suite order-dependent (test defect, hit for real)

**Problem.** `handlersInstalled` is module state. The first test to call `fetchRepo` installs the
handlers; every later test in the same module instance sees "already installed" and its
before/after listener count is identical — so the once-only assertion passes vacuously, and the
"removes a live clone" test has no handler to capture. The first draft did exactly this and two cases
failed for reasons that had nothing to do with the code.

**Reduction.** `vi.resetModules()` + a fresh dynamic import per test, with the listeners each instance
adds removed in `afterEach` so they cannot accumulate across the file.

## F3 — re-raising into a surviving listener hangs the process (correctness)

**Problem.** `process.kill(process.pid, sig)` re-enters the same signal. `@clack/prompts` installs a
SIGINT listener that prints and returns; if it is still attached, the re-raise is handled instead of
terminating, and the process hangs — a worse outcome than the leak.

**Reduction.** `removeAllListeners(sig)` immediately before the re-raise. The child test asserts the
print-only listener did not keep the process alive, so this is covered rather than merely reasoned.

## F4 — deregistering after the rm would let a disposed dir be rm'd twice (ordering)

**Problem.** If `cleanup()` removes the directory before deregistering, a handler firing in between
sees a stale entry. `rmSync(..., {force: true})` tolerates a missing path, so this is benign today —
but mkdtemp names are unique only by chance, and "only by chance" is not a guard against rm'ing a path
this process no longer owns.

**Reduction.** `liveClones.delete(dir)` first, in both `cleanup()` and the failure `catch`; a test
asserts a post-`cleanup()` handler run does not throw.

## F5 — the spec describes a dependency that no longer exists (drift)

**Problem.** The spec's invariants section pins `{ force: true, cache: false }` degit options and "the
degit ref". `5.3a` removed degit entirely before this increment ran.

**Reduction.** The lifecycle defect is unchanged — a `mkdtempSync` dir disposed by a closure — so the
fix applies verbatim; only the spec's surrounding prose is stale. Recorded rather than silently
skipped.

## F6 — the startup sweep is the one part worth NOT doing (scope)

**Problem.** The spec offers a conservative sweep of stale `pharn-XXXXXX` dirs. It is a new
**deletion surface outside the user's project**, keyed on a filename pattern, guarded only by mtime
and uid.

**Reduction.** Declined. The leak is closed at the source, so the stale set stops growing, and the OS
reclaims `tmpdir` on every platform pharn supports. Adding a deleter for a set that no longer accrues
buys little and risks a lot — the same call `5.3b` made about the degit cache.

## Verdict

**Advisory: proceed.** F1 shaped the evidence, F2 was a real bug in the first draft of the tests, and
F3 would have been a hang in production.
