# GRILL — codeload-tar-extract (advisory; gates nothing)

## F1 — the spec's file list is incomplete in a way that BREAKS the runtime (gap, load-bearing)

**Problem.** The spec's step 5 lists what "retire the dependency" means: `tests/degit-pin.test.ts`,
the `package.json`/lock entries, `src/degit.d.ts`, the `vitest.config.ts` exclusion, the
`scripts/build.mjs` external, a contributing note. It does not mention `src/lib/proxy-env.ts`,
because that module landed **after** the spec was written. `resolveDegitProxyRead()` calls
`createRequire(import.meta.url)('degit/package.json')` **at runtime**, on every network-bearing
command. Following the spec literally leaves five call sites emitting a warning about the measured
behavior of a package that is no longer installed.

**Reduction.** Re-grep rather than trusting the list. Both proxy modules, both their test files, and
all five call sites are in `## Files`. The failure would have been soft (the read returns null and
the message hedges) — which is worse than a crash, because it would ship prose about `degit@…` that
no longer describes anything.

## F2 — the pax_global_header is the single highest-risk detail, and no natural fixture has one

**Problem.** Every codeload tarball opens with a `pax_global_header` (typeflag `g`) whose name is a
single segment. An extractor that runs its path rules over it rejects **every real archive on its
first block** — while every fixture built with `tar cf` from a normal directory passes, because
bsdtar hides that entry and `tar tzf | wc -l` does not count it. A green suite plus a 100% failure
rate against the live remote is the worst shape a bug can have.

**Reduction.** The fixture builder emits one **by default** (`githubArchive()` prepends it), so it is
present in every extraction case rather than in one dedicated test; there is also an explicit case
asserting it is skipped, and one for the `x` variant. And the whole thing was checked against the
**live remote** — 1,640 files extracted, `SKILLS_VERSION` read, layout detected.

## F3 — reading `name` without `prefix` loses a third of the tree SILENTLY (untested axis)

**Problem.** ustar splits any path over 100 chars across `prefix` and `name`. Reading `name` alone
yields a bare leaf like `regression-report.json`, which strip-1 then rejects for having no leading
component. The install would not crash — it would produce a tree missing hundreds of files, and the
first symptom would be a capability "missing at its expected path" much later.

**Reduction.** A dedicated case builds a >100-char path, asserts it lands at its **full** path, and
asserts it did **not** land as a bare leaf at the root. The live probe's `.dev/features` count (153)
is the corroboration.

## F4 — "one resolve" needs a counting assertion, not a URL assertion (weak pin)

**Problem.** Asserting the codeload URL proves the download happened at the right SHA. It does not
prove the second resolve is gone — that was the point of the change, and a future refactor could
re-add a resolve without moving the URL.

**Reduction.** `expect(mock).toHaveBeenCalledTimes(2)` alongside the URL check.

## F5 — the temp-dir assertion is flaky by construction if written the obvious way (test defect)

**Problem.** "No temp dir left behind" invites scanning `os.tmpdir()` for `pharn-*`. vitest runs test
files in parallel and several — `helpers.ts`'s `useTmpDir` included — create `pharn-`-prefixed dirs
there. The first draft did exactly this and passed in isolation while failing in the full run.

**Reduction.** Each test gets its own `TMPDIR` (which `os.tmpdir()` reads at call time), so the only
`pharn-*` entries in scope are the ones `fetchRepo` just made.

## F6 — the proxy regression is real and must not be softened (P0)

**Problem.** A user who set lowercase `https_proxy` had a proxied clone via degit's own read. After
this change nobody is proxied, on any platform. It is tempting to file that under "made consistent".

**Reduction.** It IS partly that — `update` and `status --no-drift` were always unproxied plain
`fetch` — but it breaks a setup that worked, so `LIMITS.md` §3a, the CHANGELOG (**under `Removed`**,
not buried in `Changed`), and `docs/troubleshooting.md` each say so plainly, and the notice fires
before the fetch so the failure is explained rather than a bare timeout.

## F7 — the spec predicts a coverage DROP; measure it rather than assuming (assumption)

**Problem.** ORDER.md sequences this increment before the `5.6c` ratchet specifically because "5.3a
lowers coverage" — a new untested `tar-extract.ts` plus a deleted `degit.d.ts` exclusion.

**Reduction.** Measured: **97.1% statements** against a 90 threshold, up from the previous tree. The
premise was wrong because it assumed the extractor would arrive untested. Worth reporting, since a
dependency in the ORDER rests on it.

## Verdict

**Advisory: proceed.** F1 and F2 are the two that decide whether this works at all; both are closed
and both are corroborated by a live run against the real remote, not only by fixtures.
