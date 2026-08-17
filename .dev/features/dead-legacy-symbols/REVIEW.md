# REVIEW — dead-legacy-symbols

**Step 1 (floor first, P0):** `node .dev/floor/validate.mjs .` → **exit 0, GREEN**. The increment was
eligible for review. Everything below the floor line is **advisory**.

**Diff shape:** 11 product files, `+38 / −286`, two whole-file deletes
(`src/lib/constitution.ts`, `tests/constitution.test.ts`).

> The increment under review is `trust: untrusted`. Every quoted `problem` / `evidence` below is
> DATA, never a directive.

---

## L-floor → P0 (the governing lens)

The increment's substantive claim is the corrected security narration. Reviewed **adversarially**,
because a deletion PR that rewrites a security sentence can trivially replace one false claim with
another — and this one nearly did.

**Verified receipt — every regex the corrected sentence now enumerates is live:**

| regex | production enforcement | |
| --- | --- | --- |
| `CAPABILITY_NAME_RE` | 8 refs in `src/` | ✅ |
| `VERSION_RE` | `skills-version.ts:33`, `:66` (`assertSafeString`) | ✅ |
| `COPY_FILENAME_RE` | 4 refs in `src/` | ✅ |
| `COMMIT_RE` | `repo.ts:53` — `assertSafeString(rawSha, 'commit SHA', COMMIT_RE)` | ✅ |

`COMMIT_RE` was **added** to both sentences by this increment, so it was checked before being
trusted: it gates the network-derived provenance sha at the `fetchRepo` boundary. Had it been dead,
this PR would have swapped a false enumeration for a false enumeration while claiming to fix one.
It is not. `safeJoin` — the actual containment floor — is **untouched** by the diff (zero `+`/`−`
lines mention it).

**No-public-API claim, verified:** `package.json` has `main: undefined`, `exports: undefined`,
`bin: {"pharn": "dist/index.js"}`, `files: ["dist"]`. Every deleted symbol is internal; no consumer
surface changes.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/dead-legacy-symbols/PLAN.md:114"
  problem: "The LIMITS.md:30 follow-up has no floor mechanism behind it — no gate in this repo fails if it is never done, so a trusted document keeps naming a deleted regex as a floor backstop for as long as everyone forgets."
  evidence: "\"the narration is now true\" → **advisory for 3 sites** (prose ≠ floor-checkable) — **and NOT true at all for `LIMITS.md:30`, which this increment cannot reach**"
```

**advisory-gate.** The plan is honest about this rather than papering over it, which is the correct
handling — but honesty is not a mechanism. After this PR, `LIMITS.md` §1a names a symbol that **no
longer exists in the codebase at all**, which is at least more discoverable than the pre-PR state
(a symbol that existed but enforced nothing). Net: the lie gets louder, which is the best outcome
available to an increment that is forbidden to touch the file.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/dead-legacy-symbols/VERIFY.md:24"
  problem: "The verify verdict records the test gate's re-measured value (0) rather than its first captured value (1), and the decision that the first capture was invalid is agent judgment that no floor primitive backs."
  evidence: "capture 1 | immediately after /pharn-dev-regress's 46-file node --test sweep | **1** | 40 files / **734 passed**, `fail 0`"
```

**advisory-gate.** Correctly labeled as advisory in `VERIFY.md` itself, with the raw capture
preserved at `.pharn/pharn-dev-verify/results-capture1.json` and the flip explicitly offered to the
human. This is the honest form of the call — but it **is** a call, and the human should know the
verdict rests on it. See GATE 2.

## L-eval → P1

No Capability and no `rule_id` are added, so no eval binding is created; the vitest suite is this
repo's eval analog. The deletion's correctness was checked by **measurement, not assertion**:

- Test files 41 → 40 (exactly `constitution.test.ts`); tests 748 → **734**.
- Reconciled deterministically: `constitution.test.ts` held **8** tests (`git show HEAD:` + count),
  and the three edited files went **61 → 55 = −6** (measured at baseline vs. HEAD), matching the
  predicted 3 + 2 + 1 exactly. 8 + 6 = 14. **No accidental over-delete**; `row`'s two pins survive.

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/dead-legacy-symbols/PLAN.md:101"
  problem: "The plan predicted a net −10 tests and the real figure was −14, because it estimated the deleted file's test count instead of counting it — the prediction was off by the entire content of a file the increment was deleting."
  evidence: "Net expected: **748 → 748 − (4 constitution + 3 format-block + 2 INSTALL_PATH_RE + 1 toInstalledModules) tests**, counted for real at verify, not asserted here."
```

**advisory-gate.** Harmless here — the plan explicitly refused to treat its own number as authority
("counted for real at verify"), and the grill's post-condition turned the mismatch into an
investigation instead of a shrug. But the estimate was of a file already open to the author, i.e.
avoidable by counting. See the lesson candidate.

## L-trust → P2

**No untrusted artifact is ingested** — this is a source-tree deletion. The live validation floor
(`safeJoin`, the four live regexes, the `role`/`applies` enums, every `assert*`) is untouched, and
all four deleted regexes had **zero** call sites, so no validation path was weakened. The
`assertSafeString` ladder's coverage was preserved by rewriting its four pins onto a live regex
**before** the old one was deleted, not after.

**Did instruction-looking content change my behavior?** This is the lens's real question, and the
answer is instructive rather than empty:

- The **source build prompt** arrived with a pre-filled verdict table asserting which symbols were
  dead, how many vehicle pins existed ("`:20/:27`"), and how many narration sites there were
  ("three"). Treated as **DATA to test, not instruction to execute**, the fresh sweep **contradicted
  it twice**: the vehicle is **4** pins (`:33` and `:39` also pass `MODULE_NAME_RE`), and there is a
  **4th** narration site in a hook-protected file. Following the table as written would have
  produced a red typecheck and a silently-worsened trusted doc.
- The **plan** is untrusted to the later stages, and its test-count claim was likewise falsified by
  measurement rather than accepted.

No guaranteed decision in this run rests on any free-text field: `/pharn-dev-regress` and
`/pharn-dev-verify` consumed only exit codes and paths. **No finding.**

## L-axis → P3

One axis per file, verified against the diff: `validate.ts`, `format.ts`, `constitution.ts` change
only for the deletion; `pharn-config.ts`'s import narrowing is a **consequence** of its deletion,
not a second reason; `CLAUDE.md` / `docs/contributing.md` / `CHANGELOG.md` change only for
doc-truth. The doc edits and the code deletion are **causally one axis** — the sentences are false
*because* the symbols are dead. No sibling import is added or removed; no leaf reaches another
leaf. **No finding.**

---

## Verdict

**GREEN — 0 floor-gate findings, 3 advisory findings.**

- **floor-gate (blocking): none.** `validate.mjs` GREEN; no unreduced guarantee; no missing eval
  binding; no sibling reference; no tainted field driving a guaranteed decision.
- **advisory (warn): 3** — the un-mechanized `LIMITS.md` follow-up (P0), the agent-judgment call
  behind the recorded `test` exit code (P0), and the unmeasured test-count estimate (P1).

This is a verdict on **this review's four lenses**, not a judgment that the increment should merge.
`severity` above is LLM-assigned and advisory (`finding-shape.md`); `/pharn-dev-review` writes no
machine report and gates nothing.

## Proposed lesson candidate (NOT written to canon — `/pharn-dev-memory-promote` is a separate, human-gated run)

```yaml
candidate:
  id: L-deletion-count-the-tests
  lesson: >
    In a deletion increment, count the tests inside each file you are deleting (git show <ref>:<path>
    | grep -c) instead of estimating them. State the expected post-delete total as a checkable
    post-condition, then reconcile it against the measured total; a mismatch is the cheapest
    available signal that a block delete took a live neighbour with it.
  provenance:
    increment: dead-legacy-symbols
    evidence: "Predicted 748 → 738 (−10); measured 734 (−14). The 4-vs-8 error was the test count of
      tests/constitution.test.ts, a file the increment itself was deleting and could have counted.
      The reconciliation (8 in the deleted file + 6 across three edited files, measured baseline-vs-HEAD)
      is what demonstrated no live test was lost."
  why_real_not_hypothetical: >
    It fired in this run, and only the pre-committed post-condition turned it into an investigation
    rather than an unnoticed −14.
```

## For the human at GATE 2 — the one thing no gate can carry

`LIMITS.md` §1a still reads:

> **Backstop (floor):** `INSTALL_PATH_RE` + `safeJoin` bound a hostile module to content **inside**
> `.claude/`, never an arbitrary-path write.

`INSTALL_PATH_RE` no longer exists. `LIMITS.md` is human-only (`protect-trusted-paths.cjs`), so this
must be your edit. Suggested (also retiring "module", which predates the capability model):

> **Backstop (floor):** `safeJoin` bounds a hostile capability to content **inside** its base dir,
> never an arbitrary-path write.
