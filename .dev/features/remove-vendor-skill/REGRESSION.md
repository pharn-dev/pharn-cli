# REGRESSION — remove-vendor-skill

**Base:** `74c5653` (working tree dirty → `base = HEAD`, per the dogfood-build rule).
**Verdict:** `no-regressions` — `check-regress.mjs verdict` exit **0**.

## Inside / outside partition (deterministic — `check-regress.mjs scope`, exit 0)

- **Inside (21 changed files ⊆ declared `## Files`):** `src/{types, lib/{manifest,wizard,validate,vendor-fetch}, commands/init, steps/{install,summary,vendor-consent}}`, the 9 touched `tests/*.ts`, the 3 `docs/*.md`. **`escaped: []`** — no fix#7 scope breach; the build stayed inside the plan's `## Files`.
- **Outside gates run:** 44 floor/hook `*.test.mjs` + `*.test.cjs` (the `tests` gate), whole-repo `validate`, and the pharn `vitest` suite. **0 outside eval pairs.**
- **Style gates (`lint`/`format:check`/`lint:md`) skipped** by the deterministic config-touch rule: `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so a style flip over the byte-identical outside files is provably impossible.

## Per-gate exit codes: base → head

| Gate       | base (74c5653) | head (working tree) | flip? |
| ---------- | -------------- | ------------------- | ----- |
| `tests`    | 0              | 0                   | no    |
| `validate` | 0              | 0                   | no    |
| `vitest`   | 0              | 0                   | no    |

- `tests`: `node --test` over the 44 floor/hook test files — **663 pass** both sides (unchanged by this src-only feature).
- `vitest`: the pharn suite — **509 pass at base** (old suite, incl. the vendor tests) → **496 pass at head** (net −13: the removed vendor tests, plus the 2 added regression tests). The test *count* changed by design; the **gate did not flip pass→fail**, which is what a regression is.

## `regressions[]`: none · `pre_existing[]`: none

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

## Honest residual (P0/P7 — what this catches, and what it does not)

`/pharn-dev-regress` catches exactly what its suite catches, nothing more. Here that suite is the 44 floor/hook
`.test.mjs`/`.test.cjs` gates + `validate` + the pharn `vitest` suite. The `vitest` gate is the one
that actually exercises this feature's blast radius: the shared `lib/{manifest,wizard,validate}` +
`types.ts` edits are consumed by `add`/`remove`/`update`/`list`/`status`, whose **unchanged** spec files
(`add.test.ts`, `remove.test.ts`, `update.test.ts`, `list.test.ts`, `status.test.ts`, `installer.test.ts`,
`install-modules.test.ts`, `manifest.test.ts`, …) all pass at head — so no outside pharn behavior
regressed. A breakage that no deterministic check covers would be invisible; this verdict is
"deterministically-detectable breakage outside the feature is caught," not "nothing broke."
