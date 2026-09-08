# GRILL — npm-run-dev (advisory; gates nothing)

## F1 — the spec's own line numbers are stale, and one of its claims is wrong (drift)

**Problem.** The spec cites `README.md:132` (the line is now 134) and says `CLAUDE.md` asserts the
absence of a `dev` script "in two places". A live `grep -n` finds exactly **one** (`CLAUDE.md:14`).
Editing a second, imagined site would either be a no-op or damage unrelated prose.

**Reduction.** Discovery re-read all four files this run; the plan names one CLAUDE.md site. The
repo's own cross-cutting rule ("numbers in prompts are pre-PR-4; read from disk") is the reason this
was caught rather than trusted.

## F2 — the test can pin spelling but not behavior (honest scope)

**Problem.** "`npm run dev -- init` forwards `init` through to minimist exactly like the built binary"
is the spec's justification for the preferred option, and no test in the plan demonstrates it. A pin
on `scripts.dev`'s tokens proves the script exists and names the right entrypoint — nothing more.

**Reduction.** None taken, deliberately: proving the forwarding means spawning an interactive CLI in
a test, which this repo does not do anywhere. The guarantee audit downgrades the claim to PARTIAL
rather than the plan implying a coverage it lacks. **Do not** let a reviewer read the green test as
"the dev script was executed".

## F3 — a new script is a new way to become a CI gate (invariant, worth a negative pin)

**Problem.** The six CI job names are a ruleset contract. `tests/ci-workflow.test.ts` pins the
workflow side (exactly six jobs, one script each). Nothing pins the *package.json* side — a future
edit could wire `dev` into a job's `run:` list, and only the workflow test would notice.

**Reduction.** The plan adds a negative membership assertion (`dev` is not one of the six gate
scripts). It is cheap, and it states the invariant at the place a contributor adding a script will
actually look.

## F4 — adding the script makes two docs correct without editing them (scope check, in favor)

**Observation, not a defect.** The alternative fix (rewrite both doc lines to `npx tsx src/index.ts`)
touches `docs/contributing.md:16` — the exact table `5.5b` rewrites next. Taking the script option
keeps the two prompts off the same lines and honors the spec's "land this one first" instruction with
less to reconcile.

## F5 — `prepack` / `prepublishOnly` must stay untouched (invariant)

**Problem.** The spec names these explicitly. A `dev` script wired into either would run an
interactive CLI during publish.

**Reduction.** The plan's `## Files` does not include them; verify by diff that `package.json`'s only
change is the added key.

## Verdict

**Advisory: proceed.** F1 changes what gets edited (one CLAUDE.md site, not two). F2 is a scope
correction to the roll-up, not to the build. F3 adds one assertion.
