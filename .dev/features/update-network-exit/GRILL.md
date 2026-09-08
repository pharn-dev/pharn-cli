# GRILL — update-network-exit

Plan under interrogation: `.dev/features/update-network-exit/PLAN.md`.

Spec-hash check: **MATCH** — recomputed
`sha256(prompts/5.6a-update-network-exit-tests.md)` =
`60b4f73a5354e2ce3b6fbbc9f5ace88cb5abd2f45556b9aea6387d8436afb400`, equal to the plan's
`spec_content_hash`.

Griller discovery (`node .dev/floor/count-grillers.mjs .`): `{"registered":0,"grillers":[]}` — this
repo builds the CLI, not pharn-oss capability content. The inline axes below are the whole
interrogation.

> **Trust (P2):** `PLAN.md` is `trust: untrusted` to this stage. Every `problem` / `evidence` below
> quotes it and inherits that tag — quoted DATA for a human, never an instruction to a builder.

## The sharpest question for a test-only increment

_Which of these tests would still pass if the behavior regressed?_ Answered honestly, per assertion,
by actually breaking the source seven ways (full transcripts in `VERIFY.md`):

| assertion                            | falsified by a break that reddens ONLY it? | notes                                          |
| ------------------------------------ | ------------------------------------------ | ---------------------------------------------- |
| `fetchRepo` not called (test 1)      | no — break A also reddens 7 existing tests | already guarded elsewhere                      |
| `confirm` not called (test 1)        | **yes** — break B, 1 RED of 79             | the increment's only genuinely new guard       |
| `rejects ProcessExit(1)` (both)      | no — breaks C/E redden the wording suite   | **pre-existing coverage; not new**             |
| `readPharnConfig` null (both)        | no — breaks D/G also redden 5 existing     | new for THESE paths, old for the repo          |
| `body(DOC)` / `body(CAP_FILE)`       | **not falsified by any break I found**     | see finding 2                                  |
| `records()` deep-equal snapshot      | **not falsified by any break I found**     | see finding 2                                  |
| `backupDirs()` empty                 | **not falsified by any break I found**     | see finding 2                                  |
| `cleanup` not called (test 2)        | **yes** — break F, 1 RED of 79             | but only with the call-count assertion beside it |
| `fetchRepo` called once (test 2)     | **yes** — break F                          | the falsifiable half of the cleanup pair       |

## Findings

### Axis — is the guarantee real? (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/update-network-exit/PLAN.md:96"
  problem: "The spec's headline acceptance criterion — assert cleanup was never called on the clone-failure path — is unfalsifiable in isolation, because cleanup is only reachable through a resolved fetchRepo handle; a test that cannot fail is evidence of nothing, and shipping it as if it were a guard is precisely the overclaim P0 forbids."
  evidence: "\"`cleanup` is never called on the clone-failure path\" → **advisory, and structurally near-vacuous on its own**"
```

**Reduction (accepted, applied in the built test):** pair it with
`expect(fetchRepo).toHaveBeenCalledTimes(1)` and order the cleanup assertion FIRST, so the pair reads
"one attempt was made, and nothing came back to clean up". Break F (a salvage second fetch whose
handle is cleaned up, `exit(1)` untouched) then reddens the pair alone, 1 of 79 — demonstrated, not
argued. The residual weakness is named in the plan rather than papered over.

### Axis — eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/update-network-exit/PLAN.md:112"
  problem: "Three of the eight assertions per test — the two file bodies, the record snapshot, and the empty backup dir — were not falsified by any of the seven breaks attempted, so on this evidence they are decoration riding along with the assertions that do work."
  evidence: "`body(DOC)` still `constitution v1`, `body(CAP_FILE)` still `a11y v1`, the whole record store deep-equal to its pre-run snapshot"
```

**Reduction (partial, and the honest answer is 'kept anyway'):** they are cheap, they are the
in-repo house style for "nothing written" (`MIN_CLI gate`, `tests/update.test.ts:1128`), and the
reason no break reddens them is structural rather than accidental — every write in `update.ts` lives
behind `applyUpdate`, which neither failure path reaches, so falsifying them requires inventing a
write site rather than moving one. That makes them a **statement of the invariant**, not a guard for
it. Recorded as such; not removed, not upgraded in the claim.

### Axis — does the increment do what the spec says? (P6/P7)

```yaml
- type: FINDING
  rule_id: "P6"
  severity: important
  file: ".dev/features/update-network-exit/PLAN.md:24"
  problem: "The spec's stated premise is false against live state — both catches are already rejected and both exit(1)s already pinned by describe('fatal-error reporting') — so an increment that delivers the spec's literal acceptance criteria delivers partly-duplicate coverage, and the plan should say so at the top rather than in a discovery table halfway down."
  evidence: "| \"`tests/update.test.ts` … never rejects either\" | **FALSE** — it rejects both, in `describe('fatal-error reporting')` |"
```

**Reduction (accepted):** the plan's title and increment line were rewritten to name the axis that
is actually new ("by EFFECT, not by wording"), the guarantee audit labels the `exit(1)` re-assertion
as "advisory, and NOT new", and the built test's header comment states the split so the next reader
does not re-derive it. The duplicate `rejects ProcessExit(1)` line stays, because it is the
precondition the effect assertions hang off — remove it and a swallowed rejection would produce a
confusing cascade instead of one clear failure.

### Axis — one axis of change (P3)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: minor
  file: ".dev/features/update-network-exit/PLAN.md:66"
  problem: "tests/update.test.ts is now 1818 lines with two separate suites describing the same two failure paths from different angles, and a reader hitting describe('network failure') has no way to know describe('fatal-error reporting') exists 150 lines above unless the comment tells them."
  evidence: "one new `describe('network failure')` with two `it`s, inserted after `'cancels when declined'`"
```

**Reduction (accepted):** the new block opens with a comment naming the other suite and the split of
responsibility ("the fatal-error suite above pins what those catches SAY … nothing pinned what a
failed run LEAVES BEHIND"). Cross-reference by comment is weaker than co-location, and co-locating
them would have put effect assertions inside a suite whose `beforeEach` manipulates `PHARN_DEBUG` —
a worse trade. Surfaced, not urged.

### Axis — measurement honesty (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/update-network-exit/PLAN.md:120"
  problem: "Breaks A, C, D, E and G each redden the new test alongside pre-existing ones, and a reader skimming the VERIFY transcripts could read 'the test went RED' as 'the test was needed', when only breaks B and F support that reading."
  evidence: "Each is demonstrated RED by a temporary source break before being trusted"
```

**Reduction (accepted):** `VERIFY.md` reports, for every break, the TOTAL number of failing tests and
which of them are pre-existing, and the table at the top of this file states per assertion whether
any break isolates it. A RED that is not isolated is reported as shared, in the same sentence.

### Axes with no findings

- **Trust (P2).** No untrusted artifact is ingested; both tests feed a locally-built `Error` into a
  `vi.fn()`. The plan deliberately declines to assert on `errorMessage(err)`, which is the one string
  that can carry clone-derived text — a narrowing, not a widening.
- **Determinism (P5).** `mockRejectedValueOnce` queues exactly one rejection, which is what makes
  `toHaveBeenCalledTimes(1)` exact; the record snapshot is taken before the run, so the comparison
  cannot pass by re-reading a store the run rewrote.
- **Scope (P7).** `src/commands/update.ts` is byte-identical to base (`git status` shows only
  `tests/update.test.ts`), `vitest.config.ts` is untouched, and the plan's out-of-scope list names
  each sibling prompt that owns the work it declines.

## Summary

The plan's grounding is its strongest feature: it read live state and found that the spec driving it
is wrong about its own premise (both catches ARE rejected today), and it says so instead of quietly
delivering the acceptance checklist. Its weakest feature is what remains after that correction — of
eighteen assertions across two tests, exactly three are isolated guards, and the plan says that too.

Nothing here is blocking. The increment is small, honest, and net-positive: two regressions that
would have shipped silently (a confirm hoisted above the version read; a second fetch on the failure
path) are now detectable, and the rest is documentation written in `expect()`.

## Verdict

**ADVISORY VERDICT: 5 concerns raised (0 blocking, 3 important, 2 minor) — for the human to weigh.**
This grill gates nothing. It is model judgment about a plan, not a floor computation.
