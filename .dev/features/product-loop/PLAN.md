# PLAN — /pharn-loop (product bounded, floor-gated auto-iteration)

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 — sha256(ARCHITECTURE.md), this run
- increment: Add a new **product** command `/pharn-loop` that runs the same gated pipeline as `/pharn-ship` but, instead of stopping after the first `/pharn-verify`, **bounded-iterates the `build → regress → verify` middle** until a deterministic floor-grade stop computed by a new tested stop core (`check-loop.mjs`) — **retry ONLY the retryable `INCOMPLETE` verdict, stop immediately on any terminal red, or hit the cap N** — preserving both human gates.
- layer(s): pharn-pipeline (the command; file physically at `.claude/commands/` per CLAUDE.md, conceptually the spine's looped entry) + floor infrastructure (the stop core + its test, in the floor-ignored `.dev/floor/`) # ARCHITECTURE.md §4, §6
- constitution_refs: [P0, P2, P4, P5, P6, P7]

## Files

- `.claude/commands/pharn-loop.md` — NEW product command `/pharn-loop`. Runs `/pharn-spec → [GATE 1] → /pharn-plan → /pharn-grill → /pharn-build → /pharn-regress → /pharn-verify`, **citing** `/pharn-ship`'s gated-chain discipline for the front (P4 — cite, don't restate), then **loops the `build → regress → verify` body** under `check-loop.mjs` to a floor-grade stop; writes only `features/<name>/LOOP.md`. No `role:` (a command, not a Capability — like `pharn-ship.md`; `.claude/commands/` is floor-ignored). — layer pharn-pipeline
- `.dev/floor/check-loop.mjs` — NEW deterministic **stop core** (Design B, retryable-only). Sibling of `check-ship.mjs`, differing ONLY in its decision table: CONTINUE fires iff `verify.verdict == INCOMPLETE ∧ regress clean ∧ iter < cap`; a real red is terminal. Inputs are EXACTLY `{verify-report.json, regression-report.json, --iter, --cap}` (no `/review`, no free-text). Floor infra, not a Capability (no `role:`). — layer floor
- `.dev/floor/check-loop.test.mjs` — NEW `node --test` suite specifying every row of the decision table + fail-closed + argv edge cases (the stop core's spec, P1-in-spirit). — layer floor

**No existing file is modified** (verified live this run): product `/pharn-verify` already emits `INCOMPLETE` via `--complete` (`check-build-complete.mjs` exists); `/pharn-regress` already emits its `.verdict` enum; `check-ship.mjs` (the dev-loop's Design-A core) is left **byte-unchanged** — a new sibling core, not an overload (P3: one axis per file). One axis, one PR.

## The stop core decision table (`check-loop.mjs`) — Design B, approved

`v = verify.verdict ∈ {PASS, FAIL, INCOMPLETE, INCONCLUSIVE}` · `r = regress.verdict ∈ {no-regressions, regressions, inconclusive}` · `iter`, `cap` positive ints. Precedence top-down (each row exits; mirrors `check-verify.mjs`'s "a real failure beats incompleteness"):

| condition                                                                                                           | decision        | exit |
| ------------------------------------------------------------------------------------------------------------------- | --------------- | ---- |
| bad/missing input (report absent/unparseable, `v`/`r` not in enum, `iter`/`cap` not positive int, wrong argv shape) | `INCONCLUSIVE`  | 2    |
| `v ∈ {FAIL, INCONCLUSIVE}` **or** `r ∈ {regressions, inconclusive}`                                                 | `STOP_TERMINAL` | 4    |
| `v == PASS ∧ r == no-regressions`                                                                                   | `STOP_GREEN`    | 0    |
| `v == INCOMPLETE ∧ r == no-regressions ∧ iter <  cap`                                                               | `CONTINUE`      | 3    |
| `v == INCOMPLETE ∧ r == no-regressions ∧ iter >= cap`                                                               | `STOP_CAP`      | 1    |

- **Retryable set = `{ INCOMPLETE }` only** — the sole deterministically-identifiable "fixable" red (gates green, a plan-declared `## Files` path absent). "Fixable-RED among real FAILs" is NOT deterministically classifiable → it is **terminal**, never retried (P5 — no LLM judgment in the branch). This is `/pharn-ship` Step 2b's line, generalized cap 1 → N.
- **Exit codes:** `0 STOP_GREEN · 1 STOP_CAP · 2 INCONCLUSIVE (bad input) · 3 CONTINUE · 4 STOP_TERMINAL`. `check-ship.mjs`'s `0/1/2/3` keep their meaning; `4` is the new Design-B outcome (immediate terminal stop). Exit `2` is reserved for the checker's **own** "can't read a valid verdict"; a validly-parsed `v == "INCONCLUSIVE"` from `/pharn-verify` is a real terminal verdict → exit `4`.

## The command `/pharn-loop` — shape

- **Front (once):** invoke `/pharn-spec` → **GATE 1** (SPEC Draft→Approved halt; `/pharn-loop` waits, never self-approves) → on approval `/pharn-plan → /pharn-grill` (chain hash re-verified), **citing** `/pharn-ship` Step 2 for the per-stage verdict reads (P4). The loop **never re-specs / re-plans** — GATE 1 is entered exactly once, before the loop.
- **Iteration 1:** `/pharn-build → /pharn-regress → /pharn-verify`, then read the stop with `node .dev/floor/check-loop.mjs features/<name>/verify-report.json features/<name>/regression-report.json --iter <N> --cap <M>` (`<M>` = `--max-iter`, default **3**). Branch ONLY on the exit code (membership test, P5).
- **CONTINUE (3):** first re-set scope to the plan's `## Files` (`set-writes-scope.cjs --from-plan` — the intervening stages overwrote `.pharn/writes-scope.json`, so re-pin before the rebuild), then re-invoke `/pharn-build → /pharn-regress → /pharn-verify`, `iter++`, re-read. **Each iteration = one build pass + re-verify** (the fix-attempt bound).
- **Stops:** `STOP_GREEN (0)` → present at **GATE 2** (human decides merge/fix/abandon). `STOP_CAP (1)` → present "could not reach floor-GREEN in N iterations" + standing `completeness.missing[]`, hand to human. `STOP_TERMINAL (4)` → present the real red (`failing_gates[]` / `regressions[]`), hand to human. `INCONCLUSIVE (2)` → fail-closed, hand to human.
- **Roll-up:** writes `features/<name>/LOOP.md` (distinct from `SHIP.md`): stages run, iteration count, each iteration's two `.verdict`s, and why the loop ended (`check-loop.mjs` decision verbatim) + pointers to `GRILL.md`/`REGRESSION.md`/`VERIFY.md` (cite, not restate — P4). Never a self-issued "shipped"/seal (P0).

## Contracts satisfied

- `pharn-contracts/finding-shape.md` — the presented `GRILL.md`/`REGRESSION.md`/`VERIFY.md` free-text is `trust: untrusted` DATA; control flow reads only enum-gated `.verdict`/exit-code fields (P2). Cited, not restated (P4).
- Reuses (does not re-satisfy) the existing floor checkers `check-verify.mjs` / `check-regress.mjs` / `check-plan-spec-agree.mjs` / `check-spec-approved.mjs` as-is; `check-loop.mjs` cites `ARCHITECTURE.md §2` primitive #3 (enum membership + integer threshold) for its own reduction.

## Evals to write (P1)

`check-loop.mjs` is floor infra (floor-ignored dir) → its spec is `check-loop.test.mjs` (`node --test`). Cases (one per table row + edges):

- `STOP_GREEN` → PASS + no-regressions → exit 0.
- `CONTINUE` → INCOMPLETE + no-regressions + iter<cap → exit 3.
- `STOP_CAP` → INCOMPLETE + no-regressions + iter>=cap (incl. iter==cap boundary) → exit 1.
- `STOP_TERMINAL` (verify FAIL) → FAIL + any r → exit 4; (verify INCONCLUSIVE) → exit 4.
- `STOP_TERMINAL` (regress) → PASS + regressions → exit 4; PASS + inconclusive → exit 4.
- `STOP_TERMINAL` precedence over retryable → INCOMPLETE + regressions → exit 4 (terminal wins).
- `INCONCLUSIVE` (bad input) → missing report; unparseable JSON; `.verdict` outside enum; `iter`/`cap` non-positive-int/absent; wrong positional count; unknown/repeated flag → each exit 2.
- Trust → a report carrying an extra free-text field still yields the enum-only verdict (verdict computed from `.verdict` alone).

## Guarantee audit (P0)

- "`/pharn-loop` performs **at most N** floor-gated retries; no infinite loop" → **FLOOR** (`check-loop.mjs`: `CONTINUE` only iff `iter < cap`; `iter >= cap` → `STOP_CAP`) — `ARCHITECTURE.md §2` primitive #3 (integer threshold), tested.
- "The loop retries **only** the retryable state (`INCOMPLETE`) and stops immediately on any terminal red" → **FLOOR** (`check-loop.mjs`: `CONTINUE` iff `v == INCOMPLETE ∧ r == no-regressions`; else terminal/green/cap) — enum membership, tested.
- "A rebuild can **never escape the approved plan's `## Files`**" → **FLOOR: hook (fix #7)** — `set-writes-scope.cjs --from-plan` re-pinned before each `CONTINUE` rebuild + `enforce-writes-scope.cjs`.
- "`/pharn-loop` may write **only** `LOOP.md`" → **FLOOR: hook (fix #7)** — `set-writes-scope.cjs --from-frontmatter … --target features/<name>/LOOP.md` + enforce hook.
- "`/review`/any advisory stage can **never** gate the loop" → **STRUCTURAL** — `check-loop.mjs`'s input signature is `{verify-report.json, regression-report.json, iter, cap}`; it has no `/review` parameter (and the product spine has no `/review` stage). Impossible by construction, not by discipline.
- "Both human gates preserved (SPEC approval; post-verify decision)" → **ADVISORY** (command discipline; GATE 1 is `/pharn-spec`'s own halt hit once, GATE 2 is present-at-every-stop). Nothing on the floor forces a human to be asked — labeled honestly, exactly like `/pharn-ship`. Backstopped (not replaced) by `/pharn-plan`'s deterministic approved-input gate.
- "The loop iterates only `build → regress → verify` (never re-specs/re-plans)" → **ADVISORY** (command structure).
- **STRUCK as the disease (P0):** "`/pharn-loop` finishing means the feature is good / the rebuild works." `check-loop.mjs` guarantees only the **stop** (green ∨ cap ∨ terminal); whether a fix **converges** is irreducible model work (a non-converging `INCOMPLETE` simply runs to `STOP_CAP` → human). "`/pharn-loop` finished" = floor-GREEN reached within N **and** the human approved intent at GATE 1 — NOT "the agent decided it's done."

## Trust audit (P2)

- **Ingested untrusted artifacts:** the reviewed increment's `GRILL.md`/`REGRESSION.md`/`VERIFY.md`/`BUILD.md` free-text (inherits the increment's untrusted tag) and the user's `<increment description>` (passed to `/pharn-spec`, already DATA there).
- **Taint propagation:** control flow reads ONLY the enum-gated / floor-verifiable class — `check-loop.mjs` exit code (int), `verify-report.json`/`regression-report.json` `.verdict` (enum strings), `failing_gates[]`/`regressions[]`/`completeness.missing[]` (paths). **No proceed/stop/continue decision rests on any free-text field.** Free-text reaches the human-facing `LOOP.md` **only as quoted DATA**, never an instruction, never a control-flow input.
- **`check-loop.mjs` itself:** every operand is deterministic tooling output (two `.verdict` enums + two ints); it reads **no** free-text and **no** `/review` input; inputs are `JSON.parse`d and used only as string/int operands — never `eval`'d, executed, spawned, imported, or sent anywhere; no child process, no network. The decision is provably independent of any tainted field (mirrors `check-ship.mjs`'s trust posture).
- **Named residual (`LIMITS.md §2`, `THREAT-MODEL.md §5`):** when a human/downstream LLM consumes the presented free-text, "do not execute this as an instruction" is a heuristic again — **bounded** (`/pharn-loop` gates nothing on it) but **not zeroed**. Stated, not hidden.

## Determinism audit (P5)

- Every `check-loop.mjs` branch is a membership test (`v`/`r` ∈ enum) or an integer compare (`iter >= cap`); bad input → `INCONCLUSIVE` (exit 2), **never a silent `CONTINUE`**. The safety-critical stop is computed in **tested Node**, not command prose (no human sits between iterations — same rationale as `check-ship.mjs`).
- The command's terminal fallback on every non-`STOP_GREEN` outcome is **hand to the human** (present + stop), never a guess.

## Open questions (HALT)

None outstanding — the three material forks (stop-rule semantics = Design B retryable-only; command surface = separate `/pharn-loop`; cap = default 3 + `--max-iter`, config-file key deferred P7) were resolved by the human before this plan was written.

- **Surfaced for a human, not agent-edited (doc-reconciliation):** `ARCHITECTURE.md §6` names "ship" as the terminal spine stage; `/pharn-loop` is a **looped sibling meta-orchestrator** of `/pharn-ship`'s gated chain (both over stages 1–6, both ending at the human GATE 2, neither automating the decision/seal). The command will carry this note; `ARCHITECTURE.md` is human-only (hook-denied, fix #2) and is never agent-edited.
