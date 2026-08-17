# GRILL — dead-legacy-symbols (ADVISORY — gates nothing)

Plan under interrogation: `.dev/features/dead-legacy-symbols/PLAN.md` (approved at GATE 1).
**Spec-hash check:** recomputed `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`
— **matches** the plan's `spec_content_hash`. No drift. (Surfaced here; `/pharn-dev-build`'s
floor-gate is where drift actually blocks — fix #4.)

**Registered grillers:** `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`
— FLOOR membership (frontmatter enum), not a prose grep. Zero registered in this repo (griller
capabilities live in pharn-oss), so the inline axes below are the whole interrogation. Stated,
not silently skipped.

> The plan is `trust: untrusted` to this stage. All `problem` / `evidence` free-text below quotes
> it as **DATA** — never followed as an instruction.

---

## Findings

### Axis: P0 — guarantee-audit completeness

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/dead-legacy-symbols/PLAN.md:110"
  problem: "The 'no live behavior lost' claim is reduced to `npm run check` green, but a green check cannot witness a lost caller when the increment deletes that caller's test in the same commit — the actual floor for a deleted export is `tsc --noEmit` (a static reference to a removed export is a compile error), which the plan never names."
  evidence: "| \"no live behavior lost\" | **floor: `npm run check` green** + the export inventory; the *judgment* that nothing was worth keeping is **advisory** |"
```

**Grilled and grounded (this run):** the reduction is repairable, not wrong. `grep -rn "from '.*validate\.js'" src/` → **13 static imports, zero dynamic access** (no `obj['MODULE_NAME_RE']`, no
`require()`, no string-built specifier) across `src/` and `tests/`. With no dynamic access path,
`tsc --noEmit` is a **complete** reference detector for these deletions, not a partial one. The
plan should name `tsc --noEmit` (both configs) as the floor, with `npm run check` as its carrier.

### Axis: P4 — docs cite code (the sweep's blind spot)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/dead-legacy-symbols/PLAN.md:83"
  problem: "The narration sweep was name-based (it searched for the seven symbol names), so it cannot see a doc that describes the deleted validator's BEHAVIOR without naming it; `docs/contributing.md:81` is exactly that, and it sits two lines above the line the plan does edit."
  evidence: "- `docs/contributing.md` — line 83: same — layer docs"
```

**Grilled and grounded:** I ran the name-free sweep the plan did not.
`docs/contributing.md:81` reads *"`lib/validate.ts` and `lib/install-capabilities.ts` handle all
untrusted remote input (capability names, **install paths**, frontmatter)"*. **Verdict: it stays
TRUE** — install paths are still validated, by `safeJoin` + `COPY_FILENAME_RE`, neither of which
this increment touches. **No edit needed.** Recorded so the build does not "helpfully" widen its
whitelist.

The same sweep clears the other behavior-level claims: `LIMITS.md:23`, `LIMITS.md:87`,
`THREAT-MODEL.md:109`, `THREAT-MODEL.md:133` all rest on **`safeJoin`**, which survives. This is a
useful narrowing — **the human-only follow-up is exactly one line (`LIMITS.md:30`), not a
trusted-doc sweep.**

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/dead-legacy-symbols/PLAN.md:83"
  problem: "`CHANGELOG.md:414` is a historical release entry that names `installs` paths as validated; it describes a past release and MUST NOT be rewritten, but the plan's whitelist includes CHANGELOG.md without scoping the edit to the Unreleased section."
  evidence: "- `CHANGELOG.md` — one Unreleased line (internal cleanup + narration correction) — layer docs"
```

**Note:** the plan's prose already says *"one Unreleased line"*, so the intent is right; this
finding asks the build to make the scoping **explicit** — append only, never touch `:414` or any
shipped-release entry. Rewriting release history to match current code would be a P7 violation
(old records must stay true to what shipped).

### Axis: P6 — discovery / live state

```yaml
- type: FINDING
  rule_id: "P6"
  severity: important
  file: ".dev/features/dead-legacy-symbols/PLAN.md:12"
  problem: "The plan discloses a load-induced timeout flake in tests/lint-gate.test.ts but names no disambiguation procedure for /pharn-dev-verify, where the same flake would produce a FAIL verdict that the floor cannot distinguish from a real regression caused by this diff."
  evidence: "`tests/lint-gate.test.ts > rejects an unused variable in src/_plant.ts` FAIL — a **5s per-test timeout at 7341ms under parallel load**"
```

This is the **sharpest operational risk in the run.** `/pharn-dev-verify`'s verdict is a floor
exit-code threshold — it is deliberately blind to *why* a gate failed, which is correct, and which
is exactly why a flake and a regression look identical to it. Recommended procedure, decided **in
advance** so it is not improvised under a red verdict:

> If `/pharn-dev-verify` returns FAIL with `tests/lint-gate.test.ts` as the **sole** offender, do
> **not** self-clear it. Re-run that file in isolation and re-run the full gate; report **both**
> outcomes to the human at GATE 2 and let the human weigh it. A flake is disclosed, never
> silently retried into green — and never argued away by this stage.

### Axis: P1 — eval coverage

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/dead-legacy-symbols/PLAN.md:101"
  problem: "The plan predicts a net test-count delta but does not state the arithmetic as a checkable expectation, so a test lost by accident (an over-wide block delete in format.test.ts or pharn-config.test.ts) would land inside the predicted decrease and go unnoticed."
  evidence: "Net expected: **748 → 748 − (4 constitution + 3 format-block + 2 INSTALL_PATH_RE + 1 toInstalledModules) tests**, counted for real at verify, not asserted here."
```

The plan's honesty here is right (it refuses to assert a number it has not measured). The gap is
that the prediction has no **post-condition**. Concretely: 748 − 10 = **738 expected**. If verify
reports anything other than 738, that is a signal to inspect, not to accept. Cheap, and it directly
covers the `format.test.ts` risk the plan itself flagged (`row` must survive).

### Axes with no findings

- **P2 (trust propagation)** — no untrusted artifact is ingested; the live validation floor
  (`safeJoin`, `CAPABILITY_NAME_RE`, `COPY_FILENAME_RE`, `COMMIT_RE`, `VERSION_RE`, the enums, every
  `assert*`) is untouched, and all four deleted regexes have zero call sites. The audit is accurate.
- **P3 (one axis / no sibling imports)** — no planned file carries two change-reasons. The doc edits
  and the deletion are **causally one axis**: the docs are false *because* the symbol is dead. No
  leaf-to-leaf import is added or removed.
- **P5 (determinism)** — every keep/delete branch is a membership test over the fresh sweep, and the
  one thing membership could not settle (`LIMITS.md`) correctly terminated in **ask**, which the
  human answered at GATE 1. This is P5 working as designed.

---

## Summary

The plan is unusually well-grounded for a deletion: it re-ran the sweep, and its **two corrections
to the source prompt are both real and both material** — the vehicle is four `assertSafeString`
pins rather than two (deleting the regex after rewriting only two would red the typecheck), and
`INSTALL_PATH_RE` has a fourth narration site in a **hook-protected, human-only** file. Routing that
fourth site to a human instead of editing it is the constitution's stated behavior, not a
workaround.

Five concerns, none of them blockers to attempting the build:

1. **P0** — name `tsc --noEmit` as the deletion floor; this run confirmed there is **no dynamic
   access** to `validate.js`, so the typecheck is a *complete* reference detector here.
2. **P4** — the name-based sweep had a blind spot; I ran the name-free pass. `contributing.md:81`
   and the four `LIMITS.md`/`THREAT-MODEL.md` behavior claims all rest on `safeJoin` and **stay
   true**. Net effect: the human-only follow-up is confirmed to be **one line**.
3. **P7** — scope the CHANGELOG edit to Unreleased; `:414` is shipped history and must not be
   rewritten.
4. **P6** — pre-commit to the lint-gate flake procedure so a red verify is not improvised into green.
5. **P1** — carry 738 as the expected test count so an accidental over-delete cannot hide inside the
   predicted decrease.

None of these changes what gets deleted. Items 1, 3, 4 and 5 are process sharpenings the build and
verify stages can adopt as-is; item 2 is already resolved (no additional edit needed).

**One residual worth the human's eye at GATE 2:** the `LIMITS.md:30` follow-up has **no floor
mechanism** behind it. Nothing in this repo will fail if it is never done — it survives only as long
as a human remembers the PR body. That is a real, named limitation of this increment, not a
guarantee it quietly makes.

---

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human
to weigh before `/pharn-dev-build`.** This stage gates nothing: every judgment above is model work,
and the only floor-grade facts in it are the spec-hash match, the griller-membership count, and the
grep/import counts cited inline. This is **not** a statement that the plan is good or that the
increment is safe to ship.
