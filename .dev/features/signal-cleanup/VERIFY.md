# VERIFY — signal-cleanup

**FLOOR layer** — `check-verify.mjs` over the six gates: all 0 → **`PASS`**. `npm run build` clean.

**ADVISORY layer** — no `role: verifier` capabilities exist (P7).

**The evidence that matters is the child process.** The defect is not only the leaked directory; it is
that an interrupted run **exited 0** and looked successful to any calling script. A test that cannot
observe exit status cannot fail on that. So a real child under `tsx` fetches a clone, installs a
print-only SIGINT listener (exactly what `@clack/prompts` does while a spinner is up), and raises
SIGINT at itself.

Confirmed RED with `installCleanupHandlers()` commented out:

```
× removes the clone and exits 130 instead of reporting success
AssertionError: expected true to be false
                         ^ existsSync(dir) — the clone survived the interrupt
```

Green with the handlers in place: the dir is gone, `SURVIVED-THE-SIGNAL` is never printed (so the
print-only listener did not swallow the re-raise), and the process ends by signal / 130.

**What PASS does not cover.**

- **The raw-mode keypress path is covered structurally, not end-to-end.** Ctrl-C during a clack
  spinner is a *keypress*, not a signal — clack calls `process.exit(0)`, which the `exit` handler
  catches. That handler is tested by invoking it directly; no test drives a pty. The spec's own
  reproduction used `expect` on a pty, and that rig was not rebuilt here.
- **`SIGKILL` runs nothing**, and a hard crash still leaves the directory. No claim otherwise.
- **This is a backstop, not a replacement.** Every caller's `finally` is untouched and remains the
  primary path.
