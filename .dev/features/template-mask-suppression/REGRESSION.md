# REGRESSION — template-mask-suppression

- **Base:** `2e6a30c` (working-tree dogfood build → `base = HEAD`; the committed pre-build state).
- **Verdict (deterministic, `check-regress.mjs`):** `no-regressions` — exit 0.

## Inside / outside partition (deterministic, `check-regress.mjs scope` — exit 0, no escape)

**Inside (the feature's changed scope, ⊆ the plan's `## Files`):**

- `.dev/floor/scan-code-null-deref.mjs`, `.dev/floor/scan-code-resource-leak.mjs`
- `.dev/floor/scan-code-null-deref.test.mjs`, `.dev/floor/scan-code-resource-leak.test.mjs`
- `pharn-review/null-deref/null-deref.md`, `pharn-review/resource-leak/resource-leak.md`

The feature's own audit-trail artifacts (`.dev/features/template-mask-suppression/**`) are excluded from
`--changed` (they are the pipeline's trail, not build output — matching the prior-feature convention), so
`escaped` is empty. **Style gates skipped** (deterministic P5/P7): `inside` touches no shared style config
(`eslint.config.mjs` / `.prettierrc.json` / `.prettierignore` / `.markdownlint-cli2.jsonc`), so a style flip
over the byte-identical outside files is provably impossible.

## Per-gate `base → head` exit codes (identical gate set both sides)

| gate                                                                               | base | head | flip? |
| ---------------------------------------------------------------------------------- | ---- | ---- | ----- |
| `tests` (42 outside test files; the 2 feature suites excluded as inside)           | 0    | 0    | no    |
| `validate` (`.dev/floor/validate.mjs .`, whole-repo)                               | 0    | 0    | no    |
| `structural:…/trust-fence/…/expected-injection-comment.json` (committed eval pair) | 0    | 0    | no    |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** Every outside gate that
was GREEN at the `2e6a30c` baseline is still GREEN at HEAD.

> Honest residual (P0/P7): `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** This
> is a guarantee about the comparison of deterministic gate exit codes, **not** a certification that "nothing
> broke." A regression no deterministic check covers is invisible to this stage.
