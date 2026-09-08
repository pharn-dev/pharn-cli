# REVIEW — init-midinstall-failure

## Lens 1 — P0 (do not claim more than is verified)

**PASS, with four claims written down as limits rather than glossed.**

1. `src/commands/init.ts` reaching **100%** statements/branches/lines/functions is a *measurement*
   taken this run, not a gate. `vitest.config.ts` is untouched, so CI does not require it to stay
   there; the coverage ratchet is 5.6c's. A future edit could re-open the failure half and no gate
   would notice — only the three new assertions would.
2. Everything asserted about "cleanup happens before the exit" is measured against a **stubbed**
   `process.exit` that throws. It is a faithful proxy — BREAK 2 shows the ordering assertion
   discriminates where the count does not — but no vitest suite can observe real Node skipping a
   `finally`.
3. **The pin's headline symptom no longer exists, and the writing was corrected rather than left
   overstated.** Since `#149`, `lib/repo.ts`'s exit/signal backstop reclaims the clone even when a
   `finally` is skipped, so a hoisted exit does not orphan a temp dir any more. The test comment,
   the plan's guarantee audit and the PR body all now say what the pin actually buys: the primary
   mechanism can stop working with nothing observable to say so, and `#149` itself insists its
   backstop must not become the thing that hides that.
4. The `catch` is **not** exhaustively exercised. Two of its four reachable throw sites are covered;
   `resolveCapabilities` and `unknownCapabilitiesWarning` are deliberately left out because their
   assertions would duplicate case 1's. `PARTIAL` in the plan's guarantee audit, not `FLOOR`.

## Lens 2 — P3 (one gate, one responsibility)

**PASS.** Each new case owns exactly one thing the others do not: case 1 owns *no writer ran*, case
2 owns *the writer ran and the exit is still 1* (the partial-tree case), case 3 owns *a nullish
throw is still a failure*. The shared machinery is factored, not copied: one `informed()` helper for
both blocks that read `log.info`, one `cleanupRanBeforeTheReport()` for both ordering assertions.

Neither the reporter's stream contract nor `PHARN_DEBUG_HINT`'s wording is re-asserted here — they
belong to `report-error.ts` and are pinned once, at `tests/init.test.ts:196` and in the
`report-error` unit tests. Re-pinning them at each call site would make `init`'s tests fail on a
change to a different file.

**Advisory finding (low).** The file now carries **two** spellings of "join the `log.info` calls":
the hoisted `informed()`, and an inline `vi.mocked(log.info).mock.calls.map(String).join('\n')` at
the MIN_CLI refusal case, which has `log.warn`/`log.error` twins beside it. Folding that third block
into the helper was considered and rejected — the MIN_CLI cases are outside this brief, and
edit-for-tidiness is how a test-only PR grows a blast radius. Raised so it is not lost.

## Lens 3 — P4 (cite, do not restate)

**PASS.** The new comments cite rather than re-explain: the ordering helper names `init.ts`'s own
header invariant, says *why* the count cannot see it, and names `lib/repo.ts`'s backstop as the
reason the consequence is invisible too; the box case names `init.ts`'s stated reason for boxing the
cause; the `beforeEach` names the `mockResolvedValue`-survives-`clearAllMocks` hazard the `proxy
notice` describe already documents, rather than re-deriving it. No comment restates what
`report-error.ts` says about when the hint is offered — it points at `PHARN_DEBUG_HINT` and matches
loosely.

**Advisory finding (medium, adjacent — deliberately NOT fixed here).** `src/commands/init.ts:37` and
`:77-86` still explain the proxy notice entirely in terms of `degit` ("degit reads
`process.env.https_proxy` ITSELF (measured at degit@3.6.6)", "wastes neither the network nor the
`~/.degit` tarball"), and `add.ts`, `update.ts` and `status.ts` carry the same sentence. `degit` is
gone: it is absent from `package.json` `dependencies`, and `src/lib/proxy-env.ts:24` already says
"With degit retired there is no dependency…". The *tests* are current — `tests/init.test.ts:366`
asserts the warning `not.toContain('degit')` — so the code and its comments now disagree, with the
comments losing. This increment is fenced out of `src/**` by its own acceptance criteria, so it is
filed rather than fixed.

## Lens 4 — P7 (additive / in scope)

**PASS.** Nothing in `src/**` changed, and nothing user-visible moved. The three explicit fences in
the spec are respected: the TTY-gate tests, the cancel cases (four of them now, all still asserting
`ProcessExit(0)` and all byte-identical, including the `Ctrl+C at the overwrite confirm` case `#151`
added mid-run), and the static no-404 guard are untouched; `vitest.config.ts` is untouched; no
manifest module is imported; no case asserts an exact `log.error` string; the `PHARN_DEBUG` env
mutation is saved and restored inside the new describe.

Two departures from the literal brief, both recorded:

- **A third case** (`throw undefined`) beyond the two the spec lists. It exercises the same `catch`,
  the same variable and the same exit, and it is the only test in the repo that fails when the cause
  is unboxed (BREAK 3). Justified in the plan and the grill.
- **`informed()` hoisted one describe level.** The alternative was a verbatim second copy. It edits
  a block the spec did not name, but not one it fenced off, and the two cases that already used it
  still pass unchanged.

**Process note, not a finding.** `origin/main` advanced three commits while this branch was in
flight, and one of them (`#151`) retyped the mock the new block depends on. The first CI run went
RED on `Typecheck` because GitHub builds the *merge* ref; the branch was rebased, the mock re-armed
with `'proceed'`, and **every** RED transcript re-taken on the new base rather than carried over.
`REGRESSION.md` records this instead of hiding it — a rebase that silently replaces the evidence
would leave the PR's central claim unmeasured.

## Floor-gate vs advisory split

- **Floor (blocking, all green):** `format:check`, `lint`, `lint:md`, `typecheck`, `test` (1087),
  `validate.mjs` exit 0, plus `npm run build`. `check-regress` → `no-regressions`; `check-verify` →
  `PASS`.
- **Advisory (non-blocking):** the two `log.info`-joining spellings in one file (low, kept on
  purpose), and the stale `degit` comments across four `src/commands` files (medium, out of scope,
  filed here).
