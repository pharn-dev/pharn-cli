# REVIEW — project-lock

## Lens 1 — P0 (what is guaranteed vs. what is hoped)

**PASS.** The guarantee audit refuses three tempting overstatements: this is an **advisory** lock
(nothing stops a non-pharn writer), it makes **no** cross-machine claim, and age **can** retire a
live foreign-host lock after six hours. That last one is a real hole, named rather than papered over,
and justified: wedging a project forever is the worse failure mode, which is why the held window is
kept short enough that a six-hour lock is overwhelmingly a corpse.

## Lens 2 — P2 (the lock file is untrusted input)

**PASS, and this is where the sharp edge is.** The payload is user-editable and its `pid` is fed to
`process.kill`. `parsePayload` rejects anything that is not a positive integer **before** the value
can reach it, and a test plants a *string* `"1"` — pid 1 is alive on every platform — to prove
validation ordering rather than assert it. Reading follows `readRecords`' discipline: every failure
collapses to "not a usable payload", none throws, and malformed means **stale**, so a corrupt lock can
never wedge a project.

Two correctness branches a plausible implementation gets backwards are handled and tested: `EPERM`
means *alive under another user*, not dead; and pid liveness is only consulted when `host` matches, so
a foreign-host lock is never stolen on liveness grounds.

## Lens 3 — P3 (one axis, and where the calls go)

**PASS.** One module, one entry point, `node:fs` + `node:os` only — no dependency, matching the
repo's posture. The call-site placement is the load-bearing decision: **after** the last prompt (so a
held lock never blocks an agent hook behind a human) and **after** the fetch (because `update`'s
fetch-failure path exits with no `finally`, and a lock taken earlier would be stranded on every
offline run — the most common failure that command has).

`add`'s picker takes **one** lock for the whole loop rather than one per pick, because the per-name
path persists on every iteration and a per-pick lock would leave exactly the gaps this exists to
close.

## Lens 4 — P7 (the sidecar must not become part of the install)

**PASS.** `.pharn.lock` is in no manifest, no conflict set, and no record store — verified by grep —
so `status` reports no drift on pharn's own lock and `init` never lists it as a write target. It is
not a config field. `list` and `status` neither take it nor import the module, so `status --strict`
stays runnable in CI while an update holds it.

**Advisory finding (low).** `update` warns when `.pharn-backup/` is not gitignored; `.pharn.lock` gets
no equivalent warning. It is transient by design, so in the normal case there is nothing to ignore —
but a crashed run leaves one until it goes stale. Documented in troubleshooting rather than warned
about, to avoid adding a second gitignore nag.

**Advisory finding (low).** The refusal is fail-fast by contract, so a user running two commands
back-to-back in a script must sequence them. That is the spec's explicit choice over a retry loop.

## Floor-gate vs advisory split

- **Floor:** six gates green + `build`; `validate.mjs` 0; 22 new tests across three files.
- **Advisory:** two low findings above; neither blocks.
