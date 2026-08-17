# GRILL — degit-fetch-boundary-truth

> **Written retrospectively.** `/pharn-dev-grill` belongs *before* `/pharn-dev-build`; in this run the
> build had already happened when it was written. That ordering failure is recorded in `SHIP.md` and is
> not smoothed over here. A retrospective grill cannot do the one thing a real grill does — change the
> plan before it is executed — so these findings are logged as what a pre-build grill *would* have
> caught, and two of them **did** materialize.

Advisory. Gates nothing.

## Findings

### G1 — the brief's `THREAT-MODEL.md` instruction was impossible, and the plan initially inherited it — **severity: major, MATERIALIZED**

The build prompt said `THREAT-MODEL.md` is `DEFAULT_PROTECTED` and to "scope via the setter, never a
bypass." Those two clauses contradict each other: `protect-trusted-paths.cjs:58` lists the file in
`DEFAULT_PROTECTED`, and `PHARN_PROTECTED` (`:59-63`) composes **by addition only** — there is no
subtraction and no scope-based exemption, so the setter *cannot* grant that write. A pre-build grill
should have caught this by reading the hook rather than trusting the brief's characterization of it.

*What happened:* caught during build, before any write was attempted, and resolved via the #93
`*.UPDATED.md` handoff precedent. No bypass occurred. Cost: one detour.

### G2 — the plan's `## Files` under-declared, guaranteeing a scope-check failure — **severity: major, MATERIALIZED**

`## Files` listed the handoff artifact but not `THREAT-MODEL.md` itself (which the human would
necessarily touch when applying it), and omitted `.pharn/writes-scope.json` (which every stage's Step 0
setter rewrites). `check-regress.mjs scope` compares changed paths against exactly that list.

*What happened:* the first scope check exited **1** with both files reported as escapes. #93 hit the
identical class of failure and resolved it the same way — by declaring, not suppressing. A grill that
had read #93's `REGRESSION.md` would have predicted this precisely.

### G3 — the brief's probe recipes were platform-wrong and instrument-wrong — **severity: major, MATERIALIZED**

Two recipes could not have produced a valid measurement:

- `rm -rf ~/.cache/degit` is the **linux** branch. On darwin the path is `~/Library/Caches/degit`, and
  `XDG_CACHE_HOME` is not consulted there at all. Run as written, H1 would have measured an empty
  directory and concluded nothing was written.
- "Walk the dep tree / `npm ls isomorphic-git`" has nothing to walk: degit declares **no**
  `dependencies`. The real cause of the brief's own "Trap 2" was that `dist/index.js` is a 59-byte
  re-export stub.

*What happened:* both caught during Phase A and corrected. A vacuously-green H1 was the near miss.

### G4 — the guarantee audit needed a line it did not initially have — **severity: minor**

The increment's central deliverable is *prose accuracy*, which is **not** floor-reducible. The plan's
guarantee audit does label it `ADVISORY` with the evidence record as backstop — correct — but the
stronger backstop (independent adversarial re-verification of each claim against the installed
dependency, rather than the author re-reading their own greps) was not planned and was added only at
review time.

### G5 — no test covers the corrected comments — **severity: nit, accepted**

P1 says no behavior ships without a test. Nothing here is behavior: the delta is prose plus comment
lines, and the comments-only diff instrument proves it mechanically. A comment cannot regress in a way
`vitest` could observe. Accepted rather than fixed.

### G6 — the version the doc names could drift out from under it — **severity: minor, open**

`THREAT-MODEL.md` §2 now states facts "measured at `degit@3.6.6`". `package.json` declares `^3.6.1`, so
a future `npm install` can move the installed version without touching the doc, and nothing in the
floor notices. This is the same structural weakness §4b names for the tar guards ("a degit change could
remove them without any pharn test noticing"). Named honestly in the doc; **not** solved by it.

## Verdict

Advisory — proceeds regardless. Three findings materialized (G1, G2, G3), all caught and resolved
before or during build, none of them silently. G6 remains open by design and is documented in the
shipped text.
