# REVIEW — signal-cleanup

## Lens 1 — P0 (claim only what is verified)

**PASS.** The strong claim — an interrupted run cleans up *and reports 130* — is carried by a child
process that observes the exit status, and was shown RED with the handlers disabled. The weaker one is
labelled: the raw-mode Ctrl-C path (a keypress, not a signal) is covered by the `exit` handler tested
in isolation, not by a pty rig, and `VERIFY.md` says so. `SIGKILL` and hard crashes are explicitly not
claimed.

## Lens 2 — P3 (a backstop is not a replacement)

**PASS.** Every caller's `finally` is untouched; this adds a net underneath. The module comment says
which two exits a `finally` cannot see and why, so the next reader does not "simplify" the duplication
away. It also names `4.04` as owning the `cancelAndExit` fix, so the byproduct coverage here cannot be
mistaken for that work being done.

## Lens 3 — correctness of the signal path

**PASS, and one detail would have been a production hang.** Re-raising re-enters the same signal, and
`@clack/prompts` leaves a listener that prints and returns — if it survived, the re-raise would be
handled rather than fatal and the process would hang, which is worse than the leak being fixed.
`removeAllListeners(sig)` precedes the re-raise, and the child test asserts the print-only listener did
not keep the process alive.

Ordering is right too: `liveClones.delete(dir)` happens **before** the `rmSync` in both `cleanup()` and
the failure `catch`, so a handler firing in between cannot act on a disposed entry. Benign today
(`force: true` tolerates a missing path), but mkdtemp names are unique only by chance.

## Lens 4 — P7 (decline the part that adds risk)

**PASS.** The spec's optional startup sweep of stale `pharn-XXXXXX` dirs is deliberately not built: it
is a new deletion surface **outside the user's project**, keyed on a filename pattern, for a set that
stops growing the moment the leak closes — and the OS reclaims `tmpdir` on every supported platform.
Same call `5.3b` made about the leftover degit cache.

**Advisory finding (low).** `tests/support/tar-fixture.ts` duplicates the ustar writer that
`tests/tar-extract.test.ts` and `tests/repo.test.ts` each already carry. It was extracted because the
child process needs the *same bytes* in a different process, and a drifting fixture there is the
hardest kind to debug. Folding the other two onto it is a tidy-up, not this increment's job.

## Floor-gate vs advisory split

- **Floor:** six gates green + `build`; `validate.mjs` 0; the child-process test, shown RED without the fix.
- **Advisory:** one low finding (fixture duplication).
