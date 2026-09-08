# SHIP — update-network-exit

A roll-up of one gated ship run. **Advisory.** It records that the chain ran and what the floor
verdicts were — nothing more.

## Stages, in order

| #   | stage                | outcome                                                              |
| --- | -------------------- | -------------------------------------------------------------------- |
| 1   | `/pharn-dev-plan`    | `PLAN.md` written; spec content-hash pinned                          |
| 2   | `/pharn-dev-grill`   | `GRILL.md`; 5 concerns, 0 blocking; advisory, gates nothing          |
| 3   | `/pharn-dev-build`   | 1 file written (`tests/update.test.ts`); floor GREEN                 |
| 4   | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` → `"no-regressions"`      |
| 5   | `/pharn-dev-verify`  | `verify-report.json` + `VERIFY.md` → `"PASS"`                        |
| 6   | `/pharn-dev-review`  | `REVIEW.md`; GREEN, 0 floor-gate findings, 4 advisory                |

The run ends at the post-review human gate, not at a RED-verdict STOP.

## Verdict table — structural verdicts read verbatim

| gate / verdict                       | value                | source                                        |
| ------------------------------------ | -------------------- | --------------------------------------------- |
| `node .dev/floor/validate.mjs .`     | exit `0` — GREEN     | build + review Step 1                         |
| `regression-report.json` `.verdict`  | `"no-regressions"`   | `check-regress.mjs verdict`, exit 0           |
| `verify-report.json` `.verdict`      | `"PASS"`             | `check-verify.mjs`, exit 0                    |
| `npm test`                           | exit `0` — 1069 pass | 1067 at base; `+2`, exactly this increment    |
| `npm run lint`                       | exit `0`             | head capture                                  |
| `npm run typecheck`                  | exit `0`             | head capture                                  |
| `npm run format:check`               | exit `0`             | head capture                                  |
| `npm run lint:md`                    | exit `0`             | head capture                                  |
| `npm run build`                      | exit `0`             | post-gate build check                         |

Base: `47b1f98feb075bff48caa3b6c87d51205d5dc650`. `regressions[]` and `pre_existing[]` both empty;
`failing_gates[]` empty. `verifiers.registered` = 0, so the advisory block is empty — and could not
have flipped the verdict in any case (fix #3).

Each proceed decision above was read from that stage's own deterministic verdict. None rested on the
agent's judgment or on any free-text field.

## What the grill changed

Four of the five grill findings were folded into the built increment rather than merely noted:

1. **The `cleanup` assertion was near-vacuous** (P0, important). `cleanup` is reachable only through
   a resolved `fetchRepo` handle, so no edit confined to `update.ts` could call it on a rejected
   fetch. **Changed:** `expect(fetchRepo).toHaveBeenCalledTimes(1)` was added beside it, and the two
   were **reordered** so the invariant fails first. Break F now reddens the pair alone, 1 of 79 —
   before the reduction, the spec's headline criterion was a test that could not fail.
2. **The spec's premise is false** (P6, important). `PLAN.md` gained a Discovery table naming four
   spec claims that do not match disk, the increment was retitled around the axis that is actually
   new (EFFECT, not wording), and the built test opens with a comment naming the sibling suite so the
   overlap is deliberate and visible rather than accidental.
3. **Three assertions carry no demonstrated detection power** (P1, important). **Changed:** not the
   test — the report. `VERIFY.md` now accounts for every assertion as isolated / shared /
   never-falsified, and says in as many words that a green suite is weaker evidence than the
   assertion count suggests.
4. **Two suites, same paths, 150 lines apart** (P3, minor). **Changed:** the new block's header
   comment names `fatal-error reporting` and the split of responsibility.

The fifth (measurement honesty — a RED that is not isolated should not read as a needed test) shaped
how every transcript in `VERIFY.md` is reported: each break lists its total failure count and which
failures are pre-existing.

## What this run does and does not say

Two clocks, stated honestly. **Running** these stages in order is orchestration and is **advisory**.
The **verdicts** are floor, each owned by its own checker. This run added **no new floor primitive**:
every guarantee in it belongs to a sub-stage.

And one specific to this increment: `src/**` is byte-identical to base. Nothing about what `pharn`
does changed. What changed is that two regressions — a confirm hoisted above the version read, and a
second fetch on the clone-failure path — now have a test that reddens for them, and ten other
assertions that document an invariant without defending it.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
