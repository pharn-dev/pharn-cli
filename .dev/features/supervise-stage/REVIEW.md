# REVIEW — supervise-stage

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked`. The
increment adds no PHARN markdown capability, so that gate is vacuous here; the build floor
(`npm run check`) and `/pharn-dev-verify`'s gates were GREEN. Everything below is **advisory**.

Reviewed: the uncommitted diff over `b14cf221` (13 paths, see `regression-report.json` `.inside`).

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** the one guarantee — "a `models.stages.supervise` key is accepted" — reduces to
  enum membership in `PRODUCT_STAGES`, held equal to pharn-oss's checker by the parity test: the
  vendored checker is byte-identical to pharn-oss `5568d4ce` (cmp'd against a copy fetched this run)
  and pinned at sha256 `6fbc7404…`, and the parity test extracts the checker's stage keys in order.
  The docs' description of `/pharn-supervise` is labelled as pharn-oss's behaviour, cited by version,
  and says the supervisor's decision is "one model's judgment, not a check".
- **L-eval (P1):** the new member is exercised by a direct case (`model-config.test.ts`), two parity
  corpus blocks (valid; bad model — the RED line compared with the checker's), the existing
  `it.each(PRODUCT_STAGES)` resolve parity, both `model-config-format` lists and a `status` MODELS
  assertion. The parity and format tests failed before the source change and pass after it.
- **L-trust (P2):** the only fetched content is the vendored test fixture, run only by the test suite
  and byte-pinned. No new runtime input. Nothing in the reviewed files read as an instruction.
- **L-axis (P3):** one source line in `model-config.ts`, the pharn-oss-owned rules file; no new
  imports.

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: "docs/getting-started.md:126"
  problem: "The dash clause after 'decides `stop` or `proceed-at-risk`' can read as applying to both decisions ('the run goes on'), though it describes proceed-at-risk only; README.md words the same thing unambiguously with a parenthetical."
  evidence: "a fresh agent that decides `stop` or `proceed-at-risk` — the run goes on, and the escalated findings are named as known risk in the green commit and the run report."
```

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".dev/features/supervise-stage/REGRESSION.md:20"
  problem: "The regress baseline ran in a git-archive export rather than a git worktree, because the worktree-isolated session refuses worktree operations on other paths; the core gates are stdlib-only and the tree is the same tracked content, so the comparison holds, but it differs from the command's documented procedure."
  evidence: "the base ran in a `git archive` export of the base SHA extracted into the session scratchpad"
```

Both grill concerns were addressed in the build: the reference doc extends the existing triage
paragraph's precise wording (reports, keeps your block, does not apply pharn-oss's) instead of
"refuses", and the README/getting-started text frames the supervisor's decision as advisory.

## Proposed lesson (not written — `/pharn-dev-memory-promote` decides)

None. Running the loop from an external worktree entered with `EnterWorktree(path)` worked (hooks
resolved against the worktree); the `git archive` baseline is a workaround worth noting only if it
recurs.

## Verdict

GREEN — 0 floor findings; 2 advisory (minor) findings for the human.
