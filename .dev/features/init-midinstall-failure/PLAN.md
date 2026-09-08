# PLAN — pin `init`'s mid-install failure path

- spec_content_hash: bb190512d9634b608dd43a126ceb07da6fe6e7e6d60fbfefe0930902e8798125 # fix #4
- increment: **Tests only.** `pharn init` runs everything after the fetch inside one `try` whose
  `finally` deletes the temp clone. The *success* half of that block is pinned six ways; the
  *failure* half — the `catch`, the boxed `failure` cause, the deferred `reportFatal`, and the
  `exit(1)` — is pinned nowhere. Add cases in `tests/init.test.ts` that make the two realistic
  throw sites throw (`parseCapabilityIndex`, a malformed clone; `runInstallArchetype`, a failure
  part-way through the copy) and assert exit code, cleanup, cleanup **ordering**, and the
  `PHARN_DEBUG` affordance. No `src/**` file changes.
- layer(s): `tests`
- constitution_refs: [P0, P1, P3, P4, P5, P7]

## Discovery (P6 — read live this run)

Every anchor below was re-read from disk. **The spec's line numbers are all stale**, and two of
its structural claims are stale as well — both recorded here rather than silently worked around.

**`origin/main` moved twice while this branch was in flight**, and Discovery was re-run against the
final base. It was cut at `7d96bbc`; it now sits on `4972abb`, which adds `#151` (`confirmWriteTargets`
retyped to `'proceed' | 'decline' | 'cancel'` — the spec's own conditional, now ACTIVE), `#149` (an
exit/signal backstop in `src/lib/repo.ts`) and `#152` (`ci-workflow.test.ts` only). Every anchor,
measurement and RED transcript below is from `4972abb`; `REGRESSION.md` records how the drift was
caught (the first CI run, on the merge ref, went RED on typecheck).

- **The gap is real, and measured, not assumed.** `npx vitest run --coverage tests/init.test.ts`:

  ```text
  init.ts          |   94.11 |       95 |     100 |   93.75 | 150,163-164
  ```

  Line `150` is `failure = { err };` and `163-164` are `reportFatal(errorMessage(failure.err),
  failure);` + `process.exit(1);`. That is exactly the spec's finding (it cites `99-100` and
  `106-110`), at the live numbering. The whole failure half of the block is uncovered.

- **The `catch` moved and CHANGED SHAPE.** The spec quotes a `catch` that flattens the error to a
  string and hand-rolls the debug hint:

  ```ts
  failure = err instanceof Error ? err.message : String(err);
  if (process.env.PHARN_DEBUG) console.error(err);
  ```

  Live (`src/commands/init.ts:149-153`, `:162-165`) it is a **box**, and the reporting is
  single-sourced in `src/lib/report-error.ts`:

  ```ts
  let failure: FatalCause | null = null;
  …
  } catch (err) {
    failure = { err };
  } finally {
    repo.cleanup();
  }
  …
  if (failure) {
    reportFatal(errorMessage(failure.err), failure);
    process.exit(1);
  }
  ```

  This matters for the tests: `reportFatal`'s hint is gated on the **presence of the cause box**,
  not on its contents (`src/lib/report-error.ts:86-97`), the wording lives once in
  `PHARN_DEBUG_HINT`, and the hint goes to **stderr**. The spec's "assert the actionable follow-up
  is printed" is therefore an assertion about `log.info`, matched loosely — which is what the spec
  asks for anyway.

- **The box is a testable design decision the spec did not know about.** `init.ts:106-113` (live
  `:112-119`) states
  why the cause is boxed: `throw undefined` is legal JavaScript, and a bare `failure` would read as
  "nothing failed" past the `finally` — the exact place a nullish sentinel is silently wrong. That
  claim has no test. It gets one here (eval 5); it is the same `catch`, the same variable, and the
  same exit, so it is in scope rather than an extension of it.

- **`degit` is GONE — the spec's mechanism is stale, its *shape* is not.** `package.json` declares
  no `degit` (and `node_modules/degit` is absent); `src/lib/repo.ts` resolves the branch head once
  over the GitHub API and downloads that commit's tarball from `codeload.github.com`, extracted by
  `src/lib/tar-extract.ts`. **The failure this increment pins is unaffected**, because it lives
  entirely *after* `fetchRepo` returns: `fetchRepo` still returns `{ dir, sha, cleanup }`, `init`
  still holds that temp dir across the interactive summary, and the `try/finally` at `:121-153` is
  structurally the block the spec describes. What did change is the *pre*-try failure, which the
  existing test at `:140` already covers: a fetch that throws now originates in
  `downloadArchive`/`extractTarGz`, and `fetchRepo` rm's a partially-extracted tree in **its own**
  `catch` (`repo.ts:88-93`) — so `repo.cleanup` is reachable **only for a successful fetch**, which
  is precisely the state these new cases start from.

- **A process-wide temp-dir registry NOW EXISTS, and it changes the argument** (this is the claim
  that flipped mid-run). `src/lib/repo.ts` registers every clone in a `liveClones` set drained by
  `exit`/`SIGINT`/`SIGTERM` handlers (`#149`), and `cleanup` deregisters before removing. So a
  hoisted exit no longer *leaks* the clone in production — the backstop reclaims it. That does not
  weaken the ordering pin; it is the reason for it. `#149`'s own commit message says the backstop is
  "deliberately not relied on: a backstop that hides a structural bug leaves the next stage added to
  that `try` with the same trap and nothing to catch it." The primary mechanism can now stop working
  with nothing observable to say so — which is exactly what the first-invocation-order comparison
  observes. The consequence is stated this way in the test comment, not as a temp-dir leak.

- **`confirmWriteTargets` now returns `Promise<'proceed' | 'decline' | 'cancel'>`**
  (`src/steps/overwrite-check.ts`, consumed at `init.ts:137-140`; mocked
  `async () => 'proceed' as string` at `tests/init.test.ts:68`). The spec's conditional — "if
  `4.04-init-clone-leak-on-cancel.md` has already landed, use `mockResolvedValue('proceed')`" — is
  **ACTIVE**: it landed as `#151` mid-run. The new block re-arms with `'proceed'`. That PR also adds
  a `Ctrl+C at the overwrite confirm` case to this file; it pins the *cancel* lifecycle (exit 0) and
  is disjoint from this increment's *failure* path (exit 1).

- **The mock block grew.** The spec cites `tests/init.test.ts:20-53`; live it is `:21-69` and now
  also declares `minCliGate` (`:50-56`). `unknownCapabilitiesWarning` and `detectProxyNotice` are
  **not** mocked — the real modules run — which is why the new cases must not accidentally trip a
  `log.warn` before the failure.

- **The `mockResolvedValue`-survives-`clearAllMocks` hazard the spec warns about is real and
  already documented in-file.** `afterEach` is `vi.clearAllMocks()` (`:84-87`), `vitest.config.ts`
  sets no `clearMocks`/`mockReset`/`restoreMocks`, and the declined-confirm case at `:130-138`
  leaves `confirmWriteTargets` resolving `false` for every later test. The `proxy notice` describe
  at `:199-202` re-arms both prompt mocks in its own `beforeEach` for exactly this reason. The new
  describe does the same.

- **Anchors renumbered, all confirmed live on `4972abb`:** the pre-try failure case the spec calls
  `:120` is `:167`; the cancel cases it calls `:100`/`:110`/`:112` are `:128`, `:139` (`'decline'`)
  and `:157` (`'cancel'`, the case `#151` added); the TTY-gate block it calls `:134-188` is
  `:387-435`; the static no-404 guard it calls `:225` is `:478`. A newer `fatal-error reporting`
  describe already owns the `informed()` helper and the `PHARN_DEBUG` env save/restore this
  increment needs.

## Files

- `tests/init.test.ts` — one new nested describe, `mid-install failure (inside the try/finally)`,
  with the five evals below; `informed()` is hoisted one level (from the `fatal-error reporting`
  describe to the parent) so both blocks read the same helper instead of two copies — layer `tests`
- `.dev/features/init-midinstall-failure/*` — PHARN stage artifacts — layer `docs`

No `src/**` file is touched. No `vitest.config.ts` change (5.6c owns the ratchet). No `CHANGELOG.md`
entry: nothing user-visible moves, and that file documents released behavior, not test coverage.

## Evals to write (P1)

1. **Malformed clone.** `parseCapabilityIndex` throws → `ProcessExit(1)`; `runArchetypeSummary`,
   `confirmWriteTargets` and `runInstallArchetype` all never called; `cleanup` called exactly once.
2. **The `PHARN_DEBUG` affordance is offered on that failure** — loose `/PHARN_DEBUG/` over the
   `log.info` calls, with the env var deleted and restored inside the block.
3. **Failure part-way through the copy.** `runInstallArchetype` rejects → `ProcessExit(1)`;
   `runInstallArchetype` called once (it really did get that far); `cleanup` called exactly once.
4. **Cleanup precedes the report, in both cases** — `cleanup`'s first invocation ordered before
   `log.error`'s. See the guarantee audit: this, not the call count, is what pins
   cleanup-before-exit under a stubbed `process.exit`.
5. **A thrown `undefined` is a failure, not a success** — `ProcessExit(1)`, nothing installed,
   cleanup once, and the affordance still offered (the box's presence is the axis, not its
   contents).

## Guarantee audit (P0)

- "A `catch` that silently swallowed the error would be caught" → **FLOOR.** Every case asserts
  `rejects.toMatchObject(new ProcessExit(1))`. A `catch` that returned would fall through to
  `outcome === 'cancelled'` → `cancelAndExit()` → `exit(0)`, a different code.
- "The exit is not blurred with a cancel" → **FLOOR.** Four cancel cases keep asserting
  `ProcessExit(0)` and are untouched — the summary cancel, the `'decline'`, `#151`'s `'cancel'`
  (Ctrl+C at the overwrite confirm), and the skipped-capability case — while the three new ones
  assert `1`. Both directions run in the same file.
- "`init` writes nothing on a malformed clone" → **FLOOR.** `runInstallArchetype` is the only
  writer and it is asserted never called (eval 1). These are command-level tests with the writer
  mocked; the real-filesystem install e2e stays in `tests/init-archetype.test.ts`.
- "The temp clone is deleted even when the flow throws" → **FLOOR.**
  `expect(cleanup).toHaveBeenCalledTimes(1)`.
- "…and deleted **before** the exit" → **FLOOR only because of eval 4, and only in one direction.**
  The call-count assertion the spec proposes CANNOT see this: `stubProcessExit` makes
  `process.exit` **throw**, and a throw inside the `catch` still unwinds through the `finally`, so
  a regression that moved `process.exit(1)` up into the `catch` would leave `cleanup` called
  exactly once and every count-based assertion green. Nor would the *consequence* show: since
  `#149`, `lib/repo.ts`'s exit/signal backstop reclaims the clone anyway — which is the point, not
  a mitigation, because a backstop that hides a structural bug is exactly what `#149` said it must
  not become. Eval 4 compares `mock.invocationCallOrder` instead, which does discriminate. This is
  the increment's sharpest pin and it is NOT the one the spec named.
- "The `PHARN_DEBUG` hint is offered on an exception" → **FLOOR, loosely.** `/PHARN_DEBUG/` over
  `log.info`. Deliberately not the sentence: the wording is `report-error.ts`'s
  (`PHARN_DEBUG_HINT`), and a test that re-encoded it would fail on a rewording that broke nothing.
- "…and the hint reaches **stderr**" → **NOT pinned here.** `reportFatal`'s stream contract is
  already pinned at `tests/init.test.ts:196` for the fetch failure and in the `report-error` unit
  tests. Re-asserting it per call site would pin the reporter, not `init`.
- "The failure MESSAGE is useful" → **NOT floor-verifiable, deliberately.** No case asserts a
  `log.error` string; message wording belongs to `4.06-network-error-messages.md`.
- "Every throw site inside the `try` is covered" → **PARTIAL.** Two of the four are exercised
  (`parseCapabilityIndex`, `runInstallArchetype`). `resolveCapabilities` and
  `unknownCapabilitiesWarning` are not: they reach the same `catch` through the same straight-line
  statement sequence, so a third and fourth case would add coverage of the mock, not of `init`.
  Stated, not hidden.
- "Coverage of `init.ts` reaches 100%" → **MEASURED, not asserted.** The floors in
  `vitest.config.ts` are untouched here (5.6c owns them), so nothing in CI *requires* these lines
  to stay covered. The pin is the assertions, not the percentage.

## Trust audit (P2)

No untrusted input is introduced. The thrown values are literals authored in the test file. The one
value that models untrusted input — the `ManifestValidationError` a malformed clone's frontmatter
produces — is deliberately modelled as a plain `Error`: the pin is the `catch`, not the error class,
and importing `capability-index.ts` for its class would re-import a module the suite mocks.

## Determinism audit (P5)

No clock, no network, no filesystem write. `mock.invocationCallOrder` is a monotonic counter vitest
increments per call across all mocks in a run — deterministic within a test, and the suite's
`afterEach` clears history so the compared indices always come from the same run.

## Out of scope (P7)

- **`src/commands/init.ts` is not modified.** The spec's acceptance criteria say so, and the whole
  value of a test-only increment is that it pins behavior that is already there.
- **`vitest.config.ts` coverage floors** — `5.6c-add-coverage.md` ratchets them, once, later.
- **The clone leak on cancel** (`4.04`) — landed mid-run as `#151`. It is the *cancel* path
  (exit 0) and a behavior change; this is the *failure* path (exit 1). Its four cancel cases,
  including the `Ctrl+C at the overwrite confirm` one it added, stay exactly as they are.
- **Rewording any failure message** — `4.06`.
- **`update`'s and `add`'s untested paths** — `5.6a` / `5.6c`.
- **The stale `degit` comments** in `src/commands/init.ts:37,77-86` and four sibling commands, now
  contradicted by `src/lib/proxy-env.ts:24` ("With degit retired…"). Real, adjacent, and a `src`
  edit this increment is not licensed to make. Filed in `REVIEW.md`.

## Open questions (HALT)

- None. The spec's one conditional (`confirmWriteTargets`'s return type) was resolved by reading
  live state — twice. At branch time it was still `boolean`; `#151` retyped it mid-run, and the
  block re-arms with `'proceed'`. The lesson is recorded in `REGRESSION.md` rather than buried: on a
  repo merging this fast, "read live" has a shelf life, and CI's merge-ref build is what catches its
  expiry.
